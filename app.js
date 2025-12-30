/* =========================================================
   STORAGE HELPERS
========================================================= */
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
  } catch {
    return null;
  }
}

function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  setCookie(key, val, 365);
}

function load(key, def) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return JSON.parse(v);
  } catch {}
  const c = getCookie(key);
  return c ?? def;
}

/* =========================================================
   SCHEDULE DATA
========================================================= */
const SCHEDULE = [
  { label: 'Week 1 • Monday', pct: 1.0, every: null, note: 'Initial max test. After testing, use 30% every 60 min.' },
  { label: 'Week 1 • Tuesday', pct: 0.5, every: 60 },
  { label: 'Week 1 • Wednesday', pct: 0.6, every: 45 },
  { label: 'Week 1 • Thursday', pct: 0.25, every: 60 },
  { label: 'Week 1 • Friday', pct: 0.45, every: 30 },
  { label: 'Week 1 • Saturday', pct: 0.4, every: 60 },
  { label: 'Week 1 • Sunday', pct: 0.2, every: 90 },
  { label: 'Week 2 • Monday', pct: 1.0, every: null, note: 'Re-test. Then 35% every 45 min.' },
  { label: 'Week 2 • Tuesday', pct: 0.55, every: 20 },
  { label: 'Week 2 • Wednesday', pct: 0.3, every: 15 },
  { label: 'Week 2 • Thursday', pct: 0.65, every: 60 },
  { label: 'Week 2 • Friday', pct: 0.35, every: 45 },
  { label: 'Week 2 • Saturday', pct: 0.45, every: 60 },
  { label: 'Week 2 • Sunday', pct: 0.25, every: 120 },
  { label: 'Week 3 • Monday', pct: 1.0, every: null, note: 'Final test & re-plan.' }
];

/* =========================================================
   APP STATE (PERSISTED)
========================================================= */
const state = {
  base: load('erc_base', 10),
  startDate: load('erc_start', null),
  quietStart: load('erc_qstart', '22:00'),
  quietEnd: load('erc_qend', '07:00'),
  completedSlots: load('erc_completedSlots', []),
  manualCompletions: load('erc_manual', 0),
  dark: load('erc_dark', false)
};

/* =========================================================
   UTILITIES
========================================================= */
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

function repsFrom(base, pct) {
  return Math.max(1, Math.round(base * pct));
}

