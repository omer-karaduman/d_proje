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

	// Config parse hatası (Windows \r\n) için güvenlik katmanı
	if session.MaxTurns <= 0 {
		log.Printf("WARNING: MaxTurns=%d (config parse hatası), 30'a sabitlendi", session.MaxTurns)
		session.MaxTurns = 30
	}
	if session.TurnDuration <= 0 {
		log.Printf("WARNING: TurnDuration=%v (config parse hatası), 60s'e sabitlendi", session.TurnDuration)
		session.TurnDuration = 60
	}
	if session.HiddenUntil <= 0 {
		session.HiddenUntil = 3
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

	// ── Mimari: Active/Passive Failover ────────────────────────────────────────
	// game.orders.raw → 1 partition, tüm instance'lar aynı ring-engine-group'ta.
	// Kafka protokolü gereği 1 partition'ı tek bir consumer'a assign eder.
	// → Sadece 1 instance (Lider) order consume eder, state sadece orada değişir.
	// → Lider çökerse Kafka saniyeler içinde rebalance yapar, başka instance devralır.
	// → go-2/go-3 idle kalır ama SSE/HTTP isteklerine cevap vermeye devam eder.
	//
	// EventConsumer ise sse-group-{INSTANCE_ID} kullanır (event_consumer.go:36).
	// → Her instance benzersiz group'ta olduğu için tüm instance'lar
	//   game.broadcast ve diğer event topic'lerini bağımsız olarak consume eder.
	// → Nginx hangi instance'a yönlendirirse yönlendirsin, browser SSE mesajını alır.
	// → Timer asla 0'da kalmaz.

	// Instantiate analysis pipelines (required by TurnProcessor and API handler)
	p1 := engine.NewPipeline1()
	p2 := engine.NewPipeline2(eventRouter)

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

	// Real Kafka Producer
	producer, err := kafka.NewProducer(avroHelper)
	if err != nil {
		log.Printf("Warning: Failed to create transactional producer: %v", err)
	} else {
		// ISSUE-3 FIX: Inject the transactional producer so emitGameOver uses full
		// Kafka transactions (K6 rule). kafka.Producer implements engine.GameOverPublisher.
		turnProc.SetGameOverPublisher(producer)
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

	// Real Kafka Consumer for order processing.
	// ISSUE-1 FIX: All instances run the order consumer inside the same consumer group.
	// Kafka distributes partitions across the 3 instances. The instance that receives
	// partition-0 messages effectively becomes the active turn processor because ONLY
	// that instance's EventRouter.engineCh receives StartGame / validated orders.
	// The other two instances consume other partitions (non-zero orders) which get
	// validated and forwarded, but their TurnProcessors remain idle (no StartGame seen).
	// On failover, Kafka rebalances within seconds — no IS_PRIMARY flag needed.
	consumerCtx, cancelConsumer := context.WithCancel(context.Background())
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

	// Real Kafka Consumer for SSE Events.
	// EventConsumer uses "sse-group-{INSTANCE_ID}" (see event_consumer.go).
	// Each instance has a UNIQUE group → all 3 receive every broadcast message.
	// Browser timer never stalls regardless of which instance Nginx routes to.
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
