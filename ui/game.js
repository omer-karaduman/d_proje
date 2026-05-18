'use strict';

// ── API Base ──────────────────────────────────────────────────────────
const API = ''; // Always use same origin (nginx proxies /api/* to Go)

// ── Constants ─────────────────────────────────────────────────────────
const MAX_TURNS = 40;
const TURN_SECONDS = 60;


// Sayfa yüklendiğinde bu sekmeye özgü tekil ID üret
const TAB_ID = Math.random().toString(36).slice(2, 9);

// ── Unit display config (name, class, icon, special trait) ────────────
const UNIT_DISPLAY = {
  'ring-bearer': { name: 'Frodo Baggins', cls: 'Ring Bearer', icon: '💍', trait: 'Gizli hareket' },
  'aragorn': { name: 'Aragorn, Arathorn\'un Oğlu', cls: 'Fellowship Guard', icon: '⚔️', trait: 'Liderlik +1' },
  'legolas': { name: 'Legolas Yeşilyaprak', cls: 'Fellowship Guard', icon: '🏹', trait: 'Hızlı nişancı' },
  'gimli': { name: 'Gimli, Gloin\'in Oğlu', cls: 'Fellowship Guard', icon: '🪓', trait: 'Savaşçı' },
  'rohan-cavalry': { name: 'Rohan Süvarileri', cls: 'Fellowship Guard', icon: '🐎', trait: 'Süvari' },
  'gondor-army': { name: 'Gondor Ordusu', cls: 'Gondor Army', icon: '🛡️', trait: 'Tahkim edebilir (+2)' },
  'gandalf': { name: 'Gandalf Gri', cls: 'Maia', icon: '🔮', trait: 'Yol Açar (CD:3)' },
  'witch-king': { name: 'Cadı Kral (Angmar)', cls: 'Nazgul', icon: '👑', trait: 'Yıkılmaz • Tespit:2 • Liderlik+1' },
  'nazgul-2': { name: 'Karanlık Mareşal', cls: 'Nazgul', icon: '🌒', trait: 'Tespit:1 • Yeniden Doğar(3tur)' },
  'nazgul-3': { name: 'Hain', cls: 'Nazgul', icon: '🌒', trait: 'Tespit:1 • Yeniden Doğar(3tur)' },
  'uruk-hai-legion': { name: 'Uruk-hai Lejyonu', cls: 'Uruk-hai Legion', icon: '🗡️', trait: 'Kale bonusunu yok sayar' },
  'saruman': { name: 'Saruman Beyaz', cls: 'Maia', icon: '🔱', trait: 'Yol Bozar (CD:2)' },
  'sauron': { name: 'Sauron, Karanlık Lord', cls: 'Maia', icon: '👁️', trait: 'Pasif: Tüm Nazgul +1 tespit' },
};

// Helper: uid → görünen isim
function unitName(uid) {
  return UNIT_DISPLAY[uid]?.name || uid;
}
// Helper: uid → icon
function unitIcon(uid) {
  return UNIT_DISPLAY[uid]?.icon || '🔹';
}

// ── Region canvas positions ───────────────────────────────────────────
// Coordinates are in LOGICAL pixels on a 900×600 reference canvas.
// Minimum guaranteed gap between any two circle edges (r=16): ≥20px.
const REGION_POS = {
  // North-West (Shire → Rivendell)
  'the-shire':     { x:  72, y:  88 },
  'bree':          { x: 196, y:  80 },
  'tharbad':       { x: 150, y: 200 },
  'weathertop':    { x: 288, y:  68 },
  'rivendell':     { x: 378, y:  56 },

  // West (Rohan / Isengard cluster)
  'fords-of-isen': { x: 188, y: 270 },
  'fangorn':       { x: 250, y: 320 },
  'rohan-plains':  { x: 318, y: 302 },
  'isengard':      { x: 196, y: 374 },   // was 220,370 — moved left to clear helms-deep
  'helms-deep':    { x: 252, y: 390 },   // was 250,370 — pushed down
  'edoras':        { x: 334, y: 408 },

  // Centre column (Moria → Lothlorien → Emyn Muil)
  'moria':         { x: 418, y: 186 },
  'lothlorien':    { x: 472, y: 258 },   // was 450,240 → right+down (+22,+18)
  'emyn-muil':     { x: 536, y: 206 },   // was 510,250 → right+up (+26,-44)
  'dead-marshes':  { x: 574, y: 288 },   // was 530,310 → right+up (+44,-22)

  // South / Gondor cluster — most overlap was here
  'minas-tirith':  { x: 434, y: 452 },
  'ithilien':      { x: 544, y: 370 },   // was 570,390 → left+up (-26,-20)
  'osgiliath':     { x: 492, y: 462 },   // was 510,430 → left+down (-18,+32)
  'minas-morgul':  { x: 598, y: 474 },   // was 590,450 → right+down (+8,+24)
  'cirith-ungol':  { x: 664, y: 420 },

  // Mordor / Mount Doom
  'mordor':        { x: 708, y: 512 },
  'mount-doom':    { x: 804, y: 544 },
};

// ── Paths ─────────────────────────────────────────────────────────────
const PATHS = [
  { id: 'shire-to-bree', from: 'the-shire', to: 'bree' },
  { id: 'bree-to-weathertop', from: 'bree', to: 'weathertop' },
  { id: 'bree-to-rivendell', from: 'bree', to: 'rivendell' },
  { id: 'bree-to-tharbad', from: 'bree', to: 'tharbad' },
  { id: 'shire-to-tharbad', from: 'the-shire', to: 'tharbad' },
  { id: 'weathertop-to-rivendell', from: 'weathertop', to: 'rivendell' },
  { id: 'rivendell-to-moria', from: 'rivendell', to: 'moria' },
  { id: 'rivendell-to-lothlorien', from: 'rivendell', to: 'lothlorien' },
  { id: 'moria-to-lothlorien', from: 'moria', to: 'lothlorien' },
  { id: 'lothlorien-to-emyn-muil', from: 'lothlorien', to: 'emyn-muil' },
  { id: 'lothlorien-to-rohan-plains', from: 'lothlorien', to: 'rohan-plains' },
  { id: 'rohan-plains-to-fangorn', from: 'rohan-plains', to: 'fangorn' },
  { id: 'rohan-plains-to-edoras', from: 'rohan-plains', to: 'edoras' },
  { id: 'rohan-plains-to-minas-tirith', from: 'rohan-plains', to: 'minas-tirith' },
  { id: 'fangorn-to-isengard', from: 'fangorn', to: 'isengard' },
  { id: 'isengard-to-rohan-plains', from: 'isengard', to: 'rohan-plains' },
  { id: 'tharbad-to-fords-of-isen', from: 'tharbad', to: 'fords-of-isen' },
  { id: 'fords-of-isen-to-isengard', from: 'fords-of-isen', to: 'isengard' },
  { id: 'fords-of-isen-to-helms-deep', from: 'fords-of-isen', to: 'helms-deep' },
  { id: 'fords-of-isen-to-edoras', from: 'fords-of-isen', to: 'edoras' },
  { id: 'edoras-to-helms-deep', from: 'edoras', to: 'helms-deep' },
  { id: 'helms-deep-to-isengard', from: 'helms-deep', to: 'isengard' },
  { id: 'edoras-to-minas-tirith', from: 'edoras', to: 'minas-tirith' },
  { id: 'emyn-muil-to-dead-marshes', from: 'emyn-muil', to: 'dead-marshes' },
  { id: 'emyn-muil-to-ithilien', from: 'emyn-muil', to: 'ithilien' },
  { id: 'dead-marshes-to-ithilien', from: 'dead-marshes', to: 'ithilien' },
  { id: 'dead-marshes-to-mordor', from: 'dead-marshes', to: 'mordor' },
  { id: 'ithilien-to-minas-tirith', from: 'ithilien', to: 'minas-tirith' },
  { id: 'ithilien-to-osgiliath', from: 'ithilien', to: 'osgiliath' },
  { id: 'ithilien-to-cirith-ungol', from: 'ithilien', to: 'cirith-ungol' },
  { id: 'minas-tirith-to-osgiliath', from: 'minas-tirith', to: 'osgiliath' },
  { id: 'osgiliath-to-minas-morgul', from: 'osgiliath', to: 'minas-morgul' },
  { id: 'minas-morgul-to-cirith-ungol', from: 'minas-morgul', to: 'cirith-ungol' },
  { id: 'minas-morgul-to-mordor', from: 'minas-morgul', to: 'mordor' },
  { id: 'cirith-ungol-to-mordor', from: 'cirith-ungol', to: 'mordor' },
  { id: 'cirith-ungol-to-mount-doom', from: 'cirith-ungol', to: 'mount-doom' },
  { id: 'mordor-to-mount-doom', from: 'mordor', to: 'mount-doom' },
];

// ── Region metadata ───────────────────────────────────────────────────
const REGION_META = {
  'the-shire': { name: 'The Shire', terrain: 'PLAINS', threat: 0 },
  'bree': { name: 'Bree', terrain: 'PLAINS', threat: 1 },
  'tharbad': { name: 'Tharbad', terrain: 'SWAMP', threat: 2 },
  'weathertop': { name: 'Weathertop', terrain: 'MOUNTAINS', threat: 2 },
  'rivendell': { name: 'Rivendell', terrain: 'MOUNTAINS', threat: 0 },
  'fangorn': { name: 'Fangorn', terrain: 'FOREST', threat: 0 },
  'fords-of-isen': { name: 'Fords of Isen', terrain: 'PLAINS', threat: 2 },
  'rohan-plains': { name: 'Rohan Plains', terrain: 'PLAINS', threat: 1 },
  'moria': { name: 'Moria', terrain: 'MOUNTAINS', threat: 3 },
  'helms-deep': { name: "Helm's Deep", terrain: 'FORTRESS', threat: 1 },
  'isengard': { name: 'Isengard', terrain: 'FORTRESS', threat: 3 },
  'edoras': { name: 'Edoras', terrain: 'PLAINS', threat: 1 },
  'lothlorien': { name: 'Lothlorien', terrain: 'FOREST', threat: 0 },
  'dead-marshes': { name: 'Dead Marshes', terrain: 'SWAMP', threat: 2 },
  'emyn-muil': { name: 'Emyn Muil', terrain: 'MOUNTAINS', threat: 2 },
  'minas-tirith': { name: 'Minas Tirith', terrain: 'FORTRESS', threat: 1 },
  'ithilien': { name: 'Ithilien', terrain: 'FOREST', threat: 2 },
  'osgiliath': { name: 'Osgiliath', terrain: 'PLAINS', threat: 3 },
  'minas-morgul': { name: 'Minas Morgul', terrain: 'FORTRESS', threat: 4 },
  'cirith-ungol': { name: 'Cirith Ungol', terrain: 'MOUNTAINS', threat: 4 },
  'mordor': { name: 'Mordor', terrain: 'VOLCANIC', threat: 5 },
  'mount-doom': { name: 'Mount Doom', terrain: 'VOLCANIC', threat: 5 },
};

