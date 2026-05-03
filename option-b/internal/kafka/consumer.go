package kafka

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"
)

// Consumer, Kafka topic'lerini dinleyen ana yapıdır.
type Consumer struct {
	processor *OrderProcessor
	// Gerçek uygulamada buraya kafka.Consumer (confluent-kafka-go) kütüphanesi gelir.
}

func NewConsumer(p *OrderProcessor) *Consumer {
	return &Consumer{
		processor: p,
	}
}

// Start, ana dinleme döngüsünü başlatır (Section 31 - Select Loop).
func (c *Consumer) Start(ctx context.Context) {
	log.Println("Kafka Consumer baslatildi: game.orders.raw dinleniyor...")

	// İşletim sisteminden gelen durdurma sinyallerini yakala.
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	for {
		select {
		case <-ctx.Done():
			log.Println("Consumer durduruluyor (Context Done)...")
			return
		case sig := <-sigChan:
			log.Printf("Consumer durduruluyor (Signal: %v)...", sig)
			return
		default:
			// 1. Kafka'dan ham mesajı oku.
			// Örn: msg, err := kafkaConsumer.ReadMessage(time.Second)
			msgValue := c.mockReadMessage()

			if msgValue != nil {
				// 2. Okunan mesajı işlenmek üzere Processor'a gönder.
				c.processor.ProcessMessage(msgValue)
			}
		}
	}
}

// mockReadMessage, Kafka'dan veri okumayı simüle eder.
func (c *Consumer) mockReadMessage() []byte {
	// Bu kısım gerçek Kafka kütüphanesi ile değiştirilecek[cite: 2].
	return nil
}
