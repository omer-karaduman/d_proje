/* ============================================================
   Ring of the Middle Earth — game.js  (Part 1/4)
   Constants · State · Map Data · Init
   ============================================================ */

'use strict';

// ── API base ─────────────────────────────────────────────────
const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8080'
  : '';  // same origin via NGINX in Docker

// ── Game constants ────────────────────────────────────────────
const MAX_TURNS = 40;
const TURN_SECONDS = 60;

// ── Map layout (canvas coords for 22 regions) ─────────────────
const REGION_POS = {
  'the-shire':     { x: 80,  y: 100 },
  'bree':          { x: 200, y: 100 },
  'tharbad':       { x: 160, y: 210 },
  'weathertop':    { x: 290, y: 80  },
  'rivendell':     { x: 370, y: 70  },
  'fangorn':       { x: 240, y: 310 },
  'fords-of-isen': { x: 200, y: 280 },
  'rohan-plains':  { x: 310, y: 310 },
  'moria':         { x: 410, y: 190 },
  'helms-deep':    { x: 250, y: 370 },
  'isengard':      { x: 220, y: 370 },
  'edoras':        { x: 330, y: 390 },
  'lothlorien':    { x: 450, y: 240 },
  'dead-marshes':  { x: 530, y: 310 },
  'emyn-muil':     { x: 510, y: 250 },
  'minas-tirith':  { x: 440, y: 430 },
  'ithilien':      { x: 570, y: 390 },
  'osgiliath':     { x: 510, y: 430 },
  'minas-morgul':  { x: 590, y: 450 },
  'cirith-ungol':  { x: 660, y: 410 },
  'mordor':        { x: 700, y: 490 },
  'mount-doom':    { x: 780, y: 520 },
};

const PATHS = [
  { id:'shire-to-bree',              from:'the-shire',    to:'bree'          },
  { id:'bree-to-weathertop',         from:'bree',         to:'weathertop'    },
  { id:'bree-to-rivendell',          from:'bree',         to:'rivendell'     },
  { id:'bree-to-tharbad',            from:'bree',         to:'tharbad'       },
  { id:'shire-to-tharbad',           from:'the-shire',    to:'tharbad'       },
  { id:'weathertop-to-rivendell',    from:'weathertop',   to:'rivendell'     },
  { id:'rivendell-to-moria',         from:'rivendell',    to:'moria'         },
  { id:'rivendell-to-lothlorien',    from:'rivendell',    to:'lothlorien'    },
  { id:'moria-to-lothlorien',        from:'moria',        to:'lothlorien'    },
  { id:'lothlorien-to-emyn-muil',    from:'lothlorien',   to:'emyn-muil'     },
  { id:'lothlorien-to-rohan-plains', from:'lothlorien',   to:'rohan-plains'  },
  { id:'rohan-plains-to-fangorn',    from:'rohan-plains', to:'fangorn'       },
  { id:'rohan-plains-to-edoras',     from:'rohan-plains', to:'edoras'        },
  { id:'rohan-plains-to-minas-tirith',from:'rohan-plains',to:'minas-tirith'  },
  { id:'fangorn-to-isengard',        from:'fangorn',      to:'isengard'      },
  { id:'isengard-to-rohan-plains',   from:'isengard',     to:'rohan-plains'  },
  { id:'tharbad-to-fords-of-isen',   from:'tharbad',      to:'fords-of-isen' },
  { id:'fords-of-isen-to-isengard',  from:'fords-of-isen',to:'isengard'      },
  { id:'fords-of-isen-to-helms-deep',from:'fords-of-isen',to:'helms-deep'    },
  { id:'fords-of-isen-to-edoras',    from:'fords-of-isen',to:'edoras'        },
  { id:'edoras-to-helms-deep',       from:'edoras',       to:'helms-deep'    },
  { id:'helms-deep-to-isengard',     from:'helms-deep',   to:'isengard'      },
  { id:'edoras-to-minas-tirith',     from:'edoras',       to:'minas-tirith'  },
  { id:'emyn-muil-to-dead-marshes',  from:'emyn-muil',    to:'dead-marshes'  },
  { id:'emyn-muil-to-ithilien',      from:'emyn-muil',    to:'ithilien'      },
  { id:'dead-marshes-to-ithilien',   from:'dead-marshes', to:'ithilien'      },
  { id:'dead-marshes-to-mordor',     from:'dead-marshes', to:'mordor'        },
  { id:'ithilien-to-minas-tirith',   from:'ithilien',     to:'minas-tirith'  },
  { id:'ithilien-to-osgiliath',      from:'ithilien',     to:'osgiliath'     },
  { id:'ithilien-to-cirith-ungol',   from:'ithilien',     to:'cirith-ungol'  },
  { id:'minas-tirith-to-osgiliath',  from:'minas-tirith', to:'osgiliath'     },
  { id:'osgiliath-to-minas-morgul',  from:'osgiliath',    to:'minas-morgul'  },
  { id:'minas-morgul-to-cirith-ungol',from:'minas-morgul',to:'cirith-ungol'  },
  { id:'minas-morgul-to-mordor',     from:'minas-morgul', to:'mordor'        },
  { id:'cirith-ungol-to-mordor',     from:'cirith-ungol', to:'mordor'        },
  { id:'cirith-ungol-to-mount-doom', from:'cirith-ungol', to:'mount-doom'    },
  { id:'mordor-to-mount-doom',       from:'mordor',       to:'mount-doom'    },
];

