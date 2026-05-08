package main

import (
	"context"
	"encoding/json"
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
	"ring-of-the-middle-earth/internal/kafka"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Ring of the Middle Earth — starting Go game server")

	// Determine config paths
	configDir := os.Getenv("CONFIG_DIR")
	if configDir == "" {
		configDir = filepath.Join("..", "config")
	}

	// Load unit configs
	unitConfigs, hiddenUntilTurn, maxTurns, turnDuration, err := game.LoadUnitsConfig(
		filepath.Join(configDir, "units.conf"),
	)
	if err != nil {
		log.Fatalf("Failed to load units config: %v", err)
	}

	// Load map config
	regions, paths, err := game.LoadMapConfig(filepath.Join(configDir, "map.conf"))
	if err != nil {
		log.Fatalf("Failed to load map config: %v", err)
	}

	graph := game.NewGraph(regions, paths)

	// Setup Initial State (Fallback if recovery fails/empty)
	session := &game.GameSession{
		SessionID:    "session-1",
		Phase:        game.WaitingForPlayers,
		CurrentTurn:  1,
		MaxTurns:     maxTurns,
		TurnDuration: turnDuration,
		HiddenUntil:  hiddenUntilTurn,
	}

	initialCache := game.WorldStateCache{
		Turn:          1,
		TurnStartedAt: time.Now().Unix(),
		Units:         initializeUnits(unitConfigs),
		Regions:       initializeRegions(regions),
		Paths:         initializePaths(paths),
		UnitConfigs:   unitConfigs,
		Session:       *session,
		LightView:     game.LightSideView{RingBearerRegion: "the-shire"},
		DarkView:      game.DarkSideView{RingBearerRegion: ""},
	}

	// Initialize Kafka Avro Helper
	srURL := os.Getenv("SCHEMA_REGISTRY_URL")
	if srURL == "" {
		srURL = "http://localhost:8081"
	}
	avroHelper, err := kafka.NewAvroHelper(srURL)
	if err != nil {
		log.Printf("Warning: Failed to init Avro Helper: %v", err)
	} else {
		schemaDir := os.Getenv("SCHEMA_DIR")
		if schemaDir == "" {
			schemaDir = filepath.Join("..", "kafka", "schemas")
		}
		avroHelper.InitSchemas(schemaDir)
	}

	// Setup KTable State Recovery
	recoveryConsumer, err := kafka.NewConsumer(nil, avroHelper)
	if err == nil {
		recoveredState, _ := recoveryConsumer.RecoverState()
		if recoveredState != nil {
			// Merge static config back into recovered state
			recoveredState.UnitConfigs = unitConfigs
			initialCache = *recoveredState
		}
	} else {
		log.Printf("Warning: Could not create recovery consumer: %v", err)
	}

	// Start Engine Components
	cacheManager := engine.NewCacheManager(initialCache)
	
	// Create channels
	producerCh := make(chan engine.GameEvent, 200)
	kafkaOrderCh := make(chan []byte, 100) // from HTTP to raw
	
	eventRouter := engine.NewEventRouter()
	
	done := make(chan struct{})
	var wg sync.WaitGroup
	
	wg.Add(1)
	go eventRouter.Run(&wg, done)

	// Only the PRIMARY instance (go-1) runs the TurnProcessor and pipelines.
	// go-2 and go-3 are SSE fan-out replicas — they receive broadcasts via EventConsumer
	// and route to their connected SSE clients. This prevents conflicting world states.
	isPrimary := os.Getenv("IS_PRIMARY") == "true"
	log.Printf("Instance %s — isPrimary=%v", os.Getenv("INSTANCE_ID"), isPrimary)

	p1 := engine.NewPipeline1()
	p2 := engine.NewPipeline2(eventRouter)

	if isPrimary {
		turnProc := engine.NewTurnProcessor(
			cacheManager,
			eventRouter.EngineCh(),
			producerCh,
			graph,
			&initialCache.Session,
			unitConfigs,
			p2,
		)
		wg.Add(1)
		go turnProc.Run(&wg, done)

		wg.Add(2)
		go p1.Start(&wg, done)
		go p2.Start(&wg, done)
	} else {
		// Non-primary: pipelines still needed for HTTP /analysis endpoint
		wg.Add(2)
		go p1.Start(&wg, done)
		go p2.Start(&wg, done)
	}


	// Real Kafka Producer
	producer, err := kafka.NewProducer(avroHelper)
	if err != nil {
		log.Printf("Warning: Failed to create producer: %v", err)
	}

	// Event producer goroutine (from engine to Kafka)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-done:
				if producer != nil {
					producer.Close()
				}
				return
			case event := <-producerCh:
				if producer != nil {
					// Route events to proper topics
					var key string
					var subject string
					switch event.Topic {
					case "game.events.unit":
						m, ok := event.Payload.(map[string]interface{})
						if ok {
							key, _ = m["unitId"].(string)
						}
					case "game.events.region":
						m, ok := event.Payload.(map[string]interface{})
						if ok {
							key, _ = m["regionId"].(string)
						}
					case "game.events.path":
						m, ok := event.Payload.(map[string]interface{})
						if ok {
							key, _ = m["pathId"].(string)
						}
					case "game.orders.validated":
						m, ok := event.Payload.(map[string]interface{})
						if ok {
							key, _ = m["unitId"].(string)
						}
					}
						if err := producer.Produce(event.Topic, key, event.Payload, subject); err != nil {
						log.Printf("Producer error on %s: %v", event.Topic, err)
					}

				} else {
					// Fallback to internal routing
					importJSON := func(p interface{}) []byte {
						b, _ := json.Marshal(p)
						return b
					}
					eventRouter.RouteEvent(event.Topic, importJSON(event.Payload))
				}
			}
		}
	}()

	// HTTP to raw topic goroutine
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-done:
				return
			case orderBytes := <-kafkaOrderCh:
				if producer != nil {
					var order map[string]interface{}
					json.Unmarshal(orderBytes, &order)
					key, _ := order["unitId"].(string)
					producer.Produce("game.orders.raw", key, order, "game.orders.raw-value")
				} else {
					// Direct loopback to validator if no Kafka
					eventRouter.RouteEvent("game.orders.validated", orderBytes)
				}
			}
		}
	}()

	// Topology 1 & 2 logic
	validator := kafka.NewOrderValidator(cacheManager, unitConfigs)
	// onValidated routes the validated order directly to TurnProcessor's engineCh.
	// This closes the order chain: orders.raw → validate → orders.validated (Kafka)
	//                                                                         ↓ also
	//                                                         eventRouter.engineCh → TurnProcessor
	onValidated := func(orderBytes []byte) {
		eventRouter.RouteEvent("game.orders.validated", orderBytes)
	}
	orderProcessor := kafka.NewOrderProcessor(validator, producer, onValidated)

	
	// Real Kafka Consumer for order processing
	// CRITICAL FIX: Only run the OrderConsumer on the primary instance.
	// Since ONLY the primary instance's TurnProcessor ticks turns, ONLY the primary instance
	// has the authoritative CacheManager Turn state. If go-2 or go-3 consume the order,
	// their validator will reject it due to WRONG_TURN.
	consumerCtx, cancelConsumer := context.WithCancel(context.Background())
	if isPrimary {
		consumer, err := kafka.NewConsumer(orderProcessor, avroHelper)
		if err == nil {
			wg.Add(1)
			go func() {
				defer wg.Done()
				consumer.Start(consumerCtx)
			}()
		} else {
			log.Printf("Warning: Failed to create order consumer: %v", err)
		}
	}

	// Real Kafka Consumer for SSE Events
	eventConsumer, err := kafka.NewEventConsumer(eventRouter, avroHelper)
	if err == nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			eventConsumer.Start(consumerCtx)
		}()
	} else {
		log.Printf("Warning: Failed to create event consumer: %v", err)
	}

	// HTTP API server
	r := mux.NewRouter()
	apiHandler := api.NewHandler(cacheManager, eventRouter, p1, p2, kafkaOrderCh, &initialCache.Session)
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
		WriteTimeout: 0,
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
	cancelConsumer()
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

func initializeRegions(regions []game.RegionState) map[string]game.RegionState {
	m := make(map[string]game.RegionState, len(regions))
	for _, r := range regions {
		m[r.ID] = r
	}
	return m
}

func initializePaths(paths []game.PathState) map[string]game.PathState {
	m := make(map[string]game.PathState, len(paths))
	for _, p := range paths {
		m[p.ID] = p
	}
	return m
}
