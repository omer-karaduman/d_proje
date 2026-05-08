package engine

import (
	"fmt"
	"log"
	"sync"
	"time"

	"ring-of-the-middle-earth/internal/game"
)

// TurnProcessor executes the 13-step turn processing from Section 6.
// Reads from engineCh (validated orders), produces events to eventProducerCh.
// All game logic is config-driven — no unit ID literals.

// TurnProcessor manages turn-by-turn game state processing
type TurnProcessor struct {
	cache          *CacheManager
	engineCh       <-chan ValidatedOrder
	producerCh     chan<- GameEvent
	graph          *game.Graph
	session        *game.GameSession
	ringBearer     *game.RingBearerState
	unitConfigs    map[string]game.UnitConfig
	ordersThisTurn map[string]game.Order
	pipeline2      *Pipeline2
	mu             sync.Mutex
	gameOver       bool // set true after win condition fires; stops processing
}

// ValidatedOrder represents an order that passed Topology 1 validation
type ValidatedOrder struct {
	Order         game.Order
	RouteRiskScore *int
}

// GameEvent is an event produced by the engine to Kafka topics
type GameEvent struct {
	Topic   string
	Payload interface{}
}

// NewTurnProcessor creates a new TurnProcessor
func NewTurnProcessor(
	cache *CacheManager,
	engineCh <-chan ValidatedOrder,
	producerCh chan<- GameEvent,
	graph *game.Graph,
	session *game.GameSession,
	unitConfigs map[string]game.UnitConfig,
	p2 *Pipeline2,
) *TurnProcessor {
	return &TurnProcessor{
		cache:          cache,
		engineCh:       engineCh,
		producerCh:     producerCh,
		graph:          graph,
		session:        session,
		ringBearer:     &game.RingBearerState{TrueRegion: "the-shire"},
		unitConfigs:    unitConfigs,
		ordersThisTurn: make(map[string]game.Order),
		pipeline2:      p2,
	}
}

// Run starts the turn processor goroutine
func (tp *TurnProcessor) Run(wg *sync.WaitGroup, done <-chan struct{}) {
	defer wg.Done()
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			log.Println("TurnProcessor: shutting down")
			return

		case order, ok := <-tp.engineCh:
			if !ok {
				return
			}
			
			if order.Order.OrderType == game.StartGameOrder {
				tp.processStartGame()
				continue
			}
			if order.Order.OrderType == game.ResetGameOrder {
				tp.processResetGame()
				continue
			}

			if tp.gameOver {
				continue // drop orders once game is over
			}
			tp.mu.Lock()
			tp.ordersThisTurn[order.Order.UnitID] = order.Order
			tp.mu.Unlock()

		case <-ticker.C:
			if tp.gameOver {
				// Game is already over — stop the ticker and exit
				ticker.Stop()
				log.Println("TurnProcessor: game over, stopping turn loop")
				return
			}
			
			state := tp.cache.GetSnapshot()
			if state.Session.Phase != game.InProgress {
				continue
			}
			
			elapsed := time.Now().Unix() - state.TurnStartedAt
			if elapsed >= int64(tp.session.TurnDuration) {
				tp.processTurn()
			}
		}
	}
}

func (tp *TurnProcessor) processStartGame() {
	state := tp.cache.GetSnapshot()
	state.Session.Phase = game.InProgress
	state.TurnStartedAt = time.Now().Unix()
	tp.cache.Update(state)

	tp.emitWorldStateSnapshot(state)
	log.Printf("[StartGame] broadcasted WorldStateSnapshot turnStartedAt=%d", state.TurnStartedAt)
}

