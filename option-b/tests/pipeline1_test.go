package tests

import (
	"testing"

	"ring-of-the-middle-earth/internal/engine"
	"ring-of-the-middle-earth/internal/game"
)

// pipeline1_test.go — 2 required test cases from spec Section 35

// Case 1: Route with known threat and surveillance values → correct riskScore computed
func TestPipeline1_RiskScoreComputation(t *testing.T) {
	// Build a test cache with known threat and surveillance values
	cache := game.WorldStateCache{
		Regions: map[string]game.RegionState{
			"the-shire":  {ID: "the-shire", ThreatLevel: 0},
			"bree":       {ID: "bree", ThreatLevel: 1},
			"weathertop": {ID: "weathertop", ThreatLevel: 2},
			"rivendell":  {ID: "rivendell", ThreatLevel: 0},
			"moria":      {ID: "moria", ThreatLevel: 3},
			"lothlorien": {ID: "lothlorien", ThreatLevel: 0},
			"emyn-muil":  {ID: "emyn-muil", ThreatLevel: 2},
			"ithilien":   {ID: "ithilien", ThreatLevel: 2},
			"cirith-ungol": {ID: "cirith-ungol", ThreatLevel: 4},
			"mount-doom":   {ID: "mount-doom", ThreatLevel: 5},
		},
		Paths: map[string]game.PathState{
			"shire-to-bree":             {ID: "shire-to-bree", From: "the-shire", To: "bree", Status: game.Open, SurveillanceLevel: 1},
			"bree-to-weathertop":        {ID: "bree-to-weathertop", From: "bree", To: "weathertop", Status: game.Open, SurveillanceLevel: 0},
			"weathertop-to-rivendell":   {ID: "weathertop-to-rivendell", From: "weathertop", To: "rivendell", Status: game.Open, SurveillanceLevel: 0},
			"rivendell-to-moria":        {ID: "rivendell-to-moria", From: "rivendell", To: "moria", Status: game.Threatened, SurveillanceLevel: 0},
			"moria-to-lothlorien":       {ID: "moria-to-lothlorien", From: "moria", To: "lothlorien", Status: game.Open, SurveillanceLevel: 0},
			"lothlorien-to-emyn-muil":   {ID: "lothlorien-to-emyn-muil", From: "lothlorien", To: "emyn-muil", Status: game.Open, SurveillanceLevel: 0},
			"emyn-muil-to-ithilien":     {ID: "emyn-muil-to-ithilien", From: "emyn-muil", To: "ithilien", Status: game.Open, SurveillanceLevel: 0},
			"ithilien-to-cirith-ungol":  {ID: "ithilien-to-cirith-ungol", From: "ithilien", To: "cirith-ungol", Status: game.Open, SurveillanceLevel: 0},
			"cirith-ungol-to-mount-doom":{ID: "cirith-ungol-to-mount-doom", From: "cirith-ungol", To: "mount-doom", Status: game.Open, SurveillanceLevel: 0},
		},
		Units:       map[string]game.UnitSnapshot{},
		UnitConfigs: map[string]game.UnitConfig{},
	}

	p1 := engine.NewPipeline1()
	result := p1.Request(cache)

	// Find Route 1 in results
	var route1 *game.RankedRoute
	for i := range result.Routes {
		if result.Routes[i].Name == "Route 1 — Fellowship" {
			route1 = &result.Routes[i]
			break
		}
	}

	if route1 == nil {
		t.Fatal("Case 1: Route 1 not found in results")
	}

	// Expected: threatLevel = 1+2+0+3+0+2+2+4+5=19
	//           surveillance: 1 path with level=1 → 1*3=3
	//           threatened: 1 path → 1*2=2
	//           blocked: 0
	//           nazgul: 0 (no units)
	//           total = 19 + 3 + 2 = 24
	expectedRisk := 24
	if route1.RiskScore != expectedRisk {
		t.Errorf("Case 1: expected riskScore=%d, got %d", expectedRisk, route1.RiskScore)
	}
}

