package tests

import (
	"testing"

	"ring-of-the-middle-earth/internal/engine"
	"ring-of-the-middle-earth/internal/game"
)

// pipeline2_test.go — 2 required test cases from spec Section 35

func makeP2Cache(nazgulRegion string) game.WorldStateCache {
	return game.WorldStateCache{
		Regions: map[string]game.RegionState{
			"minas-morgul": {ID: "minas-morgul"},
			"cirith-ungol": {ID: "cirith-ungol"},
			"mount-doom":   {ID: "mount-doom"},
			"ithilien":     {ID: "ithilien"},
			"osgiliath":    {ID: "osgiliath"},
		},
		Paths: map[string]game.PathState{
			"minas-morgul-to-cirith-ungol": {ID: "minas-morgul-to-cirith-ungol", From: "minas-morgul", To: "cirith-ungol", Cost: 1, Status: game.Open},
			"cirith-ungol-to-mount-doom":   {ID: "cirith-ungol-to-mount-doom", From: "cirith-ungol", To: "mount-doom", Cost: 2, Status: game.Open},
			"osgiliath-to-minas-morgul":    {ID: "osgiliath-to-minas-morgul", From: "osgiliath", To: "minas-morgul", Cost: 1, Status: game.Open},
			"ithilien-to-osgiliath":        {ID: "ithilien-to-osgiliath", From: "ithilien", To: "osgiliath", Cost: 1, Status: game.Open},
			"ithilien-to-cirith-ungol":     {ID: "ithilien-to-cirith-ungol", From: "ithilien", To: "cirith-ungol", Cost: 2, Status: game.Open},
		},
		Units: map[string]game.UnitSnapshot{
			"witch-king": {
				ID: "witch-king", Region: nazgulRegion, Status: game.Active, Strength: 5,
			},
		},
		UnitConfigs: map[string]game.UnitConfig{
			"witch-king": {
				ID:             "witch-king",
				Side:           game.Shadow,
				DetectionRange: 2, // Nazgul — config-driven
			},
		},
	}
}

// Case 1: Positive intercept window → score > 0
// Witch-King at minas-morgul, Ring Bearer approaching via cirith-ungol route
func TestPipeline2_PositiveInterceptWindow(t *testing.T) {
	// Witch-King is 1 hop from cirith-ungol
	// Ring Bearer is 2 hops from cirith-ungol (at ithilien, going via ithilien-to-cirith-ungol)
	// interceptWindow = rbTurnsToReach - turnsToIntercept = 2 - 1 = 1 > 0
	cache := makeP2Cache("minas-morgul")

	p2 := engine.NewPipeline2(nil)
	result := p2.Request(cache, "ithilien")

	if len(result.ByUnit) == 0 {
		t.Fatal("Case 1: no interception plans returned")
	}

	// Find plan for witch-king
	var wkPlan *game.UnitInterceptPlan
	for i := range result.ByUnit {
		if result.ByUnit[i].UnitID == "witch-king" {
			wkPlan = &result.ByUnit[i]
			break
		}
	}

	if wkPlan == nil {
		t.Fatal("Case 1: no plan for witch-king")
	}

	if wkPlan.Score <= 0 {
		t.Errorf("Case 1: expected score > 0 for positive intercept window, got %f", wkPlan.Score)
	}
}

// Case 2: Negative intercept window → score = 0.0
// Witch-King is far away, Ring Bearer is already at mount-doom
func TestPipeline2_NegativeInterceptWindowScoreZero(t *testing.T) {
	// Ring Bearer at mount-doom (end of route)
	// Witch-King is many hops away
	cache := makeP2Cache("ithilien") // far from mount-doom

	p2 := engine.NewPipeline2(nil)
	// Ring Bearer already at mount-doom — Witch-King cannot intercept
	result := p2.Request(cache, "mount-doom")

	// For routes where Ring Bearer is already at the end, intercept window should be 0
	// If any plan has score > 0, it means the window calculation is wrong
	for _, plan := range result.ByUnit {
		if plan.UnitID == "witch-king" && plan.TargetRegion == "mount-doom" {
			// Witch-King at ithilien is 3+ hops from mount-doom
			// Ring Bearer is already there (0 turns to reach)
			// interceptWindow = 0 - 3+ = negative → score = 0
			if plan.Score > 0 && plan.TargetRegion == "mount-doom" {
				t.Errorf("Case 2: expected score=0 for negative intercept window (RB already at destination), got %f", plan.Score)
			}
		}
	}
}
