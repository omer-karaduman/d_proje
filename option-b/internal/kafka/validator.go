package kafka

import (
	"ring-of-the-middle-earth/internal/engine"
	"ring-of-the-middle-earth/internal/game"
)

// OrderValidator enforces the 8 validation rules and route risk enrichment
type OrderValidator struct {
	cacheManager *engine.CacheManager
	unitConfigs  map[string]game.UnitConfig
}

func NewOrderValidator(cm *engine.CacheManager, configs map[string]game.UnitConfig) *OrderValidator {
	return &OrderValidator{
		cacheManager: cm,
		unitConfigs:  configs,
	}
}

// Validate applies the 8 rules from Section 11
func (v *OrderValidator) Validate(order game.Order, seenUnits map[string]bool) (bool, game.ErrorCode) {
	if order.OrderType == game.StartGameOrder || order.OrderType == game.ResetGameOrder {
		return true, ""
	}

	state := v.cacheManager.GetSnapshot()

	if seenUnits[order.UnitID] {
		return false, game.ErrDuplicateUnitOrder
	}

	if order.Turn != state.Turn {
		return false, game.ErrWrongTurn
	}

	cfg, ok := v.unitConfigs[order.UnitID]
	if !ok {
		return false, game.ErrNotYourUnit
	}

	if !v.sideMatchesPlayer(cfg.Side, order.PlayerID) {
		return false, game.ErrNotYourUnit
	}

	unit, hasUnit := state.Units[order.UnitID]

	if cfg.Class == game.RingBearer {
		pathIDs := v.extractPathIDs(order)
		for _, pid := range pathIDs {
			path, ok := state.Paths[pid]
			if !ok {
				return false, game.ErrInvalidPath
			}
			if path.Status == game.Blocked {
				return false, game.ErrPathBlocked
			}
		}
	}

	if order.OrderType == game.BlockPathOrder || order.OrderType == game.SearchPathOrder {
		pid, _ := order.Payload["pathId"].(string)
		path, ok := state.Paths[pid]
		if !ok {
			return false, game.ErrInvalidPath
		}
		if hasUnit && unit.Region != path.From && unit.Region != path.To {
			return false, game.ErrUnitNotAdjacent
		}
	}

	if order.OrderType == game.AttackRegionOrder {
		target, _ := order.Payload["targetRegion"].(string)
		if hasUnit && !v.isAdjacent(state, unit.Region, target) {
			return false, game.ErrInvalidTarget
		}
	}

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

// Enrich calculates Route Risk Score (Topology 2)
func (v *OrderValidator) Enrich(order game.Order) int {
	state := v.cacheManager.GetSnapshot()
	riskScore := 0
	pathIDs := v.extractPathIDs(order)
	visitedRegions := make(map[string]bool)

	for _, pid := range pathIDs {
		path, ok := state.Paths[pid]
		if !ok {
			continue
		}

		visitedRegions[path.To] = true
		visitedRegions[path.From] = true

		riskScore += path.SurveillanceLevel * 3

		if path.Status == game.Blocked {
			riskScore += 5
		}
		if path.Status == game.Threatened {
			riskScore += 2
		}
	}

	for rid := range visitedRegions {
		if reg, ok := state.Regions[rid]; ok {
			riskScore += reg.ThreatLevel
		}
	}

	riskScore += v.calculateNazgulProximity(state, visitedRegions) * 2

	return riskScore
}

func (v *OrderValidator) sideMatchesPlayer(side game.Side, pID string) bool {
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
		if ids, ok := raw.([]interface{}); ok {
			var result []string
			for _, id := range ids {
				result = append(result, id.(string))
			}
			return result
		}
	}
	return nil
}

func (v *OrderValidator) isAdjacent(state game.WorldStateCache, from, to string) bool {
	for _, p := range state.Paths {
		if (p.From == from && p.To == to) || (p.To == from && p.From == to) {
			return true
		}
	}
	return false
}

func (v *OrderValidator) calculateNazgulProximity(state game.WorldStateCache, regions map[string]bool) int {
	count := 0
	for _, u := range state.Units {
		cfg := v.unitConfigs[u.ID]
		if cfg.DetectionRange > 0 && u.Status == game.Active {
			for rid := range regions {
				if u.Region == rid || v.isAdjacent(state, u.Region, rid) {
					count++
					break
				}
			}
		}
	}
	return count
}
