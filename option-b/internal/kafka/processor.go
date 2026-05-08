package kafka

import (
	"encoding/json"
	"log"
	"sync"
	"ring-of-the-middle-earth/internal/game"
)

// OrderProcessor Kafka mesajlarını okuyup doğrulayan yapıdır.
type OrderProcessor struct {
	validator   *OrderValidator
	producer    *Producer    // Kafka'ya mesaj gönderen yapı
	onValidated func([]byte) // called after each successfully validated order
	seenUnits   map[string]bool
	currentTurn int
	mu          sync.Mutex
}

func NewOrderProcessor(v *OrderValidator, p *Producer, onValidated func([]byte)) *OrderProcessor {
	return &OrderProcessor{
		validator:   v,
		producer:    p,
		onValidated: onValidated,
		seenUnits:   make(map[string]bool),
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

	p.mu.Lock()
	// Turn değiştiyse seenUnits map'ini sıfırla
	if order.Turn != p.currentTurn {
		p.seenUnits = make(map[string]bool)
		p.currentTurn = order.Turn
		log.Printf("OrderProcessor: New turn detected (%d), resetting seenUnits", p.currentTurn)
	}

	// 2. Validator'ı kullanarak 8 kuralı kontrol et.
	// NOT: seenUnits artık turn boyunca birikici (Rule 8: Duplicate Order kontrolü için)
	isValid, errorCode := p.validator.Validate(order, p.seenUnits)

	if !isValid {
		p.mu.Unlock()
		// 3a. Hatalıysa DLQ topic'ine gönder.
		log.Printf("Gecersiz siparis [%s]: %s", order.UnitID, errorCode)
		p.producer.SendToDLQ(order, errorCode)
		return
	}

	// Geçerliyse üniteyi seenUnits'e ekle
	p.seenUnits[order.UnitID] = true
	p.mu.Unlock()

	// 4. Risk puanını hesapla (Section 12).
	riskScore := p.validator.Enrich(order)

	// 5. Onaylı siparişi validated topic'ine gönder.
	log.Printf("Siparis onaylandi [%s] Risk Skoru: %d", order.UnitID, riskScore)
	p.producer.SendToValidated(order, riskScore)

	// 6. Directly route to TurnProcessor via callback — closes the broken chain.
	if p.onValidated != nil {
		validated, _ := json.Marshal(map[string]interface{}{
			"orderType":      order.OrderType,
			"playerId":       order.PlayerID,
			"unitId":         order.UnitID,
			"turn":           order.Turn,
			"payload":        order.Payload,
			"routeRiskScore": riskScore,
		})
		p.onValidated(validated)
	}
}
