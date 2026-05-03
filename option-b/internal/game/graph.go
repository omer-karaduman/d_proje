package game

import (
	"fmt"
	"math"
)

// Graph represents the Middle Earth map as an adjacency graph.
// All path IDs and region IDs are strings from config — no hardcoding.
type Graph struct {
	// adjacency: regionID -> list of (neighborID, pathID, cost)
	adjacency map[string][]Edge
	paths     map[string]PathState
}

// Edge represents a directed connection in the graph
type Edge struct {
	To     string
	PathID string
	Cost   int
}

// NewGraph builds the graph from region and path configs
func NewGraph(regions []RegionState, paths []PathState) *Graph {
	g := &Graph{
		adjacency: make(map[string][]Edge),
		paths:     make(map[string]PathState),
	}
	for _, r := range regions {
		g.adjacency[r.ID] = []Edge{}
	}
	for _, p := range paths {
		g.paths[p.ID] = p
		// All paths are bidirectional
		g.adjacency[p.From] = append(g.adjacency[p.From], Edge{To: p.To, PathID: p.ID, Cost: p.Cost})
		g.adjacency[p.To] = append(g.adjacency[p.To], Edge{To: p.From, PathID: p.ID, Cost: p.Cost})
	}
	return g
}

// UpdatePath updates a path in the graph (status changes etc.)
func (g *Graph) UpdatePath(p PathState) {
	g.paths[p.ID] = p
}

// Distance returns the BFS hop distance between two regions (ignoring path status/cost).
// Used for detection range checks.
func (g *Graph) Distance(from, to string) int {
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
		for _, e := range g.adjacency[curr.region] {
			if e.To == to {
				return curr.dist + 1
			}
			if !visited[e.To] {
				visited[e.To] = true
				queue = append(queue, struct {
					region string
					dist   int
				}{e.To, curr.dist + 1})
			}
		}
	}
	return math.MaxInt32
}

// ShortestPath returns the minimum number of turns to traverse from `from` to `to`
// using Dijkstra's algorithm on path costs.
func (g *Graph) ShortestPath(from, to string) int {
	dist := map[string]int{}
	for region := range g.adjacency {
		dist[region] = math.MaxInt32
	}
	dist[from] = 0

	// Simple priority queue via map iteration (small graph — 22 nodes)
	visited := map[string]bool{}

	for {
		// Find unvisited node with smallest dist
		curr := ""
		for region := range dist {
			if !visited[region] {
				if curr == "" || dist[region] < dist[curr] {
					curr = region
				}
			}
		}
		if curr == "" || dist[curr] == math.MaxInt32 {
			break
		}
		if curr == to {
			return dist[to]
		}
		visited[curr] = true

		for _, e := range g.adjacency[curr] {
			path, ok := g.paths[e.PathID]
			if !ok {
				continue
			}
			// Blocked paths are impassable (cost = infinity)
			if path.Status == Blocked {
				continue
			}
			newDist := dist[curr] + path.Cost
			if newDist < dist[e.To] {
				dist[e.To] = newDist
			}
		}
	}
	return dist[to]
}

// GetNeighbors returns all adjacent regions of a given region
func (g *Graph) GetNeighbors(regionID string) []string {
	edges, ok := g.adjacency[regionID]
	if !ok {
		return nil
	}
	result := make([]string, len(edges))
	for i, e := range edges {
		result[i] = e.To
	}
	return result
}

// GetPath returns the path between two regions (if directly connected)
func (g *Graph) GetPath(from, to string) (PathState, error) {
	for _, e := range g.adjacency[from] {
		if e.To == to {
			p, ok := g.paths[e.PathID]
			if ok {
				return p, nil
			}
		}
	}
	return PathState{}, fmt.Errorf("no path from %s to %s", from, to)
}

// GetPathByID returns a path by its ID
func (g *Graph) GetPathByID(pathID string) (PathState, bool) {
	p, ok := g.paths[pathID]
	return p, ok
}

// RegionsWithinHops returns all regions within `hops` BFS hops from `start`
func (g *Graph) RegionsWithinHops(start string, hops int) []string {
	visited := map[string]int{start: 0}
	queue := []struct {
		region string
		dist   int
	}{{start, 0}}
	var result []string

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		if curr.dist > 0 {
			result = append(result, curr.region)
		}
		if curr.dist < hops {
			for _, e := range g.adjacency[curr.region] {
				if _, seen := visited[e.To]; !seen {
					visited[e.To] = curr.dist + 1
					queue = append(queue, struct {
						region string
						dist   int
					}{e.To, curr.dist + 1})
				}
			}
		}
	}
	return result
}

// PathEndpoints returns the two endpoint regions of a path
func (g *Graph) PathEndpoints(pathID string) (string, string, bool) {
	p, ok := g.paths[pathID]
	if !ok {
		return "", "", false
	}
	return p.From, p.To, true
}

// IsEndpointRegion checks if a region is an endpoint of a given path
func (g *Graph) IsEndpointRegion(pathID, regionID string) bool {
	from, to, ok := g.PathEndpoints(pathID)
	if !ok {
		return false
	}
	return regionID == from || regionID == to
}

// AreAdjacent returns true if regionA and regionB are directly connected by any path
func (g *Graph) AreAdjacent(regionA, regionB string) bool {
	for _, e := range g.adjacency[regionA] {
		if e.To == regionB {
			return true
		}
	}
	return false
}
