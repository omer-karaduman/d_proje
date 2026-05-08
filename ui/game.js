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
const REGION_POS = {
  'the-shire': { x: 80, y: 100 },
  'bree': { x: 200, y: 100 },
  'tharbad': { x: 160, y: 210 },
  'weathertop': { x: 290, y: 80 },
  'rivendell': { x: 370, y: 70 },
  'fangorn': { x: 240, y: 310 },
  'fords-of-isen': { x: 200, y: 280 },
  'rohan-plains': { x: 310, y: 310 },
  'moria': { x: 410, y: 190 },
  'helms-deep': { x: 250, y: 370 },
  'isengard': { x: 220, y: 370 },
  'edoras': { x: 330, y: 390 },
  'lothlorien': { x: 450, y: 240 },
  'dead-marshes': { x: 530, y: 310 },
  'emyn-muil': { x: 510, y: 250 },
  'minas-tirith': { x: 440, y: 430 },
  'ithilien': { x: 570, y: 390 },
  'osgiliath': { x: 510, y: 430 },
  'minas-morgul': { x: 590, y: 450 },
  'cirith-ungol': { x: 660, y: 410 },
  'mordor': { x: 700, y: 490 },
  'mount-doom': { x: 780, y: 520 },
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
  turnStartedAt: null,   // Unix epoch (server'dan) — clock-based timer için
  turnDuration: TURN_SECONDS, // saniye
  units: {}, regions: {}, paths: {},
  selectedUnit: null, selectedUnitData: null,
  selectedOrder: null, selectedRoute: [],
  _routeCurrentRegion: null,
  pendingOrders: {},
  ringBearerRegion: null, lastDetectedRegion: null,
  hoveredRegion: null, highlightedPaths: [],
  analysisData: null, eventSource: null,
};

