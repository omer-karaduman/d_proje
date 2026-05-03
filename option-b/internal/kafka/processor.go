package kafka

import (
	"encoding/json"
	"log"
	"ring-of-the-middle-earth/internal/game"
)

// OrderProcessor Kafka mesajlarını okuyup doğrulayan yapıdır.
type OrderProcessor struct {
	validator *OrderValidator
	producer  *Producer // Kafka'ya mesaj gönderen yapı
}

func NewOrderProcessor(v *OrderValidator, p *Producer) *OrderProcessor {
	return &OrderProcessor{
		validator: v,
		producer:  p,
	}
}

// ProcessMessage bir mesaj geldiğinde çalışacak ana fonksiyondur.
func (p *OrderProcessor) ProcessMessage(value []byte) {
	// 1. Gelen ham veriyi (bytes) Order struct'ına çevir.
	var order game.Order
	if err := json.Unmarshal(value, &order); err != nil {
		log.Printf("Mesaj cozumleme hatasi: %v", err)
		return
	}

	// 2. Validator'ı kullanarak 8 kuralı kontrol et.[cite: 2]
	seenUnits := make(map[string]bool) // Bu turda işlem gören birimleri takip et
	isValid, errorCode := p.validator.Validate(order, seenUnits)

	if !isValid {
		// 3a. Hatalıysa DLQ topic'ine gönder.[cite: 2]
		log.Printf("Gecersiz siparis [%s]: %s", order.UnitID, errorCode)
		p.producer.SendToDLQ(order, errorCode)
		return
	}

	// 4. Geceliyse Rota Risk puanını hesapla (Section 12).[cite: 2]
	riskScore := p.validator.Enrich(order)

	// 5. Onaylı siparişi ve risk puanını validated topic'ine gönder.[cite: 2]
	log.Printf("Siparis onaylandi [%s] Risk Skoru: %d", order.UnitID, riskScore)
	p.producer.SendToValidated(order, riskScore)
}
