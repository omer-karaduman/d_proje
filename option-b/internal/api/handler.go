package api

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"

	"ring-of-the-middle-earth/internal/engine"
	"ring-of-the-middle-earth/internal/game"
)

// Handler implements all HTTP endpoints from Section 34 of the spec.
// Endpoints:
//   POST /game/start
//   POST /order
//   GET  /game/state
//   GET  /orders/available
//   GET  /analysis/routes
//   GET  /analysis/intercept
//   GET  /events
//   GET  /health

// Handler holds all dependencies for API handlers
type Handler struct {
	cache     *engine.CacheManager
	router    *engine.EventRouter
	pipeline1 *engine.Pipeline1
	pipeline2 *engine.Pipeline2
	kafkaCh   chan<- []byte
	session   *game.GameSession
}

// NewHandler creates a new API handler
func NewHandler(
	cache *engine.CacheManager,
	router *engine.EventRouter,
	p1 *engine.Pipeline1,
	p2 *engine.Pipeline2,
	kafkaCh chan<- []byte,
	session *game.GameSession,
) *Handler {
	return &Handler{
		cache:     cache,
		router:    router,
		pipeline1: p1,
		pipeline2: p2,
		kafkaCh:   kafkaCh,
		session:   session,
	}
}

// RegisterRoutes registers all HTTP routes
func (h *Handler) RegisterRoutes(r *mux.Router) {
	r.HandleFunc("/game/start", h.StartGame).Methods("POST")
	r.HandleFunc("/order", h.SubmitOrder).Methods("POST")
	r.HandleFunc("/game/state", h.GetGameState).Methods("GET")
	r.HandleFunc("/orders/available", h.GetAvailableOrders).Methods("GET")
	r.HandleFunc("/analysis/routes", h.GetRouteAnalysis).Methods("GET")
	r.HandleFunc("/analysis/intercept", h.GetInterceptAnalysis).Methods("GET")
	r.HandleFunc("/events", h.StreamEvents).Methods("GET")
	r.HandleFunc("/health", h.Health).Methods("GET")

	// CORS middleware
	r.Use(corsMiddleware)
}