func (tp *TurnProcessor) processResetGame() {
	state := tp.cache.GetSnapshot()

	// Reset session
	tp.session.Phase = game.WaitingForPlayers
	tp.session.CurrentTurn = 1

	// Dynamic Ring Bearer start region
	ringBearerStart := ""
	
	// Reset each unit to its starting state from UnitConfigs
	resetUnits := make(map[string]game.UnitSnapshot, len(state.Units))
	for id, cfg := range tp.unitConfigs {
		region := cfg.StartRegion
		if cfg.Class == game.RingBearer {
			ringBearerStart = cfg.StartRegion
			region = ""
		}
		resetUnits[id] = game.UnitSnapshot{
			ID:           id,
			Region:       region,
			Strength:     cfg.Strength,
			Status:       game.Active,
			RespawnTurns: 0,
			Route:        nil,
			RouteIdx:     0,
			Cooldown:     0,
		}
	}

	// Reset regions: clear control and fortification
	resetRegions := make(map[string]game.RegionState, len(state.Regions))
	for id, reg := range state.Regions {
		reg.ControlledBy = ""
		reg.Fortified = false
		reg.FortifyTurns = 0
		reg.ThreatLevel = 0
		resetRegions[id] = reg
	}

	// Reset paths: clear surveillance and blocks
	resetPaths := make(map[string]game.PathState, len(state.Paths))
	for id, p := range state.Paths {
		p.Status = game.Open
		p.SurveillanceLevel = 0
		p.BlockedBy = ""
		p.TempOpenTurns = 0
		p.Corrupted = false
		resetPaths[id] = p
	}

	// Update RingBearer state tracker
	tp.ringBearer.TrueRegion = ringBearerStart
	tp.ringBearer.Exposed = false
	tp.ringBearer.Route = nil
	tp.ringBearer.RouteIdx = 0
	tp.ringBearer.LastDetectedTurn = 0
	tp.ringBearer.LastDetectedRegion = ""

	newState := state
	newState.Turn = 1
	newState.TurnStartedAt = time.Now().Unix()
	newState.Units = resetUnits
	newState.Regions = resetRegions
	newState.Paths = resetPaths
	newState.Session = *tp.session
	newState.Session.CurrentTurn = 1
	newState.LightView = game.LightSideView{RingBearerRegion: ringBearerStart}
	newState.DarkView = game.DarkSideView{RingBearerRegion: "", LastDetectedRegion: "", LastDetectedTurn: 0}
	tp.cache.Update(newState)

	// Broadcast reset event to all SSE clients via existing game.broadcast topic
	tp.emit("game.broadcast", map[string]interface{}{
		"type":    "GameReset",
		"turn":    1,
		"message": "Oyun sıfırlandı.",
	})
	tp.gameOver = false

	log.Println("[reset] Game state reset to turn 1")
}

// processTurn executes all 13 steps of turn processing
func (tp *TurnProcessor) processTurn() {
	tp.mu.Lock()
	orders := tp.ordersThisTurn
	tp.ordersThisTurn = make(map[string]game.Order)
	tp.mu.Unlock()

	state := tp.cache.GetSnapshot()
	turn := state.Turn

	// Record when this turn started — used by clients to sync their countdown timer
	state.TurnStartedAt = time.Now().Unix()

	log.Printf("TurnProcessor: processing turn %d with %d orders", turn, len(orders))

	// Step 1: Collect validated orders (already done via channel)

	// Step 2: Process AssignRoute and RedirectUnit
	state = tp.stepAssignRoutes(state, orders)

	// Step 3: Process BlockPath and SearchPath
	state = tp.stepBlockAndSearch(state, orders)

	// Step 4: Process ReinforceRegion and DeployNazgul
	state = tp.stepReinforce(state, orders)

	// Step 5: Process FortifyRegion
	state = tp.stepFortify(state, orders)

	// Step 6: Process MaiaAbility
	state = tp.stepMaiaAbilities(state, orders)

	// Step 7: Auto-advance all units with routes
	state = tp.stepAutoAdvance(state, turn)

	// Step 8: Process AttackRegion
	state = tp.stepCombat(state, orders, turn)

	// Step 9: Decrement TEMPORARILY_OPEN timers
	state = tp.stepTempOpenTimers(state)

	// Step 10: Decrement fortification timers
	state = tp.stepFortificationTimers(state)

	// Step 11: Decrement respawn and cooldown counters
	state = tp.stepRespawnAndCooldown(state)

	// Step 12: Run detection check
	state = tp.stepDetection(state, turn)

	// Step 13: Evaluate win conditions (pass orders for DestroyRing check)
	isGameOver, result := tp.stepWinConditions(state, orders, turn)

	// Advance turn only if game is still running
	if !isGameOver {
		state.Turn = turn + 1
	}

	// Update cache
	tp.cache.Update(state)

	// Emit WorldStateSnapshot
	tp.emitWorldStateSnapshot(state)

	if isGameOver {
		tp.gameOver = true // prevent further processing
		tp.emitGameOver(result, turn)
		log.Printf("TurnProcessor: game ended at turn %d", turn)
	}
}

