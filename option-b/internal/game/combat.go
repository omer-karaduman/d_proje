package game

// Combat resolves a battle between attackers and defenders in a region.
// All behavior is driven by UnitConfig fields — no unit ID literals in logic.

// CombatResult holds the outcome of a battle
type CombatResult struct {
	AttackerWon    bool
	Damage         int
	AttackerPower  int
	DefenderPower  int
}

// TerrainBonus returns the terrain defense bonus for a region
func TerrainBonus(terrain Terrain) int {
	switch terrain {
	case Fortress:
		return 2
	case Mountains:
		return 1
	default:
		return 0
	}
}

// ComputeEffectiveStrength returns a unit's effective strength considering leadership bonuses.
// leaderConfigs is the list of co-located leaders on the same side.
func ComputeEffectiveStrength(unit UnitSnapshot, unitCfg UnitConfig, leaders []UnitConfig) int {
	strength := unit.Strength
	for _, leader := range leaders {
		// A unit cannot give itself a bonus
		if leader.ID == unit.ID {
			continue
		}
		// Only same-side leaders apply
		if leader.Leadership && leader.Side == unitCfg.Side {
			strength += leader.LeadershipBonus
		}
	}
	return strength
}

// ResolveCombat resolves combat between attackers and defenders at a region.
// attackerUnits: (snapshot, config) pairs for all attacking units
// defenderUnits: (snapshot, config) pairs for all defending units
// region: the region being contested
func ResolveCombat(
	attackerUnits []UnitWithConfig,
	defenderUnits []UnitWithConfig,
	region RegionState,
) CombatResult {
	// Collect leaders from each side co-located at the region
	attackerLeaders := collectLeaders(attackerUnits)
	defenderLeaders := collectLeaders(defenderUnits)

	// Compute attacker power
	attackerPower := 0
	for _, a := range attackerUnits {
		attackerPower += ComputeEffectiveStrength(a.Snapshot, a.Config, attackerLeaders)
	}

	// Compute defender power
	defenderPower := 0
	for _, d := range defenderUnits {
		defenderPower += ComputeEffectiveStrength(d.Snapshot, d.Config, defenderLeaders)
	}

	// Terrain bonus: skip if ALL attackers have ignoresFortress (spec: ignoresFortress = skip terrain_bonus only)
	// Actually per spec: ignoresFortress means terrain_bonus NOT added to defender power when that attacker attacks.
	// If multiple attackers, we apply the ignoresFortress rule if any attacker ignores fortress.
	// Spec says "terrain_bonus NOT added to defender power" when ignoresFortress attacker is present.
	anyIgnoresFortress := false
	for _, a := range attackerUnits {
		if a.Config.IgnoresFortress {
			anyIgnoresFortress = true
			break
		}
	}

	terrainBonus := 0
	if !anyIgnoresFortress {
		terrainBonus = TerrainBonus(region.Terrain)
	}

	// Fortification bonus always applies (even against ignoresFortress)
	fortifyBonus := 0
	if region.Fortified {
		fortifyBonus = 2
	}

	defenderPower += terrainBonus + fortifyBonus

	if attackerPower > defenderPower {
		damage := attackerPower - defenderPower
		return CombatResult{
			AttackerWon:   true,
			Damage:        damage,
			AttackerPower: attackerPower,
			DefenderPower: defenderPower,
		}
	}

	// Defender wins or tie — each attacker loses 1 strength
	return CombatResult{
		AttackerWon:   false,
		Damage:        1, // each attacker takes 1 damage
		AttackerPower: attackerPower,
		DefenderPower: defenderPower,
	}
}

// UnitWithConfig bundles a UnitSnapshot with its UnitConfig
type UnitWithConfig struct {
	Snapshot UnitSnapshot
	Config   UnitConfig
}

// collectLeaders returns the UnitConfig of all leader units in a group
func collectLeaders(units []UnitWithConfig) []UnitConfig {
	var leaders []UnitConfig
	for _, u := range units {
		if u.Config.Leadership {
			leaders = append(leaders, u.Config)
		}
	}
	return leaders
}

// ApplyDamage applies damage to a unit, respecting indestructible and respawn config.
// Returns updated UnitSnapshot — config-driven, no unit ID literals.
func ApplyDamage(snap UnitSnapshot, cfg UnitConfig, damage int) UnitSnapshot {
	raw := snap.Strength - damage
	if cfg.Indestructible {
		newStr := raw
		if newStr < 1 {
			newStr = 1
		}
		return UnitSnapshot{
			ID:           snap.ID,
			Region:       snap.Region,
			Strength:     newStr,
			Status:       Active,
			RespawnTurns: snap.RespawnTurns,
			Route:        snap.Route,
			RouteIdx:     snap.RouteIdx,
			Cooldown:     snap.Cooldown,
		}
	}
	if raw <= 0 {
		if cfg.Respawns {
			return UnitSnapshot{
				ID:           snap.ID,
				Region:       "",
				Strength:     0,
				Status:       Respawning,
				// BUG-07 fix: +1 so same-turn Step 11 decrement doesn't steal one tick.
				// RespawnTurns=3 means "available 3 turns later", not 2.
				RespawnTurns: cfg.RespawnTurns + 1,
				Route:        nil,
				RouteIdx:     0,
				Cooldown:     snap.Cooldown,
			}
		}
		return UnitSnapshot{
			ID:       snap.ID,
			Region:   "",
			Strength: 0,
			Status:   Destroyed,
		}
	}
	return UnitSnapshot{
		ID:           snap.ID,
		Region:       snap.Region,
		Strength:     raw,
		Status:       Active,
		RespawnTurns: snap.RespawnTurns,
		Route:        snap.Route,
		RouteIdx:     snap.RouteIdx,
		Cooldown:     snap.Cooldown,
	}
}
