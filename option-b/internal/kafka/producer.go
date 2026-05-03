package kafka

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"ring-of-the-middle-earth/internal/game"
)

// Producer, Kafka'ya mesaj gönderen ana yapıdır.
type Producer struct {
	// Buraya gerçek Kafka kütüphanesi (confluent-kafka-go vb.) gelecek.
	// Şimdilik mantığı kuruyoruz.
}

// SendToValidated onaylanmış siparişi risk puanıyla birlikte gönderir.
func (p *Producer) SendToValidated(order game.Order, riskScore int) {
	// Proje Bölüm 10 ve 12 gereği: EnrichedOrder yapısı oluşturulur.
	enriched := map[string]interface{}{
		"orderType":      order.OrderType,
		"playerId":       order.PlayerID,
		"unitId":         order.UnitID,
		"turn":           order.Turn,
		"payload":        order.Payload,
		"routeRiskScore": riskScore, // Hesapladığımız puanı buraya ekliyoruz.
		"timestamp":      time.Now().UnixMilli(),
	}

	data, _ := json.Marshal(enriched)

	// game.orders.validated topic'ine, unitId'yi key yaparak gönderiyoruz[cite: 2].
	fmt.Printf("KAFKA -> Validated Topic: %s (Risk: %d)\n", order.UnitID, riskScore)
	p.produce("game.orders.validated", order.UnitID, data)
}

// SendToDLQ hatalı siparişi hata koduyla birlikte DLQ kanalına gönderir[cite: 2].
func (p *Producer) SendToDLQ(order game.Order, errorCode game.ErrorCode) {
	// Proje Bölüm 10: DLQEntry şemasına uygun veri yapısı[cite: 2].
	dlqEntry := map[string]interface{}{
		"originalTopic": "game.orders.raw",
		"errorCode":     errorCode,
		"unitId":        order.UnitID,
		"rawPayload":    order.Payload,
		"timestamp":     time.Now().UnixMilli(),
	}

	data, _ := json.Marshal(dlqEntry)

	// game.dlq topic'ine hata koduyla birlikte gönderiyoruz[cite: 2].
	fmt.Printf("KAFKA -> DLQ Topic: %s (Hata: %s)\n", order.UnitID, errorCode)
	p.produce("game.dlq", string(errorCode), data)
}

// produce fonksiyonu fiziksel olarak Kafka'ya mesaj basar[cite: 2].
func (p *Producer) produce(topic string, key string, value []byte) {
	// Burada gerçek Kafka Producer kütüphanesi fonksiyonu çağrılacak[cite: 2].
	// Örn: kafkaProducer.Produce(&kafka.Message{...})
	log.Printf("Mesaj gonderildi: Topic=%s, Key=%s", topic, key)
}
