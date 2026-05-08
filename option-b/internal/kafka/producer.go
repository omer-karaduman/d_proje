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

// Producer handles sending messages to Kafka using Exactly-Once Semantics
type Producer struct {
	kp         *kafka.Producer
	avroHelper *AvroHelper
}

// NewProducer creates a new Kafka producer with idempotence enabled
func NewProducer(avroHelper *AvroHelper) (*Producer, error) {
	broker := os.Getenv("KAFKA_BROKER")
	if broker == "" {
		broker = "localhost:9092"
	}

	p, err := kafka.NewProducer(&kafka.ConfigMap{
		"bootstrap.servers":                     broker,
		"enable.idempotence":                    true, // K6 requirement
		"acks":                                  "all",
		"retries":                               5,
		"max.in.flight.requests.per.connection": 5,
	})
	if err != nil {
		return nil, err
	}

	return &Producer{
		kp:         p,
		avroHelper: avroHelper,
	}, nil
}

// Produce sends a message to Kafka. Uses Avro if schema is available, falls back to JSON.
func (p *Producer) Produce(topic string, key string, value interface{}, subject string) error {
	var payload []byte
	var err error

	// Try Avro first; if it fails (schema not registered etc.), fall back to JSON
	if p.avroHelper != nil {
		if subject == "" {
			subject = topic + "-value"
		}
		payload, err = p.avroHelper.Serialize(subject, value)
		if err != nil {
			log.Printf("Avro serialize failed for %s (falling back to JSON): %v", topic, err)
			payload = nil
		}
	}

	// JSON fallback
	if payload == nil {
		payload, err = json.Marshal(value)
		if err != nil {
			return fmt.Errorf("failed to marshal payload for topic %s: %v", topic, err)
		}
	}

	var kafkaKey []byte
	if key != "" {
		kafkaKey = []byte(key)
	}

	err = p.kp.Produce(&kafka.Message{
		TopicPartition: kafka.TopicPartition{Topic: &topic, Partition: kafka.PartitionAny},
		Key:            kafkaKey,
		Value:          payload,
		Timestamp:      time.Now(),
	}, nil)

	if err != nil {
		return fmt.Errorf("failed to produce to %s: %v", topic, err)
	}

	return nil
}

// SendToValidated sends an enriched validated order to game.orders.validated
func (p *Producer) SendToValidated(order game.Order, riskScore int) {
	// The Avro schema allows null for routeRiskScore.
	// Since hamba/avro expects pointers for union types like ["null", "int"],
	// we pass a pointer to riskScore.
	scorePtr := &riskScore

	// Create map to match OrderValidated schema exactly
	enriched := map[string]interface{}{
		"orderType":      string(order.OrderType),
		"playerId":       order.PlayerID,
		"unitId":         order.UnitID,
		"turn":           order.Turn,
		"payload":        nil, // We need to convert order.Payload to bytes if necessary, or just nil
		"routeRiskScore": scorePtr,
		"timestamp":      time.Now().UnixMilli(),
	}

	// Payload is bytes in schema. Convert map to JSON bytes if it exists.
	if order.Payload != nil {
		if payloadBytes, err := json.Marshal(order.Payload); err == nil {
			enriched["payload"] = payloadBytes
		}
	} else {
		// DÜZELTME: Boş payload yerine en azından boş JSON objesi gönder (Section 12 uyumu)
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