// stepAssignRoutes processes ASSIGN_ROUTE and REDIRECT_UNIT orders
func (tp *TurnProcessor) stepAssignRoutes(state game.WorldStateCache, orders map[string]game.Order) game.WorldStateCache {
	for unitID, order := range orders {
		switch order.OrderType {
		case game.AssignRouteOrder, game.RedirectUnitOrder:
			unit, ok := state.Units[unitID]
			if !ok {
				continue
			}
			pathIDs := extractPathIDs(order)
			unit.Route = pathIDs
			unit.RouteIdx = 0
			state.Units[unitID] = unit
			tp.emit("game.events.unit", map[string]interface{}{
				"event":  "RouteAssigned",
				"unitId": unitID,
				"route":  pathIDs,
			})
		}
	}
	return state
}

// stepBlockAndSearch processes BLOCK_PATH and SEARCH_PATH orders
func (tp *TurnProcessor) stepBlockAndSearch(state game.WorldStateCache, orders map[string]game.Order) game.WorldStateCache {
	for unitID, order := range orders {
		unit, ok := state.Units[unitID]
		if !ok || unit.Status != game.Active {
			continue
		}

		switch order.OrderType {
		case game.BlockPathOrder:
			pathID, _ := order.Payload["pathId"].(string)
			path, ok := state.Paths[pathID]
			if !ok {
				continue
			}
			// Verify unit is at an endpoint
			if !tp.graph.IsEndpointRegion(pathID, unit.Region) {
				continue
			}
			// Check if any Free Peoples unit is at endpoint (prevents blocking)
			if tp.friendlyUnitAtEndpoint(state, pathID, unit.Region, game.FreePeoples) {
				continue
			}
			path.Status = game.Blocked
			path.BlockedBy = unitID
			state.Paths[pathID] = path
			tp.emit("game.events.path", map[string]interface{}{
				"event":  "PathStatusChanged",
				"pathId": pathID,
				"status": game.Blocked,
			})

		case game.SearchPathOrder:
			pathID, _ := order.Payload["pathId"].(string)
			path, ok := state.Paths[pathID]
			if !ok {
				continue
			}
			if path.SurveillanceLevel < 3 {
				path.SurveillanceLevel++
				state.Paths[pathID] = path
				tp.emit("game.events.path", map[string]interface{}{
					"event":             "PathStatusChanged",
					"pathId":            pathID,
					"surveillanceLevel": path.SurveillanceLevel,
				})
			}
		}
	}

	// Revert BLOCKED paths if blocking unit is no longer at endpoint
	for pathID, path := range state.Paths {
		if path.Status == game.Blocked && path.BlockedBy != "" {
			blocker, ok := state.Units[path.BlockedBy]
			if !ok || blocker.Status != game.Active ||
				!tp.graph.IsEndpointRegion(pathID, blocker.Region) {
				path.Status = game.Open
				path.BlockedBy = ""
				state.Paths[pathID] = path
				tp.emit("game.events.path", map[string]interface{}{
					"event":  "PathStatusChanged",
					"pathId": pathID,
					"status": game.Open,
				})
			}
		}
	}
	return state
}

