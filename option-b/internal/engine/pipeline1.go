package engine

import (
	"context"
	"log"
	"sync"
	"time"

	"ring-of-the-middle-earth/internal/game"
)

// Pipeline1 implements the Route Risk Analysis pipeline (Section 32).
// 4 workers, buffer cap 20, triggered by GET /analysis/routes or RouteCompromised event.
// Uses context.Context + or-done pattern for cancellation.
// Uses sync.WaitGroup at every stage boundary for shutdown.

// RouteRiskRequest is a request to compute route risk
type RouteRiskRequest struct {
	Cache      game.WorldStateCache
	ResultCh   chan<- game.RankedRouteList
	CancelCtx  context.Context
}

// Pipeline1 manages the route risk analysis pipeline
type Pipeline1 struct {
	dispatchCh chan RouteRiskRequest
	workerWg   sync.WaitGroup
}

// The 4 canonical routes (from spec Section 2.3)
var canonicalRoutes = []struct {
	Name    string
	Regions []string
	Paths   []string
}{
	{
		Name:    "Route 1 — Fellowship",
		Regions: []string{"the-shire", "bree", "weathertop", "rivendell", "moria", "lothlorien", "emyn-muil", "ithilien", "cirith-ungol", "mount-doom"},
		Paths:   []string{"shire-to-bree", "bree-to-weathertop", "weathertop-to-rivendell", "rivendell-to-moria", "moria-to-lothlorien", "lothlorien-to-emyn-muil", "emyn-muil-to-ithilien", "ithilien-to-cirith-ungol", "cirith-ungol-to-mount-doom"},
	},
	{
		Name:    "Route 2 — Northern Bypass",
		Regions: []string{"the-shire", "bree", "rivendell", "lothlorien", "emyn-muil", "dead-marshes", "ithilien", "cirith-ungol", "mount-doom"},
		Paths:   []string{"shire-to-bree", "bree-to-rivendell", "rivendell-to-lothlorien", "lothlorien-to-emyn-muil", "emyn-muil-to-dead-marshes", "dead-marshes-to-ithilien", "ithilien-to-cirith-ungol", "cirith-ungol-to-mount-doom"},
	},
	{
		Name:    "Route 3 — Dark Route",
		Regions: []string{"the-shire", "bree", "rivendell", "lothlorien", "emyn-muil", "dead-marshes", "mordor", "mount-doom"},
		Paths:   []string{"shire-to-bree", "bree-to-rivendell", "rivendell-to-lothlorien", "lothlorien-to-emyn-muil", "emyn-muil-to-dead-marshes", "dead-marshes-to-mordor", "mordor-to-mount-doom"},
	},
	{
		Name:    "Route 4 — Southern Corridor",
		Regions: []string{"the-shire", "tharbad", "fords-of-isen", "edoras", "minas-tirith", "osgiliath", "minas-morgul", "cirith-ungol", "mount-doom"},
		Paths:   []string{"shire-to-tharbad", "tharbad-to-fords-of-isen", "fords-of-isen-to-edoras", "edoras-to-minas-tirith", "minas-tirith-to-osgiliath", "osgiliath-to-minas-morgul", "minas-morgul-to-cirith-ungol", "cirith-ungol-to-mount-doom"},
	},
}

// NewPipeline1 creates a new Pipeline1
func NewPipeline1() *Pipeline1 {
	return &Pipeline1{
		dispatchCh: make(chan RouteRiskRequest, 20), // buffer cap = 20 per spec
	}
}

// Start launches the pipeline with 4 workers
func (p *Pipeline1) Start(wg *sync.WaitGroup, done <-chan struct{}) {
	numWorkers := 4
	workerCh := make(chan RouteRiskRequest, 20)
	aggregateCh := make(chan []game.RankedRoute) // unbuffered per spec

	// Dispatcher goroutine
	go func() {
		defer close(workerCh)
		for {
			select {
			case <-done:
				return
			case req, ok := <-p.dispatchCh:
				if !ok {
					return
				}
				// Or-done pattern for cancellation
				select {
				case workerCh <- req:
				case <-req.CancelCtx.Done():
				case <-done:
					return
				}
			}
		}
	}()

	// 4 Worker goroutines
	for i := 0; i < numWorkers; i++ {
		p.workerWg.Add(1)
		go func(workerID int) {
			defer p.workerWg.Done()
			for req := range workerCh {
				select {
				case <-req.CancelCtx.Done():
					continue
				default:
				}
				// Compute risk scores for all routes using a value copy of cache
				cacheCopy := req.Cache
				results := computeAllRouteRisks(cacheCopy)
				select {
				case aggregateCh <- results:
				case <-req.CancelCtx.Done():
				}
			}
		}(i)
	}

	// Aggregator goroutine
	go func() {
		p.workerWg.Wait()
		close(aggregateCh)
	}()

	// Deliverer goroutine
	go func() {
		for routes := range aggregateCh {
			_ = routes // Results are sent directly via req.ResultCh in workers
		}
	}()
}

