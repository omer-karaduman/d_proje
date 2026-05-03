# Kafka Topic Topology — Ring of the Middle Earth

## Topics

| Topic                   | Partitions | Replication | Retention | Producer          | Consumer          |
|-------------------------|------------|-------------|-----------|-------------------|-------------------|
| `game.orders.raw`       | 3          | 3           | 1h        | HTTP API          | Topology 1        |
| `game.orders.validated` | 3          | 3           | 1h        | Topology 1        | TurnProcessor     |
| `game.orders.dlq`       | 1          | 3           | 24h       | Topology 1        | Monitoring        |
| `game.events.unit`      | 3          | 3           | 24h       | TurnProcessor     | EventRouter / SSE |
| `game.events.region`    | 3          | 3           | 24h       | TurnProcessor     | EventRouter / SSE |
| `game.events.path`      | 3          | 3           | 24h       | TurnProcessor     | EventRouter / SSE |
| `game.broadcast`        | 1          | 3           | 24h       | TurnProcessor     | EventRouter / SSE |
| `game.ring.position`    | 1          | 3           | 1h        | TurnProcessor     | EventRouter (Light Side only) |
| `game.ring.detection`   | 1          | 3           | 24h       | TurnProcessor     | EventRouter (Dark Side only)  |

## Topology 1 — Order Validation (Stream Processor)

```
game.orders.raw
  → [KTable join: TurnKTable, UnitKTable, PathKTable]
  → validate(8 rules)
  → VALID   → game.orders.validated
  → INVALID → game.orders.dlq
```

**8 Validation Rules:**
1. `turn == currentTurn` (WRONG_TURN)
2. unit side matches player (NOT_YOUR_UNIT)
3. Ring Bearer path not BLOCKED (PATH_BLOCKED)
4. Ring Bearer route is reachable (INVALID_PATH)
5. BlockPath/SearchPath unit at path endpoint (UNIT_NOT_ADJACENT)
6. AttackRegion target is adjacent (INVALID_TARGET)
7. MaiaAbility cooldown == 0 (ABILITY_ON_COOLDOWN)
8. One order per unit per turn (DUPLICATE_UNIT_ORDER)

## Topology 2 — Route Risk Enrichment (Stream Processor)

```
game.orders.validated (ASSIGN_ROUTE / REDIRECT_UNIT only)
  → [KTable join: PathKTable, UnitKTable, RegionKTable]
  → enrich with routeRiskScore
  → game.orders.validated (enriched, downstream)
```

**Risk Score Formula:**
```
routeRiskScore =
  sum(path.surveillanceLevel * 3 for each path in route)
  + count(THREATENED paths) * 2
  + count(BLOCKED paths) * 5
  + sum(region.threatLevel for each destination region)
  + nazgulProximityCount * 2
```