// ── DOM helper ────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Canvas refs (set on DOMContentLoaded) ─────────────────────────────
let canvas, ctx;

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

      // ── Timer senkronizasyonu — server'ın turnStartedAt'ından gerçek zamanlı hesapla
      {
        const turnDur = msg.turnDurationSec || TURN_SECONDS;
        if (msg.turnStartedAt) {
          state.turnStartedAt = msg.turnStartedAt;
          state.turnDuration = turnDur;
        } else if (typeof msg.turnRemainingSec === 'number') {
          state.turnStartedAt = Math.floor(Date.now() / 1000) - (turnDur - Math.max(1, msg.turnRemainingSec));
          state.turnDuration = turnDur;
        } else {
          // Fallback: Sunucu zamanı göndermediyse local başlat
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
  const wrapper = canvas.parentElement;
  canvas.width = wrapper.clientWidth || 900;
  canvas.height = wrapper.clientHeight || 600;
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
  if (!state.turnStartedAt || !state.turnDuration) return;
  const elapsed = Math.floor(Date.now() / 1000) - state.turnStartedAt;
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
  const pct = (s / TURN_SECONDS) * 100;
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

    if (d.turnStartedAt) {
      startTimer(d.turnStartedAt, d.turnDurationSec);
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

function drawMap() {
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const scaleX = W / 900, scaleY = H / 600;
  const now = Date.now();

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#06060e';
  ctx.fillRect(0, 0, W, H);

  // ── 0. Nazgul Tespit Alanı (Sauron Pasif Kontrolü) ──
  const sauronInMordor = (() => {
    const s = Object.values(state.units).find(u => {
      const side = (u.side || '').toUpperCase();
      const isShadow = side === 'SHADOW' || u.class === 'Maia' && u.id === 'sauron';
      return isShadow && u.region === 'mordor' && (u.status || 'ACTIVE') === 'ACTIVE' && u.id === 'sauron';
    });
    return !!s;
  })();

  Object.entries(state.units).forEach(([uid, u]) => {
    if (u.class !== 'Nazgul') return;
    if (!u.region || (u.status && u.status !== 'ACTIVE')) return;
    const pos = REGION_POS[u.region];
    if (!pos) return;

    const baseRange = u.detectionRange || 1;
    const effectiveRange = baseRange + (sauronInMordor ? 1 : 0);
    const sx = pos.x * scaleX, sy = pos.y * scaleY;

    const pulse = 0.7 + 0.3 * Math.sin(now / 800);
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(180, 30, 30, ${0.5 * pulse})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (effectiveRange >= 2) {
      ctx.beginPath();
      ctx.arc(sx, sy, 52, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(180, 30, 30, ${0.25 * pulse})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.font = `bold ${Math.round(9 * scaleX)}px Inter, sans-serif`;
    ctx.fillStyle = 'rgba(220, 80, 80, 0.9)';
    ctx.textAlign = 'center';
    ctx.fillText(`👁️  ${effectiveRange}`, sx, sy - 28);
  });

  // ── 1. Yollar ──────────────────────────────────────────────────────────
  PATHS.forEach(p => {
    const a = REGION_POS[p.from], b = REGION_POS[p.to];
    if (!a || !b) return;
    const pd = state.paths[p.id] || {};
    const highlighted = state.highlightedPaths?.includes(p.id);
    const ax = a.x * scaleX, ay = a.y * scaleY;
    const bx = b.x * scaleX, by = b.y * scaleY;

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);

    if (highlighted) {
      ctx.strokeStyle = '#c9a84c';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([]);
      ctx.shadowColor = '#c9a84c'; ctx.shadowBlur = 8;
    } else if (pd.status === 'BLOCKED') {
      const blPulse = 0.6 + 0.4 * Math.sin(now / 600);
      ctx.strokeStyle = `rgba(160, 0, 0, ${blPulse})`;
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 4]);
      ctx.shadowColor = '#8b0000'; ctx.shadowBlur = 10;
    } else if (pd.status === 'TEMPORARILY_OPEN') {
      ctx.strokeStyle = '#4a90d9';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 3]);
      ctx.shadowColor = '#4a90d9'; ctx.shadowBlur = 12;
    } else if (pd.status === 'THREATENED') {
      ctx.strokeStyle = '#c04000';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.shadowColor = '#c04000'; ctx.shadowBlur = 5;
    } else if (pd.surveillanceLevel >= 3) {
      ctx.strokeStyle = '#8040c0';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.shadowColor = '#8040c0'; ctx.shadowBlur = 8;
    } else if (pd.surveillanceLevel === 2) {
      ctx.strokeStyle = '#a03060';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.shadowColor = 'none'; ctx.shadowBlur = 0;
    } else if (pd.surveillanceLevel === 1) {
      ctx.strokeStyle = '#603040';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.shadowBlur = 0;
    } else {
      ctx.strokeStyle = '#2a2a3a';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    if (pd.surveillanceLevel > 0 && pd.status !== 'BLOCKED') {
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      ctx.font = `${Math.round(8 * scaleX)}px Inter, sans-serif`;
      ctx.fillStyle = pd.surveillanceLevel >= 3 ? '#c080ff' : pd.surveillanceLevel === 2 ? '#ff80a0' : '#a06080';
      ctx.textAlign = 'center';
      ctx.fillText('🔴'.repeat(pd.surveillanceLevel), mx, my - 4);
    }

    if (pd.status === 'BLOCKED') {
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      ctx.font = `${Math.round(14 * scaleX)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🚫', mx, my + 4);
    }

    if (pd.status === 'TEMPORARILY_OPEN') {
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      ctx.font = `${Math.round(13 * scaleX)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('✨', mx, my + 4);
    }
  });

  // ── 2. Bölgeler ────────────────────────────────────────────────────────
  for (const [id, pos] of Object.entries(REGION_POS)) {
    const meta = REGION_META[id] || {};
    const rd = state.regions[id] || {};
    const hovered = state.hoveredRegion === id;
    const sx = pos.x * scaleX, sy = pos.y * scaleY;
    const radius = hovered ? 18 : 15;

    if (id === 'mount-doom') {
      ctx.shadowColor = '#ff4400'; ctx.shadowBlur = hovered ? 25 : 15;
    } else if (id === 'the-shire') {
      ctx.shadowColor = '#4a90d9'; ctx.shadowBlur = hovered ? 15 : 8;
    } else if (id === 'isengard' || id === 'minas-morgul' || id === 'mordor') {
      ctx.shadowColor = '#8b0000'; ctx.shadowBlur = hovered ? 12 : 6;
    } else if (rd.fortified) {
      ctx.shadowColor = '#c9a84c'; ctx.shadowBlur = 8;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = TERRAIN_COLOR[meta.terrain] || '#1a1a2a';
    ctx.fill();

    if (rd.controlledBy === 'SHADOW') ctx.strokeStyle = '#8b0000';
    else if (rd.controlledBy === 'FREE_PEOPLES') ctx.strokeStyle = '#2d7a4a';
    else ctx.strokeStyle = hovered ? '#c9a84c' : '#333';
    ctx.lineWidth = hovered ? 3 : 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (rd.fortified) {
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(201,168,76,0.5)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${Math.round(10 * scaleX)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🛡️', sx + radius - 2, sy - radius + 2);
    }

    ctx.fillStyle = hovered ? '#e8e0cc' : '#7a7080';
    ctx.font = `${hovered ? 'bold ' : ''}${Math.round(9 * scaleX)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.shadowBlur = 0;
    ctx.fillText(meta.name || id, sx, sy + radius + 11);

    const threat = rd.threatLevel ?? meta.threat ?? 0;
    if (threat >= 2) {
      ctx.font = `bold ${Math.round(8 * scaleX)}px Inter, sans-serif`;
      ctx.fillStyle = threat >= 4 ? '#ff4444' : '#c04000';
      ctx.fillText(`⚠️${threat}`, sx, sy - radius - 4);
    }
  }

  // ── 3. Birimler ────────────────────────────────────────────────────────
  const byRegion = {};
  Object.entries(state.units).forEach(([uid, u]) => {
    if (!u.region) return;
    if (!byRegion[u.region]) byRegion[u.region] = [];
    byRegion[u.region].push({ uid, u });
  });

  Object.entries(byRegion).forEach(([regionId, units]) => {
    const pos = REGION_POS[regionId];
    if (!pos) return;
    const sx = pos.x * scaleX, sy = pos.y * scaleY;
    const total = units.length;

    units.forEach(({ uid, u }, i) => {
      const disp = UNIT_DISPLAY[uid] || { icon: '🔹' };
      const angle = total > 1 ? (i / total) * Math.PI * 2 - Math.PI / 2 : -Math.PI / 2;
      const dist = total > 1 ? 20 : 0;
      const ux = sx + Math.cos(angle) * dist;
      const uy = sy + Math.sin(angle) * dist;

      // DÜZELTME: Side alanını normalize et ve class/id fallback'lerini kullan
      const uSide = (u.side || '').toUpperCase();
      const shadowIds = ['witch-king','nazgul-2','nazgul-3','uruk-hai-legion','saruman','sauron'];
      const isShadow = uSide === 'SHADOW' || (uSide === '' && shadowIds.includes(uid));

      ctx.beginPath();
      ctx.arc(ux, uy - 10, 8, 0, Math.PI * 2);
      ctx.fillStyle = isShadow ? 'rgba(139,0,0,0.6)' : 'rgba(42,90,150,0.6)';
      ctx.fill();
      ctx.strokeStyle = isShadow ? '#c04000' : '#4a90d9';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = `${Math.round(11 * scaleX)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(disp.icon, ux, uy - 6);

      if (state.pendingOrders[uid]) {
        ctx.font = `${Math.round(7 * scaleX)}px Inter, sans-serif`;
        ctx.fillText('⏳', ux + 8, uy - 14);
      }
    });
  });

  // ── 4. Ring Bearer ─────────────────────────────────────────────────────
  if (state.side !== 'SHADOW' && state.ringBearerRegion) {
    const pos = REGION_POS[state.ringBearerRegion];
    if (pos) {
      const pulse = 0.6 + 0.4 * Math.sin(now / 700);
      const sx = pos.x * scaleX, sy = pos.y * scaleY;
      ctx.beginPath();
      ctx.arc(sx, sy, 22, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 235, 59, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffeb3b'; ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = `${Math.round(12 * scaleX)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('💍', sx, sy + 4);
    }
  }

  // ── 5. Son Tespit Konumu ───────────────────────────────────────────────
  if (state.side === 'SHADOW' && state.lastDetectedRegion) {
    const pos = REGION_POS[state.lastDetectedRegion];
    if (pos) {
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 500));
      const sx = pos.x * scaleX, sy = pos.y * scaleY;
      ctx.beginPath();
      ctx.arc(sx, sy, 24, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 68, 0, ${pulse})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      ctx.font = `${Math.round(11 * scaleX)}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('👁️', sx, sy + 4);
    }
  }

  // ── 6. Sauron Pasif Etki ───────────────────────────────────────────────
  if (sauronInMordor) {
    const pos = REGION_POS['mordor'];
    if (pos) {
      const pulse = 0.4 + 0.3 * Math.sin(now / 1200);
      const sx = pos.x * scaleX, sy = pos.y * scaleY;
      ctx.beginPath();
      ctx.arc(sx, sy, 30, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200, 0, 0, ${pulse})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }
  }
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
      !isActive ? 'unit-' + st.toLowerCase() : '',
      pending ? 'unit-pending' : '',
    ].filter(Boolean).join(' ');
    card.dataset.uid = uid;
    card.style.cursor = isActive ? 'pointer' : 'not-allowed';

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
      ${pending ? `<div class="uc-pending-label">⏳ ${pending.replace(/_/g, ' ')}</div>` : ''}
    `;
    card.addEventListener('click', () => onUnitSelect(uid, u, st));
    list.appendChild(card);
  });

  if (count === 0) {
    list.innerHTML = '<div class="uc-loading">Birimler yükleniyor...</div>';
  }
}

function onMapMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const my = (e.clientY - rect.top) * (canvas.height / rect.height);
  const scaleX = canvas.width / 900, scaleY = canvas.height / 600;

  let hit = null;
  for (const [id, pos] of Object.entries(REGION_POS)) {
    const dx = mx - pos.x * scaleX, dy = my - pos.y * scaleY;
    if (Math.sqrt(dx * dx + dy * dy) < 18) { hit = id; break; }
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
  const status = st || (u.status || 'ACTIVE').toUpperCase();
  if (status !== 'ACTIVE') {
    showToast(`${unitName(uid)} — ${status === 'DESTROYED' ? 'Yok edildi' : 'Yeniden doğuyor'}, emir verilemez`, 'error');
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

  const stepPaths = currentRegion
    ? PATHS.filter(p => p.from === currentRegion || p.to === currentRegion)
    : PATHS;

  if (hint) {
    const regionName = currentRegion ? (REGION_META[currentRegion]?.name || currentRegion) : '?';
    hint.innerHTML = `Konum: <strong>${regionName}</strong> — sonraki adımı seç:`;
  }

  const pd = state.paths;
  grid.innerHTML = stepPaths.map(p => {
    const fLabel = REGION_META[p.from]?.name || p.from;
    const tLabel = REGION_META[p.to]?.name || p.to;
    const dest = p.from === currentRegion ? tLabel : fLabel;
    const pstate = pd[p.id] || {};
    const tag = pstate.status === 'BLOCKED' ? ' 🚫' : pstate.status === 'THREATENED' ? ' ⚠️' : pstate.surveillanceLevel > 0 ? ` 🔴×${pstate.surveillanceLevel}` : '';
    return `<button class="path-chip" data-pid="${p.id}" data-from="${p.from}" data-to="${p.to}" onclick="addRouteStep(this)">
      ${fLabel} → ${tLabel}${tag}
      <span style="color:var(--light-blue);font-size:0.6rem">→ ${dest}</span>
    </button>`;
  }).join('') || '<span style="color:#f87171;font-size:0.72rem">⚠️ Bu konumdan devam edilecek yol bulunamadı.</span>';
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
    selDiv.innerHTML = '<span style="color:#4a4060;font-size:0.68rem">Henüz yol seçilmedi...</span>';
    return;
  }
  selDiv.innerHTML = state.selectedRoute.map((p, i) => {
    const ph = PATHS.find(x => x.id === p);
    const lbl = ph ? (REGION_META[ph.from]?.name || ph.from) + ' > ' + (REGION_META[ph.to]?.name || ph.to) : p;
    return '<span class="route-tag">' + (i + 1) + '. ' + lbl + '</span>';
  }).join('');
  selDiv.innerHTML += '<button class="btn-undo" onclick="undoRouteStep()">Geri al</button>';
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