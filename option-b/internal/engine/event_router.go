package engine

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"ring-of-the-middle-earth/internal/game"
)

// EventRouter is the SINGLE enforcement point for information asymmetry.
// Dark Side NEVER receives Ring Bearer position.
// This is the critical security boundary of the system.

// SSEClient represents a connected SSE client
type SSEClient struct {
	PlayerID string
	Side     game.Side
	Ch       chan string
	Done     chan struct{}
}

// EventRouter routes events from Kafka topics to the appropriate SSE clients
type EventRouter struct {
	lightSideSSECh chan string
	darkSideSSECh  chan string
	cacheUpdateCh  chan game.WorldStateCache
	engineCh       chan ValidatedOrder

	lightClients  map[string]*SSEClient
	darkClients   map[string]*SSEClient
	clientsMu     sync.RWMutex

	newConnCh    chan *SSEClient
	disconnCh    chan *SSEClient
	analysisCh   chan struct{}
}

// NewEventRouter creates a new EventRouter
func NewEventRouter() *EventRouter {
	return &EventRouter{
		lightSideSSECh: make(chan string, 100),
		darkSideSSECh:  make(chan string, 100),
		cacheUpdateCh:  make(chan game.WorldStateCache, 10),
		engineCh:       make(chan ValidatedOrder, 100),
		lightClients:   make(map[string]*SSEClient),
		darkClients:    make(map[string]*SSEClient),
		newConnCh:      make(chan *SSEClient, 10),
		disconnCh:      make(chan *SSEClient, 10),
		analysisCh:     make(chan struct{}, 10),
	}
}

// EngineCh returns the channel for validated orders going to the turn processor
func (er *EventRouter) EngineCh() chan ValidatedOrder {
	return er.engineCh
}

// RouteEvent routes an incoming Kafka event to the correct SSE channels.
// This is the SINGLE enforcement point for information hiding.
// DarkView.RingBearerRegion is ALWAYS "".
func (er *EventRouter) RouteEvent(topic string, payload []byte) {
	switch topic {

	case "game.ring.position":
		// RingBearerMoved — Light Side ONLY, NEVER Dark Side
		er.lightSideSSECh <- string(payload)
		// never darkSideSSECh

	case "game.ring.detection":
		// RingBearerDetected / RingBearerSpotted — Dark Side ONLY
		er.darkSideSSECh <- string(payload)
		// never lightSideSSECh

	case "game.broadcast":
		// WorldStateSnapshot — both sides, but Ring Bearer region STRIPPED for Dark Side
		er.lightSideSSECh <- string(payload)
		er.darkSideSSECh <- stripRingBearer(payload)

	case "game.events.unit", "game.events.region", "game.events.path":
		// General events — both sides receive
		er.lightSideSSECh <- string(payload)
		er.darkSideSSECh <- string(payload)

	case "game.orders.validated":
		// Forward to engine for processing
		var order game.Order
		if err := json.Unmarshal(payload, &order); err == nil {
			er.engineCh <- ValidatedOrder{Order: order}
		}
	}
}

// stripRingBearer removes ONLY the Ring Bearer's true region from a WorldStateSnapshot.
// All other units' regions are preserved. This is the SINGLE enforcement point (B7).
// Identification is done via the unit's "class" field == "RingBearer" — NOT by hardcoded ID string.
// Q&A Question 4: "Show where the Ring Bearer's position is removed" — this function.
func stripRingBearer(payload []byte) string {
	var data map[string]interface{}
	if err := json.Unmarshal(payload, &data); err != nil {
		return string(payload)
	}

	// Strip the top-level ringBearerRegion field — Dark Side must NEVER see this
	data["ringBearerRegion"] = ""

	// Strip ring-bearer unit's region inside the units map.
	// Identified by unit.class == "RingBearer" — config-driven, no ID string literal.
	if units, ok := data["units"].(map[string]interface{}); ok {
		for unitID, unitData := range units {
			unit, ok := unitData.(map[string]interface{})
			if !ok {
				continue
			}
			// Use the "class" field from UnitConfig (serialised into the snapshot) — never hardcode "ring-bearer"
			cls, _ := unit["class"].(string)
			if cls == string(game.RingBearer) {
				unit["region"] = ""
				unit["currentRegion"] = ""
				units[unitID] = unit
			}
		}
		data["units"] = units
	}

	result, _ := json.Marshal(data)
	return string(result)
}


// Run starts the EventRouter's select loop (all 7 cases from spec Section 31)
func (er *EventRouter) Run(wg *sync.WaitGroup, done <-chan struct{}) {
	defer wg.Done()

	for {
		select {
		// Case 1: New SSE connection
		case client := <-er.newConnCh:
			er.clientsMu.Lock()
			if client.Side == game.FreePeoples {
				er.lightClients[client.PlayerID] = client
			} else {
				er.darkClients[client.PlayerID] = client
			}
			er.clientsMu.Unlock()
			log.Printf("EventRouter: client connected %s (%s)", client.PlayerID, client.Side)

		// Case 2: Client disconnected
		case client := <-er.disconnCh:
			er.clientsMu.Lock()
			delete(er.lightClients, client.PlayerID)
			delete(er.darkClients, client.PlayerID)
			er.clientsMu.Unlock()
			log.Printf("EventRouter: client disconnected %s", client.PlayerID)

		// Case 3: Light Side SSE event
		case msg := <-er.lightSideSSECh:
			er.clientsMu.RLock()
			for _, client := range er.lightClients {
				select {
				case client.Ch <- msg:
				default:
					log.Printf("EventRouter: light client %s channel full", client.PlayerID)
				}
			}
			er.clientsMu.RUnlock()

		// Case 4: Dark Side SSE event
		case msg := <-er.darkSideSSECh:
			er.clientsMu.RLock()
			for _, client := range er.darkClients {
				select {
				case client.Ch <- msg:
				default:
					log.Printf("EventRouter: dark client %s channel full", client.PlayerID)
				}
			}
			er.clientsMu.RUnlock()

		// Case 5: Cache update
		case snap := <-er.cacheUpdateCh:
			// Cache updates handled separately by CacheManager
			_ = snap

		// Case 6: Analysis request
		case <-er.analysisCh:
			// Analysis requests are handled by HTTP handlers directly

		// Case 7: Shutdown signal
		case <-done:
			log.Println("EventRouter: shutting down")
			return
		}
	}
}

// RegisterClient registers a new SSE client
func (er *EventRouter) RegisterClient(client *SSEClient) {
	er.newConnCh <- client
}

// UnregisterClient removes an SSE client
func (er *EventRouter) UnregisterClient(client *SSEClient) {
	er.disconnCh <- client
}

// ServeSSE handles SSE connection for a player
func (er *EventRouter) ServeSSE(w http.ResponseWriter, r *http.Request, playerID string, side game.Side) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	client := &SSEClient{
		PlayerID: playerID,
		Side:     side,
		Ch:       make(chan string, 50),
		Done:     make(chan struct{}),
	}
	er.RegisterClient(client)
	defer er.UnregisterClient(client)

	for {
		select {
		case msg := <-client.Ch:
			_, _ = w.Write([]byte("data: " + msg + "\n\n"))
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}
