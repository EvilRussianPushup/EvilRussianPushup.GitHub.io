/* app.js - fully integrated & hardened version */

/* ---------------- Storage helpers ---------------- */
function setCookie(name, value, days) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};expires=${d.toUTCString()};path=/`;
  } catch (e) {}
}
function getCookie(name) {
  try {
    const raw = document.cookie.split('; ').find(row => row.startsWith(name + '='));
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(raw.split('=')[1]));
  } catch (e) { return null; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  try { setCookie(key, val, 365); } catch (e) {}
}
function load(key, def) {
  try {
    const v = localStorage.getItem(key);
    if (v != null) return JSON.parse(v);
  } catch (e) {}
  try {
    const c = getCookie(key);
    if (c !== null && c !== undefined) return c;
  } catch (e) {}
  return def;
}

/* ---------------- Schedule data ---------------- */
const SCHEDULE = [
  { label: 'Week 1 • Monday', pct: 1.00, every: null, note: 'Initial max test. After testing, use 30% every 60 min.' },
  { label: 'Week 1 • Tuesday', pct: 0.50, every: 60 },
  { label: 'Week 1 • Wednesday', pct: 0.60, every: 45 },
  { label: 'Week 1 • Thursday', pct: 0.25, every: 60 },
  { label: 'Week 1 • Friday', pct: 0.45, every: 30 },
  { label: 'Week 1 • Saturday', pct: 0.40, every: 60 },
  { label: 'Week 1 • Sunday', pct: 0.20, every: 90 },
  { label: 'Week 2 • Monday', pct: 1.00, every: null, note: 'Re-test your max. After testing, use 35% every 45 min.' },
  { label: 'Week 2 • Tuesday', pct: 0.55, every: 20 },
  { label: 'Week 2 • Wednesday', pct: 0.30, every: 15 },
  { label: 'Week 2 • Thursday', pct: 0.65, every: 60 },
  { label: 'Week 2 • Friday', pct: 0.35, every: 45 },
  { label: 'Week 2 • Saturday', pct: 0.45, every: 60 },
  { label: 'Week 2 • Sunday', pct: 0.25, every: 120 },
  { label: 'Week 3 • Monday', pct: 1.00, every: null, note: 'Re-test your max and plan next block.' }
];

/* ---------------- App state ---------------- */
const state = {
  base: load('erc_base', 10),
  startDate: load('erc_start', null),
  quietStart: load('erc_qstart', '22:00'),
  quietEnd: load('erc_qend', '07:00'),
  completedSlots: load('erc_completedSlots', []),
  manualCompletions: load('erc_manualCompletions', 0),
  dark: load('erc_dark', false)
};

/* ---------------- Utilities ---------------- */
function todayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
function daySlotKey(dateStr, timeStr) { return `${dateStr}|${timeStr}`; }

function parseHM(hm) {
  const [h, m] = (hm || '0:0').split(':').map(n => parseInt(n, 10) || 0);
  return { h, m };
}
function minutesToHM(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}
function setSizeFrom(base, pct) {
  return Math.max(1, Math.round(base * pct));
}
function daysBetween(a, b) {
  const da = new Date(a); da.setHours(0,0,0,0);
  const db = new Date(b); db.setHours(0,0,0,0);
  return Math.floor((db - da) / 86400000);
}

/* ---------------- Schedule helpers ---------------- */
function currentSchedule() {
  if (!state.startDate) return { effectivePct: 0.3, every: 60 };
  const idx = Math.min(SCHEDULE.length - 1, Math.max(0, daysBetween(state.startDate, new Date())));
  const spec = SCHEDULE[idx];
  if (spec.every === null) {
    if (idx === 0) return { effectivePct: 0.3, every: 60 };
    if (idx === 7) return { effectivePct: 0.35, every: 45 };
    return { effectivePct: spec.pct, every: 60 };
  }
  return { effectivePct: spec.pct, every: spec.every };
}

function getActiveIntervals() {
  const { h: sh, m: sm } = parseHM(state.quietStart);
  const { h: eh, m: em } = parseHM(state.quietEnd);
  const qs = sh * 60 + sm;
  const qe = eh * 60 + em;
  if (qs === qe) return [{ start: 0, end: 1440 }];
  if (qs < qe) return [{ start: 0, end: qs }, { start: qe, end: 1440 }];
  return [{ start: qe, end: qs }];
}

function generateSlotsForToday() {
  const cs = currentSchedule();
  if (!cs.every) return [];
  const slots = new Set();
  getActiveIntervals().forEach(iv => {
    for (let t = iv.start; t < iv.end; t += cs.every) {
      slots.add(minutesToHM(t));
    }
  });
  return [...slots].sort();
}

/* ---------------- UI ---------------- */
$(function () {
  const $timeSlots = $('#timeSlots');
  const $darkToggle = $('#darkToggle');

  function applyDarkMode() {
    document.body.classList.toggle('dark', !!state.dark);
    $darkToggle.text(state.dark ? '☀️ Light mode' : '🌙 Dark mode');
  }
  applyDarkMode();

  function renderTimeSlots() {
    const today = todayKey();
    const slots = generateSlotsForToday();
    const reps = setSizeFrom(state.base, currentSchedule().effectivePct);

    if (!slots.length) {
      $timeSlots.html('<li class="muted">No scheduled sets today</li>');
      return;
    }

    $timeSlots.html(slots.map(t => {
      const key = daySlotKey(today, t);
      const isDone = state.completedSlots.includes(key);
      return `
        <li>
          <label class="${isDone ? 'strike' : ''}">
            <input type="checkbox" data-time="${t}" ${isDone ? 'checked' : ''}>
            <span class="slotTime">${t}</span>
            <span class="slotNote">~${reps} reps</span>
          </label>
        </li>
      `;
    }).join(''));
  }

  $timeSlots.on('change', 'input[type="checkbox"]', function () {
    const key = daySlotKey(todayKey(), $(this).data('time'));
    if (this.checked) {
      if (!state.completedSlots.includes(key)) state.completedSlots.push(key);
    } else {
      state.completedSlots = state.completedSlots.filter(k => k !== key);
    }
    save('erc_completedSlots', state.completedSlots);
    renderTimeSlots();
  });

  $darkToggle.on('click', () => {
    state.dark = !state.dark;
    save('erc_dark', state.dark);
    applyDarkMode();
  });

  renderTimeSlots();
});
