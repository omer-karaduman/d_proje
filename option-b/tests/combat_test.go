package tests

import (
	"testing"

	"ring-of-the-middle-earth/internal/game"
)

// combat_test.go — 6 required test cases from spec Section 35

func makePlains() game.RegionState {
	return game.RegionState{ID: "test", Terrain: game.Plains}
}
func makeFortress() game.RegionState {
	return game.RegionState{ID: "test", Terrain: game.Fortress}
}
func makeFortifiedFortress() game.RegionState {
	return game.RegionState{ID: "test", Terrain: game.Fortress, Fortified: true}
}

func makeUnit(id string, strength int, cfg game.UnitConfig) game.UnitWithConfig {
	return game.UnitWithConfig{
		Snapshot: game.UnitSnapshot{ID: id, Strength: strength, Status: game.Active},
		Config:   cfg,
	}
}

// Case 1: Attacker(5) vs Defender(5, PLAINS) → tie
func TestCombat_TieOnPlains(t *testing.T) {
	attackerCfg := game.UnitConfig{ID: "a1", Side: game.FreePeoples, Strength: 5}
	defenderCfg := game.UnitConfig{ID: "d1", Side: game.Shadow, Strength: 5}

	attackers := []game.UnitWithConfig{makeUnit("a1", 5, attackerCfg)}
	defenders := []game.UnitWithConfig{makeUnit("d1", 5, defenderCfg)}

	result := game.ResolveCombat(attackers, defenders, makePlains())

	if result.AttackerWon {
		t.Errorf("Case 1: expected tie (defender holds), got attacker won")
	}
	if result.AttackerPower != 5 || result.DefenderPower != 5 {
		t.Errorf("Case 1: expected 5 vs 5, got %d vs %d", result.AttackerPower, result.DefenderPower)
	}
}

// Case 2: Attacker(5) vs Defender(5, FORTRESS) → defender wins (5 vs 7)
func TestCombat_AttackerLosesToFortress(t *testing.T) {
	attackerCfg := game.UnitConfig{ID: "a1", Side: game.FreePeoples, Strength: 5}
	defenderCfg := game.UnitConfig{ID: "d1", Side: game.Shadow, Strength: 5}

	attackers := []game.UnitWithConfig{makeUnit("a1", 5, attackerCfg)}
	defenders := []game.UnitWithConfig{makeUnit("d1", 5, defenderCfg)}

	result := game.ResolveCombat(attackers, defenders, makeFortress())

	if result.AttackerWon {
		t.Errorf("Case 2: expected defender wins in FORTRESS, got attacker won")
	}
	// attacker=5, defender=5+2=7
	if result.DefenderPower != 7 {
		t.Errorf("Case 2: expected defenderPower=7, got %d", result.DefenderPower)
	}
}

// Case 3: UrukHai(5, ignoresFortress) vs Defender(5, FORTRESS) → tie (5 vs 5)
func TestCombat_UrukHaiIgnoresFortress(t *testing.T) {
	urukCfg := game.UnitConfig{
		ID: "uruk", Side: game.Shadow, Strength: 5,
		Class: game.UrukHaiLegion, IgnoresFortress: true,
	}
	defenderCfg := game.UnitConfig{ID: "d1", Side: game.FreePeoples, Strength: 5}

	attackers := []game.UnitWithConfig{makeUnit("uruk", 5, urukCfg)}
	defenders := []game.UnitWithConfig{makeUnit("d1", 5, defenderCfg)}

	result := game.ResolveCombat(attackers, defenders, makeFortress())

	// terrain_bonus NOT applied: 5 vs 5 = tie
	if result.AttackerWon {
		t.Errorf("Case 3: expected tie, got attacker won")
	}
	if result.AttackerPower != 5 || result.DefenderPower != 5 {
		t.Errorf("Case 3: expected 5 vs 5 (ignoresFortress), got %d vs %d",
			result.AttackerPower, result.DefenderPower)
	}
}

// Case 4: UrukHai(5) vs Defender(5, FORTRESS, fortified) → defender wins (5 vs 7)
// fortification_bonus still applies even with ignoresFortress
func TestCombat_UrukHaiFortifiedFortress(t *testing.T) {
	urukCfg := game.UnitConfig{
		ID: "uruk", Side: game.Shadow, Strength: 5,
		Class: game.UrukHaiLegion, IgnoresFortress: true,
	}
	defenderCfg := game.UnitConfig{ID: "d1", Side: game.FreePeoples, Strength: 5}

	attackers := []game.UnitWithConfig{makeUnit("uruk", 5, urukCfg)}
	defenders := []game.UnitWithConfig{makeUnit("d1", 5, defenderCfg)}

	result := game.ResolveCombat(attackers, defenders, makeFortifiedFortress())

	// ignoresFortress: terrain=0, fortify=+2 → defender=7
	if result.AttackerWon {
		t.Errorf("Case 4: expected defender wins (fortification applies even with ignoresFortress)")
	}
	if result.DefenderPower != 7 {
		t.Errorf("Case 4: expected defenderPower=7 (5 + fortify 2), got %d", result.DefenderPower)
	}
}

// Case 5: Leadership bonus applied correctly to co-located allies
// Aragorn(5, leader+1) + Gimli(3) → Gimli effective=4; total=5+4=9
func TestCombat_LeadershipBonus(t *testing.T) {
	aragornCfg := game.UnitConfig{
		ID: "aragorn", Side: game.FreePeoples, Strength: 5,
		Leadership: true, LeadershipBonus: 1,
	}
	gimliCfg := game.UnitConfig{
		ID: "gimli", Side: game.FreePeoples, Strength: 3,
	}
	defenderCfg := game.UnitConfig{ID: "d1", Side: game.Shadow, Strength: 5}

	attackers := []game.UnitWithConfig{
		makeUnit("aragorn", 5, aragornCfg),
		makeUnit("gimli", 3, gimliCfg),
	}
	defenders := []game.UnitWithConfig{makeUnit("d1", 5, defenderCfg)}

	result := game.ResolveCombat(attackers, defenders, makePlains())

	// Aragorn=5, Gimli=3+1(Aragorn leadership)=4 → total=9 vs 5 → attacker wins
	if !result.AttackerWon {
		t.Errorf("Case 5: expected attacker wins with leadership bonus")
	}
	if result.AttackerPower != 9 {
		t.Errorf("Case 5: expected attackerPower=9 (5+4), got %d", result.AttackerPower)
	}
}

// Case 6: Indestructible unit: strength floors at 1
func TestCombat_IndestructibleFloorsAt1(t *testing.T) {
	cfg := game.UnitConfig{
		ID: "witch-king", Indestructible: true, Strength: 5,
	}
	snap := game.UnitSnapshot{ID: "witch-king", Strength: 1, Status: game.Active}

	// Apply fatal damage
	result := game.ApplyDamage(snap, cfg, 10)

	if result.Strength < 1 {
		t.Errorf("Case 6: indestructible unit strength below 1, got %d", result.Strength)
	}
	if result.Status != game.Active {
		t.Errorf("Case 6: indestructible unit should remain ACTIVE, got %s", result.Status)
	}
	if result.Strength != 1 {
		t.Errorf("Case 6: indestructible unit should floor at 1, got %d", result.Strength)
	}
}
