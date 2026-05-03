'use strict';

// ── API Base ──────────────────────────────────────────────────
const API = ''; // Always use same origin (nginx proxies /api/* to Go)


// ── Constants ─────────────────────────────────────────────────
const MAX_TURNS    = 40;
const TURN_SECONDS = 60;

// ── Region canvas positions ───────────────────────────────────
const REGION_POS = {
  'the-shire':    { x: 80,  y: 100 },
  'bree':         { x: 200, y: 100 },
  'tharbad':      { x: 160, y: 210 },
  'weathertop':   { x: 290, y:  80 },
  'rivendell':    { x: 370, y:  70 },
  'fangorn':      { x: 240, y: 310 },
  'fords-of-isen':{ x: 200, y: 280 },
  'rohan-plains': { x: 310, y: 310 },
  'moria':        { x: 410, y: 190 },
  'helms-deep':   { x: 250, y: 370 },
  'isengard':     { x: 220, y: 370 },
  'edoras':       { x: 330, y: 390 },
  'lothlorien':   { x: 450, y: 240 },
  'dead-marshes': { x: 530, y: 310 },
  'emyn-muil':    { x: 510, y: 250 },
  'minas-tirith': { x: 440, y: 430 },
  'ithilien':     { x: 570, y: 390 },
  'osgiliath':    { x: 510, y: 430 },
  'minas-morgul': { x: 590, y: 450 },
  'cirith-ungol': { x: 660, y: 410 },
  'mordor':       { x: 700, y: 490 },
  'mount-doom':   { x: 780, y: 520 },
};

// ── Paths ─────────────────────────────────────────────────────
const PATHS = [
  { id:'shire-to-bree',                  from:'the-shire',    to:'bree' },
  { id:'bree-to-weathertop',             from:'bree',         to:'weathertop' },
  { id:'bree-to-rivendell',              from:'bree',         to:'rivendell' },
  { id:'bree-to-tharbad',                from:'bree',         to:'tharbad' },
  { id:'shire-to-tharbad',               from:'the-shire',    to:'tharbad' },
  { id:'weathertop-to-rivendell',        from:'weathertop',   to:'rivendell' },
  { id:'rivendell-to-moria',             from:'rivendell',    to:'moria' },
  { id:'rivendell-to-lothlorien',        from:'rivendell',    to:'lothlorien' },
  { id:'moria-to-lothlorien',            from:'moria',        to:'lothlorien' },
  { id:'lothlorien-to-emyn-muil',        from:'lothlorien',   to:'emyn-muil' },
  { id:'lothlorien-to-rohan-plains',     from:'lothlorien',   to:'rohan-plains' },
  { id:'rohan-plains-to-fangorn',        from:'rohan-plains', to:'fangorn' },
  { id:'rohan-plains-to-edoras',         from:'rohan-plains', to:'edoras' },
  { id:'rohan-plains-to-minas-tirith',   from:'rohan-plains', to:'minas-tirith' },
  { id:'fangorn-to-isengard',            from:'fangorn',      to:'isengard' },
  { id:'isengard-to-rohan-plains',       from:'isengard',     to:'rohan-plains' },
  { id:'tharbad-to-fords-of-isen',       from:'tharbad',      to:'fords-of-isen' },
  { id:'fords-of-isen-to-isengard',      from:'fords-of-isen',to:'isengard' },
  { id:'fords-of-isen-to-helms-deep',    from:'fords-of-isen',to:'helms-deep' },
  { id:'fords-of-isen-to-edoras',        from:'fords-of-isen',to:'edoras' },
  { id:'edoras-to-helms-deep',           from:'edoras',       to:'helms-deep' },
  { id:'helms-deep-to-isengard',         from:'helms-deep',   to:'isengard' },
  { id:'edoras-to-minas-tirith',         from:'edoras',       to:'minas-tirith' },
  { id:'emyn-muil-to-dead-marshes',      from:'emyn-muil',    to:'dead-marshes' },
  { id:'emyn-muil-to-ithilien',          from:'emyn-muil',    to:'ithilien' },
  { id:'dead-marshes-to-ithilien',       from:'dead-marshes', to:'ithilien' },
  { id:'dead-marshes-to-mordor',         from:'dead-marshes', to:'mordor' },
  { id:'ithilien-to-minas-tirith',       from:'ithilien',     to:'minas-tirith' },
  { id:'ithilien-to-osgiliath',          from:'ithilien',     to:'osgiliath' },
  { id:'ithilien-to-cirith-ungol',       from:'ithilien',     to:'cirith-ungol' },
  { id:'minas-tirith-to-osgiliath',      from:'minas-tirith', to:'osgiliath' },
  { id:'osgiliath-to-minas-morgul',      from:'osgiliath',    to:'minas-morgul' },
  { id:'minas-morgul-to-cirith-ungol',   from:'minas-morgul', to:'cirith-ungol' },
  { id:'minas-morgul-to-mordor',         from:'minas-morgul', to:'mordor' },
  { id:'cirith-ungol-to-mordor',         from:'cirith-ungol', to:'mordor' },
  { id:'cirith-ungol-to-mount-doom',     from:'cirith-ungol', to:'mount-doom' },
  { id:'mordor-to-mount-doom',           from:'mordor',       to:'mount-doom' },
];

