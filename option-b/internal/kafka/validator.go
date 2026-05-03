package kafka

import (
	"ring-of-the-middle-earth/internal/game"
)

// OrderValidator, 8 kuralı ve rota risk zenginleştirmesini yöneten ana yapıdır.
type OrderValidator struct {
	turnKTable   *TurnKTable
	unitKTable   *UnitKTable
	pathKTable   *PathKTable
	regionKTable *RegionKTable
	unitConfigs  map[string]game.UnitConfig
}

// KTable yapıları state store mantığını simüle eder.
type TurnKTable struct{ CurrentTurn int }
type UnitKTable struct{ Units map[string]game.UnitSnapshot }
type PathKTable struct{ Paths map[string]game.PathState }
type RegionKTable struct{ Regions map[string]game.RegionState }

func NewOrderValidator(t *TurnKTable, u *UnitKTable, p *PathKTable, r *RegionKTable, configs map[string]game.UnitConfig) *OrderValidator {
	return &OrderValidator{
		turnKTable:   t,
		unitKTable:   u,
		pathKTable:   p,
		regionKTable: r,
		unitConfigs:  configs,
	}
}

// Validate, Section 11'deki 8 kuralı uygular.
func (v *OrderValidator) Validate(order game.Order, seenUnits map[string]bool) (bool, game.ErrorCode) {
	// Rule 8: Duplicate unit order
	if seenUnits[order.UnitID] {
		return false, game.ErrDuplicateUnitOrder
	}

	// Rule 1: Wrong turn number[cite: 2]
	if order.Turn != v.turnKTable.CurrentTurn {
		return false, game.ErrWrongTurn
	}

	// Birim konfigürasyonu kontrolü (Hardcoding yasak!)[cite: 2]
	cfg, ok := v.unitConfigs[order.UnitID]
	if !ok {
		return false, game.ErrNotYourUnit
	}

	// Rule 2: Unit belongs to player[cite: 2]
	if !v.sideMatchesPlayer(cfg.Side, order.PlayerID) {
		return false, game.ErrNotYourUnit
	}

	unit, hasUnit := v.unitKTable.Units[order.UnitID]

	// Rule 3 & 4: Ring Bearer route validation[cite: 2]
	if cfg.Class == game.RingBearer {
		pathIDs := v.extractPathIDs(order)
		for _, pid := range pathIDs {
			path, ok := v.pathKTable.Paths[pid]
			if !ok {
				return false, game.ErrInvalidPath
			}
			if path.Status == game.Blocked {
				return false, game.ErrPathBlocked
			}
		}
	}

	// Rule 5: Unit adjacency for Block/Search[cite: 2]
	if order.OrderType == game.BlockPathOrder || order.OrderType == game.SearchPathOrder {
		pid, _ := order.Payload["pathId"].(string)
		path, ok := v.pathKTable.Paths[pid]
		if !ok {
			return false, game.ErrInvalidPath
		}
		if hasUnit && unit.Region != path.From && unit.Region != path.To {
			return false, game.ErrUnitNotAdjacent
		}
	}

	// Rule 6: Attack conditions[cite: 2]
	if order.OrderType == game.AttackRegionOrder {
		target, _ := order.Payload["targetRegion"].(string)
		if hasUnit && !v.isAdjacent(unit.Region, target) {
			return false, game.ErrInvalidTarget
		}
	}

	// Rule 7: Maia cooldown[cite: 2]
	if order.OrderType == game.MaiaAbilityOrder {
		if !cfg.IsMaia {
			return false, game.ErrMaiaDisabled
		}
		if hasUnit && unit.Cooldown > 0 {
			return false, game.ErrAbilityOnCooldown
		}
	}

	return true, ""
}

// Enrich, Topology 2 - Section 12 Risk formülünü uygular[cite: 2].
func (v *OrderValidator) Enrich(order game.Order) int {
	riskScore := 0
	pathIDs := v.extractPathIDs(order)
	visitedRegions := make(map[string]bool)

	for _, pid := range pathIDs {
		path, ok := v.pathKTable.Paths[pid]
		if !ok {
			continue
		}

		visitedRegions[path.To] = true
		visitedRegions[path.From] = true

		// sum(path.surveillanceLevel * 3)[cite: 2]
		riskScore += path.SurveillanceLevel * 3

		// Status weights[cite: 2]
		if path.Status == game.Blocked {
			riskScore += 5
		}
		if path.Status == game.Threatened {
			riskScore += 2
		}
	}

	// sum(region.threatLevel)[cite: 2]
	for rid := range visitedRegions {
		if reg, ok := v.regionKTable.Regions[rid]; ok {
			riskScore += reg.ThreatLevel
		}
	}

	// nazgulProximityCount * 2[cite: 2]
	riskScore += v.calculateNazgulProximity(visitedRegions) * 2

	return riskScore
}

// --- Yardımcı Fonksiyonlar ---[cite: 2]

func (v *OrderValidator) sideMatchesPlayer(side game.Side, pID string) bool {
	// Basit kural: light-* -> FREE_PEOPLES, dark-* -> SHADOW[cite: 2]
	if len(pID) >= 6 && pID[:6] == "light-" {
		return side == game.FreePeoples
	}
	if len(pID) >= 5 && pID[:5] == "dark-" {
		return side == game.Shadow
	}
	return false
}

func (v *OrderValidator) extractPathIDs(o game.Order) []string {
	if raw, ok := o.Payload["pathIds"]; ok {
		if ids, ok := raw.([]string); ok {
			return ids
		}
	}
	return nil
}

func (v *OrderValidator) isAdjacent(from, to string) bool {
	for _, p := range v.pathKTable.Paths {
		if (p.From == from && p.To == to) || (p.To == from && p.From == to) {
			return true
		}
	}
	return false
}

func (v *OrderValidator) calculateNazgulProximity(regions map[string]bool) int {
	count := 0
	for _, u := range v.unitKTable.Units {
		cfg := v.unitConfigs[u.ID]
		if cfg.DetectionRange > 0 && u.Status == game.Active {
			for rid := range regions {
				if u.Region == rid || v.isAdjacent(u.Region, rid) {
					count++
					break
				}
			}
		}
	}
	return count
}
