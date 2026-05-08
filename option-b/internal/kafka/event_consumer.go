package kafka

import (
	"context"
	"encoding/json"
	"log"
	"os"

	"github.com/confluentinc/confluent-kafka-go/v2/kafka"
)

// EventRouter interface — avoids circular kafka→engine import
type EventRouter interface {
	RouteEvent(topic string, payload []byte)
}

// EventConsumer fans-out all game events to the local EventRouter (SSE layer)
type EventConsumer struct {
	kc         *kafka.Consumer
	avroHelper *AvroHelper
	router     EventRouter
}

// NewEventConsumer creates an EventConsumer with a unique group per instance
// so every instance receives ALL events for its connected SSE browsers.
func NewEventConsumer(router EventRouter, avroHelper *AvroHelper) (*EventConsumer, error) {
	broker := os.Getenv("KAFKA_BROKER")
	if broker == "" {
		broker = "localhost:9092"
	}

	instanceID := os.Getenv("INSTANCE_ID")
	if instanceID == "" {
		instanceID = "default"
	}
	groupID := "sse-group-" + instanceID

	kc, err := kafka.NewConsumer(&kafka.ConfigMap{
		"bootstrap.servers": broker,
		"group.id":          groupID,
		"auto.offset.reset": "latest",
		// v2: Poll() model — no go.events.channel.enable
	})
	if err != nil {
		return nil, err
	}

	return &EventConsumer{
		kc:         kc,
		avroHelper: avroHelper,
		router:     router,
	}, nil
}

// Start subscribes to all game event topics and routes them to SSE clients
func (c *EventConsumer) Start(ctx context.Context) {
	topics := []string{
		"game.events.unit",
		"game.events.region",
		"game.events.path",
		"game.broadcast",
		"game.ring.position",
		"game.ring.detection",
	}

	if err := c.kc.SubscribeTopics(topics, nil); err != nil {
		log.Fatalf("EventConsumer: subscribe failed: %v", err)
	}
	defer c.kc.Close()
	log.Printf("EventConsumer: subscribed to %v", topics)

	for {
		select {
		case <-ctx.Done():
			log.Println("EventConsumer: shutting down")
			return
		default:
			ev := c.kc.Poll(100)
			if ev == nil {
				continue
			}
			switch e := ev.(type) {
			case *kafka.Message:
				topic := *e.TopicPartition.Topic

				// Try Avro decode; fall back to raw bytes
				var payload map[string]interface{}
				if c.avroHelper != nil {
					if err := c.avroHelper.Deserialize(e.Value, &payload); err == nil {
						jsonBytes, _ := json.Marshal(payload)
						c.router.RouteEvent(topic, jsonBytes)
						continue
					}
				}
				// Fallback: treat as raw JSON
				c.router.RouteEvent(topic, e.Value)

			case kafka.AssignedPartitions:
				log.Printf("EventConsumer: partitions assigned: %v", e.Partitions)
				_ = c.kc.Assign(e.Partitions)

			case kafka.RevokedPartitions:
				log.Printf("EventConsumer: partitions revoked: %v", e.Partitions)
				_ = c.kc.Unassign()

			case kafka.Error:
				log.Printf("EventConsumer: error: %v", e)
				if e.IsFatal() {
					return
				}
			}
		}
	}
}