const TERRAIN_COLOR = {
  PLAINS: '#2a3a1a', FOREST: '#1a3020', MOUNTAINS: '#2a2030',
  SWAMP: '#1a2a1a', FORTRESS: '#2a2018', VOLCANIC: '#3a1008',
};

// ── Application State ─────────────────────────────────────────────────
const state = {
  side: null, playerId: null,
  connected: false, gamePhase: 'LOBBY',
  turn: 1, timerInterval: null,
  turnStartedAt: null,
  turnDuration: TURN_SECONDS,
  units: {}, regions: {}, paths: {},
  selectedUnit: null, selectedUnitData: null,
  selectedOrder: null, selectedRoute: [],
  _routeCurrentRegion: null,
  pendingOrders: {},
  ringBearerRegion: null, lastDetectedRegion: null,
  hoveredRegion: null, highlightedPaths: [],
  analysisData: null, eventSource: null,
  // BUG-1 FIX: dedup set prevents printing the same log entry twice in the same turn.
  // Key = "turn:message". Cleared when turn advances or on GameReset.
  _logDedup: new Set(),
  // ISSUE-4 FIX: cleared only once per page session so the log isn't wiped on every
  // WorldStateSnapshot (only on the very first Turn-1 snapshot after connecting).
  _initialSnapshotSeen: false,
};

// ── DOM helper ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Canvas refs (set on DOMContentLoaded) ─────────────────────────────
let canvas, ctx;
// Logical (CSS pixel) canvas dimensions — set by resizeCanvas(), read by drawMap().
// DPR-independent so coordinate math is always consistent.
let _logicalW = 900, _logicalH = 620;

// ── SSE Connection ────────────────────────────────────────────────────
function connectSSE() {
  const sideParam = state.side === 'SHADOW' ? 'SHADOW' : 'FREE_PEOPLES';
  const connId = `${state.playerId}-${TAB_ID}`;
  const url = `${API}/events?playerId=${encodeURIComponent(connId)}&side=${sideParam}`;
  if (state.eventSource) state.eventSource.close();
  state.eventSource = new EventSource(url);

  state.eventSource.onopen = () => {
    state.connected = true;
    const dot = document.querySelector('#connection-status .status-dot');
    if (dot) { dot.className = 'status-dot connected'; }
  };

  state.eventSource.onmessage = e => {
    try { handleServerEvent(JSON.parse(e.data)); }
    catch (err) { console.error('SSE parse error', err); }
  };

  state.eventSource.onerror = () => {
    state.connected = false;
    const dot = document.querySelector('#connection-status .status-dot');
    if (dot) dot.className = 'status-dot';
    showToast('SSE bağlantısı kesildi, yeniden bağlanılıyor...', 'warning');
  };
}

// ── Server Event Dispatcher ───────────────────────────────────────────
function handleServerEvent(msg) {
  // Sunucu bazı event'leri 'event' fieldıyla gönderir, bazıları 'type' ile
  const evtType = msg.event || msg.type;
  switch (evtType) {

    // ── Tur sonu dünya durumu ─────────────────────────────────────────
    case 'WorldStateSnapshot': {
      // ISSUE-4 FIX: On the very first snapshot after connecting (Turn 1), clear the
      // event log container so that history replayed from SSE on reconnect / second-tab
      // open does NOT duplicate entries that the previous session already showed.
      // We only clear once per page session (flag flips permanently after first snapshot).
      if (!state._initialSnapshotSeen) {
        state._initialSnapshotSeen = true;
        const log = $('event-log');
        if (log) log.innerHTML = '';
        state._logDedup.clear();
      }

      // Hareket eden birimleri tespit et (snapshot geldiğinde)
      Object.entries(msg.units || {}).forEach(([uid, newU]) => {
        const oldU = state.units[uid];
        if (oldU && newU.region && oldU.region && oldU.region !== newU.region) {
          const oldName = REGION_META[oldU.region]?.name || oldU.region;
          const newName = REGION_META[newU.region]?.name || newU.region;
          addEventLog(
            `${unitIcon(uid)} ${unitName(uid)} taşındı: ${oldName} → ${newName}`,
            'event-movement'
          );
        }
        // Güç değişimini tespit et
        if (oldU && typeof newU.strength === 'number' && typeof oldU.strength === 'number'
          && newU.strength < oldU.strength) {
          const dmg = oldU.strength - newU.strength;
          addEventLog(
            `💥 ${unitName(uid)} hasar aldı: ${oldU.strength} → ${newU.strength} (−${dmg})`,
            'event-combat'
          );
        }
        // Statü değişimini tespit et
        if (oldU && newU.status && oldU.status !== newU.status) {
          const statusLabel = { DESTROYED: 'YOK EDİLDİ', RESPAWNING: 'YENİDEN DOĞUYOR', ACTIVE: 'AKTİF' };
          addEventLog(
            `${unitIcon(uid)} ${unitName(uid)} durumu değişti → ${statusLabel[newU.status] || newU.status}`,
            newU.status === 'DESTROYED' ? 'event-combat' : 'event-movement'
          );
        }
      });

      const prevTurn = state.turn;
      // BUG-1 FIX: clear dedup set when turn advances so old keys don't pile up
      if ((msg.turn || 0) !== state.turn) state._logDedup.clear();

      state.turn = msg.turn || state.turn;
      state.units = msg.units || state.units;
      state.regions = msg.regions || state.regions;
      state.paths = msg.paths || state.paths;
      state.pendingOrders = {};
      $('turn-number').textContent = state.turn;

      if (msg.ringBearerRegion) {
        state.ringBearerRegion = msg.ringBearerRegion;
        const rbElem = $('rb-location-text');
        if (rbElem) rbElem.textContent = REGION_META[msg.ringBearerRegion]?.name || msg.ringBearerRegion;
      }

      {
        const turnDur = msg.turnDurationSec || TURN_SECONDS;
        if (msg.turnStartedAt) {
          state.turnStartedAt = msg.turnStartedAt;
          state.turnDuration = turnDur;
        } else if (typeof msg.turnRemainingSec === 'number') {
          state.turnStartedAt = Math.floor(Date.now() / 1000) - (turnDur - Math.max(1, msg.turnRemainingSec));
          state.turnDuration = turnDur;
        } else {
          state.turnStartedAt = Math.floor(Date.now() / 1000);
          state.turnDuration = turnDur;
        }
        syncTimerFromClock();
      }
      renderUnits();
      drawMap();
      if (prevTurn > 0) {
        addEventLog(
          `⏳ Tur ${prevTurn} tamamlandı — Tur ${state.turn}/${MAX_TURNS} başladı`,
          'event-turn'
        );
      }
      break;
    }

    // ── Yüzük Taşıyıcısı hareketi (Yalnızca Işık Tarafı) ────────────
    case 'RingBearerMoved':
      state.ringBearerRegion = msg.trueRegion;
      $('rb-location').classList.remove('hidden');
      $('rb-location-text').textContent = REGION_META[msg.trueRegion]?.name || msg.trueRegion;
      drawMap();
      addEventLog(
        `💍 Frodo Baggins ilerledi → ${REGION_META[msg.trueRegion]?.name || msg.trueRegion}`,
        'event-movement'
      );
      break;

    // ── Yüzük Taşıyıcısı tespit (Yalnızca Karanlık Taraf) ─────────
    case 'RingBearerDetected':
      if (state.turn <= 3) return; // Güvenlik katmanı: İlk 3 tur tespit mekanizması tamamen devre dışı
      state.lastDetectedRegion = msg.regionId;
      $('detection-status').classList.remove('hidden');
      $('detection-text').textContent = REGION_META[msg.regionId]?.name || msg.regionId;
      drawMap();
      addEventLog(
        `👁️ SAURON'UN GÖZÜ AÇILDI! Yüzük Taşıyıcısı tespit edildi: ${REGION_META[msg.regionId]?.name || msg.regionId}`,
        'event-detection'
      );
      showToast('Sauron\'un Gözü Açıldı!', 'warning');
      break;

    // ── Yüzük Taşıyıcısı gözetleme yolunda yakalandı ───────────────
    case 'RingBearerSpotted':
      if (state.turn <= 3) return; // Güvenlik katmanı: İlk 3 tur tespit mekanizması tamamen devre dışı
      addEventLog(
        `🔍 Yüzük Taşıyıcısı gözetleme altındaki yoldan geçti: ${msg.pathId} — AÇIĞA ÇIKTI!`,
        'event-detection'
      );
      showToast('Yüzük Taşıyıcısı açığa çıktı!', 'warning');
      break;

    // ── Yol durum değişikliği ──────────────────────────────────────────
    case 'PathStatusChanged': {
      const pathData = state.paths[msg.pathId] || {};
      if (state.paths[msg.pathId]) {
        state.paths[msg.pathId] = { ...pathData, ...msg };
      }
      drawMap();
      const pathMeta = PATHS.find(p => p.id === msg.pathId);
      const pathLabel = pathMeta
        ? `${REGION_META[pathMeta.from]?.name || pathMeta.from} ↔ ${REGION_META[pathMeta.to]?.name || pathMeta.to}`
        : msg.pathId;
      const statusMap = {
        BLOCKED: '🚫 ENGELLENDİ',
        THREATENED: '⚠️ TEHDİT ALTINDA',
        OPEN: '✅ Açıldı',
        TEMPORARILY_OPEN: '🔵 Geçici Açık (Gandalf, 2 tur)',
      };
      const statusLabel = statusMap[msg.newStatus || msg.status] || (msg.newStatus || msg.status || '?');
      const survNote = (msg.surveillanceLevel > 0)
        ? ` | Gözetleme: ${'🔴'.repeat(msg.surveillanceLevel)}`
        : '';
      addEventLog(`🛤️ ${pathLabel} — ${statusLabel}${survNote}`, 'event-path');
      break;
    }

    // ── Yol kalıcı bozuldu (Saruman) ──────────────────────────────────
    case 'PathCorrupted': {
      const pathMeta = PATHS.find(p => p.id === msg.pathId);
      const pathLabel = pathMeta
        ? `${REGION_META[pathMeta.from]?.name || pathMeta.from} ↔ ${REGION_META[pathMeta.to]?.name || pathMeta.to}`
        : msg.pathId;
      if (state.paths[msg.pathId]) {
        state.paths[msg.pathId].surveillanceLevel = 3;
      }
      drawMap();
      addEventLog(
        `🔱 Saruman yolu kalıcı olarak bozdu! ${pathLabel} — Gözetleme MAX (🔴🔴🔴)`,
        'event-detection'
      );
      showToast('Saruman bir yolu bozdu!', 'warning');
      break;
    }

    // ── Rota tamamlandı ───────────────────────────────────────────────
    case 'RouteComplete': {
      const uname = unitName(msg.unitId);
      const uicon = unitIcon(msg.unitId);
      const region = REGION_META[msg.region]?.name || msg.region || '?';
      addEventLog(`${uicon} ${uname} rotasını tamamladı — ${region}`, 'event-movement');
      if (msg.region === 'mount-doom' || msg.unitId === 'ring-bearer') {
        showToast(`${uname} Kader Dağı'na ulaştı!`, 'success');
      }
      break;
    }

    // ── Rota engellendi ───────────────────────────────────────────────
    case 'RouteBlocked': {
      const uname = unitName(msg.unitId);
      const uicon = unitIcon(msg.unitId);
      const pathMeta = PATHS.find(p => p.id === msg.pathId);
      const pathLabel = pathMeta
        ? `${REGION_META[pathMeta.from]?.name || pathMeta.from} ↔ ${REGION_META[pathMeta.to]?.name || pathMeta.to}`
        : (msg.pathId || '?');
      addEventLog(
        `🚫 ${uicon} ${uname} rotası engellendi! Yol: ${pathLabel} — Birim beklemede.`,
        'event-detection'
      );
      showToast(`${uname} rotası engellendi!`, 'warning');
      break;
    }

    // ── Rota tehlikeye girdi ──────────────────────────────────────────
    case 'RouteCompromised': {
      const uname = unitName(msg.unitId);
      const uicon = unitIcon(msg.unitId);
      addEventLog(
        `⚠️ ${uicon} ${uname} rotası tehlikeye girdi — yeniden rota atanması gerekebilir`,
        'event-detection'
      );
      break;
    }

    // ── Savaş sonucu ──────────────────────────────────────────────────
    case 'BattleResolved': {
      const regionName = REGION_META[msg.regionId]?.name || msg.regionId;
      const attackerStr = msg.attackerPower ? ` (Güç: ${msg.attackerPower})` : '';
      const defenderStr = msg.defenderPower ? ` (Güç: ${msg.defenderPower})` : '';
      if (msg.attackerWon) {
        addEventLog(
          `⚔️ SAVAŞ — ${regionName}: Saldırgan KAZANDI!${attackerStr} vs Savunmacı${defenderStr}. Bölge el değiştirdi.`,
          'event-combat'
        );
      } else {
        addEventLog(
          `🛡️ SAVAŞ — ${regionName}: Savunmacı tuttu!${defenderStr} Her saldırgan −1 güç kaybetti.`,
          'event-combat'
        );
      }
      if (msg.regionId === 'isengard' && msg.attackerWon) {
        addEventLog(`🔱 İsengard düştü — Saruman kalıcı olarak devre dışı!`, 'event-detection');
        showToast('İsengard düştü! Saruman devre dışı!', 'success');
      }
      if (msg.regionId === 'mount-doom') {
        showToast('Kader Dağı\'nda savaş!', 'warning');
      }
      drawMap();
      break;
    }

    // ── Bölge kontrolü değişti ────────────────────────────────────────
    case 'RegionControlChanged': {
      const regionName = REGION_META[msg.regionId]?.name || msg.regionId;
      const ctrlLabel = msg.newController === 'SHADOW' ? '🔴 Karanlık Taraf'
        : msg.newController === 'FREE_PEOPLES' ? '🔵 Özgür Halklar' : '⚪ Tarafsız';
      addEventLog(`🚩 ${regionName} kontrolü: ${ctrlLabel}`, 'event-path');
      if (state.regions[msg.regionId]) state.regions[msg.regionId].controlledBy = msg.newController;
      drawMap();
      break;
    }

    // ── Birim yeniden doğdu ───────────────────────────────────────────
    case 'UnitRespawned': {
      const uname = unitName(msg.unitId);
      const uicon = unitIcon(msg.unitId);
      const region = REGION_META[msg.region]?.name || msg.region || 'ev bölgesi';
      if (state.units[msg.unitId]) {
        state.units[msg.unitId].status = 'ACTIVE';
        state.units[msg.unitId].region = msg.region || state.units[msg.unitId].region;
        state.units[msg.unitId].strength = msg.strength || state.units[msg.unitId].strength;
      }
      renderUnits();
      addEventLog(`✨ ${uicon} ${uname} yeniden doğdu — ${region} (Tam güç)`, 'event-movement');
      break;
    }

    // ── Tahkim ────────────────────────────────────────────────────────
    case 'RegionFortified': {
      const regionName = REGION_META[msg.regionId]?.name || msg.regionId;
      addEventLog(`🏰 ${regionName} tahkim edildi (+2 savunma, 2 tur)`, 'event-path');
      if (state.regions[msg.regionId]) state.regions[msg.regionId].fortified = true;
      drawMap();
      break;
    }

    // ── Oyun Sıfırlandı ───────────────────────────────────────────────
    case 'GameReset': {
      addEventLog('🔄 Oyun sunucu tarafından sıfırlandı — login ekranına dönülüyor...', 'event-gameover');
      showToast('🔄 Oyun sıfırlandı!', 'warning');
      setTimeout(() => resetGame(), 1500);
      break;
    }

    // ── Oyun bitti ────────────────────────────────────────────────────
    case 'GameOver':
      handleGameOver(msg);
      break;

    // ── Bilinmeyen event'leri logla ───────────────────────────────────
    default: {
      const evtName = msg.event || msg.type || 'Bilinmeyen';
      if (msg.event || msg.type) {
        console.debug('[SSE unknown]', msg);
      }
      break;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// PARÇA 2 — Init, Login, Timer, Orders
// ══════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  canvas = $('game-map');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  runLoadingScreen();

  $('player-id-input').addEventListener('input', e => {
    $('join-btn').disabled = e.target.value.trim().length < 2;
  });

  canvas.addEventListener('mousemove', onMapMouseMove);
  canvas.addEventListener('click', onMapClick);
  canvas.addEventListener('mouseleave', () => {
    state.hoveredRegion = null;
    $('map-tooltip').classList.add('hidden');
  });
  window.addEventListener('resize', () => { resizeCanvas(); });
});

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  // Read the actual rendered CSS size (getBoundingClientRect is reliable even
  // before explicit layout; falls back to HTML attribute values).
  const rect = canvas.getBoundingClientRect();
  const cssW = rect.width  || parseInt(canvas.getAttribute('width'))  || 900;
  const cssH = rect.height || parseInt(canvas.getAttribute('height')) || 620;

  _logicalW = cssW;
  _logicalH = cssH;

  // Physical draw-buffer = logical × DPR (Retina-sharp).
  // Do NOT set canvas.style.width/height — let CSS width:100%/height:100% handle display size.
  canvas.width  = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function runLoadingScreen() {
  const fill = $('loading-fill');
  let pct = 0;
  const iv = setInterval(() => {
    pct += Math.random() * 8 + 2;
    if (pct >= 100) { pct = 100; clearInterval(iv); }
    fill.style.width = pct + '%';
    if (pct >= 100) {
      setTimeout(() => {
        $('loading-screen').style.opacity = '0';
        setTimeout(() => {
          $('loading-screen').classList.add('hidden');
          $('login-screen').classList.remove('hidden');
        }, 800);
      }, 400);
    }
  }, 120);
}

function selectSide(side) {
  state.side = side;
  document.querySelectorAll('.side-card').forEach(c => {
    c.classList.remove('selected-light', 'selected-dark');
  });
  if (side === 'FREE_PEOPLES') {
    $('light-side-card').classList.add('selected-light');
  } else {
    $('dark-side-card').classList.add('selected-dark');
  }
  const pid = $('player-id-input').value.trim();
  $('join-btn').disabled = pid.length < 2;
}

async function joinGame() {
  const pid = $('player-id-input').value.trim();
  if (!pid || !state.side) { showToast('Taraf seçin ve isim girin', 'error'); return; }

  const prefix = state.side === 'FREE_PEOPLES' ? 'light-' : 'dark-';
  state.playerId = pid.startsWith(prefix) ? pid : prefix + pid;

  try {
    const r = await fetch('/game/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'HVH' })
    });
    if (!r.ok && r.status !== 409) throw new Error(r.status);
  } catch (e) { /* server may already be started */ }

  // Update UI
  $('login-screen').classList.add('hidden');
  $('game-screen').classList.remove('hidden');
  $('turn-total').textContent = `/${MAX_TURNS}`;

  const badge = $('side-badge');
  if (state.side === 'SHADOW') {
    badge.textContent = '👁️ The Shadow';
    badge.classList.add('dark-badge');
    $('analysis-title').textContent = '🗡️ Interception';
    $('rb-location').classList.add('hidden');
    $('detection-status').classList.remove('hidden');
  } else {
    badge.textContent = '🌟 The Free Peoples';
    $('rb-location').classList.remove('hidden');
  }

  connectSSE();
  fetchGameState();
  requestAnalysis();
  startMapAnimation();
}