// ── Region metadata ───────────────────────────────────────────
const REGION_META = {
  'the-shire':    { name:'The Shire',     terrain:'PLAINS',   threat:0 },
  'bree':         { name:'Bree',          terrain:'PLAINS',   threat:1 },
  'tharbad':      { name:'Tharbad',       terrain:'SWAMP',    threat:2 },
  'weathertop':   { name:'Weathertop',   terrain:'MOUNTAINS',threat:2 },
  'rivendell':    { name:'Rivendell',    terrain:'MOUNTAINS',threat:0 },
  'fangorn':      { name:'Fangorn',       terrain:'FOREST',   threat:0 },
  'fords-of-isen':{ name:'Fords of Isen',terrain:'PLAINS',   threat:2 },
  'rohan-plains': { name:'Rohan Plains', terrain:'PLAINS',   threat:1 },
  'moria':        { name:'Moria',         terrain:'MOUNTAINS',threat:3 },
  'helms-deep':   { name:"Helm's Deep",  terrain:'FORTRESS', threat:1 },
  'isengard':     { name:'Isengard',      terrain:'FORTRESS', threat:3 },
  'edoras':       { name:'Edoras',        terrain:'PLAINS',   threat:1 },
  'lothlorien':   { name:'Lothlorien',   terrain:'FOREST',   threat:0 },
  'dead-marshes': { name:'Dead Marshes', terrain:'SWAMP',    threat:2 },
  'emyn-muil':    { name:'Emyn Muil',    terrain:'MOUNTAINS',threat:2 },
  'minas-tirith': { name:'Minas Tirith', terrain:'FORTRESS', threat:1 },
  'ithilien':     { name:'Ithilien',     terrain:'FOREST',   threat:2 },
  'osgiliath':    { name:'Osgiliath',    terrain:'PLAINS',   threat:3 },
  'minas-morgul': { name:'Minas Morgul', terrain:'FORTRESS', threat:4 },
  'cirith-ungol': { name:'Cirith Ungol', terrain:'MOUNTAINS',threat:4 },
  'mordor':       { name:'Mordor',        terrain:'VOLCANIC', threat:5 },
  'mount-doom':   { name:'Mount Doom',   terrain:'VOLCANIC', threat:5 },
};

const TERRAIN_COLOR = {
  PLAINS:'#2a3a1a', FOREST:'#1a3020', MOUNTAINS:'#2a2030',
  SWAMP:'#1a2a1a',  FORTRESS:'#2a2018', VOLCANIC:'#3a1008',
};

// ── Application State ─────────────────────────────────────────
const state = {
  side: null, playerId: null,
  connected: false, gamePhase: 'LOBBY',
  turn: 1, timerSeconds: TURN_SECONDS, timerInterval: null,
  units: {}, regions: {}, paths: {},
  selectedUnit: null, selectedUnitData: null,
  selectedOrder: null, selectedRoute: [],
  _routeCurrentRegion: null,
  pendingOrders: {},
  ringBearerRegion: null, lastDetectedRegion: null,
  hoveredRegion: null, highlightedPaths: [],
  analysisData: null, eventSource: null,
};

// ── DOM helper ────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── Canvas refs (set on DOMContentLoaded) ─────────────────────
let canvas, ctx;

// ── SSE Connection ────────────────────────────────────────────
function connectSSE() {
  const sideParam = state.side === 'SHADOW' ? 'SHADOW' : 'FREE_PEOPLES';
  const url = `${API}/events?playerId=${encodeURIComponent(state.playerId)}&side=${sideParam}`;
  if (state.eventSource) state.eventSource.close();
  state.eventSource = new EventSource(url);

  state.eventSource.onopen = () => {
    state.connected = true;
    const dot = document.querySelector('#connection-status .status-dot');
    if (dot) { dot.className = 'status-dot connected'; }
  };

  state.eventSource.onmessage = e => {
    try { handleServerEvent(JSON.parse(e.data)); }
    catch(err) { console.error('SSE parse error', err); }
  };

  state.eventSource.onerror = () => {
    state.connected = false;
    const dot = document.querySelector('#connection-status .status-dot');
    if (dot) dot.className = 'status-dot';
    showToast('SSE bağlantısı kesildi, yeniden bağlanılıyor...', 'warning');
  };
}

// ── Server Event Dispatcher ───────────────────────────────────
function handleServerEvent(msg) {
  switch (msg.event) {
    case 'WorldStateSnapshot':
      // Detect moved units before updating state
      Object.entries(msg.units || {}).forEach(([uid, newU]) => {
        const oldU = state.units[uid];
        if (oldU && newU.region && oldU.region !== newU.region) {
          const oldName = REGION_META[oldU.region]?.name || oldU.region || '?';
          const newName = REGION_META[newU.region]?.name || newU.region;
          addEventLog(`🚶 ${uid} taşındı: ${oldName} → ${newName}`, 'event-movement');
        }
      });
      state.turn    = msg.turn || state.turn;
      state.units   = msg.units   || state.units;
      state.regions = msg.regions || state.regions;
      state.paths   = msg.paths   || state.paths;
      state.pendingOrders = {};
      $('turn-number').textContent = state.turn;
      
      if (msg.ringBearerRegion) {
        state.ringBearerRegion = msg.ringBearerRegion;
        const rbElem = document.getElementById('rb-location-text');
        if (rbElem) rbElem.textContent = REGION_META[msg.ringBearerRegion]?.name || msg.ringBearerRegion;
      }

      // Sync timer directly from server remaining time to avoid client/server clock drift
      {
        const turnDur = msg.turnDurationSec || TURN_SECONDS;
        let remaining = turnDur;
        if (typeof msg.turnRemainingSec === 'number') {
          remaining = Math.max(1, msg.turnRemainingSec);
        } else if (msg.turnStartedAt) {
          remaining = Math.max(1, turnDur - Math.floor(Date.now() / 1000 - msg.turnStartedAt));
        }
        startTimer(remaining);
      }
      renderUnits();
      drawMap();
      addEventLog(`⏱️ Tur ${state.turn - 1} tamamlandı. Yeni tur başladı: ${state.turn}/40`, 'info');
      break;

    case 'RingBearerMoved':   // Light Side only — server enforces
      state.ringBearerRegion = msg.trueRegion;
      $('rb-location').classList.remove('hidden');
      $('rb-location-text').textContent = REGION_META[msg.trueRegion]?.name || msg.trueRegion;
      drawMap();
      addEventLog(`Yüzük Taşıyıcısı → ${msg.trueRegion}`, 'event-movement');
      break;

    case 'RingBearerDetected': // Dark Side only
      state.lastDetectedRegion = msg.regionId;
      $('detection-status').classList.remove('hidden');
      $('detection-text').textContent = REGION_META[msg.regionId]?.name || msg.regionId;
      drawMap();
      addEventLog(`👁️ Yüzük Taşıyıcısı tespit edildi: ${msg.regionId}!`, 'event-detection');
      showToast('Sauron\'un Gözü Açıldı!', 'warning');
      break;

    case 'PathStatusChanged':
      if (state.paths[msg.pathId]) {
        state.paths[msg.pathId] = { ...state.paths[msg.pathId], ...msg };
      }
      drawMap();
      addEventLog(`Yol durumu değişti: ${msg.pathId} → ${msg.status || ''}`, 'info');
      break;

    case 'BattleResolved':
      addEventLog(`⚔️ Savaş: ${msg.regionId} — ${msg.attackerWon ? 'Saldırgan kazandı' : 'Savunmacı kazandı'}`, 'event-combat');
      break;

    case 'GameOver':
      handleGameOver(msg);
      break;


    default:
      addEventLog(msg.event || JSON.stringify(msg).substring(0,60), 'info');
  }
}