const REGION_META = {
  'the-shire':     { name:'The Shire',        terrain:'PLAINS',   threat:0 },
  'bree':          { name:'Bree',             terrain:'PLAINS',   threat:1 },
  'tharbad':       { name:'Tharbad',          terrain:'SWAMP',    threat:2 },
  'weathertop':    { name:'Weathertop',       terrain:'MOUNTAINS',threat:2 },
  'rivendell':     { name:'Rivendell',        terrain:'MOUNTAINS',threat:0 },
  'fangorn':       { name:'Fangorn',          terrain:'FOREST',   threat:0 },
  'fords-of-isen': { name:'Fords of Isen',    terrain:'PLAINS',   threat:2 },
  'rohan-plains':  { name:'Rohan Plains',     terrain:'PLAINS',   threat:1 },
  'moria':         { name:'Moria',            terrain:'MOUNTAINS',threat:3 },
  'helms-deep':    { name:"Helm's Deep",      terrain:'FORTRESS', threat:1 },
  'isengard':      { name:'Isengard',         terrain:'FORTRESS', threat:3 },
  'edoras':        { name:'Edoras',           terrain:'PLAINS',   threat:1 },
  'lothlorien':    { name:'Lothlorien',       terrain:'FOREST',   threat:0 },
  'dead-marshes':  { name:'Dead Marshes',     terrain:'SWAMP',    threat:2 },
  'emyn-muil':     { name:'Emyn Muil',        terrain:'MOUNTAINS',threat:2 },
  'minas-tirith':  { name:'Minas Tirith',     terrain:'FORTRESS', threat:1 },
  'ithilien':      { name:'Ithilien',         terrain:'FOREST',   threat:2 },
  'osgiliath':     { name:'Osgiliath',        terrain:'PLAINS',   threat:3 },
  'minas-morgul':  { name:'Minas Morgul',     terrain:'FORTRESS', threat:4 },
  'cirith-ungol':  { name:"Cirith Ungol",     terrain:'MOUNTAINS',threat:4 },
  'mordor':        { name:'Mordor',           terrain:'VOLCANIC', threat:5 },
  'mount-doom':    { name:'Mount Doom',       terrain:'VOLCANIC', threat:5 },
};

const TERRAIN_COLOR = {
  PLAINS:    '#2a3a1a',
  FOREST:    '#1a3020',
  MOUNTAINS: '#2a2030',
  SWAMP:     '#1a2a1a',
  FORTRESS:  '#2a2018',
  VOLCANIC:  '#3a1008',
};

// ── Application State ─────────────────────────────────────────
const state = {
  playerId: '',
  side: '',         // 'FREE_PEOPLES' | 'SHADOW'
  connected: false,
  gamePhase: 'LOBBY',  // LOBBY | IN_PROGRESS | ENDED
  turn: 1,
  timerSeconds: TURN_SECONDS,
  timerInterval: null,
  units: {},         // unitId -> unitData from server
  regions: {},       // regionId -> regionData from server
  paths: {},         // pathId -> pathData from server
  ringBearerRegion: null,
  lastDetectedRegion: null,
  selectedUnit: null,
  availableOrders: [],
  selectedOrder: null,
  eventSource: null,
  canvasScale: { x: 1, y: 1 },
  hoveredRegion: null,
  highlightedRegions: [],  // for route analysis
  analysisData: null,
};

// ── Canvas & context ──────────────────────────────────────────
let canvas, ctx;

// ── DOM refs ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ═══════════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  canvas = $('game-map');
  ctx    = canvas.getContext('2d');

  // Boot loading animation
  runLoadingScreen();

  // Player ID input enables button
  $('player-id-input').addEventListener('input', e => {
    $('join-btn').disabled = e.target.value.trim().length < 2;
  });

  // Canvas events
  canvas.addEventListener('mousemove', onMapMouseMove);
  canvas.addEventListener('click',     onMapClick);
  canvas.addEventListener('mouseleave', () => {
    state.hoveredRegion = null;
    $('map-tooltip').classList.add('hidden');
    drawMap();
  });

  window.addEventListener('resize', () => {
    resizeCanvas();
    drawMap();
  });
});

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

/* ============================================================