// stepReinforce processes REINFORCE_REGION and DEPLOY_NAZGUL orders
func (tp *TurnProcessor) stepReinforce(state game.WorldStateCache, orders map[string]game.Order) game.WorldStateCache {
	for unitID, order := range orders {
		unit, ok := state.Units[unitID]
		if !ok || unit.Status != game.Active {
			continue
		}
		switch order.OrderType {
		case game.ReinforceRegionOrder:
			target, _ := order.Payload["targetRegion"].(string)
			if _, ok := state.Regions[target]; !ok {
				continue
			}
			// Adjacency check: unit must be at an endpoint of a path leading to target
			if target != unit.Region && !tp.graph.AreAdjacent(unit.Region, target) {
				log.Printf("TurnProcessor: REINFORCE rejected — %s not adjacent to %s", unit.Region, target)
				continue
			}
			unit.Region = target
			state.Units[unitID] = unit
			tp.emit("game.events.unit", map[string]interface{}{
				"event":  "UnitMoved",
				"unitId": unitID,
				"to":     target,
			})
		case game.DeployNazgulOrder:
			target, _ := order.Payload["targetRegion"].(string)
			if _, ok := state.Regions[target]; !ok {
				continue
			}
			// Nazgul can deploy to any reachable region (flying — no adjacency limit)
			unit.Region = target
			state.Units[unitID] = unit
		}
	}
	return state
}

// stepFortify processes FORTIFY_REGION orders
func (tp *TurnProcessor) stepFortify(state game.WorldStateCache, orders map[string]game.Order) game.WorldStateCache {
	for unitID, order := range orders {
		if order.OrderType != game.FortifyRegionOrder {
			continue
		}
		unit, ok := state.Units[unitID]
		if !ok || unit.Status != game.Active {
			continue
		}
		cfg, ok := tp.unitConfigs[unitID]
		if !ok || !cfg.CanFortify {
			continue
		}
		region, ok := state.Regions[unit.Region]
		if !ok {
			continue
		}
		region.Fortified = true
		region.FortifyTurns = 2
		state.Regions[unit.Region] = region
		tp.emit("game.events.region", map[string]interface{}{
			"event":    "RegionFortified",
			"regionId": unit.Region,
		})
	}
	return state
}

// stepMaiaAbilities processes MAIA_ABILITY orders — dispatched by config, not by unit ID
func (tp *TurnProcessor) stepMaiaAbilities(state game.WorldStateCache, orders map[string]game.Order) game.WorldStateCache {
	for unitID, order := range orders {
		if order.OrderType != game.MaiaAbilityOrder {
			continue
		}
		cfg, ok := tp.unitConfigs[unitID]
		if !ok || !cfg.IsMaia {
			continue
		}
		unit, ok := state.Units[unitID]
		if !ok || unit.Status != game.Active || unit.Cooldown > 0 {
			continue
		}

		targetPathID, _ := order.Payload["targetPathId"].(string)
		if targetPathID == "" {
			// Frontend sends "pathId"; accept both keys for compatibility
			targetPathID, _ = order.Payload["pathId"].(string)
		}
		path, ok := state.Paths[targetPathID]
		if !ok {
			continue
		}

		// Dispatch based on config — NEVER on unit ID string literal
		abilityType := game.DispatchMaiaAbility(cfg)
		switch abilityType {
		case "OPEN_PATH":
			// Gandalf-type: must be at endpoint of a BLOCKED path
			if path.Status != game.Blocked {
				continue
			}
			if !tp.graph.IsEndpointRegion(targetPathID, unit.Region) {
				continue
			}
			path.Status = game.TemporarilyOpen
			path.TempOpenTurns = 2
			state.Paths[targetPathID] = path
			unit.Cooldown = cfg.Cooldown
			state.Units[unitID] = unit
			tp.emit("game.events.path", map[string]interface{}{
				"event":         "PathStatusChanged",
				"pathId":        targetPathID,
				"status":        game.TemporarilyOpen,
				"tempOpenTurns": 2,
			})

		case "CORRUPT_PATH":
			// Saruman-type: must be at endpoint, path in maiaAbilityPaths
			if !cfg.IsMaiaAbilityPath(targetPathID) {
				continue
			}
			if !tp.graph.IsEndpointRegion(targetPathID, unit.Region) {
				continue
			}
			path.SurveillanceLevel = 3
			path.Corrupted = true
			state.Paths[targetPathID] = path
			unit.Cooldown = cfg.Cooldown
			state.Units[unitID] = unit
			tp.emit("game.events.path", map[string]interface{}{
				"event":             "PathCorrupted",
				"pathId":            targetPathID,
				"surveillanceLevel": 3,
			})

		case "PASSIVE":
			// Sauron-type: no active order needed
		}
	}
	return state
}

