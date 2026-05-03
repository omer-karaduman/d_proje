package kafka

import (
	"ring-of-the-middle-earth/internal/game"
)

// CalculateRouteRisk, Bölüm 12'deki formüle göre rotanın risk puanını hesaplar.
func (v *OrderValidator) CalculateRouteRisk(pathIDs []string) int {
	score := 0
	destinationRegions := make(map[string]bool)

	// 1. Yol bazlı riskleri hesapla
	for _, pid := range pathIDs {
		path, ok := v.pathKTable.Paths[pid]
		if !ok {
			continue
		}

		// Rota üzerindeki bölgeleri topla (tehdit seviyesi hesaplaması için)
		destinationRegions[path.To] = true
		destinationRegions[path.From] = true

		// Formül: sum(path.surveillanceLevel * 3)
		score += path.SurveillanceLevel * 3

		// Formül: count(THREATENED) * 2, count(BLOCKED) * 5[cite: 2]
		if path.Status == game.Threatened {
			score += 2
		} else if path.Status == game.Blocked {
			score += 5
		}
	}

	// 2. Bölge bazlı riskleri hesapla[cite: 2]
	for rid := range destinationRegions {
		if region, ok := v.regionKTable.Regions[rid]; ok {
			// Formül: sum(region.threatLevel)[cite: 2]
			score += region.ThreatLevel
		}
	}

	// 3. Nazgul yakınlık riskini hesapla[cite: 2]
	// Formül: nazgulProximityCount * 2 (2 hop mesafesindekiler)[cite: 2]
	score += v.countNazgulProximity(destinationRegions) * 2

	return score
}

// countNazgulProximity, rotadaki bölgelere 2 adım mesafede olan Nazgul sayısını döner[cite: 2].
func (v *OrderValidator) countNazgulProximity(routeRegions map[string]bool) int {
	nazgulCount := 0

	// Tüm birimleri tara[cite: 2]
	for _, unit := range v.unitKTable.Units {
		cfg := v.unitConfigs[unit.ID]

		// Sadece aktif Nazgul'leri kontrol et (DetectionRange > 0 kuralı)[cite: 2]
		if cfg.DetectionRange > 0 && unit.Status == game.Active {
			isNear := false
			for rid := range routeRegions {
				// Aynı bölgedeyse veya komşu bölgedeyse (2 hop sınırı)[cite: 2]
				if unit.Region == rid || v.isAdjacent(unit.Region, rid) {
					isNear = true
					break
				}
			}
			if isNear {
				nazgulCount++
			}
		}
	}
	return nazgulCount
}