// ── Clock-based timer ─────────────────────────────────────────────────
let _timerIntervalId = null;

function syncTimerFromClock() {
  clearInterval(_timerIntervalId);
  _tickTimer();
  _timerIntervalId = setInterval(_tickTimer, 1000);
  state.timerInterval = _timerIntervalId;
}

function _tickTimer() {
  // Oyun henüz başlamadıysa veya turnStartedAt geçersizse bekleme göster
  if (!state.turnStartedAt || state.turnStartedAt <= 0 || !state.turnDuration) {
    $('timer-text').textContent = '—';
    $('timer-arc').setAttribute('stroke-dasharray', '100 100');
    $('timer-arc').style.stroke = '#555';
    return;
  }
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - state.turnStartedAt;
  // Güvenlik: elapsed negatif veya aşırı büyükse (saat kayması) düzelt
  if (elapsed < 0 || elapsed > state.turnDuration + 5) {
    $('timer-text').textContent = '—';
    return;
  }
  const remaining = Math.max(0, state.turnDuration - elapsed);
  updateTimerUI(remaining);
  if (remaining <= 0) {
    clearInterval(_timerIntervalId);
    updateTimerUI(0);
  }
}

function startTimer(turnStartedAt, duration) {
  state.turnStartedAt = turnStartedAt;
  state.turnDuration = duration || TURN_SECONDS;
  syncTimerFromClock();
}


function updateTimerUI(s) {
  $('timer-text').textContent = s;
  // FIX: use state.turnDuration (not hardcoded TURN_SECONDS) so arc is correct
  // when turnDurationSec differs from the default (e.g. 30s demo mode).
  const totalSec = state.turnDuration || TURN_SECONDS;
  const pct = Math.max(0, Math.min(100, (s / totalSec) * 100));
  $('timer-arc').setAttribute('stroke-dasharray', `${pct} 100`);
  $('timer-arc').style.stroke = s <= 10 ? '#ff4444' : '#c9a84c';
}

