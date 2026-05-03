package kafka

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"github.com/confluentinc/confluent-kafka-go/v2/kafka"
	"ring-of-the-middle-earth/internal/game"
)

// Consumer handles reading from game.orders.raw Kafka topic
type Consumer struct {
	processor  *OrderProcessor
	kc         *kafka.Consumer
	avroHelper *AvroHelper
}

// NewConsumer creates a real Kafka consumer for order processing
func NewConsumer(p *OrderProcessor, avroHelper *AvroHelper) (*Consumer, error) {
	broker := os.Getenv("KAFKA_BROKER")
	if broker == "" {
		broker = "localhost:9092"
	}
	groupID := os.Getenv("CONSUMER_GROUP_ID")
	if groupID == "" {
		groupID = "ring-engine-group"
	}

	kc, err := kafka.NewConsumer(&kafka.ConfigMap{
		"bootstrap.servers":  broker,
		"group.id":           groupID,
		"auto.offset.reset":  "earliest",
		"session.timeout.ms": 6000,
		// v2: no go.events.channel.enable — use Poll() instead
	})
	if err != nil {
		return nil, err
	}

	return &Consumer{
		processor:  p,
		kc:         kc,
		avroHelper: avroHelper,
	}, nil
}

// RecoverState reads the latest compacted snapshot from game.session
func (c *Consumer) RecoverState() (*game.WorldStateCache, error) {
	broker := os.Getenv("KAFKA_BROKER")
	if broker == "" {
		broker = "localhost:9092"
	}

	tempConsumer, err := kafka.NewConsumer(&kafka.ConfigMap{
		"bootstrap.servers": broker,
		"group.id":          "recovery-group-" + os.Getenv("INSTANCE_ID"),
		"auto.offset.reset": "earliest",
	})
	if err != nil {
		return nil, err
	}
	defer tempConsumer.Close()

	err = tempConsumer.Assign([]kafka.TopicPartition{{
		Topic:     stringPtr("game.session"),
		Partition: 0,
		Offset:    kafka.OffsetBeginning,
	}})
	if err != nil {
		return nil, err
	}

	log.Println("Consumer: recovering state from game.session...")
	var lastSnapshot *game.WorldStateCache

	for {
		msg, err := tempConsumer.ReadMessage(2 * time.Second)
		if err != nil {
			if kafkaErr, ok := err.(kafka.Error); ok && kafkaErr.Code() == kafka.ErrTimedOut {
				break // end of topic
			}
			log.Printf("RecoverState read error: %v", err)
			break
		}

		var snapshot map[string]interface{}
		if err := c.avroHelper.Deserialize(msg.Value, &snapshot); err == nil {
			jsonBytes, _ := json.Marshal(snapshot)
			var cache game.WorldStateCache
			if err := json.Unmarshal(jsonBytes, &cache); err == nil {
				lastSnapshot = &cache
			}
		}
	}

	if lastSnapshot != nil {
		log.Printf("Consumer: recovered state at turn %d", lastSnapshot.Turn)
	} else {
		log.Println("Consumer: no state in game.session, starting fresh")
	}
	return lastSnapshot, nil
}

func stringPtr(s string) *string { return &s }

// Start polls game.orders.raw and dispatches to OrderProcessor
func (c *Consumer) Start(ctx context.Context) {
	log.Println("Kafka Consumer started: listening on game.orders.raw...")

	if err := c.kc.Subscribe("game.orders.raw", nil); err != nil {
		log.Fatalf("Consumer: subscribe failed: %v", err)
	}
	defer c.kc.Close()

	for {
		select {
		case <-ctx.Done():
			log.Println("Consumer: shutting down")
			return
		default:
			// v2 polling model
			ev := c.kc.Poll(100) // 100ms timeout
			if ev == nil {
				continue
			}
			switch e := ev.(type) {
			case *kafka.Message:
				var jsonBytes []byte
				// Try Avro deserialization first; fall back to raw JSON
				var order map[string]interface{}
				if c.avroHelper != nil {
					if err := c.avroHelper.Deserialize(e.Value, &order); err == nil {
						jsonBytes, _ = json.Marshal(order)
					}
				}
				if jsonBytes == nil {
					// Raw JSON fallback (producer used JSON when Avro failed)
					jsonBytes = e.Value
					log.Printf("Consumer: using raw JSON fallback for message")
				}
				c.processor.ProcessMessage(jsonBytes)


			case kafka.AssignedPartitions:
				log.Printf("Consumer: partitions assigned: %v", e.Partitions)
				_ = c.kc.Assign(e.Partitions)

			case kafka.RevokedPartitions:
				log.Printf("Consumer: partitions revoked: %v", e.Partitions)
				_ = c.kc.Unassign()

			case kafka.Error:
				log.Printf("Consumer: kafka error: %v", e)
				if e.IsFatal() {
					log.Printf("Consumer: fatal error, exiting: %v", e)
					return
				}
			}
		}
	}
}

// (EventConsumer is in event_consumer.go)
