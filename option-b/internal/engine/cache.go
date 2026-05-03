package engine

import (
	"sync"

	"ring-of-the-middle-earth/internal/game"
)

// CacheManager owns the WorldStateCache and provides thread-safe access.
// Goroutine pattern: never shares pointers — always sends value copies.

// CacheManager manages the in-memory world state
type CacheManager struct {
	mu    sync.RWMutex
	cache game.WorldStateCache
	updateCh chan game.WorldStateCache
}

// NewCacheManager creates a new CacheManager
func NewCacheManager(initial game.WorldStateCache) *CacheManager {
	return &CacheManager{
		cache:    initial,
		updateCh: make(chan game.WorldStateCache, 10),
	}
}

// GetSnapshot returns a deep copy of the current world state
func (cm *CacheManager) GetSnapshot() game.WorldStateCache {
	cm.mu.RLock()
	defer cm.mu.RUnlock()
	return deepCopyCache(cm.cache)
}

// Update atomically updates the world state cache
func (cm *CacheManager) Update(state game.WorldStateCache) {
	cm.mu.Lock()
	defer cm.mu.Unlock()
	cm.cache = deepCopyCache(state)
}

// UpdateCh returns the update channel for external consumers
func (cm *CacheManager) UpdateCh() <-chan game.WorldStateCache {
	return cm.updateCh
}

// deepCopyCache creates a deep copy of the cache to prevent sharing state
// between goroutines (spec: "sends value copies to workers — never pointers")
func deepCopyCache(src game.WorldStateCache) game.WorldStateCache {
	dst := game.WorldStateCache{
		Turn:        src.Turn,
		UnitConfigs: src.UnitConfigs, // read-only after startup, safe to share
		Session:     src.Session,
		LightView:   src.LightView,
		DarkView:    src.DarkView,
	}

	// Deep copy Units
	dst.Units = make(map[string]game.UnitSnapshot, len(src.Units))
	for k, v := range src.Units {
		u := v
		if v.Route != nil {
			u.Route = make([]string, len(v.Route))
			copy(u.Route, v.Route)
		}
		dst.Units[k] = u
	}

	// Deep copy Regions
	dst.Regions = make(map[string]game.RegionState, len(src.Regions))
	for k, v := range src.Regions {
		r := v
		if v.UnitsPresent != nil {
			r.UnitsPresent = make([]string, len(v.UnitsPresent))
			copy(r.UnitsPresent, v.UnitsPresent)
		}
		dst.Regions[k] = r
	}

	// Deep copy Paths
	dst.Paths = make(map[string]game.PathState, len(src.Paths))
	for k, v := range src.Paths {
		dst.Paths[k] = v
	}

	// Deep copy LightView route
	if src.LightView.AssignedRoute != nil {
		dst.LightView.AssignedRoute = make([]string, len(src.LightView.AssignedRoute))
		copy(dst.LightView.AssignedRoute, src.LightView.AssignedRoute)
	}

	return dst
}