// stepAutoAdvance auto-advances all units with assigned routes
func (tp *TurnProcessor) stepAutoAdvance(state game.WorldStateCache, turn int) game.WorldStateCache {
	for unitID, unit := range state.Units {
		if unit.Status != game.Active || len(unit.Route) == 0 || unit.RouteIdx >= len(unit.Route) {
			continue
		}

		pathID := unit.Route[unit.RouteIdx]
		path, ok := state.Paths[pathID]
		if !ok {
			continue
		}

		cfg := tp.unitConfigs[unitID]

		// Check if path is blocked
		if path.Status == game.Blocked {
			tp.emit("game.events.unit", map[string]interface{}{
				"event":  "RouteBlocked",
				"unitId": unitID,
				"pathId": pathID,
			})
			continue
		}

		// Determine source region.
		// IMPORTANT: Ring Bearer's unit.Region is always "" for info hiding.
		// Use the internal TrueRegion tracker for movement direction.
		var fromRegion string
		if cfg.Class == game.RingBearer {
			fromRegion = tp.ringBearer.TrueRegion // authoritative secret position
			if fromRegion == "" {
				// Fallback: read from LightView (set at initialisation)
				fromRegion = state.LightView.RingBearerRegion
			}
		} else {
			fromRegion = unit.Region
		}

		// Determine destination region
		toRegion := ""
		if path.From == fromRegion {
			toRegion = path.To
		} else if path.To == fromRegion {
			toRegion = path.From
		} else {
			// Unit is not at either endpoint of this path — skip this step
			log.Printf("TurnProcessor: %s is not at endpoint of path %s (at=%q from=%q to=%q), skipping",
				unitID, pathID, fromRegion, path.From, path.To)
			continue
		}

		// Move the unit
		unit.Region = toRegion
		unit.RouteIdx++

		// Ring Bearer handling — config-driven: RingBearer class never exposes true region
		if cfg.Class == game.RingBearer {
			// Update ring bearer secret state
			tp.ringBearer.TrueRegion = toRegion
			tp.ringBearer.RouteIdx = unit.RouteIdx
			// Keep LightView in sync so /game/state always returns correct position
			state.LightView.RingBearerRegion = toRegion

			// Check surveillance exposure
			if game.CheckRingBearerExposedByPath(path, turn, state.Session.HiddenUntil) {
				tp.ringBearer.Exposed = true
				tp.emit("game.ring.detection", map[string]interface{}{
					"event":  "RingBearerSpotted",
					"pathId": pathID,
					"turn":   turn,
				})
			}

			// Emit to Light Side only
			tp.emit("game.ring.position", map[string]interface{}{
				"event":      "RingBearerMoved",
				"trueRegion": toRegion,
				"turn":       turn,
			})

			// In public state, ring bearer region is always ""
			unit.Region = ""
		}

		state.Units[unitID] = unit

		// Check route completion
		if unit.RouteIdx >= len(unit.Route) {
			tp.emit("game.events.unit", map[string]interface{}{
				"event":  "RouteComplete",
				"unitId": unitID,
			})
		} else {
			tp.emit("game.events.unit", map[string]interface{}{
				"event":  "UnitMoved",
				"unitId": unitID,
				"from":   fromRegion,
				"to":     toRegion,
				"turn":   turn,
			})
		}
	}
	return state
}

