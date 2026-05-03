package game

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// ConfigLoader loads unit and map configs from .conf files.
// The conf format is a simplified HOCON-like syntax defined in the spec.

// LoadUnitsConfig loads unit configurations from a units.conf file
func LoadUnitsConfig(path string) (map[string]UnitConfig, int, int, int, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, 0, 0, 0, fmt.Errorf("read units config: %w", err)
	}

	configs := make(map[string]UnitConfig)
	hiddenUntilTurn := 3
	maxTurns := 40
	turnDuration := 60

	content := string(data)
	lines := strings.Split(content, "\n")

	var currentUnit *UnitConfig
	inUnitsBlock := false

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)

		// Skip comments
		if strings.HasPrefix(line, "#") || line == "" {
			continue
		}

		// Parse top-level keys
		if strings.HasPrefix(line, "hidden-until-turn") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				hiddenUntilTurn, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
			}
			continue
		}
		if strings.HasPrefix(line, "max-turns") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				maxTurns, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
			}
			continue
		}
		if strings.HasPrefix(line, "turn-duration-seconds") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				turnDuration, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
			}
			continue
		}

		if strings.HasPrefix(line, "units") {
			inUnitsBlock = true
			continue
		}

		if !inUnitsBlock {
			continue
		}

		// Start of a unit block
		if strings.HasPrefix(line, "{") {
			currentUnit = &UnitConfig{}
		}

		// End of a unit block
		if strings.Contains(line, "}") && currentUnit != nil {
			// Finalize multiline unit
			if currentUnit.ID != "" {
				configs[currentUnit.ID] = *currentUnit
			}
			currentUnit = nil
			continue
		}

		if currentUnit == nil {
			continue
		}

		// Parse unit fields from current line (and multi-line blocks)
		parseUnitFields(currentUnit, line)
	}

	return configs, hiddenUntilTurn, maxTurns, turnDuration, nil
}

func parseUnitFields(unit *UnitConfig, line string) {
	// Parse key=value pairs from HOCON-like syntax
	// Handle quoted strings, booleans, ints, arrays
	scanner := bufio.NewScanner(strings.NewReader(line))
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for {
		// Find key=value pairs
		eqIdx := strings.Index(line, "=")
		if eqIdx < 0 {
			break
		}
		// Get key (trim whitespace and leading {/,)
		keyPart := strings.TrimSpace(line[:eqIdx])
		keyPart = strings.TrimLeft(keyPart, "{, ")
		key := strings.Trim(keyPart, "\" ")

		// Get value part after =
		valuePart := strings.TrimSpace(line[eqIdx+1:])

		// Extract value up to next comma or end
		value, rest := extractValue(valuePart)

		applyUnitField(unit, key, value)
		line = rest
	}
}

func extractValue(s string) (value, rest string) {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "\"") {
		// Quoted string
		end := strings.Index(s[1:], "\"")
		if end < 0 {
			return s[1:], ""
		}
		return s[1 : end+1], s[end+2:]
	}
	if strings.HasPrefix(s, "[") {
		// Array
		end := strings.Index(s, "]")
		if end < 0 {
			return s, ""
		}
		return s[:end+1], s[end+1:]
	}
	// Primitive value (bool, int, identifier)
	end := strings.IndexAny(s, ",}")
	if end < 0 {
		return strings.TrimSpace(s), ""
	}
	return strings.TrimSpace(s[:end]), s[end:]
}

func applyUnitField(unit *UnitConfig, key, value string) {
	switch key {
	case "id":
		unit.ID = strings.Trim(value, "\"")
	case "name":
		unit.Name = strings.Trim(value, "\"")
	case "class":
		unit.Class = UnitClass(strings.Trim(value, "\""))
	case "side":
		unit.Side = Side(strings.Trim(value, "\""))
	case "start":
		unit.StartRegion = strings.Trim(value, "\"")
	case "strength":
		unit.Strength, _ = strconv.Atoi(strings.TrimSpace(value))
	case "leadership":
		unit.Leadership = value == "true"
	case "leadershipBonus":
		unit.LeadershipBonus, _ = strconv.Atoi(strings.TrimSpace(value))
	case "indestructible":
		unit.Indestructible = value == "true"
	case "detectionRange":
		unit.DetectionRange, _ = strconv.Atoi(strings.TrimSpace(value))
	case "respawns":
		unit.Respawns = value == "true"
	case "respawnTurns":
		unit.RespawnTurns, _ = strconv.Atoi(strings.TrimSpace(value))
	case "maia":
		unit.IsMaia = value == "true"
	case "maiaAbilityPaths":
		unit.MaiaAbilityPaths = parseStringArray(value)
	case "ignoresFortress":
		unit.IgnoresFortress = value == "true"
	case "canFortify":
		unit.CanFortify = value == "true"
	case "cooldown":
		unit.Cooldown, _ = strconv.Atoi(strings.TrimSpace(value))
	}
}

func parseStringArray(s string) []string {
	s = strings.Trim(s, "[]")
	if s == "" {
		return []string{}
	}
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		p = strings.Trim(p, "\"")
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

// LoadMapConfig loads the map configuration (regions and paths) from map.conf
func LoadMapConfig(path string) ([]RegionState, []PathState, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, fmt.Errorf("read map config: %w", err)
	}

	var regions []RegionState
	var paths []PathState

	content := string(data)
	lines := strings.Split(content, "\n")

	inRegions := false
	inPaths := false

	for _, rawLine := range lines {
		line := strings.TrimSpace(rawLine)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		if strings.HasPrefix(line, "regions") {
			inRegions = true
			inPaths = false
			continue
		}
		if strings.HasPrefix(line, "paths") {
			inPaths = true
			inRegions = false
			continue
		}

		if inRegions && strings.HasPrefix(line, "{") {
			r := parseRegion(line)
			if r.ID != "" {
				regions = append(regions, r)
			}
		}
		if inPaths && strings.HasPrefix(line, "{") {
			p := parsePath(line)
			if p.ID != "" {
				paths = append(paths, p)
			}
		}
	}

	return regions, paths, nil
}

func parseRegion(line string) RegionState {
	r := RegionState{}
	fields := extractInlineFields(line)
	for k, v := range fields {
		switch k {
		case "id":
			r.ID = v
		case "name":
			r.Name = v
		case "terrain":
			r.Terrain = Terrain(v)
		case "specialRole":
			r.SpecialRole = SpecialRole(v)
		case "startControl":
			r.ControlledBy = Controller(v)
		case "startThreat":
			r.ThreatLevel, _ = strconv.Atoi(v)
		}
	}
	return r
}

func parsePath(line string) PathState {
	p := PathState{
		Status:            Open,
		SurveillanceLevel: 0,
	}
	fields := extractInlineFields(line)
	for k, v := range fields {
		switch k {
		case "id":
			p.ID = v
		case "from":
			p.From = v
		case "to":
			p.To = v
		case "cost":
			p.Cost, _ = strconv.Atoi(v)
		}
	}
	return p
}

func extractInlineFields(line string) map[string]string {
	result := make(map[string]string)
	// Remove outer { }
	line = strings.Trim(line, "{} ")

	for {
		eqIdx := strings.Index(line, "=")
		if eqIdx < 0 {
			break
		}
		keyPart := strings.TrimSpace(line[:eqIdx])
		key := strings.Trim(keyPart, "\", ")

		valuePart := strings.TrimSpace(line[eqIdx+1:])
		value, rest := extractValue(valuePart)
		value = strings.Trim(value, "\"")

		result[key] = value
		line = strings.TrimLeft(rest, ", ")
	}
	return result
}