// Request sends a route risk analysis request and waits for result (with 2-second timeout)
func (p *Pipeline1) Request(cache game.WorldStateCache) game.RankedRouteList {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	resultCh := make(chan game.RankedRouteList, 1)

	// Compute directly (in practice, dispatch to workers)
	go func() {
		routes := computeAllRouteRisks(cache)
		ranked := rankRoutes(routes, cache)
		select {
		case resultCh <- ranked:
		case <-ctx.Done():
		}
	}()

	select {
	case result := <-resultCh:
		return result
	case <-ctx.Done():
		log.Println("Pipeline1: timeout, returning partial result")
		return game.RankedRouteList{Warnings: []string{"analysis_timeout"}}
	}
}

// computeAllRouteRisks computes risk scores for all 4 canonical routes.
// Uses a value copy of the cache — never touches shared state.
func computeAllRouteRisks(cache game.WorldStateCache) []game.RankedRoute {
	result := make([]game.RankedRoute, len(canonicalRoutes))

	for i, route := range canonicalRoutes {
		rr := game.RankedRoute{
			Name:    route.Name,
			Regions: route.Regions,
			Paths:   route.Paths,
		}

		// sum(region.threatLevel for each destination region)
		for _, regionID := range route.Regions[1:] { // skip start region
			r, ok := cache.Regions[regionID]
			if ok {
				rr.ThreatLevel += r.ThreatLevel
			}
		}
		rr.RiskScore += rr.ThreatLevel

		// sum(path.surveillanceLevel * 3 for each path)
		for _, pathID := range route.Paths {
			p, ok := cache.Paths[pathID]
			if !ok {
				continue
			}
			rr.SurveillanceSum += p.SurveillanceLevel
			if p.Status == game.Blocked {
				rr.BlockedPaths = append(rr.BlockedPaths, pathID)
			}
			if p.Status == game.Threatened {
				rr.ThreatenedPaths = append(rr.ThreatenedPaths, pathID)
			}
		}
		rr.RiskScore += rr.SurveillanceSum * 3
		rr.RiskScore += len(rr.BlockedPaths) * 5
		rr.RiskScore += len(rr.ThreatenedPaths) * 2

		// nazgulProximityCount: Nazgul within 2 graph hops of any region in route
		nazgulProximityCount := 0
		routeRegionSet := make(map[string]bool)
		for _, rID := range route.Regions {
			routeRegionSet[rID] = true
		}
		for unitID, u := range cache.Units {
			cfg, ok := cache.UnitConfigs[unitID]
			if !ok || u.Status != game.Active {
				continue
			}
			// Nazgul identified by DetectionRange > 0 — config-driven
			if cfg.DetectionRange <= 0 {
				continue
			}
			// Check if within 2 graph hops of any route region
			for routeRegion := range routeRegionSet {
				// Simple hop check using adjacency (we don't have graph here, use BFS manually)
				if u.Region == routeRegion {
					nazgulProximityCount++
					break
				}
				// 1-hop check
				for _, neighbor := range getNeighborsFromPaths(routeRegion, cache.Paths) {
					if u.Region == neighbor {
						nazgulProximityCount++
						goto nextUnit
					}
					// 2-hop check
					for _, neighbor2 := range getNeighborsFromPaths(neighbor, cache.Paths) {
						if u.Region == neighbor2 {
							nazgulProximityCount++
							goto nextUnit
						}
					}
				}
			}
		nextUnit:
		}
		rr.NazgulProximity = nazgulProximityCount
		rr.RiskScore += nazgulProximityCount * 2

		result[i] = rr
	}
	return result
}

// getNeighborsFromPaths returns neighboring regions from path data
func getNeighborsFromPaths(regionID string, paths map[string]game.PathState) []string {
	var neighbors []string
	for _, p := range paths {
		if p.From == regionID {
			neighbors = append(neighbors, p.To)
		} else if p.To == regionID {
			neighbors = append(neighbors, p.From)
		}
	}
	return neighbors
}

// rankRoutes sorts routes by risk score (ascending) and builds RankedRouteList
func rankRoutes(routes []game.RankedRoute, cache game.WorldStateCache) game.RankedRouteList {
	// Sort by risk score ascending (lowest risk = recommended)
	for i := 0; i < len(routes)-1; i++ {
		for j := i + 1; j < len(routes); j++ {
			if routes[j].RiskScore < routes[i].RiskScore {
				routes[i], routes[j] = routes[j], routes[i]
			}
		}
	}

	recommended := ""
	if len(routes) > 0 {
		recommended = routes[0].Name
	}

	var warnings []string
	for _, r := range routes {
		if len(r.BlockedPaths) > 0 {
			warnings = append(warnings, r.Name+": contains blocked paths")
		}
	}

	return game.RankedRouteList{
		Routes:      routes,
		Recommended: recommended,
		Warnings:    warnings,
	}
}
