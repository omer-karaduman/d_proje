package game

// UnitClass represents the class of a unit
type UnitClass string

const (
	RingBearer      UnitClass = "RingBearer"
	FellowshipGuard UnitClass = "FellowshipGuard"
	GondorArmy      UnitClass = "GondorArmy"
	Nazgul          UnitClass = "Nazgul"
	UrukHaiLegion   UnitClass = "UrukHaiLegion"
	Maia            UnitClass = "Maia"
)

// Side represents which faction a unit belongs to
type Side string

const (
	FreePeoples Side = "FREE_PEOPLES"
	Shadow      Side = "SHADOW"
)

// UnitConfig holds the static configuration for a unit loaded from config file.
// No unit ID literal appears anywhere in game logic — behavior is driven by these fields.
type UnitConfig struct {
	ID               string
	Name             string
	Class            UnitClass
	Side             Side
	StartRegion      string
	Strength         int
	Leadership       bool
	LeadershipBonus  int
	Indestructible   bool
	DetectionRange   int
	Respawns         bool
	RespawnTurns     int
	IsMaia           bool
	MaiaAbilityPaths []string
	IgnoresFortress  bool
	CanFortify       bool
	Cooldown         int
}

// UnitStatus represents the current status of a unit
type UnitStatus string

const (
	Active     UnitStatus = "ACTIVE"
	Destroyed  UnitStatus = "DESTROYED"
	Respawning UnitStatus = "RESPAWNING"
)

// UnitSnapshot holds the mutable runtime state of a unit
type UnitSnapshot struct {
	ID           string     `json:"id"`
	Region       string     `json:"region"` // always "" for ring-bearer in public state
	Strength     int        `json:"strength"`
	Status       UnitStatus `json:"status"`
	RespawnTurns int        `json:"respawnTurns"`
	Route        []string   `json:"route"` // path IDs
	RouteIdx     int        `json:"routeIdx"`
	Cooldown     int        `json:"cooldown"`
}

// PathStatus represents the current status of a path
type PathStatus string

const (
	Open            PathStatus = "OPEN"
	Threatened      PathStatus = "THREATENED"
	Blocked         PathStatus = "BLOCKED"
	TemporarilyOpen PathStatus = "TEMPORARILY_OPEN"
)

// PathState holds the runtime state of a path
type PathState struct {
	ID                string     `json:"id"`
	From              string     `json:"from"`
	To                string     `json:"to"`
	Cost              int        `json:"cost"`
	Status            PathStatus `json:"status"`
	SurveillanceLevel int        `json:"surveillanceLevel"`
	TempOpenTurns     int        `json:"tempOpenTurns"`
	BlockedBy         string     `json:"blockedBy"` // unit ID of blocking unit, "" if none
	Corrupted         bool       `json:"corrupted"` // permanently corrupted by Saruman
}

// Terrain types for regions
type Terrain string

const (
	Plains   Terrain = "PLAINS"
	Mountains Terrain = "MOUNTAINS"
	Forest   Terrain = "FOREST"
	Fortress Terrain = "FORTRESS"
	Volcanic Terrain = "VOLCANIC"
	Swamp    Terrain = "SWAMP"
)

// SpecialRole for regions
type SpecialRole string

const (
	RingBearerStart    SpecialRole = "RING_BEARER_START"
	RingDestructionSite SpecialRole = "RING_DESTRUCTION_SITE"
	ShadowStronghold   SpecialRole = "SHADOW_STRONGHOLD"
	NoSpecialRole      SpecialRole = "NONE"
)

// Controller of a region
type Controller string

const (
	FreePeoplesControl Controller = "FREE_PEOPLES"
	ShadowControl      Controller = "SHADOW"
	Neutral            Controller = "NEUTRAL"
)

// RegionState holds the runtime state of a region
type RegionState struct {
	ID           string      `json:"id"`
	Name         string      `json:"name"`
	Terrain      Terrain     `json:"terrain"`
	SpecialRole  SpecialRole `json:"specialRole"`
	ControlledBy Controller  `json:"controlledBy"`
	ThreatLevel  int         `json:"threatLevel"`
	Fortified    bool        `json:"fortified"`
	FortifyTurns int         `json:"fortifyTurns"`
	UnitsPresent []string    `json:"unitsPresent"` // unit IDs
}

// RingBearerState holds the secret state of the Ring Bearer.
// trueRegion is NEVER exposed to any shared topic or Dark Side consumer.
type RingBearerState struct {
	TrueRegion         string
	Exposed            bool
	Route              []string
	RouteIdx           int
	LastDetectedTurn   int
	LastDetectedRegion string
}

// OrderType represents the type of order submitted by a player
type OrderType string

const (
	AssignRouteOrder    OrderType = "ASSIGN_ROUTE"
	RedirectUnitOrder   OrderType = "REDIRECT_UNIT"
	DestroyRingOrder    OrderType = "DESTROY_RING"
	MaiaAbilityOrder    OrderType = "MAIA_ABILITY"
	BlockPathOrder      OrderType = "BLOCK_PATH"
	SearchPathOrder     OrderType = "SEARCH_PATH"
	AttackRegionOrder   OrderType = "ATTACK_REGION"
	ReinforceRegionOrder OrderType = "REINFORCE_REGION"
	FortifyRegionOrder  OrderType = "FORTIFY_REGION"
	DeployNazgulOrder   OrderType = "DEPLOY_NAZGUL"
)

