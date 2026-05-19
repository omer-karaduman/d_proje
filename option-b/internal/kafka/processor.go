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
	producer    *Producer
	onValidated func([]byte)
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
	var order game.Order
	if err := json.Unmarshal(value, &order); err != nil {
		log.Printf("Mesaj cozumleme hatasi: %v", err)
		return
	}

	p.mu.Lock()
	if order.Turn != p.currentTurn {
		p.seenUnits = make(map[string]bool)
		p.currentTurn = order.Turn
		log.Printf("OrderProcessor: New turn detected (%d), resetting seenUnits", p.currentTurn)
	}

	isValid, errorCode := p.validator.Validate(order, p.seenUnits)

	if !isValid {
		p.mu.Unlock()
		log.Printf("Gecersiz siparis [%s]: %s", order.UnitID, errorCode)
		if p.producer != nil {
			p.producer.SendToDLQ(order, errorCode)
		}
		return
	}

	p.seenUnits[order.UnitID] = true
	p.mu.Unlock()

	riskScore := p.validator.Enrich(order)

	log.Printf("Siparis onaylandi [%s] Risk Skoru: %d", order.UnitID, riskScore)
	if p.producer != nil {
		p.producer.SendToValidated(order, riskScore)
	}

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