// ════════════════════════════════════════════════════════════════
// PARÇA 2 — Init, Login, Timer, Orders
// ════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  canvas = $('game-map');
  ctx    = canvas.getContext('2d');
  resizeCanvas();
  runLoadingScreen();

  $('player-id-input').addEventListener('input', e => {
    $('join-btn').disabled = e.target.value.trim().length < 2;
  });

  canvas.addEventListener('mousemove', onMapMouseMove);
  canvas.addEventListener('click',     onMapClick);
  canvas.addEventListener('mouseleave', () => {
    state.hoveredRegion = null;
    $('map-tooltip').classList.add('hidden');
    drawMap();
  });
  window.addEventListener('resize', () => { resizeCanvas(); drawMap(); });
});

function resizeCanvas() {
  const wrapper = canvas.parentElement;
  canvas.width  = wrapper.clientWidth  || 900;
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
    c.classList.remove('selected-light','selected-dark');
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
  } catch(e) { /* server may already be started */ }

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
  // Don't start a blind 60s timer — wait for WorldStateSnapshot from server which
  // includes turnStartedAt so all clients sync to the same remaining time.
  // Start a provisional 60s timer in case SSE takes a moment to deliver.
  startTimer(TURN_SECONDS);
  fetchGameState();
  requestAnalysis();
  drawMap();
}


// ── Turn Timer ────────────────────────────────────────────────
// remaining: seconds to count down from. Defaults to TURN_SECONDS.
function startTimer(remaining) {
  const from = (typeof remaining === 'number' && remaining > 0) ? remaining : TURN_SECONDS;
  state.timerSeconds = from;
  clearInterval(state.timerInterval);
  updateTimerUI(state.timerSeconds);
  state.timerInterval = setInterval(() => {
    state.timerSeconds--;
    updateTimerUI(state.timerSeconds);
    if (state.timerSeconds <= 0) {
      state.timerSeconds = TURN_SECONDS; // local fallback reset, server will send snapshot
    }
  }, 1000);
}

function updateTimerUI(s) {
  $('timer-text').textContent = s;
  const pct = (s / TURN_SECONDS) * 100;
  $('timer-arc').setAttribute('stroke-dasharray', `${pct} 100`);
  $('timer-arc').style.stroke = s <= 10 ? '#ff4444' : '#c9a84c';
}

// ── Fetch game state on join ──────────────────────────────────
async function fetchGameState() {
  try {
    const sideParam = state.side === 'SHADOW' ? 'SHADOW' : 'FREE_PEOPLES';
    const r = await fetch(`/game/state?playerId=${encodeURIComponent(state.playerId)}&side=${sideParam}`);
    if (!r.ok) return;
    const d = await r.json();
    state.turn    = d.turn    || 1;
    state.units   = d.units   || {};
    state.regions = d.regions || {};
    state.paths   = d.paths   || {};
    // Light Side sees ring bearer true region via lightView
    if (d.lightView?.ringBearerRegion) state.ringBearerRegion = d.lightView.ringBearerRegion;
    else if (d.ringBearerRegion)       state.ringBearerRegion = d.ringBearerRegion;
    // Default: ring bearer starts at The Shire
    if (!state.ringBearerRegion && state.side !== 'SHADOW') state.ringBearerRegion = 'the-shire';
    if (d.lastDetectedRegion)  state.lastDetectedRegion  = d.lastDetectedRegion;
    $('turn-number').textContent = state.turn;

    // Sync timer to server's turn clock using exact remaining seconds to avoid clock drift
    if (typeof d.turnRemainingSec === 'number') {
      const remaining = Math.max(1, d.turnRemainingSec);
      startTimer(remaining);
      console.log(`[timer] synced from /game/state: ${remaining}s remaining`);
    } else if (d.turnStartedAt) {
      const turnDur   = d.turnDurationSec || TURN_SECONDS;
      const elapsed   = Math.floor(Date.now() / 1000) - d.turnStartedAt;
      const remaining = Math.max(1, turnDur - elapsed);
      startTimer(remaining);
      console.log(`[timer] synced from /game/state via clock diff: ${remaining}s remaining (elapsed=${elapsed}s)`);
    }

    renderUnits();
    drawMap();
  } catch(e) { console.warn('fetchGameState failed', e); }
}




