package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/gorilla/mux"

	"ring-of-the-middle-earth/internal/api"
	"ring-of-the-middle-earth/internal/engine"
	"ring-of-the-middle-earth/internal/game"
)

// main is the entry point for the Go game server.
// Goroutine architecture (Section 28):
//   - KafkaConsumer goroutines (one per topic)
//   - EventRouter goroutine
//   - CacheManager goroutine
//   - TurnProcessor goroutine
//   - Pipeline 1 goroutines (4 workers)
//   - Pipeline 2 goroutines (4 workers)
//   - SSE goroutines (one per player)
//   - HTTP server goroutine

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Ring of the Middle Earth — starting Go game server")

	// Determine config paths (relative to binary or from env)
	configDir := os.Getenv("CONFIG_DIR")
	if configDir == "" {
		configDir = filepath.Join("..", "config")
	}

	// Load unit configs from units.conf
	unitConfigs, hiddenUntilTurn, maxTurns, turnDuration, err := game.LoadUnitsConfig(
		filepath.Join(configDir, "units.conf"),
	)
	if err != nil {
		log.Fatalf("Failed to load units config: %v", err)
	}
	log.Printf("Loaded %d unit configs", len(unitConfigs))

	// Load map config from map.conf
	regions, paths, err := game.LoadMapConfig(filepath.Join(configDir, "map.conf"))
	if err != nil {
		log.Fatalf("Failed to load map config: %v", err)
	}
	log.Printf("Loaded %d regions, %d paths", len(regions), len(paths))

	// Build graph
	graph := game.NewGraph(regions, paths)

	// Initialize world state
	initialUnits := initializeUnits(unitConfigs)
	initialRegions := initializeRegions(regions)
	initialPaths := initializePaths(paths)

	session := &game.GameSession{
		SessionID:    "session-1",
		Phase:        game.WaitingForPlayers,
		CurrentTurn:  1,
		MaxTurns:     maxTurns,
		TurnDuration: turnDuration,
		HiddenUntil:  hiddenUntilTurn,
	}

	initialCache := game.WorldStateCache{
		Turn:        1,
		Units:       initialUnits,
		Regions:     initialRegions,
		Paths:       initialPaths,
		UnitConfigs: unitConfigs,
		Session:     *session,
		LightView:   game.LightSideView{RingBearerRegion: "the-shire"},
		DarkView:    game.DarkSideView{RingBearerRegion: ""}, // ALWAYS ""
	}

	// Create goroutine infrastructure
	done := make(chan struct{})
	var wg sync.WaitGroup

	// CacheManager
	cacheManager := engine.NewCacheManager(initialCache)

	// Event channels
	producerCh := make(chan engine.GameEvent, 200)
	kafkaOrderCh := make(chan []byte, 100)

	// EventRouter
	eventRouter := engine.NewEventRouter()
	wg.Add(1)
	go eventRouter.Run(&wg, done)

	// TurnProcessor
	engineCh := eventRouter.EngineCh()
	validatedCh := make(<-chan engine.ValidatedOrder)
	_ = validatedCh

	turnProc := engine.NewTurnProcessor(
		cacheManager,
		engineCh,
		producerCh,
		graph,
		session,
		unitConfigs,
	)
	wg.Add(1)
	go turnProc.Run(&wg, done)

	// Pipelines
	p1 := engine.NewPipeline1()
	p2 := engine.NewPipeline2()
	wg.Add(2)
	go p1.Start(&wg, done)
	go p2.Start(&wg, done)

	// Event producer goroutine (routes events to Kafka topics)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-done:
				return
			case event := <-producerCh:
				// In production: publish to Kafka
				// For development: route directly via EventRouter
				log.Printf("Event: topic=%s", event.Topic)
			}
		}
	}()

	// Kafka order consumer goroutine (routes raw orders to validator)
	wg.Add(1)
	go func() {
		defer wg.Done()
		kafkaBroker := os.Getenv("KAFKA_BROKER")
		if kafkaBroker == "" {
			log.Println("KAFKA_BROKER not set — running in local mode (orders from HTTP directly)")
		}
		for {
			select {
			case <-done:
				return
			case orderBytes := <-kafkaOrderCh:
				// Forward to EventRouter
				eventRouter.RouteEvent("game.orders.validated", orderBytes)
			}
		}
	}()

	// HTTP API server
	r := mux.NewRouter()
	apiHandler := api.NewHandler(cacheManager, eventRouter, p1, p2, kafkaOrderCh, session)
	apiHandler.RegisterRoutes(r)

	// Serve static UI files
	r.PathPrefix("/").Handler(http.FileServer(http.Dir("../ui")))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0, // SSE needs no write timeout
	}

	// HTTP server goroutine
	wg.Add(1)
	go func() {
		defer wg.Done()
		log.Printf("HTTP server listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// Graceful shutdown on SIGINT/SIGTERM
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("Shutting down gracefully...")
	close(done)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)

	wg.Wait()
	log.Println("Shutdown complete")
}

// initializeUnits creates initial UnitSnapshot for all 14 units from config
func initializeUnits(configs map[string]game.UnitConfig) map[string]game.UnitSnapshot {
	units := make(map[string]game.UnitSnapshot, len(configs))
	for id, cfg := range configs {
		region := cfg.StartRegion
		// Ring Bearer's region is always "" in public state
		if cfg.Class == game.RingBearer {
			region = ""
		}
		units[id] = game.UnitSnapshot{
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
	return units
}

// initializeRegions converts []RegionState to map[regionID]RegionState
func initializeRegions(regions []game.RegionState) map[string]game.RegionState {
	m := make(map[string]game.RegionState, len(regions))
	for _, r := range regions {
		m[r.ID] = r
	}
	return m
}

// initializePaths converts []PathState to map[pathID]PathState
func initializePaths(paths []game.PathState) map[string]game.PathState {
	m := make(map[string]game.PathState, len(paths))
	for _, p := range paths {
		m[p.ID] = p
	}
	return m
}
