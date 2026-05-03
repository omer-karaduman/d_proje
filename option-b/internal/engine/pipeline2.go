package engine

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"ring-of-the-middle-earth/internal/game"
)

// InterceptRequest is a request for interception analysis
type InterceptRequest struct {
	Cache             game.WorldStateCache
	RingBearerRegion  string
	ResultCh          chan<- game.InterceptPlan
	CancelCtx         context.Context
	EventTriggered    bool // True if triggered by event, false if HTTP
}

// Pipeline2 manages the interception analysis pipeline
type Pipeline2 struct {
	dispatchCh chan InterceptRequest
	router     *EventRouter // To emit results if event-triggered
}

// NewPipeline2 creates a new Pipeline2
func NewPipeline2(router *EventRouter) *Pipeline2 {
	return &Pipeline2{
		dispatchCh: make(chan InterceptRequest, 30),
		router:     router,
	}
}

// Start launches the pipeline with 4 workers
func (p *Pipeline2) Start(wg *sync.WaitGroup, done <-chan struct{}) {
	numWorkers := 4
	workerCh := make(chan InterceptRequest, 30)
	
	type workerResult struct {
		Req   InterceptRequest
		Plans []game.UnitInterceptPlan
	}
	aggregateCh := make(chan workerResult, 30)

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
				
				cacheCopy := deepCopyCache(req.Cache)
				plans := computeInterceptionPlans(cacheCopy, req.RingBearerRegion)
				
				select {
				case aggregateCh <- workerResult{Req: req, Plans: plans}:
				case <-req.CancelCtx.Done():
				}
			}
		}(i)
	}

	// Aggregator
	go func() {
		for res := range aggregateCh {
			plan := game.InterceptPlan{ByUnit: res.Plans}
			
			// If HTTP requested, send to channel
			if res.Req.ResultCh != nil {
				select {
				case res.Req.ResultCh <- plan:
				default:
				}
			}
			
			// If Event triggered, emit to Dark Side SSE
			if res.Req.EventTriggered && p.router != nil {
				payload := map[string]interface{}{
					"event": "InterceptionPlanGenerated",
					"plan":  plan,
				}
				jsonBytes, _ := json.Marshal(payload)
				p.router.RouteEvent("game.analysis.intercept", jsonBytes)
			}
		}
	}()

	go func() {
		workerWg.Wait()
		close(aggregateCh)
	}()
}

// Request computes an interception plan synchronously (with 2-second timeout).
// Uses a goroutine + context for or-done cancellation per spec Section 33.
func (p *Pipeline2) Request(cache game.WorldStateCache, ringBearerRegion string) game.InterceptPlan {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	resultCh := make(chan game.InterceptPlan, 1)

	go func() {
		// Value copy of cache — never pass pointers between goroutines
		cacheCopy := deepCopyCache(cache)
		plans := computeInterceptionPlans(cacheCopy, ringBearerRegion)
		select {
		case resultCh <- game.InterceptPlan{ByUnit: plans}:
		case <-ctx.Done():
		}
	}()

	select {
	case result := <-resultCh:
		return result
	case <-ctx.Done():
		log.Println("Pipeline2: processing timeout, returning partial result")
		return game.InterceptPlan{}
	}
}


// TriggerAsync triggers pipeline 2 asynchronously on RingBearerDetected
func (p *Pipeline2) TriggerAsync(cache game.WorldStateCache, ringBearerRegion string) {
	req := InterceptRequest{
		Cache:            cache,
		RingBearerRegion: ringBearerRegion,
		ResultCh:         nil,
		CancelCtx:        context.Background(),
		EventTriggered:   true,
	}
	
	select {
	case p.dispatchCh <- req:
	default:
		log.Println("Pipeline2: dispatchCh full, dropping async trigger")
	}
}

// computeInterceptionPlans computes (Nazgul, route-candidate) interception scores.
func computeInterceptionPlans(cache game.WorldStateCache, ringBearerRegion string) []game.UnitInterceptPlan {
	var plans []game.UnitInterceptPlan

	for unitID, u := range cache.Units {
		cfg, ok := cache.UnitConfigs[unitID]
		if !ok || u.Status != game.Active {
			continue
		}
		if cfg.DetectionRange <= 0 {
			continue
		}

		bestScore := 0.0
		bestRegion := ""
		bestTurns := 0

		for _, route := range canonicalRoutes {
			for routeIdx, routeRegion := range route.Regions {
				turnsToIntercept := bfsDistance(u.Region, routeRegion, cache.Paths)
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
	return 999 
}

func pathCostToRegion(startRegion string, route struct {
	Name    string
	Regions []string
	Paths   []string
}, targetIdx int, paths map[string]game.PathState) int {
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