// stepCombat processes ATTACK_REGION orders
func (tp *TurnProcessor) stepCombat(state game.WorldStateCache, orders map[string]game.Order, turn int) game.WorldStateCache {
	// Group attacks by target region
	attacksByRegion := map[string][]string{} // targetRegion -> []attackerUnitIDs
	for unitID, order := range orders {
		if order.OrderType != game.AttackRegionOrder {
			continue
		}
		target, _ := order.Payload["targetRegion"].(string)
		if target == "" {
			continue
		}
		// Check attacker adjacency: must be at or adjacent to target region
		attackerUnit, unitOK := state.Units[unitID]
		if !unitOK || attackerUnit.Status != game.Active {
			continue
		}
		if attackerUnit.Region != target && !tp.graph.AreAdjacent(attackerUnit.Region, target) {
			log.Printf("TurnProcessor: ATTACK rejected — %s (%s) not adjacent to %s", unitID, attackerUnit.Region, target)
			continue
		}
		attacksByRegion[target] = append(attacksByRegion[target], unitID)
	}

	for targetRegion, attackerIDs := range attacksByRegion {
		region, ok := state.Regions[targetRegion]
		if !ok {
			continue
		}

		// Collect attackers and defenders
		var attackers, defenders []game.UnitWithConfig
		for _, uid := range attackerIDs {
			u, ok := state.Units[uid]
			if !ok || u.Status != game.Active {
				continue
			}
			cfg := tp.unitConfigs[uid]
			attackers = append(attackers, game.UnitWithConfig{Snapshot: u, Config: cfg})
		}

		attackerSide := game.FreePeoples
		if len(attackers) > 0 {
			attackerSide = attackers[0].Config.Side
		}

		for uid, u := range state.Units {
			if u.Status != game.Active || u.Region != targetRegion {
				continue
			}
			cfg := tp.unitConfigs[uid]
			if cfg.Side != attackerSide {
				defenders = append(defenders, game.UnitWithConfig{Snapshot: u, Config: cfg})
			}
		}

		if len(defenders) == 0 {
			// No defenders — attackers take region
			region.ControlledBy = game.Controller(attackerSide)
			for _, a := range attackers {
				u := state.Units[a.Snapshot.ID]
				u.Region = targetRegion
				state.Units[a.Snapshot.ID] = u
			}
			state.Regions[targetRegion] = region
			continue
		}

		result := game.ResolveCombat(attackers, defenders, region)
		tp.emit("game.events.region", map[string]interface{}{
			"event":       "BattleResolved",
			"regionId":    targetRegion,
			"attackerWon": result.AttackerWon,
			"turn":        turn,
		})

		if result.AttackerWon {
			// Apply damage to defenders
			for _, d := range defenders {
				u := state.Units[d.Snapshot.ID]
				cfg := tp.unitConfigs[d.Snapshot.ID]
				u = game.ApplyDamage(u, cfg, result.Damage)
				state.Units[d.Snapshot.ID] = u
			}
			// Move attackers in
			region.ControlledBy = game.Controller(attackerSide)
			for _, a := range attackers {
				u := state.Units[a.Snapshot.ID]
				u.Region = targetRegion
				state.Units[a.Snapshot.ID] = u
			}

			// Check if Isengard fell — disables Saruman (config-driven: SHADOW_STRONGHOLD region)
			if region.SpecialRole == game.ShadowStronghold && attackerSide == game.FreePeoples {
				tp.disableSarumanIfIsengardFell(state, targetRegion)
			}
		} else {
			// Attackers repelled — each loses 1 strength
			for _, a := range attackers {
				u := state.Units[a.Snapshot.ID]
				cfg := tp.unitConfigs[a.Snapshot.ID]
				u = game.ApplyDamage(u, cfg, 1)
				state.Units[a.Snapshot.ID] = u
			}
		}
		state.Regions[targetRegion] = region
	}
	return state
}

// disableSarumanIfIsengardFell disables the Shadow Maia with MaiaAbilityPaths when Isengard falls.
// Config-driven: identified by IsMaia=true, Shadow side, non-empty MaiaAbilityPaths.
func (tp *TurnProcessor) disableSarumanIfIsengardFell(state game.WorldStateCache, fallenRegion string) {
	for unitID, u := range state.Units {
		cfg, ok := tp.unitConfigs[unitID]
		if !ok {
			continue
		}
		// Saruman-equivalent: Shadow Maia at the fallen SHADOW_STRONGHOLD with ability paths
		if cfg.IsMaia && cfg.Side == game.Shadow && len(cfg.MaiaAbilityPaths) > 0 &&
			u.Region == fallenRegion {
			u.Status = game.Destroyed
			state.Units[unitID] = u
			tp.emit("game.events.unit", map[string]interface{}{
				"event":  "MaiaDisabled",
				"unitId": unitID,
				"region": fallenRegion,
			})
		}
	}
}

