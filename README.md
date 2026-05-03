# Ring of the Middle Earth

> A browser-based distributed strategy game — Light Side escorts the Ring Bearer to Mount Doom, Dark Side hunts them down.

**Course:** Distributed Application Development | **Language:** Go 1.22 | **Option:** B

---

## Quick Start

```bash
# Start full system (Kafka + 3 Go instances + NGINX + UI)
make up

# Stop everything
make down

# Run unit tests (no Docker required)
make test

# View logs
make logs
```

Open **http://localhost** in two browser windows — one picks **Light Side**, the other picks **Dark Side**.

---

## Architecture

```
Browser (UI)
    │  HTTP / SSE
    ▼
NGINX Load Balancer (:80)
    │  Round-robin
    ▼
Go App Instance x3 (:8080)
    │
    ├── HTTP API (gorilla/mux)
    │     POST /game/start
    │     POST /order
    │     GET  /game/state
    │     GET  /orders/available
    │     GET  /analysis/routes     (Light Side only)
    │     GET  /analysis/intercept  (Dark Side only)
    │     GET  /events              (SSE stream)
    │     GET  /health
    │
    ├── TurnProcessor goroutine
    │     13-step turn cycle, ticker-driven (60s default)
    │
    ├── EventRouter goroutine
    │     7-case select loop
    │     SINGLE information asymmetry enforcement point
    │
    ├── Pipeline 1 goroutine (Route Risk Analysis, 4 workers)
    ├── Pipeline 2 goroutine (Interception Analysis, 4 workers)
    └── CacheManager goroutine (WorldStateCache, thread-safe deep copy)
         │
Kafka (3 brokers, KRaft)
    game.orders.raw        → Topology 1 (validation)
    game.orders.validated  → TurnProcessor
    game.orders.dlq        → dead-letter queue
    game.events.*          → EventRouter → SSE clients
    game.broadcast         → both sides (Ring Bearer stripped for Dark Side)
    game.ring.position     → Light Side ONLY
    game.ring.detection    → Dark Side ONLY
```

## Key Design Decisions

| Requirement | Implementation |
|---|---|
| Information Asymmetry | `EventRouter.RouteEvent()` is the ONLY place that decides what each side sees. Ring Bearer region is ALWAYS `""` in public state. |
| No unit ID literals | All game logic driven by `UnitConfig` fields (`DetectionRange`, `IsMaia`, `CanFortify`, etc.) |
| Goroutine safety | `CacheManager` uses `sync.RWMutex` + deep copy — no pointer sharing between goroutines |
| Kafka Streams | Two in-process topology emulators: `OrderValidator` (Topology 1) and `RouteRiskEnricher` (Topology 2) |
| Graceful shutdown | `done` channel + `sync.WaitGroup` across all goroutines + HTTP `Shutdown(ctx)` |

## Project Structure

```
ring-of-the-middle-earth/
├── config/
│   ├── units.conf          # 14 units, all config-driven
│   └── map.conf            # 22 regions, 37 paths
├── kafka/
│   ├── schemas/            # Avro schemas (.avsc)
│   └── streams/            # Topology documentation
├── option-b/               # Go backend
│   ├── main.go
│   ├── Dockerfile
│   └── internal/
│       ├── game/           # Types, combat, detection, graph, config loader
│       ├── engine/         # TurnProcessor, CacheManager, Pipelines, EventRouter
│       ├── api/            # HTTP handler (8 endpoints)
│       └── kafka/          # OrderValidator, RouteRiskEnricher
│   └── tests/              # 13 required test cases
├── ui/
│   ├── index.html
│   ├── style.css
│   └── game.js
├── docker-compose.yml      # 3 Kafka brokers + 3 Go instances + NGINX
├── nginx.conf
└── Makefile
```

## Running Tests

```bash
cd option-b
go test ./tests/... -v -race
```

Tests cover (spec Section 35):
- 6 combat test cases (`combat_test.go`)
- 3 event router information hiding tests (`router_test.go`)
- 2 Pipeline 1 route risk tests (`pipeline1_test.go`)
- 2 Pipeline 2 interception tests (`pipeline2_test.go`)