// ── Fetch game state on join ──────────────────────────────────────────
async function fetchGameState() {
  try {
    const sideParam = state.side === 'SHADOW' ? 'SHADOW' : 'FREE_PEOPLES';
    const r = await fetch(`/game/state?playerId=${encodeURIComponent(state.playerId)}&side=${sideParam}`);
    if (!r.ok) return;
    const d = await r.json();
    state.turn = d.turn || 1;
    state.units = d.units || {};
    state.regions = d.regions || {};
    state.paths = d.paths || {};
    if (d.lightView?.ringBearerRegion) state.ringBearerRegion = d.lightView.ringBearerRegion;
    else if (d.ringBearerRegion) state.ringBearerRegion = d.ringBearerRegion;

    if (d.lastDetectedRegion) state.lastDetectedRegion = d.lastDetectedRegion;
    $('turn-number').textContent = state.turn;

    // FIX: Always start the timer, even if the server doesn't send turnStartedAt.
    // On Dark Side, the server strips Ring Bearer data but ALSO may omit turnStartedAt
    // on Turn 1 if the game just started and the first tick hasn't fired yet.
    // Without this fallback, the Dark Side timer is silently never started.
    const turnDur = d.turnDurationSec || TURN_SECONDS;

    if (d.turnStartedAt && d.turnStartedAt > 0) {
      // Sunucudan geçerli başlangıç zamanı var — timer'ı başlat
      startTimer(d.turnStartedAt, turnDur);
    } else if (typeof d.turnRemainingSec === 'number' && d.turnRemainingSec > 0) {
      // Kalan süreden başlangıç zamanını hesapla
      const startedAt = Math.floor(Date.now() / 1000) - (turnDur - Math.max(1, d.turnRemainingSec));
      startTimer(startedAt, turnDur);
    } else {
      // Henüz turnStartedAt yok — "—" göster, SSE gelince düzelir
      state.turnStartedAt = 0;
      state.turnDuration = turnDur;
      syncTimerFromClock();
    }

    renderUnits();
    drawMap();
  } catch (e) { console.warn('fetchGameState failed', e); }
}