// ── Submit Order ──────────────────────────────────────────────
async function doSubmitOrder() {
  if (!state.selectedUnit || !state.selectedOrder) {
    showToast('Birim ve emir seçin', 'error'); return;
  }
  const payload = collectOrderPayload();
  const order = {
    orderType: state.selectedOrder,
    playerId:  state.playerId,
    unitId:    state.selectedUnit,
    turn:      state.turn,
    payload
  };
  try {
    const r = await fetch(`/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    if (r.status === 202 || r.status === 200) {
      // Track pending order visually
      state.pendingOrders[state.selectedUnit] = state.selectedOrder;
      const unitName = state.selectedUnit;
      const orderName = state.selectedOrder?.replace(/_/g,' ');
      showToast(`⏳ Emir kuyruğa alındı: ${orderName}. Tur bittiğinde uygulanacak.`, 'success');
      addEventLog(`✔️ Emir gönderildi → ${unitName}: ${orderName} (tur ${state.turn} sonunda uygulanacak)`, 'info');
      renderUnits(); // refresh to show pending badge
      closeOrderPanel();
    } else {
      const err = await r.json().catch(() => ({}));
      showToast(`Hata: ${err.error || r.status}`, 'error');
    }
  } catch(e) { showToast('Sunucu bağlantı hatası', 'error'); }
}

function collectOrderPayload() {
  const payload = {};
  const pathSelect    = $('order-path-select');
  const regionAttack  = $('order-region-select');        // attack adjacent
  const regionMove    = $('order-region-select-move');   // reinforce/deploy all

  if (pathSelect   && pathSelect.value)   payload.pathId       = pathSelect.value;
  if (regionAttack && regionAttack.value) payload.targetRegion = regionAttack.value;
  if (regionMove   && regionMove.value)   payload.targetRegion = regionMove.value;

  // FORTIFY_REGION uses unit's current region automatically
  if (state.selectedOrder === 'FORTIFY_REGION' && state.selectedUnitData?.region) {
    payload.targetRegion = state.selectedUnitData.region;
  }

  // Route from chip picker
  if (state.selectedRoute && state.selectedRoute.length > 0)
    payload.pathIds = state.selectedRoute;

  return payload;
}



function closeOrderPanel() {
  $('order-panel').classList.add('hidden');
  state.selectedUnit  = null;
  state.selectedOrder = null;
  drawMap();
}

// ════════════════════════════════════════════════════════════════
// PARÇA 3 — Canvas Render, Unit Panel, Map Events
// ════════════════════════════════════════════════════════════════

function drawMap() {
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  const scaleX = W / 900, scaleY = H / 600;

  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = '#06060e';
  ctx.fillRect(0, 0, W, H);

  // 1. Draw Paths
  PATHS.forEach(p => {
    const a = REGION_POS[p.from], b = REGION_POS[p.to];
    const pd = state.paths[p.id] || {};
    const highlighted = state.highlightedPaths.includes(p.id);

    ctx.beginPath();
    ctx.moveTo(a.x * scaleX, a.y * scaleY);
    ctx.lineTo(b.x * scaleX, b.y * scaleY);

    if (highlighted)               ctx.strokeStyle = '#c9a84c';
    else if (pd.status === 'BLOCKED')         ctx.strokeStyle = '#8b0000';
    else if (pd.status === 'THREATENED')      ctx.strokeStyle = '#c04000';
    else if (pd.status === 'TEMPORARILY_OPEN')ctx.strokeStyle = '#4a90d9';
    else                                      ctx.strokeStyle = '#2a2a3a';

    ctx.lineWidth = highlighted ? 3 : 1.5;
    if (pd.surveillanceLevel > 0) {
      ctx.setLineDash([6, 3]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // 2. Draw Regions
  for (const [id, pos] of Object.entries(REGION_POS)) {
    const meta = REGION_META[id] || {};
    const rd   = state.regions[id] || {};
    const hovered = state.hoveredRegion === id;
    const sx = pos.x * scaleX, sy = pos.y * scaleY;
    const radius = hovered ? 18 : 15;

    // Glow for special regions
    if (id === 'mount-doom') {
      ctx.shadowColor = '#ff4400'; ctx.shadowBlur = 15;
    } else if (id === 'the-shire') {
      ctx.shadowColor = '#4a90d9'; ctx.shadowBlur = 10;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = TERRAIN_COLOR[meta.terrain] || '#1a1a2a';
    ctx.fill();

    // Control border
    if (rd.controlledBy === 'SHADOW') ctx.strokeStyle = '#8b0000';
    else if (rd.controlledBy === 'FREE_PEOPLES') ctx.strokeStyle = '#2d7a4a';
    else ctx.strokeStyle = hovered ? '#c9a84c' : '#333';
    ctx.lineWidth = hovered ? 3 : 1.5;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fortified ring
    if (rd.fortified) {
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#c9a84c44';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Region label
    ctx.fillStyle = hovered ? '#e8e0cc' : '#7a7080';
    ctx.font = `${hovered ? 'bold ' : ''}${Math.round(9 * scaleX)}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(meta.name || id, sx, sy + radius + 11);
  }

  // 3. Draw units on map
  Object.entries(state.units).forEach(([uid, u]) => {
    if (!u.region) return; // Hidden (Ring Bearer for Dark Side)
    const pos = REGION_POS[u.region];
    if (!pos) return;
    const sx = pos.x * scaleX, sy = pos.y * scaleY;
    // Small dot for each unit
    ctx.beginPath();
    ctx.arc(sx + 8, sy - 8, 5, 0, Math.PI * 2);
    ctx.fillStyle = u.side === 'SHADOW' ? '#c04000' : '#4a90d9';
    ctx.fill();
  });

  // 4. Ring Bearer true position (Light Side only)
  if (state.side === 'FREE_PEOPLES' && state.ringBearerRegion) {
    const pos = REGION_POS[state.ringBearerRegion];
    if (pos) {
      ctx.strokeStyle = '#ffeb3b';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#ffeb3b'; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(pos.x * scaleX, pos.y * scaleY, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // 5. Last detected region (Dark Side)
  if (state.side === 'SHADOW' && state.lastDetectedRegion) {
    const pos = REGION_POS[state.lastDetectedRegion];
    if (pos) {
      ctx.strokeStyle = '#ff4400';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(pos.x * scaleX, pos.y * scaleY, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

// ── Unit Panel ────────────────────────────────────────────────
function renderUnits() {
  const list = $('units-list');
  if (!list) return;
  list.innerHTML = '';
  const mySide = state.side === 'SHADOW' ? 'SHADOW' : 'FREE_PEOPLES';

  // Only show own-side units; if server hasn't set sides yet, show by name pattern
  const isMyUnit = (uid, u) => {
    if (u.side) return u.side === mySide;
    // Fallback heuristic when side not set by server
    const id = uid.toLowerCase();
    if (mySide === 'SHADOW')
      return id.includes('nazgul') || id === 'saruman' || id === 'sauron';
    return !id.includes('nazgul') && id !== 'saruman' && id !== 'sauron';
  };

  let count = 0;
  Object.entries(state.units).forEach(([uid, u]) => {
    if (!isMyUnit(uid, u)) return;
    count++;
    const maxStr = 10;
    const pct = Math.max(0, Math.round(((u.strength || 0) / maxStr) * 100));
    const st = (u.status || 'ACTIVE').toUpperCase();
    const statusClass = st === 'ACTIVE' ? 'status-active'
                      : st === 'RESPAWNING' ? 'status-respawning' : 'status-destroyed';
    const isActive = st === 'ACTIVE' || !u.status;
    const pending  = state.pendingOrders[uid]; // has queued order?

    const card = document.createElement('div');
    card.className = `unit-card${!isActive ? ' unit-' + st.toLowerCase() : ''}${pending ? ' unit-pending' : ''}`;
    card.dataset.uid = uid;
    card.style.cursor = isActive ? 'pointer' : 'not-allowed';
    card.title = pending ? `${uid} — emir kuyrukta: ${pending}` : isActive ? `${uid} — tıkla emir ver` : `${uid} — ${u.status}`;
    card.innerHTML = `
      <div class="unit-name">${uid}${pending ? ` <span class="pending-badge">⏳${pending.replace(/_/g,' ')}</span>` : ''}</div>
      <div class="unit-region">${u.region ? (REGION_META[u.region]?.name || u.region) : '???'}</div>
      <div class="unit-strength-bar">
        <div class="strength-bar"><div class="strength-fill" style="width:${pct}%;background:${pct>50?'#2d7a4a':pct>25?'#c9a84c':'#8b0000'}"></div></div>
        <span class="strength-text">${u.strength||0}</span>
      </div>
      <span class="unit-status-badge ${statusClass}">${u.status||'ACTIVE'}</span>`;
    card.addEventListener('click', () => onUnitSelect(uid, u, st));
    list.appendChild(card);
  });

  // If server hasn't sent units yet, show a placeholder
  if (count === 0) {
    list.innerHTML = '<div style="color:#7a7080;font-size:0.8rem;padding:0.5rem">Birimler yükleniyor...</div>';
  }
}

// ── Map Interaction ───────────────────────────────────────────
function onMapMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width  / rect.width);
  const my = (e.clientY - rect.top)  * (canvas.height / rect.height);
  const scaleX = canvas.width / 900, scaleY = canvas.height / 600;

  let hit = null;
  for (const [id, pos] of Object.entries(REGION_POS)) {
    const dx = mx - pos.x * scaleX, dy = my - pos.y * scaleY;
    if (Math.sqrt(dx*dx + dy*dy) < 18) { hit = id; break; }
  }

  if (hit !== state.hoveredRegion) {
    state.hoveredRegion = hit;
    drawMap();
  }

  const tip = $('map-tooltip');
  if (hit) {
    const meta = REGION_META[hit] || {}, rd = state.regions[hit] || {};
    tip.innerHTML = `<h4>${meta.name||hit}</h4>
      <p>🏔️ ${meta.terrain||''} | ☠️ Tehdit: ${rd.threatLevel ?? meta.threat ?? 0}</p>
      <p>🏳️ ${rd.controlledBy || 'NEUTRAL'}${rd.fortified?' 🛡️ Tahkimli':''}</p>`;
    tip.style.left = (e.clientX - rect.left + 10) + 'px';
    tip.style.top  = (e.clientY - rect.top  - 10) + 'px';
    tip.classList.remove('hidden');
    $('path-info-text').textContent = `${meta.name||hit} — ${meta.terrain||''} bölgesi`;
  } else {
    tip.classList.add('hidden');
  }
}

function onMapClick(e) {
  if (!state.hoveredRegion) return;
  const rid = state.hoveredRegion;
  if (state.selectedUnit && state.selectedOrder) {
    // Fill targetRegion into payload
    const sel = $('order-region-select');
    if (sel) sel.value = rid;
  }
}
function onUnitSelect(uid, u, st) {
  const status = st || (u.status || 'ACTIVE').toUpperCase();
  if (status !== 'ACTIVE') { showToast(`${uid} ${status} — emir verilemez`, 'error'); return; }
  state.selectedUnit     = uid;
  state.selectedUnitData = u;
  document.querySelectorAll('.unit-card').forEach(c =>
    c.classList.toggle('selected', c.dataset.uid === uid));
  fetchAvailableOrders(uid);
}


async function fetchAvailableOrders(uid) {
  const defaultOrders = getDefaultOrders(uid);
  console.log('[orders] fetching for', uid, 'defaults:', defaultOrders);

  try {
    const sideParam = state.side === 'SHADOW' ? 'SHADOW' : 'FREE_PEOPLES';
    const r = await fetch(
      `/api/orders/available?unitId=${uid}&playerId=${encodeURIComponent(state.playerId)}&side=${sideParam}`,
      { signal: AbortSignal.timeout(2000) }
    );
    if (r.ok) {
      const serverOrders = await r.json();
      if (serverOrders && serverOrders.length > 0) {
        console.log('[orders] server returned:', serverOrders);
        _safeShowPanel(uid, serverOrders);
        return;
      }
    }
  } catch(e) {
    console.warn('[orders] fetch failed, using defaults:', e.message);
  }

  _safeShowPanel(uid, defaultOrders);
}

function _safeShowPanel(uid, orders) {
  try {
    showOrderPanel(uid, orders);
  } catch(e) {
    console.error('[showOrderPanel] ERROR:', e);
    // Minimal fallback panel
    const panel = $('order-panel');
    const content = $('order-content');
    if (panel && content) {
      content.innerHTML = `<div style="color:#ff4444;padding:0.5rem">⚠️ Panel hatası: ${e.message}</div>`;
      panel.classList.remove('hidden');
    }
  }
}

function getDefaultOrders(uid) {

  const id = uid.toLowerCase();
  if (id === 'ring-bearer')
    return ['ASSIGN_ROUTE', 'REINFORCE_REGION'];
  if (id.includes('nazgul'))
    return ['BLOCK_PATH', 'SEARCH_PATH', 'DEPLOY_NAZGUL', 'ATTACK_REGION'];
  if (id === 'saruman' || id === 'gandalf')
    return ['MAIA_ABILITY', 'ATTACK_REGION', 'REINFORCE_REGION'];
  if (id === 'sauron')
    return ['MAIA_ABILITY', 'DEPLOY_NAZGUL', 'SEARCH_PATH'];
  // Generic unit
  if (state.side === 'SHADOW')
    return ['BLOCK_PATH', 'ATTACK_REGION', 'REINFORCE_REGION'];
  return ['REINFORCE_REGION', 'ATTACK_REGION', 'FORTIFY_REGION'];
}


// Which inputs each order type needs
const ORDER_NEEDS = {
  ASSIGN_ROUTE:     ['route'],
  REINFORCE_REGION: ['region'],
  ATTACK_REGION:    ['region'],
  FORTIFY_REGION:   ['region'],
  BLOCK_PATH:       ['path'],
  SEARCH_PATH:      ['path'],
  DEPLOY_NAZGUL:    ['region'],
  MAIA_ABILITY:     ['path'],
};
const ORDER_ICON = {
  ASSIGN_ROUTE:'🗺️', REINFORCE_REGION:'🏰', ATTACK_REGION:'⚔️',
  FORTIFY_REGION:'🛡️', BLOCK_PATH:'🚫', SEARCH_PATH:'🔍',
  DEPLOY_NAZGUL:'👁️', MAIA_ABILITY:'✨',
};

function showOrderPanel(uid, orders) {
  $('order-panel-title').textContent = `\u2694\ufe0f ${uid}`;
  const content = $('order-content');
  const unit       = state.selectedUnitData || {};

  // Ring Bearer's region is always "" in public state (info hiding).
  // Light Side knows the true region via state.ringBearerRegion.
  // Use it so the route builder starts from the correct position.
  let unitRegion = unit.region || null;
  if (!unitRegion && uid === 'ring-bearer' && state.side !== 'SHADOW') {
    unitRegion = state.ringBearerRegion || 'the-shire';
  }

  // Adjacent paths (for BLOCK/SEARCH/MAIA)
  const adjacentPaths = unitRegion
    ? PATHS.filter(p => p.from === unitRegion || p.to === unitRegion)
    : PATHS;

  // Adjacent region IDs (for ATTACK)
  const adjacentRegionIds = new Set(
    adjacentPaths.map(p => p.from === unitRegion ? p.to : p.from)
  );

  const makePathOpts = paths => paths.map(p => {
    const f = REGION_META[p.from]?.name || p.from;
    const t = REGION_META[p.to]?.name   || p.to;
    return `<option value="${p.id}">${f} \u2192 ${t}</option>`;
  }).join('');

  const makeRegionOpts = fn => Object.entries(REGION_META)
    .filter(([id]) => fn(id))
    .map(([id,m]) => `<option value="${id}">${m.name}</option>`)
    .join('');

  const pathOptsAdjacent = makePathOpts(adjacentPaths);
  const pathOptsAll      = makePathOpts(PATHS);
  const regionOptsAdjacent = makeRegionOpts(id => adjacentRegionIds.has(id));
  const regionOptsAll      = makeRegionOpts(id => id !== unitRegion);

  // Location hint
  const locHint = unitRegion
    ? `<span style="color:#7a7080;font-size:0.72rem">\ud83d\udccd ${REGION_META[unitRegion]?.name || unitRegion}</span>`
    : '';

  // Build HTML
  let html = `<div style="margin-bottom:0.35rem">${locHint}</div>`;

  // Order type chips
  html += `<div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-bottom:0.5rem">`;
  (orders || []).forEach(o => {
    html += `<button class="order-chip" data-order="${o}" onclick="selectOrderType('${o}')">${ORDER_ICON[o]||'📋'} ${o.replace(/_/g,' ')}</button>`;
  });
  html += `</div>`;

  // Dynamic input areas
  html += `<div id="order-inputs" style="display:none">

    <!-- ASSIGN_ROUTE: smart chain builder starting from unit's region -->
    <div id="input-route" style="display:none">
      <label class="order-label">Rota — adım adım yol seç:</label>
      <div id="route-chain-hint" style="color:#7a7080;font-size:0.72rem;margin-bottom:0.3rem">
        Başlangıç: <strong style="color:var(--gold)">${unitRegion ? (REGION_META[unitRegion]?.name||unitRegion) : 'bilinmiyor'}</strong>
        → Sonraki adım için bir yol seç
      </div>
      <div id="route-chip-grid" style="display:flex;flex-wrap:wrap;gap:0.25rem;max-height:80px;overflow-y:auto;padding:0.2rem 0">
        <!-- filled by renderRouteStep() -->
      </div>
      <div id="route-selected" style="display:flex;flex-wrap:wrap;gap:0.25rem;margin-top:0.4rem;min-height:20px"></div>
    </div>

    <!-- ATTACK_REGION -->
    <div id="input-region-attack" style="display:none">
      <label class="order-label">⚔️ Saldırılabilecek komşu bölgeler:</label>
      <select class="order-select" id="order-region-select"><option value="">— seçin —</option>${regionOptsAdjacent || regionOptsAll}</select>
    </div>

    <!-- REINFORCE / DEPLOY: adjacent regions -->
    <div id="input-region" style="display:none">
      <label class="order-label">Hedef Bölge (komşu):</label>
      <select class="order-select" id="order-region-select-move"><option value="">— seçin —</option>${regionOptsAdjacent || regionOptsAll}</select>
    </div>

    <!-- BLOCK / SEARCH / MAIA: adjacent paths -->
    <div id="input-path" style="display:none">
      <label class="order-label">Erişilebilir yollar${unitRegion ? ' (Konum: '+(REGION_META[unitRegion]?.name||unitRegion)+')' : ''}:</label>
      <select class="order-select" id="order-path-select"><option value="">— seçin —</option>${pathOptsAdjacent || pathOptsAll}</select>
      ${adjacentPaths.length === 0 ? '<p style="color:#f87171;font-size:0.72rem">⚠️ Birim bir yolun ucunda değil.</p>' : ''}
    </div>

  </div>
  <div style="display:flex;gap:0.5rem;margin-top:0.4rem">
    <button class="btn-primary" id="dyn-submit" onclick="doSubmitOrder()" style="flex:1" disabled>Submit Order</button>
    <button class="btn-secondary" onclick="closeOrderPanel()">İptal</button>
  </div>`;

  content.innerHTML = html;
  state.selectedRoute = [];
  state._routeCurrentRegion = unitRegion; // chain builder starts here
  const orig = document.querySelector('#order-panel > .order-buttons');
  if (orig) orig.style.display = 'none';
  $('order-panel').classList.remove('hidden');
}



// Called when ASSIGN_ROUTE is selected — renders paths from currentRegion only
function renderRouteStep() {
  // Ring Bearer: use true region from state (Light Side knows it); other units: use their public region
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

  // Only show paths adjacent to currentRegion
  const stepPaths = currentRegion
    ? PATHS.filter(p => p.from === currentRegion || p.to === currentRegion)
    : PATHS;

  if (hint) {
    const regionName = currentRegion ? (REGION_META[currentRegion]?.name || currentRegion) : '?';
    hint.innerHTML = `Konum: <strong style="color:var(--gold)">${regionName}</strong> — seçilebilir sonraki adımlar:`;
  }

  grid.innerHTML = stepPaths.map(p => {
    const fLabel = REGION_META[p.from]?.name || p.from;
    const tLabel = REGION_META[p.to]?.name   || p.to;
    const dest   = p.from === currentRegion ? tLabel : fLabel;
    const f = fLabel.replace(/"/g,'&quot;');
    const t = tLabel.replace(/"/g,'&quot;');
    return `<button class="path-chip" data-pid="${p.id}" data-from="${p.from}" data-to="${p.to}" data-label="${f} → ${t}" onclick="addRouteStep(this)">${fLabel} → ${tLabel} <span style="color:#4a90d9;font-size:0.65rem">(→ ${dest})</span></button>`;
  }).join('') || '<span style="color:#f87171;font-size:0.72rem">Bu konumdan devam edilecek yol bulunamadı.</span>';
}

// Adds a path to the route chain and advances to the next region
function addRouteStep(el) {
  const pid  = el.dataset.pid;
  const from = el.dataset.from;
  const to   = el.dataset.to;
  if (!pid) return;
  if (!state.selectedRoute) state.selectedRoute = [];
  state.selectedRoute.push(pid);

  // Advance current region to the destination of this path
  const curReg = state._routeCurrentRegion || (state.selectedUnitData?.region);
  state._routeCurrentRegion = (from === curReg) ? to : from;

  // Update selected display
  const selDiv = $('route-selected');
  if (selDiv) {
    selDiv.innerHTML = state.selectedRoute.map((p, i) => {
      const ph = PATHS.find(x => x.id === p);
      const lbl = ph ? `${REGION_META[ph.from]?.name||ph.from} → ${REGION_META[ph.to]?.name||ph.to}` : p;
      return `<span class="route-tag">${i+1}. ${lbl}</span>`;
    }).join('');
    // Add undo button
    selDiv.innerHTML += ` <button onclick="undoRouteStep()" style="font-size:0.68rem;padding:0.1rem 0.3rem;border:1px solid #555;border-radius:4px;background:none;color:#aaa;cursor:pointer">↩ Geri al</button>`;
  }

  // Re-render next step options
  renderRouteStep();

  // Enable submit
  const btn = $('dyn-submit');
  if (btn) btn.disabled = false;
}

function undoRouteStep() {
  if (!state.selectedRoute || state.selectedRoute.length === 0) return;
  state.selectedRoute.pop();
  // Recalculate current region from the route
  const startRegion = state.selectedUnitData?.region || null;
  let cur = startRegion;
  for (const pid of state.selectedRoute) {
    const p = PATHS.find(x => x.id === pid);
    if (p) cur = (p.from === cur) ? p.to : p.from;
  }
  state._routeCurrentRegion = cur;
  // Re-render
  const selDiv = $('route-selected');
  if (selDiv) {
    if (state.selectedRoute.length === 0) {
      selDiv.innerHTML = '';
    } else {
      selDiv.innerHTML = state.selectedRoute.map((p, i) => {
        const ph = PATHS.find(x => x.id === p);
        const lbl = ph ? `${REGION_META[ph.from]?.name||ph.from} → ${REGION_META[ph.to]?.name||ph.to}` : p;
        return `<span class="route-tag">${i+1}. ${lbl}</span>`;
      }).join('');
      selDiv.innerHTML += ` <button onclick="undoRouteStep()" style="font-size:0.68rem;padding:0.1rem 0.3rem;border:1px solid #555;border-radius:4px;background:none;color:#aaa;cursor:pointer">↩ Geri al</button>`;
    }
  }
  renderRouteStep();
}

function selectOrderType(o) {
  state.selectedOrder = o;
  document.querySelectorAll('.order-chip').forEach(c =>
    c.classList.toggle('active', c.dataset.order === o));

  $('order-inputs').style.display = 'block';

  // Map order type to which input div to show
  const showMap = {
    ASSIGN_ROUTE:     ['route'],
    BLOCK_PATH:       ['path'],
    SEARCH_PATH:      ['path'],
    MAIA_ABILITY:     ['path'],
    ATTACK_REGION:    ['region-attack'],
    REINFORCE_REGION: ['region'],
    FORTIFY_REGION:   [],          // no input needed (fortifies current region)
    DEPLOY_NAZGUL:    ['region'],
  };
  const show = showMap[o] || [];
  ['route','region','region-attack','path'].forEach(t => {
    const el = $('input-' + t);
    if (el) el.style.display = show.includes(t) ? 'block' : 'none';
  });

  // Initialize route chain builder when ASSIGN_ROUTE is selected
  if (o === 'ASSIGN_ROUTE') renderRouteStep();

  const btn = $('dyn-submit');
  if (btn) btn.disabled = (o === 'FORTIFY_REGION') ? false : o === 'ASSIGN_ROUTE' ? true : false;
}


function selectOrder(o) { selectOrderType(o); }

// Toggle a path chip in the route picker — receives the button element
function toggleRoutePath(el) {
  const pid   = el.dataset.pid;
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
  // Update selected display
  const sel = $('route-selected');
  if (sel) {
    sel.innerHTML = state.selectedRoute.map((p, i) => {
      const ph = PATHS.find(x => x.id === p);
      const lbl = ph
        ? `${REGION_META[ph.from]?.name||ph.from}→${REGION_META[ph.to]?.name||ph.to}`
        : p;
      return `<span class="route-tag">${i+1}. ${lbl} <span style="cursor:pointer;opacity:.7" onclick="removeRoutePath('${p}')">✕</span></span>`;
    }).join('');
    if (state.selectedRoute.length === 0)
      sel.innerHTML = '<span style="color:#7a7080;font-size:0.75rem">Henüz yol seçilmedi</span>';
  }
}

function removeRoutePath(pid) {
  const btn = document.querySelector(`.path-chip[data-pid="${pid}"]`);
  if (btn) toggleRoutePath(btn);
}


// ════════════════════════════════════════════════════════════════
// PARÇA 4 — Analysis, Game Over, Toast, Event Log, Helpers
// ════════════════════════════════════════════════════════════════

async function requestAnalysis() {
  const endpoint = state.side === 'SHADOW'
    ? `/analysis/intercept?side=SHADOW`
    : `/analysis/routes?side=FREE_PEOPLES`;
  try {
    const r = await fetch(API + endpoint);
    if (!r.ok) return;
    state.analysisData = await r.json();
    renderAnalysis();
  } catch(e) { console.warn('analysis fetch failed', e); }
}

function renderAnalysis() {
  const el = $('analysis-results');
  if (!el || !state.analysisData) return;
  let html = '';

  if (state.side === 'FREE_PEOPLES') {
    // Pipeline 1: Route Risk
    const data = state.analysisData;
    (data.routes || []).forEach(r => {
      const isRec = r.name === data.recommended;
      const riskPct = Math.min(100, (r.riskScore / 30) * 100);
      html += `<div class="route-card${isRec?' recommended':''}">
        <div class="route-name">${isRec?'★ ':''}${r.name}</div>
        <div class="route-risk">Risk: ${r.riskScore} | Nazgul: ${r.nazgulProximity}</div>
        <div class="risk-bar"><div class="risk-fill" style="width:${riskPct}%"></div></div>
      </div>`;
    });
  } else {
    // Pipeline 2: Interception
    (state.analysisData.byUnit || []).forEach(u => {
      html += `<div class="intercept-card">
        <div class="intercept-unit">${u.unitId}</div>
        <div class="intercept-target">→ ${REGION_META[u.targetRegion]?.name||u.targetRegion}
          (${u.turnsToIntercept} tur, skor: ${(u.score*100).toFixed(0)}%)</div>
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
    (msg.winner === 'DARK_SIDE'  && state.side === 'SHADOW');

  $('game-over-icon').textContent  = msg.winner === 'DRAW' ? '⚖️' : isWinner ? '🏆' : '💀';
  $('game-over-title').textContent = msg.winner === 'DRAW' ? 'Beraberlik!'
    : isWinner ? 'Zafer!' : 'Yenilgi!';
  $('game-over-subtitle').textContent =
    msg.winner === 'LIGHT_SIDE' ? 'Yüzük imha edildi — Özgür Halklar kazandı!' :
    msg.winner === 'DARK_SIDE'  ? 'Yüzük Taşıyıcısı yakalandı — Gölge kazandı!' :
    'Maksimum tur sayısına ulaşıldı.';
  $('game-over-cause').textContent = msg.cause || '';
  $('game-over-overlay').classList.remove('hidden');
  addEventLog(`🏁 Oyun bitti: ${msg.winner} — ${msg.cause}`, 'event-gameover');
}

function resetGame() {
  if (state.eventSource) state.eventSource.close();
  clearInterval(state.timerInterval);
  Object.assign(state, {
    connected:false, gamePhase:'LOBBY', turn:1,
    units:{}, regions:{}, paths:{},
    ringBearerRegion:null, lastDetectedRegion:null,
    selectedUnit:null, availableOrders:[], selectedOrder:null,
    highlightedPaths:[], analysisData:null,
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
  el.textContent = `[T${state.turn}] ${msg}`;
  log.prepend(el);
  // Keep max 50 entries
  while (log.children.length > 50) log.removeChild(log.lastChild);
}

function showToast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  $('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 4000);
}