// stepTempOpenTimers decrements TEMPORARILY_OPEN path timers
func (tp *TurnProcessor) stepTempOpenTimers(state game.WorldStateCache) game.WorldStateCache {
	for pathID, path := range state.Paths {
		if path.Status == game.TemporarilyOpen {
			path.TempOpenTurns--
			if path.TempOpenTurns <= 0 {
				// Revert: BLOCKED if blocker still present, else OPEN
				if path.BlockedBy != "" {
					blocker, ok := state.Units[path.BlockedBy]
					if ok && blocker.Status == game.Active &&
						tp.graph.IsEndpointRegion(pathID, blocker.Region) {
						path.Status = game.Blocked
					} else {
						path.Status = game.Open
						path.BlockedBy = ""
					}
				} else {
					path.Status = game.Open
				}
			}
			state.Paths[pathID] = path
		}
	}
	return state
}

// stepFortificationTimers decrements fortification timers
func (tp *TurnProcessor) stepFortificationTimers(state game.WorldStateCache) game.WorldStateCache {
	for regionID, region := range state.Regions {
		if region.Fortified {
			region.FortifyTurns--
			if region.FortifyTurns <= 0 {
				region.Fortified = false
				region.FortifyTurns = 0
			}
			state.Regions[regionID] = region
		}
	}
	return state
}

// stepRespawnAndCooldown decrements respawn and cooldown counters
func (tp *TurnProcessor) stepRespawnAndCooldown(state game.WorldStateCache) game.WorldStateCache {
	for unitID, unit := range state.Units {
		cfg := tp.unitConfigs[unitID]
		changed := false
		if unit.Status == game.Respawning {
			unit.RespawnTurns--
			if unit.RespawnTurns <= 0 {
				unit.Status = game.Active
				unit.Region = cfg.StartRegion
				unit.Strength = cfg.Strength
				unit.RespawnTurns = 0
			}
			changed = true
		}
		if unit.Cooldown > 0 {
			unit.Cooldown--
			changed = true
		}
		if changed {
			state.Units[unitID] = unit
		}
	}
	return state
}

// stepDetection runs the detection formula (Section 3.6)
func (tp *TurnProcessor) stepDetection(state game.WorldStateCache, turn int) game.WorldStateCache {
	var allUnits []game.UnitWithConfig
	for unitID, u := range state.Units {
		cfg := tp.unitConfigs[unitID]
		allUnits = append(allUnits, game.UnitWithConfig{Snapshot: u, Config: cfg})
	}

	// Determine Sauron effect — config-driven
	sauronActive := game.IsSauronEffectActive(allUnits)

	result := game.RunDetection(
		turn,
		state.Session.HiddenUntil,
		tp.ringBearer.TrueRegion,
		allUnits,
		tp.graph,
		sauronActive,
	)

	if result.Exposed {
		tp.ringBearer.Exposed = true
		tp.ringBearer.LastDetectedTurn = turn
		tp.ringBearer.LastDetectedRegion = result.TrueRegion
		// Emit to Dark Side only
		tp.emit("game.ring.detection", map[string]interface{}{
			"event":    "RingBearerDetected",
			"regionId": result.TrueRegion,
			"turn":     turn,
		})
		tp.emit("game.events.unit", map[string]interface{}{
			"event":    "RingBearerDetected",
			"regionId": result.TrueRegion,
			"turn":     turn,
		})
		
		// Trigger Interception Analysis (Pipeline 2) asynchronously per spec
		if tp.pipeline2 != nil {
			tp.pipeline2.TriggerAsync(state, result.TrueRegion)
		}
	}

	// Reset exposed at end of turn
	defer func() { tp.ringBearer.Exposed = false }()

	return state
}