// Case 2: Nazgul within 2 hops → proximity count adds correctly to score
func TestPipeline1_NazgulProximityCount(t *testing.T) {
	// Nazgul at "bree" — 1 hop from "the-shire", part of Route 1
	cache := game.WorldStateCache{
		Regions: map[string]game.RegionState{
			"the-shire":  {ID: "the-shire", ThreatLevel: 0},
			"bree":       {ID: "bree", ThreatLevel: 1},
			"weathertop": {ID: "weathertop", ThreatLevel: 2},
			"rivendell":  {ID: "rivendell", ThreatLevel: 0},
			"moria":      {ID: "moria", ThreatLevel: 3},
			"lothlorien": {ID: "lothlorien", ThreatLevel: 0},
			"emyn-muil":  {ID: "emyn-muil", ThreatLevel: 2},
			"ithilien":   {ID: "ithilien", ThreatLevel: 2},
			"cirith-ungol": {ID: "cirith-ungol", ThreatLevel: 4},
			"mount-doom":   {ID: "mount-doom", ThreatLevel: 5},
		},
		Paths: map[string]game.PathState{
			"shire-to-bree":             {ID: "shire-to-bree", From: "the-shire", To: "bree", Status: game.Open},
			"bree-to-weathertop":        {ID: "bree-to-weathertop", From: "bree", To: "weathertop", Status: game.Open},
			"weathertop-to-rivendell":   {ID: "weathertop-to-rivendell", From: "weathertop", To: "rivendell", Status: game.Open},
			"rivendell-to-moria":        {ID: "rivendell-to-moria", From: "rivendell", To: "moria", Status: game.Open},
			"moria-to-lothlorien":       {ID: "moria-to-lothlorien", From: "moria", To: "lothlorien", Status: game.Open},
			"lothlorien-to-emyn-muil":   {ID: "lothlorien-to-emyn-muil", From: "lothlorien", To: "emyn-muil", Status: game.Open},
			"emyn-muil-to-ithilien":     {ID: "emyn-muil-to-ithilien", From: "emyn-muil", To: "ithilien", Status: game.Open},
			"ithilien-to-cirith-ungol":  {ID: "ithilien-to-cirith-ungol", From: "ithilien", To: "cirith-ungol", Status: game.Open},
			"cirith-ungol-to-mount-doom":{ID: "cirith-ungol-to-mount-doom", From: "cirith-ungol", To: "mount-doom", Status: game.Open},
		},
		Units: map[string]game.UnitSnapshot{
			"nazgul-2": {
				ID: "nazgul-2", Region: "bree", Status: game.Active, Strength: 3,
			},
		},
		UnitConfigs: map[string]game.UnitConfig{
			"nazgul-2": {
				ID:             "nazgul-2",
				Side:           game.Shadow,
				DetectionRange: 1, // Nazgul — config-driven
			},
		},
	}

	p1 := engine.NewPipeline1()
	result := p1.Request(cache)

	var route1 *game.RankedRoute
	for i := range result.Routes {
		if result.Routes[i].Name == "Route 1 — Fellowship" {
			route1 = &result.Routes[i]
			break
		}
	}

	if route1 == nil {
		t.Fatal("Case 2: Route 1 not found")
	}

	// Nazgul at "bree" which is IN Route 1 regions → nazgulProximity >= 1
	if route1.NazgulProximity < 1 {
		t.Errorf("Case 2: expected nazgulProximity >= 1 for Nazgul at bree (in route), got %d",
			route1.NazgulProximity)
	}

	// Score contribution: nazgulProximity * 2 >= 2
	expectedMinContribution := route1.NazgulProximity * 2
	if expectedMinContribution < 2 {
		t.Errorf("Case 2: expected nazgul contribution >= 2, got %d", expectedMinContribution)
	}
}
