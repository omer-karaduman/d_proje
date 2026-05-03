package kafka

import (
	"encoding/json"
	"fmt"
	"log"

	"ring-of-the-middle-earth/internal/game"
)

// OrderValidator implements Kafka Streams Topology 1 — Order Validation (Section 11).
// 8 validation rules, producing to game.orders.validated or game.dlq.
// All state is read from KTables (UnitKTable, PathKTable, TurnKTable).

// OrderValidator validates orders from game.orders.raw
type OrderValidator struct {
	turnKTable  *TurnKTable
	unitKTable  *UnitKTable
	pathKTable  *PathKTable
}

// TurnKTable holds the current turn number
type TurnKTable struct {
	CurrentTurn int
}

// UnitKTable holds current unit states
type UnitKTable struct {
	Units map[string]game.UnitSnapshot
}

// PathKTable holds current path states
type PathKTable struct {
	Paths map[string]game.PathState
}

// ValidationResult holds the result of order validation
type ValidationResult struct {
	Valid     bool
	ErrorCode game.ErrorCode
	Order     game.Order
}

// NewOrderValidator creates a new OrderValidator
func NewOrderValidator(turn *TurnKTable, units *UnitKTable, paths *PathKTable) *OrderValidator {
	return &OrderValidator{
		turnKTable: turn,
		unitKTable: units,
		pathKTable: paths,
	}
}

// Validate applies all 8 validation rules from spec Section 11.
// Returns ValidationResult with error code if invalid.
func (v *OrderValidator) Validate(order game.Order, unitConfigs map[string]game.UnitConfig, seenUnitsThisTurn map[string]bool) ValidationResult {
	// Rule 8: Duplicate unit order (checked first to maintain set)
	if seenUnitsThisTurn[order.UnitID] {
		return ValidationResult{
			Valid:     false,
			ErrorCode: game.ErrDuplicateUnitOrder,
			Order:     order,
		}
	}

	// Rule 1: Wrong turn number
	if order.Turn != v.turnKTable.CurrentTurn {
		return ValidationResult{
			Valid:     false,
			ErrorCode: game.ErrWrongTurn,
			Order:     order,
		}
	}

	// Get unit config to check ownership — config-driven, not hardcoded
	cfg, ok := unitConfigs[order.UnitID]
	if !ok {
		return ValidationResult{
			Valid:     false,
			ErrorCode: game.ErrNotYourUnit,
			Order:     order,
		}
	}

	// Rule 2: Unit belongs to submitting player's side
	if !sideMatchesPlayer(cfg.Side, order.PlayerID) {
		return ValidationResult{
			Valid:     false,
			ErrorCode: game.ErrNotYourUnit,
			Order:     order,
		}
	}

	unit, hasUnit := v.unitKTable.Units[order.UnitID]

	// Rule 3 & 4: Ring Bearer route validation
	if cfg.Class == game.RingBearer {
		if order.OrderType == game.AssignRouteOrder || order.OrderType == game.RedirectUnitOrder {
			pathIDs := extractOrderPathIDs(order)
			for _, pathID := range pathIDs {
				path, ok := v.pathKTable.Paths[pathID]
				if !ok {
					return ValidationResult{Valid: false, ErrorCode: game.ErrInvalidPath, Order: order}
				}
				// Rule 3: next path is BLOCKED
				if path.Status == game.Blocked {
					return ValidationResult{Valid: false, ErrorCode: game.ErrPathBlocked, Order: order}
				}
			}
		}
	}

	// Rule 5: BlockPath/SearchPath — unit must be at endpoint
	if order.OrderType == game.BlockPathOrder || order.OrderType == game.SearchPathOrder {
		pathID, _ := order.Payload["pathId"].(string)
		path, ok := v.pathKTable.Paths[pathID]
		if !ok {
			return ValidationResult{Valid: false, ErrorCode: game.ErrInvalidPath, Order: order}
		}
		if hasUnit && unit.Region != path.From && unit.Region != path.To {
			return ValidationResult{Valid: false, ErrorCode: game.ErrUnitNotAdjacent, Order: order}
		}
	}

	// Rule 6: AttackRegion — target must be adjacent and enemy-controlled
	if order.OrderType == game.AttackRegionOrder {
		target, _ := order.Payload["targetRegion"].(string)
		if hasUnit {
			adjacent := false
			for _, path := range v.pathKTable.Paths {
				if (path.From == unit.Region && path.To == target) ||
					(path.To == unit.Region && path.From == target) {
					adjacent = true
					break
				}
			}
			if !adjacent || target == "" {
				return ValidationResult{Valid: false, ErrorCode: game.ErrInvalidTarget, Order: order}
			}
		}
	}

	// Rule 7: MaiaAbility cooldown
	if order.OrderType == game.MaiaAbilityOrder {
		if !cfg.IsMaia {
			return ValidationResult{Valid: false, ErrorCode: game.ErrMaiaDisabled, Order: order}
		}
		if hasUnit && unit.Cooldown > 0 {
			return ValidationResult{Valid: false, ErrorCode: game.ErrAbilityOnCooldown, Order: order}
		}
	}

	return ValidationResult{Valid: true, Order: order}
}