// StartGame handles POST /game/start
func (h *Handler) StartGame(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Mode string `json:"mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	if req.Mode != "HVH" {
		http.Error(w, "only HVH mode supported", http.StatusBadRequest)
		return
	}
	h.session.Phase = game.InProgress
	
	// Reset the timer when the game starts
	state := h.cache.GetSnapshot()
	state.Session.Phase = game.InProgress
	state.TurnStartedAt = time.Now().Unix()
	h.cache.Update(state)
	
	respondJSON(w, http.StatusOK, map[string]string{"status": "started", "mode": req.Mode})
}

// SubmitOrder handles POST /order — publishes to game.orders.raw; returns 202
func (h *Handler) SubmitOrder(w http.ResponseWriter, r *http.Request) {
	var order game.Order
	if err := json.NewDecoder(r.Body).Decode(&order); err != nil {
		http.Error(w, "invalid order format", http.StatusBadRequest)
		return
	}

	// Publish to game.orders.raw via Kafka producer channel
	payload, err := json.Marshal(order)
	if err != nil {
		http.Error(w, "serialization error", http.StatusInternalServerError)
		return
	}

	select {
	case h.kafkaCh <- payload:
		w.WriteHeader(http.StatusAccepted)
	default:
		http.Error(w, "queue full", http.StatusServiceUnavailable)
	}
}

// GetGameState handles GET /game/state
// Ring Bearer region is stripped for Dark Side
func (h *Handler) GetGameState(w http.ResponseWriter, r *http.Request) {
	playerID := r.URL.Query().Get("playerId")
	state := h.cache.GetSnapshot()

	// Determine player side from session (in a real system this would check auth)
	// For now, check if player is light or dark based on query param
	isDarkSide := r.URL.Query().Get("side") == "SHADOW"

	// Build response
	publicUnits := make(map[string]interface{})
	for unitID, u := range state.Units {
		cfg, ok := state.UnitConfigs[unitID]
		if !ok {
			continue
		}
		unitData := map[string]interface{}{
			"id":       u.ID,
			"strength": u.Strength,
			"status":   u.Status,
			"region":   u.Region,
		}
		// Enforce information hiding: Ring Bearer region is always "" for Dark Side
		if isDarkSide && cfg.Class == game.RingBearer {
			unitData["currentRegion"] = "" // ALWAYS "" for Dark Side
			unitData["region"] = ""
		}
		publicUnits[unitID] = unitData
	}

	response := map[string]interface{}{
		"turn":             state.Turn,
		"turnStartedAt":    state.TurnStartedAt,
		"turnDurationSec":  int(state.Session.TurnDuration),
		"turnRemainingSec": int(state.Session.TurnDuration) - int(time.Now().Unix()-state.TurnStartedAt),
		"units":          publicUnits,
		"regions":        state.Regions,
		"paths":          state.Paths,
		"session":        state.Session,
	}

	// Light Side gets ring bearer position via both top-level and lightView fields
	if !isDarkSide {
		rbRegion := state.LightView.RingBearerRegion
		response["ringBearerRegion"] = rbRegion
		response["lightView"] = map[string]interface{}{
			"ringBearerRegion": rbRegion,
			"assignedRoute":    state.LightView.AssignedRoute,
			"routeIdx":         state.LightView.RouteIdx,
		}
	}
	// Dark Side NEVER gets ring bearer position
	if isDarkSide {
		response["lastDetectedRegion"] = state.DarkView.LastDetectedRegion
		response["lastDetectedTurn"] = state.DarkView.LastDetectedTurn
		// response does NOT include ringBearerRegion
	}

	log.Printf("GetGameState: player=%s isDark=%v", playerID, isDarkSide)
	respondJSON(w, http.StatusOK, response)
}

// GetAvailableOrders handles GET /orders/available?unitId=X&playerId=Y
func (h *Handler) GetAvailableOrders(w http.ResponseWriter, r *http.Request) {
	unitID := r.URL.Query().Get("unitId")
	playerID := r.URL.Query().Get("playerId")
	isDarkSide := r.URL.Query().Get("side") == "SHADOW"

	state := h.cache.GetSnapshot()
	unit, ok := state.Units[unitID]
	if !ok {
		respondJSON(w, http.StatusOK, []string{})
		return
	}

	cfg, ok := state.UnitConfigs[unitID]
	if !ok {
		respondJSON(w, http.StatusOK, []string{})
		return
	}

	// Verify unit belongs to player's side
	if isDarkSide && cfg.Side != game.Shadow {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "NOT_YOUR_UNIT"})
		return
	}
	if !isDarkSide && cfg.Side != game.FreePeoples {
		respondJSON(w, http.StatusForbidden, map[string]string{"error": "NOT_YOUR_UNIT"})
		return
	}

	if unit.Status != game.Active {
		respondJSON(w, http.StatusOK, []string{})
		return
	}

	orders := computeAvailableOrders(unit, cfg, state, isDarkSide)
	log.Printf("GetAvailableOrders: player=%s unit=%s orders=%v", playerID, unitID, orders)
	respondJSON(w, http.StatusOK, orders)
}

// GetRouteAnalysis handles GET /analysis/routes (Light Side only)
func (h *Handler) GetRouteAnalysis(w http.ResponseWriter, r *http.Request) {
	isDarkSide := r.URL.Query().Get("side") == "SHADOW"
	if isDarkSide {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	state := h.cache.GetSnapshot()
	result := h.pipeline1.Request(state)
	respondJSON(w, http.StatusOK, result)
}

// GetInterceptAnalysis handles GET /analysis/intercept (Dark Side only)
func (h *Handler) GetInterceptAnalysis(w http.ResponseWriter, r *http.Request) {
	isDarkSide := r.URL.Query().Get("side") == "SHADOW"
	if !isDarkSide {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}

	state := h.cache.GetSnapshot()
	// Dark Side doesn't know true region, but engine uses last detected
	lastDetected := state.DarkView.LastDetectedRegion
	result := h.pipeline2.Request(state, lastDetected)
	respondJSON(w, http.StatusOK, result)
}

// StreamEvents handles GET /events — SSE stream
func (h *Handler) StreamEvents(w http.ResponseWriter, r *http.Request) {
	playerID := r.URL.Query().Get("playerId")
	sideStr := r.URL.Query().Get("side")

	var side game.Side
	if sideStr == "SHADOW" {
		side = game.Shadow
	} else {
		side = game.FreePeoples
	}

	h.router.ServeSSE(w, r, playerID, side)
}

// Health handles GET /health
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "ring-of-the-middle-earth",
		"version": os.Getenv("APP_VERSION"),
	})
}

// computeAvailableOrders returns the list of legal orders for a unit
func computeAvailableOrders(unit game.UnitSnapshot, cfg game.UnitConfig, state game.WorldStateCache, isDarkSide bool) []string {
	var orders []string

	// All active units can assign/redirect routes
	orders = append(orders, string(game.AssignRouteOrder))
	if len(unit.Route) > 0 {
		orders = append(orders, string(game.RedirectUnitOrder))
	}

	// Dark Side only
	if isDarkSide {
		orders = append(orders, string(game.SearchPathOrder))
		if cfg.DetectionRange > 0 { // Nazgul — config-driven
			orders = append(orders, string(game.DeployNazgulOrder))
			orders = append(orders, string(game.BlockPathOrder))
		}
	}

	// Light Side only
	if !isDarkSide {
		if cfg.CanFortify {
			orders = append(orders, string(game.FortifyRegionOrder))
		}
		// RingBearer at mount-doom can destroy ring
		if cfg.Class == game.RingBearer {
			if state.LightView.RingBearerRegion == "mount-doom" {
				orders = append(orders, string(game.DestroyRingOrder))
			}
		}
	}

	// Maia ability — available when cooldown is 0 and not passive
	if cfg.IsMaia && unit.Cooldown == 0 {
		abilityType := game.DispatchMaiaAbility(cfg)
		if abilityType != "PASSIVE" && abilityType != "" {
			orders = append(orders, string(game.MaiaAbilityOrder))
		}
	}

	// Attack/Reinforce adjacent enemies
	orders = append(orders, string(game.AttackRegionOrder))
	orders = append(orders, string(game.ReinforceRegionOrder))

	return orders
}

// respondJSON writes a JSON response
func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

// corsMiddleware adds CORS headers for browser access
func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
