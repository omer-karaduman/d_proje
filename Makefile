.PHONY: up down test logs clean help

# Ring of the Middle Earth — Makefile
# Usage: make up | make down | make test | make logs

COMPOSE = docker compose

## up: Start the entire system (Kafka + Schema Registry + 3 Go instances + UI)
up:
	$(COMPOSE) up -d --build
	@echo ""
	@echo "✅ System started!"
	@echo "   Light Side UI:  http://localhost/?side=FREE_PEOPLES&playerId=light-1"
	@echo "   Dark Side UI:   http://localhost/?side=SHADOW&playerId=dark-1"
	@echo "   Kafka UI:       http://localhost:9090"
	@echo "   Schema Registry: http://localhost:8081"
	@echo "   Health:         http://localhost:8080/health"

## down: Stop and remove all containers
down:
	$(COMPOSE) down -v

## test: Run all unit tests (no Docker required)
test:
	@echo "Running Go unit tests..."
	cd option-b && go test ./tests/... -v -race
	@echo ""
	@echo "✅ All tests passed!"

## test-race: Run tests with race detector
test-race:
	cd option-b && go test ./tests/... -v -race -count=1

## logs: Tail logs from all Go instances
logs:
	$(COMPOSE) logs -f go-1 go-2 go-3

## logs-kafka: Tail Kafka broker logs
logs-kafka:
	$(COMPOSE) logs -f kafka-1 kafka-2 kafka-3

## kafka-topics: List all topics with config
kafka-topics:
	docker exec kafka-1 kafka-topics --bootstrap-server kafka-1:9092 --describe

## kafka-consumer: Watch game.broadcast topic (for Demo Scenario 3 — GameOver exactly once)
kafka-consumer-broadcast:
	docker exec -it kafka-1 kafka-console-consumer \
		--bootstrap-server kafka-1:9092 \
		--topic game.broadcast \
		--from-beginning

## kafka-consumer-detection: Watch ring detection events (Dark Side only)
kafka-consumer-detection:
	docker exec -it kafka-1 kafka-console-consumer \
		--bootstrap-server kafka-1:9092 \
		--topic game.ring.detection \
		--from-beginning

## demo-scenario3: Kill go-2 to demonstrate fault tolerance
demo-scenario3:
	@echo "Stopping go-2 to trigger Kafka consumer group rebalance..."
	$(COMPOSE) stop go-2
	@echo "go-2 stopped. Observe rebalance in Kafka logs."
	@echo "Run 'make demo-scenario3-restart' to restart go-2"

demo-scenario3-restart:
	$(COMPOSE) start go-2
	@echo "go-2 restarted. Observe KTable state recovery."

## build: Build Go binary only
build:
	cd option-b && go build -o ./bin/server ./main.go

## clean: Remove all containers, volumes, and built artifacts
clean:
	$(COMPOSE) down -v --remove-orphans
	rm -rf option-b/bin

## help: Show this help
help:
	@grep -E '^##' Makefile | sed 's/## //'