// ── Submit Order ──────────────────────────────────────────────────────
async function doSubmitOrder() {
  if (!state.selectedUnit || !state.selectedOrder) {
    showToast('Birim ve emir seçin', 'error'); return;
  }
  const payload = collectOrderPayload();
  const order = {
    orderType: state.selectedOrder,
    playerId: state.playerId,
    unitId: state.selectedUnit,
    turn: state.turn,
    payload
  };
  try {
    const r = await fetch(`/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    if (r.status === 202 || r.status === 200) {
      state.pendingOrders[state.selectedUnit] = state.selectedOrder;
      const uDisplayName = unitName(state.selectedUnit);
      const orderName = state.selectedOrder?.replace(/_/g, ' ');
      showToast(`⏳ Emir kuyruğa alındı: ${orderName}. Tur bittiğinde uygulanacak.`, 'success');
      addEventLog(`✔️ Emir gönderildi → ${uDisplayName}: ${orderName} (tur ${state.turn} sonunda uygulanacak)`, 'info');
      renderUnits();
      closeOrderPanel();
    } else {
      const err = await r.json().catch(() => ({}));
      showToast(`Hata: ${err.error || r.status}`, 'error');
    }
  } catch (e) { showToast('Sunucu bağlantı hatası', 'error'); }
}

function collectOrderPayload() {
  const payload = {};

  // DÜZELTME: FORTIFY_REGION sadece kendi bölgesini referans alır, diğer inputları yoksayar.
  if (state.selectedOrder === 'FORTIFY_REGION') {
    payload.targetRegion = state.selectedUnitData?.region || state._routeCurrentRegion;
    return payload;
  }

  const pathSelect = $('order-path-select');
  const regionAttack = $('order-region-select');
  const regionMove = $('order-region-select-move');

  if (pathSelect && pathSelect.value) payload.pathId = pathSelect.value;
  if (regionAttack && regionAttack.value && state.selectedOrder === 'ATTACK_REGION') payload.targetRegion = regionAttack.value;
  if (regionMove && regionMove.value && (state.selectedOrder === 'REINFORCE_REGION' || state.selectedOrder === 'DEPLOY_NAZGUL')) payload.targetRegion = regionMove.value;

  if (state.selectedRoute && state.selectedRoute.length > 0)
    payload.pathIds = state.selectedRoute;

  return payload;
}

function closeOrderPanel() {
  $('order-panel').classList.add('hidden');
  state.selectedUnit = null;
  state.selectedOrder = null;
  drawMap();
}

// ══════════════════════════════════════════════════════════════════════
// PARÇA 3 — Canvas Render, Unit Panel, Map Events
// ══════════════════════════════════════════════════════════════════════

// ── Map centering math ─────────────────────────────────────────────────────────────────────
// Returns {offsetX, offsetY, scaleX, scaleY} so the map is perfectly centred
// within the logical canvas area (_logicalW × _logicalH).
// All drawMap + mouse handlers share this single source of truth.
function getMapTransform() {
  const positions = Object.values(REGION_POS);
  const minX = Math.min(...positions.map(p => p.x));  // 72
  const maxX = Math.max(...positions.map(p => p.x));  // 804
  const minY = Math.min(...positions.map(p => p.y));  // 56
  const maxY = Math.max(...positions.map(p => p.y));  // 544

  const W = _logicalW, H = _logicalH;
  const PADDING = 54; // px breathing room on each side for labels

  // Scale that fits the map bounding box inside the canvas with padding
  const scaleX = (W - PADDING * 2) / (maxX - minX);
  const scaleY = (H - PADDING * 2) / (maxY - minY);
  const scale  = Math.min(scaleX, scaleY); // uniform scale keeps aspect ratio

  // Translate so the scaled map bounding box is centred
  const mapW = (maxX - minX) * scale;
  const mapH = (maxY - minY) * scale;
  const offsetX = (W - mapW) / 2 - minX * scale;
  const offsetY = (H - mapH) / 2 - minY * scale;

  return { offsetX, offsetY, scale };
}

function drawMap() {
  if (!ctx) return;
  const dpr  = window.devicePixelRatio || 1;
  // Derive logical dims from the physical buffer (always current, DPR-independent).
  const W    = canvas.width  / dpr;
  const H    = canvas.height / dpr;
  const now  = Date.now();

  // 1. Clear entire physical buffer
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 2. Full-canvas vignette background (DPR scale, no map offset)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const _bgG = ctx.createRadialGradient(W*.5,H*.44,0, W*.5,H*.44, Math.max(W,H)*.72);
  _bgG.addColorStop(0,'#0f0f20'); _bgG.addColorStop(1,'#030308');
  ctx.fillStyle = _bgG;
  ctx.fillRect(0, 0, W, H);

  // 3. Compute bounding box of all REGION_POS and centering offset
  const _pos = Object.values(REGION_POS);
  const minX = Math.min(..._pos.map(p=>p.x));
  const maxX = Math.max(..._pos.map(p=>p.x));
  const minY = Math.min(..._pos.map(p=>p.y));
  const maxY = Math.max(..._pos.map(p=>p.y));
  const PAD  = 56; // breathing room for labels on all sides
  const scale = Math.min((W - PAD*2)/(maxX-minX), (H - PAD*2)/(maxY-minY));
  const offsetX = (W - (maxX-minX)*scale)/2 - minX*scale;
  const offsetY = (H - (maxY-minY)*scale)/2 - minY*scale;

  // 4. Single setTransform that combines DPR + centering translation.
  //    All subsequent draws just use  pos.x * scale, pos.y * scale.
  ctx.setTransform(dpr, 0, 0, dpr, offsetX*dpr, offsetY*dpr);
  const scaleX = scale, scaleY = scale, s = scale;

  // ── 0b. Helpers ──────────────────────────────────────────────────────────────
  // Rounded-rect path (browser-safe)
  const _rr = (x, y, w, h, r) => {
    const ri = Math.min(r ?? 3, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+ri, y);
    ctx.lineTo(x+w-ri, y);  ctx.arc(x+w-ri, y+ri,    ri, -Math.PI/2, 0);
    ctx.lineTo(x+w, y+h-ri); ctx.arc(x+w-ri, y+h-ri, ri,  0, Math.PI/2);
    ctx.lineTo(x+ri, y+h);   ctx.arc(x+ri,   y+h-ri, ri,  Math.PI/2, Math.PI);
    ctx.lineTo(x, y+ri);     ctx.arc(x+ri,   y+ri,   ri,  Math.PI, -Math.PI/2);
    ctx.closePath();
  };

  // Outstroked text — crisp on any background
  const _txt = (text, x, y, fillCol, size, bold = false, strokeWidth = 2.5) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fillCol;
    ctx.fillText(text, x, y);
  };

  // Draw a single premium unit token
  const drawUnitToken = (uid, u, ux, uy, isSelected, hasPending) => {
    const disp     = UNIT_DISPLAY[uid] || { icon: '🔹', name: uid };
    const shadowIds = ['witch-king','nazgul-2','nazgul-3','uruk-hai-legion','saruman','sauron'];
    const side     = (u.side || '').toUpperCase();
    const isShadow = side === 'SHADOW' || (side === '' && shadowIds.includes(uid));
    const R        = Math.round(14 * s); // token radius — increased from 11 for visibility

    // Selected: pulsing gold outer ring
    if (isSelected) {
      const gp = 0.5 + 0.5 * Math.sin(now / 350);
      ctx.beginPath();
      ctx.arc(ux, uy, R + 5, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(201,168,76,${gp})`;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#c9a84c'; ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Drop shadow under token
    ctx.beginPath();
    ctx.arc(ux, uy + 2, R, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();

    // Token background — radial gradient for a polished 3-D pill look
    const tg = ctx.createRadialGradient(ux - R*.3, uy - R*.3, 0, ux, uy, R);
    if (isShadow) {
      tg.addColorStop(0, '#3a0a0a');
      tg.addColorStop(1, '#160404');
    } else {
      tg.addColorStop(0, '#0a1a3a');
      tg.addColorStop(1, '#040c1c');
    }
    ctx.beginPath();
    ctx.arc(ux, uy, R, 0, Math.PI*2);
    ctx.fillStyle = tg;
    ctx.fill();

    // Crisp 2px side-coloured border
    const borderCol = isShadow
      ? (hasPending ? '#ffaa44' : '#cc2200')
      : (hasPending ? '#ffdd55' : '#3a8eff');
    ctx.beginPath();
    ctx.arc(ux, uy, R, 0, Math.PI*2);
    ctx.strokeStyle = borderCol;
    ctx.lineWidth = hasPending ? 2.5 : 2;
    ctx.stroke();

    // Emoji — pixel-perfect centred
    const iconPx = Math.round(12 * s);
    ctx.font = `${iconPx}px Inter, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(disp.icon, ux, uy);
    ctx.textBaseline = 'alphabetic';

    // Unit short-name label (first word) with outstroked text
    const label  = (disp.name || uid).split(/[\s,]/)[0];
    const lPx    = Math.round(6 * s);
    const ly     = uy + R + 9;
    _txt(label, ux, ly, isShadow ? '#ffcccc' : '#cce4ff', lPx);

    // Pending gold dot (top-right)
    if (hasPending) {
      ctx.beginPath();
      ctx.arc(ux + R - 2, uy - R + 2, 3.5, 0, Math.PI*2);
      ctx.fillStyle = '#c9a84c';
      ctx.fill();
    }
  };

  // ── 0c. Sauron-in-Mordor detection (needed for section 6) ───────────────────
  const sauronInMordor = (() => {
    const s = Object.values(state.units).find(u => {
      const id = Object.entries(state.units).find(([,v]) => v === u)?.[0] || '';
      const isSauron = (u.side||'').toUpperCase() === 'SHADOW' &&
                       (u.class === 'MAIA' || id === 'sauron');
      return isSauron && u.region === 'mordor' && (u.status||'ACTIVE').toUpperCase() === 'ACTIVE';
    });
    return !!s;
  })();

  // ── 0d. Nazgul detection aura ───────────────────────────────────────────────
  const nazgulUnits = Object.entries(state.units).filter(([uid, u]) => {
    const cfg = (state.unitConfigs || {})[uid] || {};
    return (cfg.detectionRange || 0) > 0 && (u.status||'ACTIVE').toUpperCase() === 'ACTIVE' && u.region;
  });
  if (state.side === 'FREE_PEOPLES') {
    nazgulUnits.forEach(([uid, u]) => {
      const pos = REGION_POS[u.region]; if (!pos) return;
      const cfg = (state.unitConfigs||{})[uid]||{};
      const effectiveRange = (cfg.detectionRange||2) * 1.5;
      const sx = pos.x * scaleX, sy = pos.y * scaleY;
      const auraR = effectiveRange * 55 * s;
      const ag = ctx.createRadialGradient(sx, sy, 0, sx, sy, auraR);
      ag.addColorStop(0, 'rgba(180,0,0,0.12)');
      ag.addColorStop(1, 'rgba(180,0,0,0)');
      ctx.beginPath();
      ctx.arc(sx, sy, auraR, 0, Math.PI*2);
      ctx.fillStyle = ag;
      ctx.fill();
      ctx.font = `${Math.round(11*s)}px Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('👁️', sx, sy - 28*s);
      ctx.textBaseline = 'alphabetic';
    });
  }

  // ── 1. Paths ─────────────────────────────────────────────────────────────────
  PATHS.forEach(p => {
    const a = REGION_POS[p.from], b = REGION_POS[p.to];
    if (!a || !b) return;
    const pd   = state.paths[p.id] || {};
    const high = state.highlightedPaths?.includes(p.id);
    const ax = a.x*scaleX, ay = a.y*scaleY;
    const bx = b.x*scaleX, by = b.y*scaleY;
    const mx = (ax+bx)/2, my = (ay+by)/2;

    let col, lw, dash, glowCol, glowR;
    if (high)                           { col='#e8cc7a'; lw=3.5; dash=[];      glowCol='#c9a84c'; glowR=12; }
    else if (pd.status==='BLOCKED')     { const p0=.6+.4*Math.sin(now/600);
                                          col=`rgba(220,30,30,${p0})`; lw=3.5; dash=[6,4]; glowCol='#8b0000'; glowR=16; }
    else if (pd.status==='TEMPORARILY_OPEN') { col='#5ab4ff'; lw=2.5; dash=[8,3]; glowCol='#4a90d9'; glowR=14; }
    else if (pd.status==='THREATENED')  { col='#d45500'; lw=2.2; dash=[5,3];  glowCol='#c04000'; glowR=6; }
    else if ((pd.surveillanceLevel||0)>=3){ col='#9050d0'; lw=2;   dash=[4,2]; glowCol='#8040c0'; glowR=8; }
    else if ((pd.surveillanceLevel||0)===2){ col='#b04070'; lw=1.8; dash=[4,3]; glowCol='none';   glowR=0; }
    else if ((pd.surveillanceLevel||0)===1){ col='#703050'; lw=1.5; dash=[3,4]; glowCol='none';   glowR=0; }
    else                                { col='#1e1e30'; lw=1.5; dash=[];      glowCol='none';   glowR=0; }

    // Layer 1: dark road base
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by);
    ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=lw+3; ctx.setLineDash([]); ctx.shadowBlur=0;
    ctx.stroke();

    // Layer 2: coloured status line
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by);
    ctx.strokeStyle=col; ctx.lineWidth=lw; ctx.setLineDash(dash);
    ctx.shadowColor=glowCol; ctx.shadowBlur=glowR;
    ctx.stroke();
    ctx.setLineDash([]); ctx.shadowBlur=0;

    // Midpoint icon
    const iPx = Math.round(12*s);
    ctx.textAlign='center'; ctx.textBaseline='middle';
    if (pd.status==='BLOCKED')          { ctx.font=`${iPx}px Inter,sans-serif`; ctx.fillText('🚫',mx,my); }
    else if (pd.status==='TEMPORARILY_OPEN') { ctx.font=`${iPx}px Inter,sans-serif`; ctx.fillText('✨',mx,my); }
    else if ((pd.surveillanceLevel||0)>0) {
      const dotCol = (pd.surveillanceLevel||0)>=3 ? '#c080ff' : (pd.surveillanceLevel||0)===2 ? '#ff7090' : '#a04060';
      const dots = '●'.repeat(pd.surveillanceLevel||0);
      ctx.font=`${Math.round(7*s)}px Inter,sans-serif`;
      const dw=ctx.measureText(dots).width;
      _rr(mx-dw/2-3, my-6, dw+6, 10, 3);
      ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fill();
      ctx.fillStyle=dotCol; ctx.fillText(dots,mx,my);
    }
    ctx.textBaseline='alphabetic';
  });

  // ── 2. Region nodes — radial-gradient for depth/polish ──────────────────────
  for (const [id, pos] of Object.entries(REGION_POS)) {
    const meta    = REGION_META[id] || {};
    const rd      = state.regions[id] || {};
    const hovered = state.hoveredRegion === id;
    const sx = pos.x*scaleX, sy = pos.y*scaleY;
    const R  = hovered ? 19 : 16;
    const usc = Math.min(scaleX, scaleY);

    // Drop shadow
    ctx.beginPath(); ctx.arc(sx, sy+2, R+1, 0, Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fill();

    // Landmark glow
    ctx.shadowBlur = 0;
    if      (id==='mount-doom')  { ctx.shadowColor='#ff4400'; ctx.shadowBlur=hovered?30:18; }
    else if (id==='the-shire')   { ctx.shadowColor='#4a90d9'; ctx.shadowBlur=hovered?16:8; }
    else if (id==='mordor'||id==='isengard'||id==='minas-morgul')
                                 { ctx.shadowColor='#8b0000'; ctx.shadowBlur=hovered?14:7; }
    else if (rd.fortified)       { ctx.shadowColor='#c9a84c'; ctx.shadowBlur=10; }
    else if (hovered)            { ctx.shadowColor='rgba(201,168,76,0.7)'; ctx.shadowBlur=14; }

    // Terrain fill — RADIAL GRADIENT for depth (looks like a raised button/node)
    const baseCol = TERRAIN_COLOR[meta.terrain] || '#1a1a2a';
    const rg = ctx.createRadialGradient(sx-R*.35, sy-R*.35, 0, sx, sy, R);
    rg.addColorStop(0, lightenColor(baseCol, 0.60));  // brighter highlight
    rg.addColorStop(0.55, baseCol);
    rg.addColorStop(1,   darkenColor(baseCol, 0.45));
    ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI*2);
    ctx.fillStyle = rg; ctx.fill();
    ctx.shadowBlur = 0;

    // Control ring
    let ringCol;
    if      (rd.controlledBy==='SHADOW')       ringCol='rgba(200,20,20,0.9)';
    else if (rd.controlledBy==='FREE_PEOPLES') ringCol='rgba(45,140,74,0.9)';
    else if (hovered)                          ringCol='rgba(201,168,76,0.95)';
    else                                       ringCol='rgba(60,60,85,0.8)';
    ctx.beginPath(); ctx.arc(sx, sy, R, 0, Math.PI*2);
    ctx.strokeStyle=ringCol; ctx.lineWidth=hovered?3:2; ctx.stroke();

    // Fortification dashed outer ring
    if (rd.fortified) {
      ctx.beginPath(); ctx.arc(sx, sy, R+5, 0, Math.PI*2);
      ctx.strokeStyle='rgba(201,168,76,0.6)'; ctx.lineWidth=2;
      ctx.setLineDash([4,2]); ctx.stroke(); ctx.setLineDash([]);
      ctx.font=`${Math.round(9*usc)}px Inter,sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('🛡️', sx+R-1, sy-R+1);
      ctx.textBaseline='alphabetic';
    }

    // Region name — outstroked for legibility
    const labelY = sy + R + 14;
    const fPx    = Math.round(hovered ? 9.5*usc : 8.5*usc);
    _txt(meta.name || id, sx, labelY, hovered ? '#e8e0cc' : '#b8b0cc', fPx, hovered);

    // High-threat badge (≥4 only)
    const threat = rd.threatLevel ?? meta.threat ?? 0;
    if (threat >= 4) {
      const tPx  = Math.round(8*usc);
      const tTxt = `⚠ ${threat}`;
      ctx.font   = `bold ${tPx}px Inter,sans-serif`;
      const tW   = ctx.measureText(tTxt).width;
      const tY   = sy - R - 6;
      _rr(sx-tW/2-4, tY-tPx-1, tW+8, tPx+4, 3);
      ctx.fillStyle='rgba(100,0,0,0.8)'; ctx.fill();
      _txt(tTxt, sx, tY, '#ff5555', tPx, true, 1.5);
    }
  }

  // ── 3. Unit tokens — anti-overlap trigonometric spread ──────────────────────
  const byRegion = {};
  Object.entries(state.units).forEach(([uid, u]) => {
    if (!u.region) return;
    if ((u.status||'ACTIVE').toUpperCase() !== 'ACTIVE') return;
    (byRegion[u.region] = byRegion[u.region] || []).push({ uid, u });
  });

  Object.entries(byRegion).forEach(([regionId, units]) => {
    const pos = REGION_POS[regionId]; if (!pos) return;
    const cx = pos.x*scaleX, cy = pos.y*scaleY;
    const total = units.length;
    // Cluster radius — must be > 2×tokenRadius (R≈14px) to prevent overlap.
    // Using a fixed pixel value so it scales correctly with the canvas.
    const tokenR = Math.round(14 * s);
    const CR = total===1 ? 0 : total===2 ? tokenR*2+6 : total<=4 ? tokenR*2+8 : tokenR*2+14;

    units.forEach(({ uid, u }, i) => {
      const isSelected = state.selectedUnit === uid;
      const hasPending = !!state.pendingOrders[uid];
      // Evenly spaced arc; single unit stays centred
      const angle = total===1 ? -Math.PI/2 : (i/total)*Math.PI*2 - Math.PI/2;
      const ux = cx + Math.cos(angle)*CR;
      const uy = cy + Math.sin(angle)*CR;
      drawUnitToken(uid, u, ux, uy, isSelected, hasPending);
    });

    // Count badge for 3+ unit clusters
    if (total >= 3) {
      const bx = cx + CR + 8, by = cy - CR - 4;
      ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI*2);
      ctx.fillStyle='#c9a84c'; ctx.fill();
      ctx.font=`bold ${Math.round(8*s)}px Inter,sans-serif`;
      ctx.fillStyle='#0a0a14'; ctx.textAlign='center';
      ctx.textBaseline='middle'; ctx.fillText(String(total),bx,by);
      ctx.textBaseline='alphabetic';
    }
  });

  // ── 4. Ring Bearer — double pulsing ring (Light Side) ───────────────────────
  if (state.side !== 'SHADOW' && state.ringBearerRegion) {
    const pos = REGION_POS[state.ringBearerRegion];
    if (pos) {
      const pulse = .55 + .45*Math.sin(now/700);
      const sx = pos.x*scaleX, sy = pos.y*scaleY;
      ctx.beginPath(); ctx.arc(sx,sy,25,0,Math.PI*2);
      ctx.strokeStyle=`rgba(255,235,59,${pulse})`; ctx.lineWidth=3;
      ctx.shadowColor='#ffeb3b'; ctx.shadowBlur=20; ctx.stroke(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.arc(sx,sy,16,0,Math.PI*2);
      ctx.strokeStyle=`rgba(255,235,59,${pulse*.45})`; ctx.lineWidth=1.5; ctx.stroke();
      ctx.font=`${Math.round(14*s)}px Inter,sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('💍',sx,sy); ctx.textBaseline='alphabetic';
    }
  }

  // ── 5. Last Detected Region — dashed hunt ring (Shadow) ─────────────────────
  if (state.side === 'SHADOW' && state.lastDetectedRegion) {
    const pos = REGION_POS[state.lastDetectedRegion];
    if (pos) {
      const pulse = .5+.5*Math.abs(Math.sin(now/500));
      const sx = pos.x*scaleX, sy = pos.y*scaleY;
      ctx.beginPath(); ctx.arc(sx,sy,27,0,Math.PI*2);
      ctx.strokeStyle=`rgba(255,68,0,${pulse})`; ctx.lineWidth=2.5;
      ctx.setLineDash([5,4]); ctx.shadowColor='#ff4400'; ctx.shadowBlur=16;
      ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur=0;
      ctx.font=`${Math.round(13*s)}px Inter,sans-serif`;
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('👁️',sx,sy); ctx.textBaseline='alphabetic';
    }
  }

  // ── 6. Sauron Passive Aura ───────────────────────────────────────────────────
  if (sauronInMordor) {
    const pos = REGION_POS['mordor'];
    if (pos) {
      const pulse = .4+.3*Math.sin(now/1200);
      const sx = pos.x*scaleX, sy = pos.y*scaleY;
      ctx.beginPath(); ctx.arc(sx,sy,33,0,Math.PI*2);
      ctx.strokeStyle=`rgba(200,0,0,${pulse})`; ctx.lineWidth=1.5;
      ctx.setLineDash([3,5]); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur=0;
    }
  }

  // Reset transform — remove centering offset, keep DPR scale
  const _dpr = window.devicePixelRatio || 1;
  ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
}