/* =========================================================
   SCHEDULE LOGIC
========================================================= */
function currentSchedule() {
  if (!state.startDate) {
    return { pct: 0.3, every: 60, test: true, label: '', note: '' };
  }

  const idx = Math.min(
    SCHEDULE.length - 1,
    Math.max(0, daysBetween(state.startDate, new Date()))
  );

  const d = SCHEDULE[idx];

  if (d.every === null) {
    if (idx === 0) return { pct: 0.3, every: 60, test: true, label: d.label, note: d.note };
    if (idx === 7) return { pct: 0.35, every: 45, test: true, label: d.label, note: d.note };
  }

  return {
    pct: d.pct,
    every: d.every,
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

/* =========================================================
   COMPUTATIONS
========================================================= */
function expectedSetsToday() {
  return generateSlotsForToday().length;
}

function completedToday() {
  const today = todayKey();
  return state.completedSlots.filter(k => k.startsWith(today)).length;
}

function computeNextDue() {
  const now = new Date();
  const today = todayKey();

  for (const t of generateSlotsForToday()) {
    const [h, m] = t.split(':').map(Number);
    const dt = new Date();
    dt.setHours(h, m, 0, 0);
    if (dt <= now) continue;
    if (!state.completedSlots.includes(daySlotKey(today, t))) return dt;
  }
  return null;
}

function formatCountdown(ms) {
  if (ms <= 0) return 'Due now!';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? h + ':' : ''}${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

/* =========================================================
   WEEK OVERVIEW
========================================================= */
function prettyScheduleText() {
  let out = '';
  SCHEDULE.forEach(d => {
    const day = d.label.split('•')[1].trim();
    if (d.every) {
      out += `${day}: ${Math.round(d.pct * 100)}% → ~${repsFrom(state.base, d.pct)} reps every ${d.every} min\n`;
    } else {
      out += `${day}: TEST DAY\n`;
    }
  });
  return out;
}

/* =========================================================
   RENDERING
========================================================= */
let slotsRendered = false;

function renderSlots() {
  const ul = $('timeSlots');
  if (!ul) return;

  const today = todayKey();
  const reps = repsFrom(state.base, currentSchedule().pct);
  const slots = generateSlotsForToday();

  if (!slots.length) {
    ul.innerHTML = '<li class="text-muted">No scheduled sets today</li>';
    return;
  }

  ul.innerHTML = slots.map(t => {
    const key = daySlotKey(today, t);
    const done = state.completedSlots.includes(key);
    return `
      <li>
        <label class="${done ? 'strike' : ''}">
          <input type="checkbox" data-time="${t}" ${done ? 'checked' : ''}>
          <span class="slotTime">${t}</span>
          <span class="slotNote">~${reps} reps</span>
        </label>
      </li>
    `;
  }).join('');

  slotsRendered = true;
}

function refreshUI() {
  const cs = currentSchedule();

  if ($('base')) $('base').value = state.base;
  if ($('quietStart')) $('quietStart').value = state.quietStart;
  if ($('quietEnd')) $('quietEnd').value = state.quietEnd;
  if ($('start')) $('start').value = state.startDate;

  if ($('dayLabel')) $('dayLabel').textContent = cs.label.split('•')[1]?.trim() || '';
  if ($('todayPercent')) $('todayPercent').textContent = `${Math.round(cs.pct * 100)}%`;
  if ($('todayEvery')) $('todayEvery').textContent = cs.every ?? '—';
  if ($('todayReps')) $('todayReps').textContent = repsFrom(state.base, cs.pct);
  if ($('todayNote')) $('todayNote').textContent = cs.note || '';

  const sets = completedToday() + state.manualCompletions;
  if ($('setsToday')) $('setsToday').textContent = sets;
  if ($('repsToday')) $('repsToday').textContent = sets * repsFrom(state.base, cs.pct);

  const expected = expectedSetsToday();
  const pct = expected ? Math.min(100, Math.round((sets / expected) * 100)) : 0;
  if ($('progressBar')) $('progressBar').style.width = pct + '%';

  if ($('schedulePreview')) $('schedulePreview').textContent = prettyScheduleText();

  const next = computeNextDue();
  if ($('nextDue')) {
    $('nextDue').textContent = next ? formatCountdown(next - new Date()) : 'No more sets today';
  }

  if (!slotsRendered) renderSlots();
}

/* =========================================================
   EVENTS
========================================================= */
document.addEventListener('change', e => {
  if (e.target.id === 'base') {
    state.base = Math.max(1, +e.target.value);
    save('erc_base', state.base);
    slotsRendered = false;
  }

  if (e.target.id === 'quietStart' || e.target.id === 'quietEnd') {
    state[e.target.id] = e.target.value;
    save(`erc_${e.target.id}`, e.target.value);
    slotsRendered = false;
  }

  if (e.target.id === 'start') {
    state.startDate = e.target.value;
    save('erc_start', state.startDate);
    slotsRendered = false;
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
  }

  refreshUI();
});

document.addEventListener('click', e => {
  if (e.target.id === 'markDone') {
    state.manualCompletions++;
    save('erc_manual', state.manualCompletions);
    refreshUI();
  }

  if (e.target.id === 'darkToggle') {
    state.dark = !state.dark;
    document.body.classList.toggle('dark', state.dark);
    save('erc_dark', state.dark);
  }
});

/* =========================================================
   INIT
========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  if (!state.startDate) {
    state.startDate = todayKey();
    save('erc_start', state.startDate);
  }

  document.body.classList.toggle('dark', state.dark);
  refreshUI();
  setInterval(refreshUI, 1000);
});
