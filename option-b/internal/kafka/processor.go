package kafka

import (
	"encoding/json"
	"log"
	"ring-of-the-middle-earth/internal/game"
)

// OrderProcessor Kafka mesajlarını okuyup doğrulayan yapıdır.
type OrderProcessor struct {
	validator   *OrderValidator
	producer    *Producer // Kafka'ya mesaj gönderen yapı
	onValidated func([]byte) // called after each successfully validated order
}

func NewOrderProcessor(v *OrderValidator, p *Producer, onValidated func([]byte)) *OrderProcessor {
	return &OrderProcessor{
		validator:   v,
		producer:    p,
		onValidated: onValidated,
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

	// 2. Validator'ı kullanarak 8 kuralı kontrol et.
	seenUnits := make(map[string]bool)
	isValid, errorCode := p.validator.Validate(order, seenUnits)

	if !isValid {
		// 3a. Hatalıysa DLQ topic'ine gönder.
		log.Printf("Gecersiz siparis [%s]: %s", order.UnitID, errorCode)
		p.producer.SendToDLQ(order, errorCode)
		return
	}

	// 4. Risk puanını hesapla (Section 12).
	riskScore := p.validator.Enrich(order)

	// 5. Onaylı siparişi validated topic'ine gönder.
	log.Printf("Siparis onaylandi [%s] Risk Skoru: %d", order.UnitID, riskScore)
	p.producer.SendToValidated(order, riskScore)

	// 6. Directly route to TurnProcessor via callback — closes the broken chain.
	// game.orders.validated is in Kafka for durability; this callback ensures
	// the same-instance TurnProcessor sees the order immediately.
	if p.onValidated != nil {
		validated, _ := json.Marshal(map[string]interface{}{
			"orderType":     order.OrderType,
			"playerId":      order.PlayerID,
			"unitId":        order.UnitID,
			"turn":          order.Turn,
			"payload":       order.Payload,
			"routeRiskScore": riskScore,
		})
		p.onValidated(validated)
	}
}