// Colour helpers for radial gradient region nodes
function lightenColor(hex, amount) {
  const n = parseInt(hex.replace('#',''),16);
  const r = Math.min(255, ((n>>16)&0xff) + Math.round(255*amount));
  const g = Math.min(255, ((n>>8) &0xff) + Math.round(255*amount));
  const b = Math.min(255, ( n     &0xff) + Math.round(255*amount));
  return `rgb(${r},${g},${b})`;
}
function darkenColor(hex, amount) {
  const n = parseInt(hex.replace('#',''),16);
  const r = Math.max(0, ((n>>16)&0xff) - Math.round(255*amount));
  const g = Math.max(0, ((n>>8) &0xff) - Math.round(255*amount));
  const b = Math.max(0, ( n     &0xff) - Math.round(255*amount));
  return `rgb(${r},${g},${b})`;
}

let _mapAnimHandle = null;
function startMapAnimation() {
  if (_mapAnimHandle) return;
  function loop() {
    drawMap();
    _mapAnimHandle = requestAnimationFrame(loop);
  }
  _mapAnimHandle = requestAnimationFrame(loop);
}

// ── Unit Panel ────────────────────────────────────────────────────────
function renderUnits() {
  const list = $('units-list');
  if (!list) return;
  list.innerHTML = '';
  const mySide = state.side === 'SHADOW' ? 'SHADOW' : 'FREE_PEOPLES';

  // DÜZELTME: Side alanına güvenir, yoksa ID listesine düşer (UI display map ile uyumlu)
  const isMyUnit = (uid, u) => {
    const side = (u.side || '').toUpperCase();
    if (side === 'SHADOW' || side === 'FREE_PEOPLES') return side === mySide;
    const shadowIds = ['witch-king','nazgul-2','nazgul-3','uruk-hai-legion','saruman','sauron'];
    return shadowIds.includes(uid) ? mySide === 'SHADOW' : mySide === 'FREE_PEOPLES';
  };

  let count = 0;
  Object.entries(state.units).forEach(([uid, u]) => {
    if (!isMyUnit(uid, u)) return;
    count++;

    const disp = UNIT_DISPLAY[uid] || { name: uid, cls: '?', icon: '🔹', trait: '' };
    const maxStr = 10;
    const curStr = u.strength ?? 0;
    const pct = Math.max(0, Math.min(100, Math.round((curStr / maxStr) * 100)));
    const st = (u.status || 'ACTIVE').toUpperCase();
    const isActive = st === 'ACTIVE' || !u.status;
    const pending = state.pendingOrders[uid];

    const barColor = pct > 60 ? '#2d7a4a' : pct > 30 ? '#c9a84c' : '#8b0000';
    const statusLabel = { ACTIVE: 'Aktif', DESTROYED: 'Yok Edildi', RESPAWNING: 'Yeniden Doğuyor' };
    const statusCls = st === 'ACTIVE' ? 'status-active' : st === 'RESPAWNING' ? 'status-respawning' : 'status-destroyed';
    const regionName = u.region ? (REGION_META[u.region]?.name || u.region) : (uid === 'ring-bearer' && state.side !== 'SHADOW' ? (REGION_META[state.ringBearerRegion]?.name || '?') : '???');
    const isShadow = mySide === 'SHADOW';

    const card = document.createElement('div');
    card.className = [
      'unit-card',
      isShadow ? 'unit-card--shadow' : 'unit-card--light',
      // Disabled state: CSS class handles pointer-events, opacity, grayscale.
      // Do NOT also set inline styles — they interfere with !important rules.
      !isActive ? 'unit-card--disabled' : '',
      // Respawning gets an extra amber-tint variant so it looks distinct from Destroyed.
      st === 'RESPAWNING' ? 'unit-card--respawning' : '',
      pending ? 'unit-pending' : '',
    ].filter(Boolean).join(' ');
    card.dataset.uid = uid;
    if (!isActive) {
      // Accessibility: mark as disabled and remove from tab order entirely.
      card.setAttribute('aria-disabled', 'true');
      card.setAttribute('tabindex', '-1');
    }

    card.innerHTML = `
      <div class="uc-header">
        <span class="uc-icon">${disp.icon}</span>
        <div class="uc-info">
          <div class="uc-name">${disp.name}${pending ? `<span class="pending-badge">⏳</span>` : ''}</div>
          <div class="uc-class">${disp.cls}</div>
        </div>
        <span class="unit-status-badge ${statusCls}">${statusLabel[st] || st}</span>
      </div>
      <div class="uc-location">📍  ${regionName}</div>
      <div class="uc-str-row">
        <span class="uc-str-label">Güç</span>
        <div class="strength-bar">
          <div class="strength-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <span class="strength-text">${curStr}/${maxStr}</span>
      </div>
      ${disp.trait ? `<div class="uc-trait">${disp.trait}</div>` : ''}
      ${!isActive ? `<div class="uc-disabled-label">${st === 'RESPAWNING' ? `🔄 Yeniden doğuyor...` : `☠️ Yok edildi`}</div>` : ''}
      ${pending ? `<div class="uc-pending-label">⏳ ${pending.replace(/_/g, ' ')}</div>` : ''}
    `;
    // ISSUE-5: Only attach click listener for ACTIVE units
    if (isActive) {
      card.addEventListener('click', () => onUnitSelect(uid, u, st));
    }
    list.appendChild(card);
  });

  if (count === 0) {
    list.innerHTML = '<div class="uc-loading">Birimler yükleniyor...</div>';
  }
}

function onMapMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const dpr  = window.devicePixelRatio || 1;
  const W    = canvas.width / dpr;
  const H    = canvas.height / dpr;

  // Mouse in logical canvas pixels
  const mx = (e.clientX - rect.left) * (W / rect.width);
  const my = (e.clientY - rect.top)  * (H / rect.height);

  // Inline centering math — must match drawMap exactly
  const _pos = Object.values(REGION_POS);
  const minX = Math.min(..._pos.map(p=>p.x)), maxX = Math.max(..._pos.map(p=>p.x));
  const minY = Math.min(..._pos.map(p=>p.y)), maxY = Math.max(..._pos.map(p=>p.y));
  const PAD  = 56;
  const scale   = Math.min((W-PAD*2)/(maxX-minX), (H-PAD*2)/(maxY-minY));
  const offsetX = (W-(maxX-minX)*scale)/2 - minX*scale;
  const offsetY = (H-(maxY-minY)*scale)/2 - minY*scale;

  // Convert to REGION_POS coordinate space
  const lx = mx - offsetX, ly = my - offsetY;

  let hit = null;
  const HIT_R = 20;
  for (const [id, pos] of Object.entries(REGION_POS)) {
    const dx = lx - pos.x*scale, dy = ly - pos.y*scale;
    if (Math.sqrt(dx*dx + dy*dy) < HIT_R) { hit = id; break; }
  }

  if (hit !== state.hoveredRegion) {
    state.hoveredRegion = hit;
    drawMap();
  }

  const tip = $('map-tooltip');
  if (hit) {
    const meta = REGION_META[hit] || {}, rd = state.regions[hit] || {};
    tip.innerHTML = `<h4>${meta.name || hit}</h4>
      <p>⛰️ ${meta.terrain || ''} | ☠️ Tehdit: ${rd.threatLevel ?? meta.threat ?? 0}</p>
      <p>🚩 ${rd.controlledBy || 'NEUTRAL'}${rd.fortified ? ' 🛡️ Tahkimli' : ''}</p>`;
    tip.style.left = (e.clientX - rect.left + 10) + 'px';
    tip.style.top = (e.clientY - rect.top - 10) + 'px';
    tip.classList.remove('hidden');

    // GÜVENLİK KONTROLÜ EKLENDİ:
    const pathInfoElem = $('path-info-text');
    if (pathInfoElem) {
      pathInfoElem.textContent = `${meta.name || hit} — ${meta.terrain || ''} bölgesi`;
    }
  } else {
    tip.classList.add('hidden');
  }
}

function onMapClick(e) {
  if (!state.hoveredRegion) return;
  const rid = state.hoveredRegion;
  if (state.selectedUnit && state.selectedOrder) {
    const sel = $('order-region-select');
    if (sel) sel.value = rid;
  }
}

function onUnitSelect(uid, u, st) {
  // Hard guard: this function should never be called for non-active units because
  // renderUnits skips attaching the click listener. This is a double-safety net.
  const status = st || (u?.status || 'ACTIVE').toUpperCase();
  if (status !== 'ACTIVE') {
    // Dead/respawning unit — silently ignore. The card is visually disabled so
    // the player already sees feedback; a toast here would be confusing.
    return;
  }
  state.selectedUnit = uid;
  state.selectedUnitData = u;
  document.querySelectorAll('.unit-card').forEach(c =>
    c.classList.toggle('selected', c.dataset.uid === uid));
  fetchAvailableOrders(uid);
}

