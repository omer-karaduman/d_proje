#!/bin/bash
# kafka/init-topics.sh

echo "Kafka'nin baslamasi bekleniyor..."
sleep 15 # Kafka broker'ların tam ayağa kalkması için kısa bir bekleme süresi

echo "Topic'ler olusturuluyor..."

# 1. game.orders.raw
kafka-topics --bootstrap-server kafka1:29092 --create --if-not-exists --topic game.orders.raw --partitions 3 --replication-factor 3 --config cleanup.policy=delete --config retention.ms=3600000

# 2. game.orders.validated
kafka-topics --bootstrap-server kafka1:29092 --create --if-not-exists --topic game.orders.validated --partitions 6 --replication-factor 3 --config cleanup.policy=delete --config retention.ms=3600000

# 3. game.events.unit
kafka-topics --bootstrap-server kafka1:29092 --create --if-not-exists --topic game.events.unit --partitions 6 --replication-factor 3 --config cleanup.policy=delete --config retention.ms=604800000

# 4. game.events.region
kafka-topics --bootstrap-server kafka1:29092 --create --if-not-exists --topic game.events.region --partitions 6 --replication-factor 3 --config cleanup.policy=delete --config retention.ms=604800000

# 5. game.events.path
kafka-topics --bootstrap-server kafka1:29092 --create --if-not-exists --topic game.events.path --partitions 6 --replication-factor 3 --config cleanup.policy=delete --config retention.ms=604800000

# 6. game.session (Compact policy!)
kafka-topics --bootstrap-server kafka1:29092 --create --if-not-exists --topic game.session --partitions 1 --replication-factor 3 --config cleanup.policy=compact

# 7. game.broadcast
kafka-topics --bootstrap-server kafka1:29092 --create --if-not-exists --topic game.broadcast --partitions 1 --replication-factor 3 --config cleanup.policy=delete --config retention.ms=3600000

# 8. game.ring.position
kafka-topics --bootstrap-server kafka1:29092 --create --if-not-exists --topic game.ring.position --partitions 1 --replication-factor 3 --config cleanup.policy=delete --config retention.ms=3600000

# 9. game.ring.detection
kafka-topics --bootstrap-server kafka1:29092 --create --if-not-exists --topic game.ring.detection --partitions 2 --replication-factor 3 --config cleanup.policy=delete --config retention.ms=3600000

# 10. game.dlq
kafka-topics --bootstrap-server kafka1:29092 --create --if-not-exists --topic game.dlq --partitions 3 --replication-factor 3 --config cleanup.policy=delete --config retention.ms=604800000

echo "Kurulum tamamlandi!"