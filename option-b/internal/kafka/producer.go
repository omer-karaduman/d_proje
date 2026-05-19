package kafka

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"ring-of-the-middle-earth/internal/game"

	"github.com/confluentinc/confluent-kafka-go/v2/kafka"
)

// Producer handles sending messages to Kafka.
// It supports two modes:
//   - Produce()              — idempotent, non-transactional (for regular game events)
//   - ProduceTransactional() — full Kafka transaction (for GameOver, K6 rule)
type Producer struct {
	kp         *kafka.Producer
	avroHelper *AvroHelper
	txnEnabled bool // true if transactional.id was configured
}

// NewProducer creates a new Kafka producer.
//
// ISSUE-3 FIX (K6 Rule — Exactly-Once GameOver Semantics):
// We now configure transactional.id using INSTANCE_ID so this producer can use
// full Kafka transactions. Each instance needs a unique transactional ID; Kafka
// uses this ID to fence zombie producers from a previous incarnation of the same
// instance, preventing duplicate GameOver events even when a node crashes and
// restarts mid-transaction.
//
// Note: transactional.id implicitly enables idempotence, so we no longer set
// enable.idempotence explicitly (it would conflict on some Kafka client versions).
func NewProducer(avroHelper *AvroHelper) (*Producer, error) {
	broker := os.Getenv("KAFKA_BROKER")
	if broker == "" {
		broker = "localhost:9092"
	}

	// Use INSTANCE_ID (go-1, go-2, go-3) as the unique transactional ID.
	// This satisfies K6: each instance has a stable, unique ID across restarts.
	instanceID := os.Getenv("INSTANCE_ID")
	if instanceID == "" {
		instanceID = "go-default"
	}
	txnID := "ring-engine-txn-" + instanceID

	cfg := &kafka.ConfigMap{
		"bootstrap.servers":                     broker,
		"acks":                                  "all",
		"retries":                               10,
		"max.in.flight.requests.per.connection": 5,
		// K6 FIX: transactional.id enables exactly-once producer semantics.
		// Idempotence is automatically enabled when transactional.id is set.
		"transactional.id":       txnID,
		"transaction.timeout.ms": 30000, // 30s — longer than max turn duration
		"enable.idempotence":     true,  // explicit for clarity; implied by txn.id
	}

	p, err := kafka.NewProducer(cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create transactional producer: %w", err)
	}

	// InitTransactions MUST be called before any transaction can begin.
	// This also performs epoch fencing on the broker side — any zombie producer
	// with the same transactional.id from a previous crash is invalidated here.
	if err := p.InitTransactions(nil); err != nil {
		p.Close()
		return nil, fmt.Errorf("InitTransactions failed (txnID=%s): %w", txnID, err)
	}

	log.Printf("[Producer] Transactional producer ready. txnID=%s", txnID)

	return &Producer{
		kp:         p,
		avroHelper: avroHelper,
		txnEnabled: true,
	}, nil
}

// serializePayload encodes value as Avro (if schema registry is available) or JSON.
func (p *Producer) serializePayload(topic, subject string, value interface{}) ([]byte, error) {
	if p.avroHelper != nil {
		if subject == "" {
			subject = topic + "-value"
		}
		payload, err := p.avroHelper.Serialize(subject, value)
		if err == nil {
			return payload, nil
		}
		log.Printf("Avro serialize failed for %s (falling back to JSON): %v", topic, err)
	}
	return json.Marshal(value)
}

// Produce sends a single message to Kafka outside of a transaction.
// Uses Avro if schema is available, falls back to JSON.
// For critical singleton events (GameOver), use ProduceTransactional instead.
func (p *Producer) Produce(topic string, key string, value interface{}, subject string) error {
	payload, err := p.serializePayload(topic, subject, value)
	if err != nil {
		return fmt.Errorf("failed to serialize payload for topic %s: %w", topic, err)
	}

	var kafkaKey []byte
	if key != "" {
		kafkaKey = []byte(key)
	}

	// Transactional producer için begin/commit gerekli
	if p.txnEnabled {
		if err := p.kp.BeginTransaction(); err != nil {
			return fmt.Errorf("BeginTransaction failed: %w", err)
		}
	}

	err = p.kp.Produce(&kafka.Message{
		TopicPartition: kafka.TopicPartition{Topic: &topic, Partition: kafka.PartitionAny},
		Key:            kafkaKey,
		Value:          payload,
		Timestamp:      time.Now(),
	}, nil)
	if err != nil {
		if p.txnEnabled {
			_ = p.kp.AbortTransaction(nil)
		}
		return fmt.Errorf("failed to produce to %s: %w", topic, err)
	}

	if p.txnEnabled {
		p.kp.Flush(5000)
		if err := p.kp.CommitTransaction(nil); err != nil {
			_ = p.kp.AbortTransaction(nil)
			return fmt.Errorf("CommitTransaction failed: %w", err)
		}
	}
	return nil
}

// TransactionalMessage is one message to be produced inside a transaction.
type TransactionalMessage struct {
	Topic   string
	Key     string
	Value   interface{}
	Subject string
}

