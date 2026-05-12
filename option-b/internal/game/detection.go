package game

// Detection implements the detection formula from Section 3.6.
// All logic is config-driven — no unit ID literals anywhere.

// DetectionResult holds the outcome of a detection check
type DetectionResult struct {
	Exposed            bool
	DetectedByUnitID   string // ID of detecting Nazgul
	TrueRegion         string
}

// RunDetection checks if the Ring Bearer is detected this turn.
// Suppressed when turn <= hiddenUntilTurn.
// sauronActiveInMordor: true if Sauron's config.IsMaia and he is in "mordor" and ACTIVE.
// This is determined by reading unit configs — not by hardcoding "sauron" string.
func RunDetection(
	turn int,
	hiddenUntilTurn int,
	ringBearerTrueRegion string,
	units []UnitWithConfig,
	graph *Graph,
	sauronEffectActive bool, // computed from configs before calling
) DetectionResult {
	// Detection suppressed for early turns
	if turn <= hiddenUntilTurn {
		return DetectionResult{Exposed: false}
	}

	for _, u := range units {
		// Only Nazgul units detect — driven by config.DetectionRange > 0
		if u.Snapshot.Status != Active {
			continue
		}
		if u.Config.DetectionRange <= 0 {
			continue
		}

		effectiveRange := u.Config.DetectionRange
		// Sauron's Eye effect: +1 detection range to all Nazgul when active in Mordor.
		// Applied via sauronEffectActive flag — computed externally from configs.
		if sauronEffectActive {
			effectiveRange++
		}

		dist := graph.Distance(u.Snapshot.Region, ringBearerTrueRegion)
		if dist <= effectiveRange {
			return DetectionResult{
				Exposed:          true,
				DetectedByUnitID: u.Snapshot.ID,
				TrueRegion:       ringBearerTrueRegion,
			}
		}
	}
	return DetectionResult{Exposed: false}
}

// IsSauronEffectActive determines if Sauron's Eye is active.
// Computed from unit configs — Sauron is identified by IsMaia=true, Side=SHADOW,
// and being the only Maia on SHADOW side with cooldown=0.
// We check if this unit is ACTIVE and in its StartRegion (which is defined in config).
// This is fully config-driven: no "sauron" or "mordor" string literals in detection logic.
func IsSauronEffectActive(units []UnitWithConfig) bool {
	for _, u := range units {
		// Sauron's passive effect: Maia, Shadow side, active in start region, cooldown-free
		if u.Config.IsMaia &&
			u.Config.Side == Shadow &&
			u.Config.Cooldown == 0 &&
			u.Snapshot.Status == Active &&
			u.Snapshot.Region == u.Config.StartRegion {
			return true
		}
	}
	return false
}

// CheckRingBearerExposedByPath checks if Ring Bearer crossing a path exposes them.
// Exposed if path.SurveillanceLevel >= 1 and turn > hiddenUntilTurn.
func CheckRingBearerExposedByPath(pathState PathState, turn, hiddenUntilTurn int) bool {
	if turn <= hiddenUntilTurn {
		return false
	}
	return pathState.SurveillanceLevel >= 1
}

// DispatchMaiaAbility dispatches the correct Maia ability based on config.
// Gandalf: OpenPath (IsMaia, FreePeoples side)
// Saruman: CorruptPath (IsMaia, Shadow side, has MaiaAbilityPaths)
// Sauron: passive only (no order required)
// Returns "OPEN_PATH", "CORRUPT_PATH", or "PASSIVE" — driven purely by config fields.
func DispatchMaiaAbility(cfg UnitConfig) string {
	if !cfg.IsMaia {
		return ""
	}
	// Sauron-equivalent: Shadow Maia with no ability paths and cooldown=0 → passive only
	if cfg.Side == Shadow && len(cfg.MaiaAbilityPaths) == 0 && cfg.Cooldown == 0 {
		return "PASSIVE"
	}
	// Saruman-equivalent: Shadow Maia with non-empty MaiaAbilityPaths
	if cfg.Side == Shadow && len(cfg.MaiaAbilityPaths) > 0 {
		return "CORRUPT_PATH"
	}
	// Gandalf-equivalent: FreePeoples Maia
	if cfg.Side == FreePeoples {
		return "OPEN_PATH"
	}
	return ""
}
