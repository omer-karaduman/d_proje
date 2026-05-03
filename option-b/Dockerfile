FROM golang:1.24-bookworm AS builder

WORKDIR /build

# confluent-kafka-go requires gcc and glibc (librdkafka vendored glibc build)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libc6-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

COPY go.mod go.sum* ./
RUN go mod download || true

COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -o /app/server ./main.go

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    tzdata \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/server .

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s \
  CMD wget -qO- http://localhost:8080/health || exit 1

ENTRYPOINT ["./server"]
