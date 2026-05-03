package engine

import (
	"context"
	"log"
	"sync"
	"time"

	"ring-of-the-middle-earth/internal/game"
)

// Pipeline2 implements the Interception Analysis pipeline (Section 33).
// 4 workers, buffer cap 30, triggered by GET /analysis/intercept or RingBearerDetected event.

// InterceptRequest is a request for interception analysis
type InterceptRequest struct {
	Cache             game.WorldStateCache
	RingBearerRegion  string // only known to Light Side / engine
	ResultCh          chan<- game.InterceptPlan
	CancelCtx         context.Context
}

// Pipeline2 manages the interception analysis pipeline
type Pipeline2 struct {
	dispatchCh chan InterceptRequest
}

// NewPipeline2 creates a new Pipeline2
func NewPipeline2() *Pipeline2 {
	return &Pipeline2{
		dispatchCh: make(chan InterceptRequest, 30), // buffer cap = 30 per spec
	}
}

// Start launches the pipeline with 4 workers
func (p *Pipeline2) Start(wg *sync.WaitGroup, done <-chan struct{}) {
	numWorkers := 4
	workerCh := make(chan InterceptRequest, 30)
	aggregateCh := make(chan []game.UnitInterceptPlan) // unbuffered

	// Dispatcher
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
				select {
				case workerCh <- req:
				case <-req.CancelCtx.Done():
				case <-done:
					return
				}
			}
		}
	}()

	// Workers
	var workerWg sync.WaitGroup
	for i := 0; i < numWorkers; i++ {
		workerWg.Add(1)
		go func(workerID int) {
			defer workerWg.Done()
			for req := range workerCh {
				select {
				case <-req.CancelCtx.Done():
					continue
				default:
				}
				// Value copy of cache — never pointers
				cacheCopy := req.Cache
				plans := computeInterceptionPlans(cacheCopy, req.RingBearerRegion)
				select {
				case aggregateCh <- plans:
				case <-req.CancelCtx.Done():
				}
			}
		}(i)
	}

	// Aggregator / shutdown
	go func() {
		workerWg.Wait()
		close(aggregateCh)
	}()
}

// Request computes the interception plan with 2-second timeout
func (p *Pipeline2) Request(cache game.WorldStateCache, ringBearerRegion string) game.InterceptPlan {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	resultCh := make(chan game.InterceptPlan, 1)
	go func() {
		plans := computeInterceptionPlans(cache, ringBearerRegion)
		select {
		case resultCh <- game.InterceptPlan{ByUnit: plans}:
		case <-ctx.Done():
		}
	}()

	select {
	case result := <-resultCh:
		return result
	case <-ctx.Done():
		log.Println("Pipeline2: timeout, returning partial result")
		return game.InterceptPlan{}
	}
}

// computeInterceptionPlans computes (Nazgul, route-candidate) interception scores.
// Nazgul are identified by config.DetectionRange > 0 — no ID literals.
func computeInterceptionPlans(cache game.WorldStateCache, ringBearerRegion string) []game.UnitInterceptPlan {
	var plans []game.UnitInterceptPlan

	for unitID, u := range cache.Units {
		cfg, ok := cache.UnitConfigs[unitID]
		if !ok || u.Status != game.Active {
			continue
		}
		// Nazgul: identified by DetectionRange > 0 (config-driven)
		if cfg.DetectionRange <= 0 {
			continue
		}

		bestScore := 0.0
		bestRegion := ""
		bestTurns := 0

		// For each canonical route, find best interception point
		for _, route := range canonicalRoutes {
			for routeIdx, routeRegion := range route.Regions {
				// turnsToIntercept: BFS distance from Nazgul to routeRegion
				turnsToIntercept := bfsDistance(u.Region, routeRegion, cache.Paths)

				// rbTurnsToReach: sum of path costs to reach routeRegion from Ring Bearer's last known position
				rbTurnsToReach := pathCostToRegion(ringBearerRegion, route, routeIdx, cache.Paths)

				interceptWindow := rbTurnsToReach - turnsToIntercept

				score := 0.0
				if interceptWindow >= 0 {
					routeLength := len(route.Regions) - 1
					if routeLength > 0 {
						score = 1.0 - float64(turnsToIntercept)/float64(routeLength)
					}
				}

				if score > bestScore {
					bestScore = score
					bestRegion = routeRegion
					bestTurns = turnsToIntercept
				}
			}
		}

		if bestRegion != "" {
			plans = append(plans, game.UnitInterceptPlan{
				UnitID:       unitID,
				TargetRegion: bestRegion,
				Score:        bestScore,
				Turns:        bestTurns,
			})
		}
	}

	return plans
}

// bfsDistance computes BFS hop distance between two regions using path adjacency
func bfsDistance(from, to string, paths map[string]game.PathState) int {
	if from == to {
		return 0
	}
	visited := map[string]bool{from: true}
	queue := []struct {
		region string
		dist   int
	}{{from, 0}}

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		for _, p := range paths {
			var neighbor string
			if p.From == curr.region {
				neighbor = p.To
			} else if p.To == curr.region {
				neighbor = p.From
			} else {
				continue
			}
			if neighbor == to {
				return curr.dist + 1
			}
			if !visited[neighbor] {
				visited[neighbor] = true
				queue = append(queue, struct {
					region string
					dist   int
				}{neighbor, curr.dist + 1})
			}
		}
	}
	return 999 // unreachable
}

// pathCostToRegion computes the sum of path costs from a starting region to a target region index on a route
func pathCostToRegion(startRegion string, route struct {
	Name    string
	Regions []string
	Paths   []string
}, targetIdx int, paths map[string]game.PathState) int {
	// Find start index on route
	startIdx := -1
	for i, r := range route.Regions {
		if r == startRegion {
			startIdx = i
			break
		}
	}
	if startIdx < 0 || startIdx >= targetIdx {
		return 0
	}

	cost := 0
	for i := startIdx; i < targetIdx && i < len(route.Paths); i++ {
		p, ok := paths[route.Paths[i]]
		if ok {
			cost += p.Cost
		}
	}
	return cost
}