// Order represents a game order submitted by a player
type Order struct {
	OrderType  OrderType              `json:"orderType"`
	PlayerID   string                 `json:"playerId"`
	UnitID     string                 `json:"unitId"`
	Turn       int                    `json:"turn"`
	Payload    map[string]interface{} `json:"payload,omitempty"`
}

// ErrorCode represents validation error codes
type ErrorCode string

const (
	ErrWrongTurn           ErrorCode = "WRONG_TURN"
	ErrNotYourUnit         ErrorCode = "NOT_YOUR_UNIT"
	ErrInvalidPath         ErrorCode = "INVALID_PATH"
	ErrPathBlocked         ErrorCode = "PATH_BLOCKED"
	ErrUnitNotAdjacent     ErrorCode = "UNIT_NOT_ADJACENT"
	ErrInvalidTarget       ErrorCode = "INVALID_TARGET"
	ErrDuplicateUnitOrder  ErrorCode = "DUPLICATE_UNIT_ORDER"
	ErrAbilityOnCooldown   ErrorCode = "ABILITY_ON_COOLDOWN"
	ErrMaiaDisabled        ErrorCode = "MAIA_DISABLED"
	ErrDestroyConditionNotMet ErrorCode = "DESTROY_CONDITION_NOT_MET"
)

// GamePhase represents the current phase of the game
type GamePhase string

const (
	WaitingForPlayers GamePhase = "WAITING_FOR_PLAYERS"
	InProgress        GamePhase = "IN_PROGRESS"
	GameOverPhase     GamePhase = "GAME_OVER"
)

// Winner in case of game over
type Winner string

const (
	LightSideWinner Winner = "LIGHT_SIDE"
	DarkSideWinner  Winner = "DARK_SIDE"
	Draw            Winner = "DRAW"
)

// GameSession holds current game session state
type GameSession struct {
	SessionID    string
	Phase        GamePhase
	CurrentTurn  int
	MaxTurns     int
	TurnDuration int // seconds
	HiddenUntil  int
	StartedAt    int64
	Winner       Winner
	WinCause     string
}

// WorldStateCache is the in-memory view of all game state
// owned by the CacheManager goroutine — never shared by pointer
type WorldStateCache struct {
	Turn           int
	TurnStartedAt  int64 // Unix seconds — set when each turn begins; used by clients to sync timer
	Units          map[string]UnitSnapshot
	Regions        map[string]RegionState
	Paths          map[string]PathState
	UnitConfigs    map[string]UnitConfig // read-only after startup
	Session        GameSession
	LightView      LightSideView
	DarkView       DarkSideView
}

// LightSideView contains Light Side exclusive information
type LightSideView struct {
	RingBearerRegion string
	AssignedRoute    []string
	RouteIdx         int
}

// DarkSideView contains Dark Side state — RingBearerRegion is ALWAYS ""
type DarkSideView struct {
	RingBearerRegion   string // ALWAYS "" — no code path ever sets this
	LastDetectedRegion string
	LastDetectedTurn   int
}

// RankedRouteList is the output of Pipeline 1 (Route Risk Analysis)
type RankedRouteList struct {
	Routes      []RankedRoute `json:"routes"`
	Recommended string        `json:"recommended"`
	Warnings    []string      `json:"warnings"`
}

// RankedRoute holds a single route with its risk score
type RankedRoute struct {
	Name            string   `json:"name"`
	Regions         []string `json:"regions"`
	Paths           []string `json:"paths"`
	RiskScore       int      `json:"riskScore"`
	ThreatLevel     int      `json:"threatLevel"`
	SurveillanceSum int      `json:"surveillanceSum"`
	BlockedPaths    []string `json:"blockedPaths"`
	ThreatenedPaths []string `json:"threatenedPaths"`
	NazgulProximity int      `json:"nazgulProximity"`
}

// InterceptPlan is the output of Pipeline 2 (Interception Analysis)
type InterceptPlan struct {
	ByUnit []UnitInterceptPlan `json:"byUnit"`
}

// UnitInterceptPlan holds an interception plan for a single Nazgul
type UnitInterceptPlan struct {
	UnitID       string  `json:"unitId"`
	TargetRegion string  `json:"targetRegion"`
	Score        float64 `json:"score"`
	Turns        int     `json:"turnsToIntercept"`
}

// IsMaiaAbilityPath returns true if pathID is in this unit's MaiaAbilityPaths list.
// Used by TurnProcessor to validate Saruman's CorruptPath ability — config-driven.
func (cfg UnitConfig) IsMaiaAbilityPath(pathID string) bool {
	for _, p := range cfg.MaiaAbilityPaths {
		if p == pathID {
			return true
		}
	}
	return false
}