// ProduceTransactional produces a batch of messages inside a single Kafka transaction.
//
// ISSUE-3 FIX (K6 Rule):
// This is the correct method for the GameOver event. The sequence is:
//  1. BeginTransaction()
//  2. Produce all messages (non-blocking)
//  3. Flush (wait for all messages to be sent to the broker buffer)
//  4. CommitTransaction()
//
// If any step fails, AbortTransaction() is called, leaving the topics in a
// clean state. On the next restart, InitTransactions() (called in NewProducer)
// will fence the zombie epoch and the caller can retry.
//
// This guarantees that GameOver is written at most once — even if the node
// crashes between steps 2 and 4, the broker will abort the incomplete transaction
// and consumers configured with isolation.level=read_committed will not see it.
func (p *Producer) ProduceTransactional(messages []TransactionalMessage) error {
	if !p.txnEnabled {
		// Fallback: transactional producer not available, produce individually
		for _, m := range messages {
			if err := p.Produce(m.Topic, m.Key, m.Value, m.Subject); err != nil {
				return err
			}
		}
		return nil
	}

	// Step 1: Begin transaction
	if err := p.kp.BeginTransaction(); err != nil {
		return fmt.Errorf("BeginTransaction failed: %w", err)
	}

	// Step 2: Produce all messages within the transaction
	for _, m := range messages {
		payload, err := p.serializePayload(m.Topic, m.Subject, m.Value)
		if err != nil {
			_ = p.kp.AbortTransaction(nil)
			return fmt.Errorf("serialize failed for %s within transaction: %w", m.Topic, err)
		}

		var kafkaKey []byte
		if m.Key != "" {
			kafkaKey = []byte(m.Key)
		}

		if err := p.kp.Produce(&kafka.Message{
			TopicPartition: kafka.TopicPartition{Topic: &m.Topic, Partition: kafka.PartitionAny},
			Key:            kafkaKey,
			Value:          payload,
			Timestamp:      time.Now(),
		}, nil); err != nil {
			_ = p.kp.AbortTransaction(nil)
			return fmt.Errorf("produce failed for %s within transaction: %w", m.Topic, err)
		}
	}

	// Step 3: Flush — wait for all messages to reach broker buffer before commit
	remaining := p.kp.Flush(15 * 1000) // 15s timeout
	if remaining > 0 {
		_ = p.kp.AbortTransaction(nil)
		return fmt.Errorf("flush timed out: %d messages not delivered, transaction aborted", remaining)
	}

	// Step 4: Commit transaction — this is the atomic commit point
	if err := p.kp.CommitTransaction(nil); err != nil {
		_ = p.kp.AbortTransaction(nil)
		return fmt.Errorf("CommitTransaction failed: %w", err)
	}

	log.Printf("[Producer] Transaction committed (%d messages)", len(messages))
	return nil
}

// PublishGameOverTx implements engine.GameOverPublisher.
// Wraps the GameOver payload in a full Kafka transaction to guarantee
// exactly-once delivery (K6 rule). Satisfies the engine.GameOverPublisher interface.
func (p *Producer) PublishGameOverTx(payload map[string]interface{}) error {
	return p.ProduceTransactional([]TransactionalMessage{
		{
			Topic: "game.broadcast",
			Key:   "game-over",
			Value: payload,
		},
	})
}

// SendToValidated sends an enriched validated order to game.orders.validated
func (p *Producer) SendToValidated(order game.Order, riskScore int) {
	// The Avro schema allows null for routeRiskScore.
	// Since hamba/avro expects pointers for union types like ["null", "int"],
	// we pass a pointer to riskScore.
	scorePtr := &riskScore

	enriched := map[string]interface{}{
		"orderType":      string(order.OrderType),
		"playerId":       order.PlayerID,
		"unitId":         order.UnitID,
		"turn":           order.Turn,
		"payload":        nil,
		"routeRiskScore": scorePtr,
		"timestamp":      time.Now().UnixMilli(),
	}

	if order.Payload != nil {
		if payloadBytes, err := json.Marshal(order.Payload); err == nil {
			enriched["payload"] = payloadBytes
		}
	} else {
		enriched["payload"] = []byte("{}")
	}

	err := p.Produce("game.orders.validated", order.UnitID, enriched, "")
	if err != nil {
		log.Printf("Error producing to validated: %v", err)
	} else {
		log.Printf("KAFKA -> Validated Topic: %s (Risk: %d)", order.UnitID, riskScore)
	}
}

// SendToDLQ sends an invalid order to game.dlq
func (p *Producer) SendToDLQ(order game.Order, errorCode game.ErrorCode) {
	dlqEntry := map[string]interface{}{
		"originalTopic": "game.orders.raw",
		"partition":     0,
		"offset":        int64(0),
		"errorCode":     string(errorCode),
		"errorMessage":  string(errorCode),
		"rawPayload":    []byte{},
		"timestamp":     time.Now().UnixMilli(),
	}

	if payloadBytes, err := json.Marshal(order); err == nil {
		dlqEntry["rawPayload"] = payloadBytes
	}

	err := p.Produce("game.dlq", string(errorCode), dlqEntry, "")
	if err != nil {
		log.Printf("Error producing to DLQ: %v", err)
	} else {
		log.Printf("KAFKA -> DLQ Topic: %s (Hata: %s)", order.UnitID, errorCode)
	}
}

// Close flushes and closes the producer
func (p *Producer) Close() {
	p.kp.Flush(15 * 1000)
	p.kp.Close()
}