// DÜZELTME: getDefaultOrders tamamen SİLİNDİ. Sadece sunucudan gelen emirler gösterilir.
async function fetchAvailableOrders(uid) {
  try {
    const sideParam = state.side === 'SHADOW' ? 'SHADOW' : 'FREE_PEOPLES';
    const r = await fetch(
      `${API}/orders/available?unitId=${uid}&playerId=${encodeURIComponent(state.playerId)}&side=${sideParam}`,
      { signal: AbortSignal.timeout(2000) }
    );
    if (r.ok) {
      const serverOrders = await r.json();
      _safeShowPanel(uid, serverOrders || []);
      return;
    }
  } catch (e) {
    console.warn('[orders] fetch failed:', e.message);
  }
  _safeShowPanel(uid, []); // Sunucu başarısızsa emir uydurma
}

function _safeShowPanel(uid, orders) {
  try {
    showOrderPanel(uid, orders);
  } catch (e) {
    console.error('[showOrderPanel] ERROR:', e);
    const panel = $('order-panel');
    const content = $('order-content');
    if (panel && content) {
      content.innerHTML = `<div style="color:#ff4444;padding:0.5rem">⚠️ Panel hatası: ${e.message}</div>`;
      panel.classList.remove('hidden');
    }
  }
}

const ORDER_ICON = {
  ASSIGN_ROUTE: '🗺️', REINFORCE_REGION: '🏰', ATTACK_REGION: '⚔️',
  FORTIFY_REGION: '🛡️', BLOCK_PATH: '🚫', SEARCH_PATH: '🔍',
  DEPLOY_NAZGUL: '👁️', MAIA_ABILITY: '✨',
};

const ORDER_DESC = {
  ASSIGN_ROUTE: 'Rota ata — birim her tur bir adım ilerler',
  REINFORCE_REGION: 'Takviye — komşu bölgeye geç',
  ATTACK_REGION: 'Saldır — komşu düşman bölgesine saldır',
  FORTIFY_REGION: 'Tahkim et — bu bölgeye +2 savunma, 2 tur',
  BLOCK_PATH: 'Yolu Engelle — yolun ucundayken yolu kapat',
  SEARCH_PATH: 'Yolu Tara — gözetleme seviyesini arttır',
  DEPLOY_NAZGUL: 'Nazgul Konuşlandır — hedef bölgeye gönder',
  MAIA_ABILITY: 'Maia Yeteneği — Gandalf: Aç / Saruman: Boz',
};