// stepWinConditions evaluates win/draw conditions
// Spec 1.2: Light Side wins ONLY if DestroyRing order was submitted this turn.
func (tp *TurnProcessor) stepWinConditions(state game.WorldStateCache, orders map[string]game.Order, turn int) (bool, map[string]interface{}) {
	// Light Side wins: Ring Bearer at mount-doom + DestroyRing submitted + no Dark Side unit at mount-doom
	if tp.ringBearer.TrueRegion == "mount-doom" {
		// Check that DESTROY_RING order was submitted this turn
		destroyRingSubmitted := false
		for _, o := range orders {
			if o.OrderType == game.DestroyRingOrder {
				destroyRingSubmitted = true
				break
			}
		}
		if !destroyRingSubmitted {
			log.Printf("TurnProcessor: Ring Bearer at mount-doom but DESTROY_RING not submitted")
		}

		if destroyRingSubmitted {
			darkSideAtMountDoom := false
			for unitID, u := range state.Units {
				cfg := tp.unitConfigs[unitID]
				if cfg.Side == game.Shadow && u.Status == game.Active && u.Region == "mount-doom" {
					darkSideAtMountDoom = true
					break
				}
			}
			if !darkSideAtMountDoom {
				return true, map[string]interface{}{
					"winner": "LIGHT_SIDE",
					"cause":  "RING_DESTROYED",
					"turn":   turn,
				}
			}
		}
	}

	// Dark Side wins: any Nazgul at same region as Ring Bearer and Ring Bearer exposed
	if tp.ringBearer.Exposed {
		for unitID, u := range state.Units {
			cfg := tp.unitConfigs[unitID]
			if cfg.DetectionRange > 0 && u.Status == game.Active &&
				u.Region == tp.ringBearer.TrueRegion {
				return true, map[string]interface{}{
					"winner": "DARK_SIDE",
					"cause":  "RING_BEARER_CAPTURED",
					"turn":   turn,
				}
			}
		}
	}

	// Draw after max turns
	if turn >= state.Session.MaxTurns {
		return true, map[string]interface{}{
			"winner": "DRAW",
			"cause":  "MAX_TURNS_REACHED",
			"turn":   turn,
		}
	}

	return false, nil
}

// emit sends an event to the producer channel
func (tp *TurnProcessor) emit(topic string, payload interface{}) {
	select {
	case tp.producerCh <- GameEvent{Topic: topic, Payload: payload}:
	default:
		log.Printf("TurnProcessor: event channel full, dropping event on %s", topic)
	}
}

// emitWorldStateSnapshot emits the full world state to game.broadcast
func (tp *TurnProcessor) emitWorldStateSnapshot(state game.WorldStateCache) {
	// Build public units view — Ring Bearer region is always "" for public state
	publicUnits := make(map[string]game.UnitSnapshot, len(state.Units))
	for id, u := range state.Units {
		cfg := tp.unitConfigs[id]
		if cfg.Class == game.RingBearer {
			u.Region = "" // enforce information hiding in public state
		}
		publicUnits[id] = u
	}

	// Include ringBearerRegion (Light Side sees true region; stripRingBearer removes it for Dark Side)
	tp.emit("game.broadcast", map[string]interface{}{
		"event":             "WorldStateSnapshot",
		"turn":              state.Turn,
		"units":             publicUnits,
		"regions":           state.Regions,
		"paths":             state.Paths,
		"turnStartedAt":     state.TurnStartedAt,
		"turnDurationSec":   int(tp.session.TurnDuration),
		"turnRemainingSec":  int(tp.session.TurnDuration) - int(time.Now().Unix()-state.TurnStartedAt),
		"ringBearerRegion":  tp.ringBearer.TrueRegion, // Light Side only; stripped for Dark Side
	})
}


// emitGameOver emits GameOver with exactly-once semantics
func (tp *TurnProcessor) emitGameOver(result map[string]interface{}, turn int) {
	result["event"] = "GameOver"
	tp.emit("game.broadcast", result)
	log.Printf("TurnProcessor: GameOver emitted — %v", result)
}

// extractPathIDs extracts path IDs from order payload
func extractPathIDs(order game.Order) []string {
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

// friendlyUnitAtEndpoint checks if a unit of given side is at a path endpoint
func (tp *TurnProcessor) friendlyUnitAtEndpoint(state game.WorldStateCache, pathID, region string, side game.Side) bool {
	for unitID, u := range state.Units {
		if u.Status != game.Active || u.Region != region {
			continue
		}
		cfg := tp.unitConfigs[unitID]
		if cfg.Side == side {
			return true
		}
	}
	return false
}