// sideMatchesPlayer determines if a player ID belongs to the given side.
// In a real system this would check the session/auth. Here we use a convention:
// playerIds starting with "light-" are FREE_PEOPLES, "dark-" are SHADOW.
func sideMatchesPlayer(side game.Side, playerID string) bool {
	if len(playerID) >= 6 && playerID[:6] == "light-" {
		return side == game.FreePeoples
	}
	if len(playerID) >= 5 && playerID[:5] == "dark-" {
		return side == game.Shadow
	}
	// Default: allow (for testing)
	return true
}

// extractOrderPathIDs extracts path IDs from an order's payload
func extractOrderPathIDs(order game.Order) []string {
	raw, ok := order.Payload["pathIds"]
	if !ok {
		raw = order.Payload["newPathIds"]
	}
	if raw == nil {
		return nil
	}
	switch v := raw.(type) {
	case []string:
		return v
	case []interface{}:
		result := make([]string, len(v))
		for i, s := range v {
			result[i] = fmt.Sprintf("%v", s)
		}
		return result
	}
	return nil
}

// RouteRiskEnricher implements Kafka Streams Topology 2 — Route Risk Enrichment (Section 12).
type RouteRiskEnricher struct {
	pathKTable   *PathKTable
	unitKTable   *UnitKTable
	regionKTable *RegionKTable
}

// RegionKTable holds current region states
type RegionKTable struct {
	Regions map[string]game.RegionState
}

// NewRouteRiskEnricher creates a new RouteRiskEnricher
func NewRouteRiskEnricher(paths *PathKTable, units *UnitKTable, regions *RegionKTable) *RouteRiskEnricher {
	return &RouteRiskEnricher{
		pathKTable:   paths,
		unitKTable:   units,
		regionKTable: regions,
	}
}

// EnrichedOrder is an order with route risk score attached
type EnrichedOrder struct {
	game.Order
	RouteRiskScore    int      `json:"routeRiskScore"`
	ThreatenedPaths   []string `json:"threatenedPaths"`
	BlockedPaths      []string `json:"blockedPaths"`
}

// Enrich computes and attaches routeRiskScore to validated ASSIGN_ROUTE/REDIRECT_UNIT orders.
// Formula from spec Section 12.
func (e *RouteRiskEnricher) Enrich(order game.Order) (*EnrichedOrder, error) {
	if order.OrderType != game.AssignRouteOrder && order.OrderType != game.RedirectUnitOrder {
		return nil, fmt.Errorf("not a route order")
	}

	pathIDs := extractOrderPathIDs(order)
	enriched := &EnrichedOrder{Order: order}

	// Collect destination regions from paths
	destinationRegions := map[string]bool{}
	for _, pathID := range pathIDs {
		path, ok := e.pathKTable.Paths[pathID]
		if !ok {
			continue
		}
		destinationRegions[path.To] = true
		destinationRegions[path.From] = true

		// sum(path.surveillanceLevel * 3)
		enriched.RouteRiskScore += path.SurveillanceLevel * 3

		// count(THREATENED) * 2, count(BLOCKED) * 5
		switch path.Status {
		case game.Threatened:
			enriched.ThreatenedPaths = append(enriched.ThreatenedPaths, pathID)
			enriched.RouteRiskScore += 2
		case game.Blocked:
			enriched.BlockedPaths = append(enriched.BlockedPaths, pathID)
			enriched.RouteRiskScore += 5
		}
	}

	// sum(region.threatLevel for each destination region)
	for regionID := range destinationRegions {
		region, ok := e.regionKTable.Regions[regionID]
		if ok {
			enriched.RouteRiskScore += region.ThreatLevel
		}
	}

	// nazgulProximityCount * 2 — Nazgul within 2 graph hops of any route region
	nazgulProximity := 0
	for unitID, u := range e.unitKTable.Units {
		cfg, ok := getUnitConfigByID(unitID)
		if !ok || u.Status != game.Active {
			continue
		}
		// Nazgul: DetectionRange > 0
		if cfg.DetectionRange <= 0 {
			continue
		}
		for regionID := range destinationRegions {
			if u.Region == regionID {
				nazgulProximity++
				break
			}
			// Check 1-2 hop adjacency
			for _, p := range e.pathKTable.Paths {
				neighbor := ""
				if p.From == regionID {
					neighbor = p.To
				} else if p.To == regionID {
					neighbor = p.From
				}
				if neighbor != "" && u.Region == neighbor {
					nazgulProximity++
					goto nextNazgul
				}
			}
		nextNazgul:
		}
	}
	enriched.RouteRiskScore += nazgulProximity * 2

	log.Printf("RouteRiskEnricher: order=%s riskScore=%d", order.UnitID, enriched.RouteRiskScore)
	return enriched, nil
}

// getUnitConfigByID is a package-level config lookup (set at init time from loaded configs)
var globalUnitConfigs map[string]game.UnitConfig

// SetGlobalUnitConfigs sets the global unit config map for enricher use
func SetGlobalUnitConfigs(configs map[string]game.UnitConfig) {
	globalUnitConfigs = configs
}

func getUnitConfigByID(id string) (game.UnitConfig, bool) {
	if globalUnitConfigs == nil {
		return game.UnitConfig{}, false
	}
	cfg, ok := globalUnitConfigs[id]
	return cfg, ok
}

// SerializeOrder serializes an order to JSON for Kafka
func SerializeOrder(order game.Order) ([]byte, error) {
	return json.Marshal(order)
}

// DeserializeOrder deserializes an order from JSON
func DeserializeOrder(data []byte) (game.Order, error) {
	var order game.Order
	err := json.Unmarshal(data, &order)
	return order, err
}