function showOrderPanel(uid, orders) {
  const disp = UNIT_DISPLAY[uid] || { name: uid, cls: '', icon: '🔹', trait: '' };
  const content = $('order-content');
  const unit = state.selectedUnitData || {};

  $('order-panel-title').innerHTML =
    `${disp.icon} <span style="font-family:'Cinzel',serif;color:var(--gold)">${disp.name}</span>`
    + `<span class="op-class-badge">${disp.cls}</span>`
    + `<button class="op-close-btn" onclick="closeOrderPanel()" title="Kapat">✕</button>`;

  let unitRegion = unit.region || null;
  if (!unitRegion && uid === 'ring-bearer' && state.side !== 'SHADOW') {
    unitRegion = state.ringBearerRegion || 'the-shire';
  }

  const adjacentPaths = unitRegion
    ? PATHS.filter(p => p.from === unitRegion || p.to === unitRegion)
    : PATHS;
  const adjacentRegionIds = new Set(
    adjacentPaths.map(p => p.from === unitRegion ? p.to : p.from)
  );

  const makePathOpts = paths => paths.map(p => {
    const pd = state.paths[p.id] || {};
    const f = REGION_META[p.from]?.name || p.from;
    const t = REGION_META[p.to]?.name || p.to;
    const tag = pd.status === 'BLOCKED' ? ' 🚫' : pd.status === 'THREATENED' ? ' ⚠️' : pd.surveillanceLevel > 0 ? ` 🔴×${pd.surveillanceLevel}` : '';
    return `<option value="${p.id}">${f} → ${t}${tag}</option>`;
  }).join('');

  const makeRegionOpts = fn => Object.entries(REGION_META)
    .filter(([id]) => fn(id))
    .map(([id, m]) => {
      const rd = state.regions[id] || {};
      const ctrl = rd.controlledBy === 'SHADOW' ? '🔴' : rd.controlledBy === 'FREE_PEOPLES' ? '🔵' : '⚪';
      return `<option value="${id}">${ctrl} ${m.name}</option>`;
    }).join('');

  const pathOptsAdj = makePathOpts(adjacentPaths);
  const pathOptsAll = makePathOpts(PATHS);
  const regionOptsAdj = makeRegionOpts(id => adjacentRegionIds.has(id));
  const regionOptsAll = makeRegionOpts(id => id !== unitRegion);

  const locLine = unitRegion
    ? `<div class="op-location">📍  <strong>${REGION_META[unitRegion]?.name || unitRegion}</strong></div>`
    : '';

  let html = locLine;

  html += `<div class="op-chips">`;
  (orders || []).forEach(o => {
    html += `<button class="order-chip" data-order="${o}" onclick="selectOrderType('${o}')">
      <span class="oc-icon">${ORDER_ICON[o] || '📋'}</span>
      <span class="oc-label">${o.replace(/_/g, ' ')}</span>
    </button>`;
  });
  html += `</div>`;

  html += `<div id="op-desc" class="op-desc hidden"></div>`;

  html += `<div id="order-inputs" class="op-inputs hidden">

    <div id="input-route" class="op-input-block hidden">
      <div class="op-input-header">🗺️ Rota Oluştur
        <button class="btn-undo" onclick="clearRoute()" style="margin-left:auto">🗑️ Temizle</button>
      </div>
      <div id="route-chain-hint" class="op-route-hint">
        Başlangıç: <strong>${unitRegion ? (REGION_META[unitRegion]?.name || unitRegion) : '?'}</strong>
        — Sonraki adım için aşağıdaki yollardan birini seç:
      </div>
      <div id="route-chip-grid" class="op-path-grid"></div>
      <div id="route-selected" class="op-route-selected">
        <span style="color:#4a4060;font-size:0.68rem">Henüz yol seçilmedi...</span>
      </div>
    </div>

    <div id="input-region-attack" class="op-input-block hidden">
      <div class="op-input-header">⚔️ Saldırı Hedefi</div>
      <select class="order-select" id="order-region-select"
        onchange="const btn=$('dyn-submit');if(btn)btn.disabled=!this.value">
        <option value="">— Bölge seçin —</option>${regionOptsAdj || regionOptsAll}
      </select>
    </div>

    <div id="input-region" class="op-input-block hidden">
      <div class="op-input-header">🏰 Hedef Bölge</div>
      <select class="order-select" id="order-region-select-move"
        onchange="const btn=$('dyn-submit');if(btn)btn.disabled=!this.value">
        <option value="">— Bölge seçin —</option>${regionOptsAdj || regionOptsAll}
      </select>
    </div>

    <div id="input-path" class="op-input-block hidden">
      <div class="op-input-header">🛤️ Hedef Yol</div>
      ${adjacentPaths.length === 0
      ? '<p class="op-warn">⚠️ Birim bir yolun ucunda değil — önce birimi yol uç noktasına taşıyın.</p>'
      : `<p style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.3rem">${adjacentPaths.length} yol erişilebilir</p>`
    }
      <select class="order-select" id="order-path-select" onchange="const btn=$('dyn-submit');if(btn)btn.disabled=!this.value">
        <option value="">— Yol seçin —</option>${pathOptsAdj || pathOptsAll}
      </select>
    </div>

    <div id="input-fortify" class="op-input-block hidden">
      <div class="op-input-header">🏰 Tahkim Et</div>
      <p style="font-size:0.72rem;color:var(--text-muted)">
        <strong style="color:var(--gold)">${REGION_META[unitRegion]?.name || unitRegion || '?'}</strong> bölgesi tahkim edilecek (+2 savunma, 2 tur sürer).
      </p>
    </div>

  </div>

  <div class="op-footer">
    <button class="btn-primary op-submit" id="dyn-submit" onclick="doSubmitOrder()" disabled>
      ⚡ Emri Gönder
    </button>
    <button class="btn-secondary" onclick="closeOrderPanel()">✕ İptal</button>
  </div>`;

  content.innerHTML = html;
  state.selectedRoute = [];
  state._routeCurrentRegion = unitRegion;
  const orig = document.querySelector('#order-panel > .order-buttons');
  if (orig) orig.style.display = 'none';
  $('order-panel').classList.remove('hidden');
}

function renderRouteStep() {
  const isRB = state.selectedUnit === 'ring-bearer';
  let currentRegion = state._routeCurrentRegion;
  if (!currentRegion) {
    currentRegion = (isRB && state.side !== 'SHADOW')
      ? (state.ringBearerRegion || 'the-shire')
      : (state.selectedUnitData?.region || null);
    state._routeCurrentRegion = currentRegion;
  }

  const grid = $('route-chip-grid');
  const hint = $('route-chain-hint');
  if (!grid) return;

  // Only show paths that leave the current region (destinations)
  const stepPaths = currentRegion
    ? PATHS.filter(p => p.from === currentRegion || p.to === currentRegion)
    : PATHS;

  const currentName = currentRegion ? (REGION_META[currentRegion]?.name || currentRegion) : '?';
  const stepNum = (state.selectedRoute?.length || 0) + 1;

  if (hint) {
    hint.innerHTML =
      `<span class="route-step-num">${stepNum}. Adım</span> ` +
      `<span class="route-step-from">${currentName}</span> konumundan ` +
      `<strong>nereye gidilsin?</strong>`;
  }

  const pd = state.paths;
  if (stepPaths.length === 0) {
    grid.innerHTML = '<span class="route-dead-end">⛔ Bu konumdan devam edilecek yol yok.</span>';
    return;
  }

  grid.innerHTML = stepPaths.map(p => {
    const destId = p.from === currentRegion ? p.to : p.from;
    const destName = REGION_META[destId]?.name || destId;
    const pstate = pd[p.id] || {};
    let statusPill = '';
    if (pstate.status === 'BLOCKED')
      statusPill = '<span class="route-pill route-pill--blocked">🚫 KAPALI</span>';
    else if (pstate.status === 'THREATENED')
      statusPill = '<span class="route-pill route-pill--threatened">⚠️ TEHLİKELİ</span>';
    else if (pstate.status === 'TEMPORARILY_OPEN')
      statusPill = '<span class="route-pill route-pill--open">✨ GEÇİCİ AÇIK</span>';
    else if ((pstate.surveillanceLevel || 0) > 0)
      statusPill = `<span class="route-pill route-pill--surv">${'🔴'.repeat(pstate.surveillanceLevel)} GÖZETİM</span>`;

    return `<button class="path-chip" data-pid="${p.id}" data-from="${p.from}" data-to="${p.to}" onclick="addRouteStep(this)">
      <span class="path-chip__dest">→ ${destName}</span>
      ${statusPill}
    </button>`;
  }).join('');
}

function addRouteStep(el) {
  const pid = el.dataset.pid;
  const from = el.dataset.from;
  const to = el.dataset.to;
  if (!pid) return;
  if (!state.selectedRoute) state.selectedRoute = [];
  state.selectedRoute.push(pid);
  const curReg = state._routeCurrentRegion || (state.selectedUnitData?.region);
  state._routeCurrentRegion = (from === curReg) ? to : from;
  _refreshRouteSelected();
  renderRouteStep();
  const btn = $('dyn-submit');
  if (btn) btn.disabled = false;
}

function selectOrderType(o) {
  state.selectedOrder = o;
  document.querySelectorAll('.order-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.order === o));

  const desc = $('op-desc');
  if (desc) {
    desc.textContent = ORDER_DESC[o] || '';
    desc.classList.remove('hidden');
  }

  const inputs = $('order-inputs');
  if (inputs) inputs.classList.remove('hidden');

  const showMap = {
    ASSIGN_ROUTE: 'route',
    BLOCK_PATH: 'path',
    SEARCH_PATH: 'path',
    MAIA_ABILITY: 'path',
    ATTACK_REGION: 'region-attack',
    REINFORCE_REGION: 'region',
    FORTIFY_REGION: 'fortify',
    DEPLOY_NAZGUL: 'region',
  };
  const showKey = showMap[o];
  ['route', 'region', 'region-attack', 'path', 'fortify'].forEach(t => {
    const el = $('input-' + t);
    if (el) el.classList.toggle('hidden', t !== showKey);
  });

  if (o === 'ASSIGN_ROUTE') renderRouteStep();

  const btn = $('dyn-submit');

  // DÜZELTME: BLOCK_PATH emri için yol yoksa direkt Gönder butonu kapatılır
  if (o === 'BLOCK_PATH') {
    const pathSel = $('order-path-select');
    if (btn) btn.disabled = !pathSel || !pathSel.value;
  } else {
    if (btn) btn.disabled = o === 'ASSIGN_ROUTE' ? true : o === 'FORTIFY_REGION' ? false : false;
  }
}

function selectOrder(o) { selectOrderType(o); }

function toggleRoutePath(el) {
  const pid = el.dataset.pid;
  if (!pid) return;
  if (!state.selectedRoute) state.selectedRoute = [];
  const idx = state.selectedRoute.indexOf(pid);
  if (idx === -1) {
    state.selectedRoute.push(pid);
    el.classList.add('active');
  } else {
    state.selectedRoute.splice(idx, 1);
    el.classList.remove('active');
  }
  const sel = $('route-selected');
  if (sel) {
    sel.innerHTML = state.selectedRoute.map((p, i) => {
      const ph = PATHS.find(x => x.id === p);
      const lbl = ph
        ? `${REGION_META[ph.from]?.name || ph.from}→${REGION_META[ph.to]?.name || ph.to}`
        : p;
      return `<span class="route-tag">${i + 1}. ${lbl} <span style="cursor:pointer;opacity:.7" onclick="removeRoutePath('${p}')">✕</span></span>`;
    }).join('');
    if (state.selectedRoute.length === 0)
      sel.innerHTML = '<span style="color:#7a7080;font-size:0.75rem">Henüz yol seçilmedi</span>';
  }
}

function removeRoutePath(pid) {
  const btn = document.querySelector(`.path-chip[data-pid="${pid}"]`);
  if (btn) toggleRoutePath(btn);
}

// DÜZELTME: Template literal hatası tamamen giderildi.
async function resetGameServer() {
  const btn = $('server-reset-btn');
  if (!confirm('Oyunu sıfırlamak istiyor musunuz?')) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Sıfırlanıyor...'; }

  try {
    const r = await fetch(`${API}/game/reset`, { method: 'POST' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    await fetch(`${API}/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'HVH' })
    });

    showToast('Oyun sıfırlandı! Yeniden katılabilirsiniz.', 'success');
    addEventLog('Oyun sıfırlandı - Tur 1\'e dönüldü.', 'event-gameover');
    setTimeout(() => resetGame(), 1200);
  } catch (e) {
    showToast(`Sıfırlama başarısız: ${e.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Oyunu Sıfırla'; }
  }
}

function undoRouteStep() {
  if (!state.selectedRoute || state.selectedRoute.length === 0) return;
  state.selectedRoute.pop();
  const base = state.selectedUnitData?.region ||
    (state.selectedUnit === 'ring-bearer' ? (state.ringBearerRegion || 'the-shire') : null);
  let cur = base;
  for (const pid of state.selectedRoute) {
    const p = PATHS.find(x => x.id === pid);
    if (p) cur = (p.from === cur) ? p.to : p.from;
  }
  state._routeCurrentRegion = cur;
  _refreshRouteSelected();
  renderRouteStep();
  const btn = $('dyn-submit');
  if (btn) btn.disabled = state.selectedRoute.length === 0;
}

function clearRoute() {
  state.selectedRoute = [];
  const base = state.selectedUnitData?.region ||
    (state.selectedUnit === 'ring-bearer' ? (state.ringBearerRegion || 'the-shire') : null);
  state._routeCurrentRegion = base;
  _refreshRouteSelected();
  renderRouteStep();
  const btn = $('dyn-submit');
  if (btn) btn.disabled = true;
}

function _refreshRouteSelected() {
  const selDiv = $('route-selected');
  if (!selDiv) return;
  if (!state.selectedRoute || state.selectedRoute.length === 0) {
    selDiv.innerHTML = '<span class="route-empty">Henüz yol seçilmedi — yukarıdan bir hedef seçin</span>';
    return;
  }

  // Build a region chain: start → r1 → r2 → ...
  const baseRegion = state.selectedUnitData?.region ||
    (state.selectedUnit === 'ring-bearer' ? (state.ringBearerRegion || 'the-shire') : null);
  let chain = [baseRegion];
  let cur = baseRegion;
  for (const pid of state.selectedRoute) {
    const p = PATHS.find(x => x.id === pid);
    if (p) { cur = (p.from === cur) ? p.to : p.from; chain.push(cur); }
  }

  const labels = chain.map((rid, i) => {
    const name = REGION_META[rid]?.name || rid || '?';
    const isLast = i === chain.length - 1;
    if (i === 0) return `<span class="route-crumb route-crumb--start">📍 ${name}</span>`;
    return `<span class="route-crumb__arrow">→</span><span class="route-crumb ${isLast ? 'route-crumb--end' : ''}">` +
      `<span class="route-crumb__num">${i}</span>${name}</span>`;
  }).join('');

  selDiv.innerHTML = `<div class="route-chain">${labels}</div>` +
    `<button class="btn-undo" onclick="undoRouteStep()" title="Son adımı geri al">↩ Geri</button>`;
}

// ══════════════════════════════════════════════════════════════════════
// PARÇA 4 — Analysis, Game Over, Toast, Event Log, Helpers
// ══════════════════════════════════════════════════════════════════════

async function requestAnalysis() {
  const endpoint = state.side === 'SHADOW'
    ? `/analysis/intercept?side=SHADOW`
    : `/analysis/routes?side=FREE_PEOPLES`;
  try {
    const r = await fetch(API + endpoint);
    if (!r.ok) return;
    state.analysisData = await r.json();
    renderAnalysis();
  } catch (e) { console.warn('analysis fetch failed', e); }
}

function renderAnalysis() {
  const el = $('analysis-results');
  if (!el || !state.analysisData) return;
  let html = '';

  if (state.side === 'FREE_PEOPLES') {
    const data = state.analysisData;
    (data.routes || []).forEach(r => {
      const isRec = r.name === data.recommended;
      const riskPct = Math.min(100, (r.riskScore / 30) * 100);
      html += `<div class="route-card${isRec ? ' recommended' : ''}">
        <div class="route-name">${isRec ? '★ ' : ''}${r.name}</div>
        <div class="route-risk">Risk: ${r.riskScore} | Nazgul: ${r.nazgulProximity}</div>
        <div class="risk-bar"><div class="risk-fill" style="width:${riskPct}%"></div></div>
      </div>`;
    });
  } else {
    (state.analysisData.byUnit || []).forEach(u => {
      html += `<div class="intercept-card">
        <div class="intercept-unit">${u.unitId}</div>
        <div class="intercept-target">→ ${REGION_META[u.targetRegion]?.name || u.targetRegion}
          (${u.turnsToIntercept} tur, skor: ${(u.score * 100).toFixed(0)}%)</div>
      </div>`;
    });
  }

  el.innerHTML = html || '<p style="color:#7a7080;font-size:0.8rem">Veri yok</p>';
}

function handleGameOver(msg) {
  clearInterval(state.timerInterval);
  state.gamePhase = 'ENDED';

  const isWinner =
    (msg.winner === 'LIGHT_SIDE' && state.side === 'FREE_PEOPLES') ||
    (msg.winner === 'DARK_SIDE' && state.side === 'SHADOW');

  $('game-over-icon').textContent = msg.winner === 'DRAW' ? '⚖️' : isWinner ? '🏆' : '💀';
  $('game-over-title').textContent = msg.winner === 'DRAW' ? 'Beraberlik!'
    : isWinner ? 'Zafer!' : 'Yenilgi!';
  $('game-over-subtitle').textContent =
    msg.winner === 'LIGHT_SIDE' ? 'Yüzük imha edildi — Özgür Halklar kazandı!' :
      msg.winner === 'DARK_SIDE' ? 'Yüzük Taşıyıcısı yakalandı — Gölge kazandı!' :
        'Maksimum tur sayısına ulaşıldı.';
  $('game-over-cause').textContent = msg.cause || '';
  $('game-over-overlay').classList.remove('hidden');
  addEventLog(`🏁 Oyun bitti: ${msg.winner} — ${msg.cause}`, 'event-gameover');
}

function resetGame() {
  if (state.eventSource) state.eventSource.close();
  clearInterval(state.timerInterval);
  clearInterval(_timerIntervalId);
  if (_mapAnimHandle) { cancelAnimationFrame(_mapAnimHandle); _mapAnimHandle = null; }
  // BUG-1 FIX: clear log dedup set on game reset so fresh logs can appear
  state._logDedup = new Set();
  // ISSUE-4 FIX: reset initial-snapshot flag so the log is cleared again on next connect
  state._initialSnapshotSeen = false;
  Object.assign(state, {
    connected: false, gamePhase: 'LOBBY', turn: 1,
    units: {}, regions: {}, paths: {},
    turnStartedAt: null, turnDuration: TURN_SECONDS,
    ringBearerRegion: null, lastDetectedRegion: null,
    selectedUnit: null, availableOrders: [], selectedOrder: null,
    highlightedPaths: [], analysisData: null,
  });

  $('game-over-overlay').classList.add('hidden');
  $('game-screen').classList.add('hidden');
  $('login-screen').classList.remove('hidden');
}

function addEventLog(msg, cssClass = 'info') {
  const log = $('event-log');
  if (!log) return;
  const el = document.createElement('div');
  el.className = `event-item event-${cssClass}`;
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  el.innerHTML = `<span class="event-turn">[T${state.turn}]</span><span class="event-time">${timeStr}</span><span class="event-msg">${msg}</span>`;
  log.prepend(el);
  while (log.children.length > 80) log.removeChild(log.lastChild);
}

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  $('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 4000);
}
