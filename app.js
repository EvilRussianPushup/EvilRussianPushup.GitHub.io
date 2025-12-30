/* ===================== Storage helpers ===================== */
function setCookie(name, value, days) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + days * 86400000);
    document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};expires=${d.toUTCString()};path=/`;
  } catch {}
}

function getCookie(name) {
  try {
    const row = document.cookie.split('; ').find(r => r.startsWith(name + '='));
    if (!row) return null;
    return JSON.parse(decodeURIComponent(row.split('=')[1]));
  } catch { return null; }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  setCookie(key, value, 365);
}

function load(key, def) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return JSON.parse(v);
  } catch {}
  const c = getCookie(key);
  return c ?? def;
}

/* ===================== Schedule ===================== */
const SCHEDULE = [
  { label: 'Week 1 • Monday', pct: 1.0, every: null, note: 'Initial max test' },
  { label: 'Week 1 • Tuesday', pct: 0.5, every: 60 },
  { label: 'Week 1 • Wednesday', pct: 0.6, every: 45 },
  { label: 'Week 1 • Thursday', pct: 0.25, every: 60 },
  { label: 'Week 1 • Friday', pct: 0.45, every: 30 },
  { label: 'Week 1 • Saturday', pct: 0.4, every: 60 },
  { label: 'Week 1 • Sunday', pct: 0.2, every: 90 },
  { label: 'Week 2 • Monday', pct: 1.0, every: null, note: 'Re-test max' }
];

/* ===================== State ===================== */
const state = {
  base: load('erc_base', 10),
  startDate: load('erc_start', null),
  quietStart: load('erc_qstart', '22:00'),
  quietEnd: load('erc_qend', '07:00'),
  completedSlots: load('erc_completedSlots', []),
  manualCompletions: load('erc_manual', 0)
};

/* ===================== Utilities ===================== */
const $ = id => document.getElementById(id);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function daySlotKey(date, time) {
  return `${date}|${time}`;
}

function parseHM(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToHM(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function daysBetween(a, b) {
  const d1 = new Date(a); d1.setHours(0,0,0,0);
  const d2 = new Date(b); d2.setHours(0,0,0,0);
  return Math.floor((d2 - d1) / 86400000);
}

/* ===================== Schedule Logic ===================== */
function currentSchedule() {
  if (!state.startDate) return { every: 60, pct: 0.3, test: true };

  const idx = Math.min(
    SCHEDULE.length - 1,
    Math.max(0, daysBetween(state.startDate, new Date()))
  );

  const d = SCHEDULE[idx];
  return {
    every: d.every,
    pct: d.pct,
    test: d.every === null,
    label: d.label,
    note: d.note || ''
  };
}

function activeIntervals() {
  const qs = parseHM(state.quietStart);
  const qe = parseHM(state.quietEnd);
  if (qs === qe) return [{ start: 0, end: 1440 }];

  if (qs < qe) {
    return [
      { start: 0, end: qs },
      { start: qe, end: 1440 }
    ];
  }
  return [{ start: qe, end: qs }];
}

function generateSlotsForToday() {
  const cs = currentSchedule();
  if (!cs.every) return [];

  const slots = new Set();
  activeIntervals().forEach(iv => {
    const first = Math.ceil(iv.start / cs.every) * cs.every;
    for (let t = first; t < iv.end; t += cs.every) {
      slots.add(minutesToHM(t));
    }
  });
  return [...slots].sort();
}

/* ===================== Rendering ===================== */
let slotsRendered = false;

function renderSlots() {
  const ul = $('timeSlots');
  if (!ul) return;

  const today = todayKey();
  const reps = Math.max(1, Math.round(state.base * currentSchedule().pct));
  const slots = generateSlotsForToday();

  if (!slots.length) {
    ul.innerHTML = `<li class="text-muted">No sets today</li>`;
    return;
  }

  ul.innerHTML = slots.map(t => {
    const key = daySlotKey(today, t);
    const done = state.completedSlots.includes(key);
    return `
      <li>
        <label class="${done ? 'strike' : ''}">
          <input type="checkbox" data-time="${t}" ${done ? 'checked' : ''}>
          <span>${t}</span>
          <span>~${reps} reps</span>
        </label>
      </li>
    `;
  }).join('');

  slotsRendered = true;
}

function refreshUI() {
  const cs = currentSchedule();

  if ($('base')) $('base').value = state.base;
  if ($('setsToday')) $('setsToday').textContent =
    state.completedSlots.filter(s => s.startsWith(todayKey())).length
    + state.manualCompletions;

  if (!slotsRendered) renderSlots();
}

/* ===================== Events ===================== */
document.addEventListener('change', e => {
  if (e.target.matches('#base')) {
    state.base = Math.max(1, +e.target.value);
    save('erc_base', state.base);
    slotsRendered = false;
    refreshUI();
  }

  if (e.target.matches('#quietStart, #quietEnd')) {
    state[e.target.id] = e.target.value;
    save(`erc_${e.target.id}`, e.target.value);
    slotsRendered = false;
    refreshUI();
  }

  if (e.target.matches('input[type="checkbox"][data-time]')) {
    const key = daySlotKey(todayKey(), e.target.dataset.time);
    if (e.target.checked) {
      if (!state.completedSlots.includes(key)) state.completedSlots.push(key);
    } else {
      state.completedSlots = state.completedSlots.filter(k => k !== key);
    }
    save('erc_completedSlots', state.completedSlots);
    slotsRendered = false;
    refreshUI();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  if (!state.startDate) {
    state.startDate = todayKey();
    save('erc_start', state.startDate);
  }
  refreshUI();
  setInterval(refreshUI, 1000);
});
