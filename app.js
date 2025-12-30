/* app.js - fully integrated & hardened version */

/* ---------------- Storage helpers ---------------- */
function setCookie(name, value, days) {
  try {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};expires=${d.toUTCString()};path=/`;
  } catch (e) { /* ignore */ }
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

/* ---------------- App state (persisted) ---------------- */
const state = {
  base: load('erc_base', 10),
  startDate: load('erc_start', null),              // ISO date (YYYY-MM-DD) or null
  quietStart: load('erc_qstart', '22:00'),         // HH:MM
  quietEnd: load('erc_qend', '07:00'),             // HH:MM
  lastDoneISO: load('erc_lastDoneISO', null),     // ISO timestamp
  completedSlots: load('erc_completedSlots', []), // array of "YYYY-MM-DD|HH:MM"
  manualCompletions: load('erc_manualCompletions', 0),
  dark: load('erc_dark', false)
};

/* ---------------- Utility helpers ---------------- */
function todayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
function daySlotKey(dateStr, timeStr) { return `${dateStr}|${timeStr}`; }
function parseHM(hm) {
  if (!hm || typeof hm !== 'string') return { h: 0, m: 0 };
  const [h, m] = hm.split(':').map(s => parseInt(s, 10) || 0);
  return { h, m };
}
function minutesToHM(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function setSizeFrom(base, pct) { return Math.max(1, Math.round(base * pct)); }
function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  const da = new Date(a); da.setHours(0, 0, 0, 0);
  const db = new Date(b); db.setHours(0, 0, 0, 0);
  return Math.floor((db - da) / ms);
}

/* ---------------- Schedule helpers ---------------- */
function currentSchedule() {
  if (!state.startDate) return { index: 0, spec: SCHEDULE[0], effectivePct: 0.30, every: 60, needsTest: true };
  const idx = Math.max(0, Math.min(SCHEDULE.length - 1, daysBetween(state.startDate, new Date())));
  const spec = SCHEDULE[Math.min(idx, SCHEDULE.length - 1)];
  let effectivePct = spec.pct, every = spec.every, needsTest = false;
  if (spec.every === null) {
    needsTest = true;
    if (idx === 0) { effectivePct = 0.30; every = 60; }
    else if (idx === 7) { effectivePct = 0.35; every = 45; }
    else { every = 60; }
  }
  return { index: idx, spec, effectivePct, every, needsTest };
}

/* returns array of active intervals in minutes where sets are allowed:
   e.g. [{start: 420, end: 1320}] for 07:00-22:00 active */
function getActiveIntervals() {
  const { h: qsH, m: qsM } = parseHM(state.quietStart);
  const { h: qeH, m: qeM } = parseHM(state.quietEnd);
  const qStart = qsH * 60 + qsM;
  const qEnd = qeH * 60 + qeM;
  const total = 24 * 60;
  const intervals = [];

  if (qStart === qEnd) {
    // no quiet hours
    intervals.push({ start: 0, end: total });
    return intervals;
  }

  if (qStart < qEnd) {
    // quiet inside the day, active before qStart and after qEnd
    if (qStart > 0) intervals.push({ start: 0, end: qStart });
    if (qEnd < total) intervals.push({ start: qEnd, end: total });
    return intervals;
  }

  // qStart > qEnd -> quiet crosses midnight (e.g. 22:00 -> 07:00)
  // active between qEnd and qStart (same day)
  intervals.push({ start: qEnd, end: qStart });
  return intervals;
}

/* Generate a sorted unique list of HH:MM strings for today's schedule */
function generateSlotsForToday() {
  const cs = currentSchedule();
  if (!cs.every) return []; // test day
  const intervals = getActiveIntervals();
  const slots = new Set();
  intervals.forEach(iv => {
    // start at iv.start, then step by cs.every minutes
    for (let t = iv.start; t < iv.end; t += cs.every) {
      slots.add(minutesToHM(t % 1440));
    }
  });
  return Array.from(slots).sort();
}

/* expected sets = sum over intervals of floor(length / every) */
function computeExpectedSets(cs) {
  if (!cs.every) return 0;
  const intervals = getActiveIntervals();
  let total = 0;
  intervals.forEach(iv => {
    const len = Math.max(0, iv.end - iv.start);
    total += Math.floor(len / cs.every);
  });
  return Math.max(0, total);
}

/* ---------------- Rendering & UI ---------------- */
/* We'll declare these inside ready() to ensure elements exist. */

$(function () {
  // cache jQuery elements - safe because DOM is ready
  const $base = $('#base'), $start = $('#start'), $quietStart = $('#quietStart'), $quietEnd = $('#quietEnd');
  const $dayLabel = $('#dayLabel'), $freqLabel = $('#freqLabel'), $setSize = $('#setSize');
  const $todayPercent = $('#todayPercent'), $todayReps = $('#todayReps'), $todayEvery = $('#todayEvery'), $todayNote = $('#todayNote');
  const $nextDue = $('#nextDue'), $dueExplain = $('#dueExplain');
  const $setsToday = $('#setsToday'), $repsToday = $('#repsToday'), $progressBar = $('#progressBar');
  const $schedulePreview = $('#schedulePreview'), $timeSlots = $('#timeSlots');
  const $markDone = $('#markDone'), $darkToggle = $('#darkToggle');

  // optional tiny display elements (may not exist in all layouts)
  const $nextDueMini = $('#nextDueMini'); // may be empty jQuery object
  const $dueExplainMini = $('#dueExplainMini');

  // apply dark mode class based on persisted state
  function applyDarkModeOnLoad() {
    document.body.classList.toggle('dark', !!state.dark);
    if ($darkToggle.length) $darkToggle.text(state.dark ? '☀️ Light mode' : '🌙 Dark mode');
  }
  applyDarkModeOnLoad();

  // ensure startDate default
  if (!state.startDate) {
    const t = todayKey();
    state.startDate = t;
    save('erc_start', t);
  }

  // helper: build pretty week text (uses user's base to compute ~reps)
  function prettyScheduleText() {
    let out = 'Week 1\n';
    for (let i = 0; i < 7; i++) out += formatWeekLine(SCHEDULE[i]);
    out += '\nWeek 2\n';
    for (let i = 7; i < 14; i++) out += formatWeekLine(SCHEDULE[i]);
    out += '\nWeek 3\nMon 100% test';
    return out;
  }
  function formatWeekLine(d) {
    const dayName = d.label.split('•')[1].trim();
    if (d.every) return `${dayName} ${Math.round(d.pct * 100)}% → ~${setSizeFrom(state.base, d.pct)} reps every ${d.every} min\n`;
    return `${dayName} Test day${d.note ? ' — ' + d.note : ''}\n`;
  }

  // render slot list
  function renderTimeSlots() {
    const today = todayKey();
    const slots = generateSlotsForToday();
    if (!Array.isArray(slots) || slots.length === 0) {
      $timeSlots.html('<li class="text-muted">No scheduled sets today (test day or quiet hours)</li>');
      return;
    }
    const items = slots.map(t => {
      const key = daySlotKey(today, t);
      const isDone = state.completedSlots.includes(key);
      const reps = setSizeFrom(state.base, currentSchedule().effectivePct);

      return `<li><label class="${isDone ? 'strike' : ''}"><input type="checkbox" data-time="${t}" ${isDone ? 'checked' : ''}><span class="slotTime">${t}</span><span class="slotNote">~${reps} reps</span></label></li>`;
    });

    $timeSlots.html(items.join(''));
  }

  // compute counts for today
  function computeTodayCounts() {
    const today = todayKey();
    const prefix = today + '|';
    const completedForToday = state.completedSlots.filter(s => s.startsWith(prefix)).length;
    const sets = completedForToday + (state.manualCompletions || 0);
    const repsPerSet = setSizeFrom(state.base, currentSchedule().effectivePct);
    return { sets, reps: sets * repsPerSet, completedForToday };
  }

  // compute next due Date object (or null)
  function computeNextDueDate() {
    const slots = generateSlotsForToday();
    const now = new Date();
    const today = todayKey();
    for (const t of slots) {
      const [hh, mm] = t.split(':').map(s => parseInt(s, 10) || 0);
      const dt = new Date();
      dt.setHours(hh, mm, 0, 0);
      if (dt.getTime() < now.getTime()) continue; // already passed
      const key = daySlotKey(today, t);
      if (!state.completedSlots.includes(key)) return dt;
    }
    return null;
  }

  // human friendly countdown hh:mm:ss
  function humanCountdown(ms) {
    if (ms <= 0) return '00:00:00';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return (h ? (h + ':') : '') + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
  }

  // main UI refresh - idempotent & safe
  function refreshUI() {
    try {
      // inputs
      if ($base.length) $base.val(state.base);
      if ($start.length && state.startDate) $start.val(state.startDate);
      if ($quietStart.length) $quietStart.val(state.quietStart);
      if ($quietEnd.length) $quietEnd.val(state.quietEnd);

      // schedule info
      const cs = currentSchedule();
      if ($dayLabel.length) $dayLabel.text(cs.spec.label.split('•')[1].trim());
      if ($freqLabel.length) $freqLabel.text(cs.needsTest ? 'test today' : `every ${cs.every} min`);
      if ($setSize.length) $setSize.text(setSizeFrom(state.base, cs.effectivePct));

      if ($todayPercent.length) $todayPercent.text(`${Math.round(cs.effectivePct * 100)}%`);
      if ($todayReps.length) $todayReps.text(setSizeFrom(state.base, cs.effectivePct));
      if ($todayEvery.length) $todayEvery.text(cs.every || '—');
      if ($todayNote.length) $todayNote.text(cs.spec.note || '');

      if ($schedulePreview.length) $schedulePreview.text(prettyScheduleText());

      // slots / counts / progress
      renderTimeSlots();
      const expected = computeExpectedSets(cs);
      const counts = computeTodayCounts();
      if ($setsToday.length) $setsToday.text(counts.sets);
      if ($repsToday.length) $repsToday.text(counts.reps);

      const progressPct = expected > 0 ? Math.min(100, Math.round((counts.sets / expected) * 100)) : (counts.sets > 0 ? 100 : 0);
      if ($progressBar.length) $progressBar.css('width', progressPct + '%');

      // next due
      const next = computeNextDueDate();
      const now = new Date();
      if (next) {
        const delta = next.getTime() - now.getTime();
        if (delta <= 0) {
          if ($nextDue.length) { $nextDue.text('Due now!').addClass('glow'); }
          if ($dueExplain.length) $dueExplain.text('Time to drop and do your set.');
          if ($nextDueMini.length) $nextDueMini.text('Due now!');
          if ($dueExplainMini.length) $dueExplainMini.text('Time to drop and do your set.');
        } else {
          const formatted = humanCountdown(delta);
          if ($nextDue.length) { $nextDue.text(formatted).removeClass('glow'); }
          if ($dueExplain.length) $dueExplain.text(`Next at ${next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
          if ($nextDueMini.length) $nextDueMini.text(formatted);
          if ($dueExplainMini.length) $dueExplainMini.text(`Next at ${next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        }
      } else {
        if ($nextDue.length) $nextDue.text('No more scheduled sets today').removeClass('glow');
        if ($dueExplain.length) $dueExplain.text('');
        if ($nextDueMini.length) $nextDueMini.text('No more today');
        if ($dueExplainMini.length) $dueExplainMini.text('');
      }
    } catch (err) {
      // don't throw - log for debugging
      // console.error('refreshUI error', err);
    }
  }

  /* ---------------- Event handlers ---------------- */

  // base input
  $base.on('input', function () {
    const v = Math.max(1, Math.round(Number($(this).val() || 1)));
    state.base = v;
    save('erc_base', state.base);
    refreshUI();
  });

  // start date
  $start.on('change', function () {
    const v = $(this).val();
    state.startDate = v || todayKey();
    save('erc_start', state.startDate);
    refreshUI();
  });

  // quiet hours
  $quietStart.on('change', function () { state.quietStart = $(this).val(); save('erc_qstart', state.quietStart); refreshUI(); });
  $quietEnd.on('change', function () { state.quietEnd = $(this).val(); save('erc_qend', state.quietEnd); refreshUI(); });

  // dark toggle
  $darkToggle.on('click', function () {
    state.dark = !state.dark;
    applyDarkModeOnLoad();
    save('erc_dark', state.dark);
  });

  // mark done button (manual completion)
  $markDone.on('click', function () {
    state.manualCompletions = (state.manualCompletions || 0) + 1;
    state.lastDoneISO = new Date().toISOString();
    save('erc_manualCompletions', state.manualCompletions);
    save('erc_lastDoneISO', state.lastDoneISO);
    $(this).addClass('pop'); setTimeout(() => $(this).removeClass('pop'), 350);
    refreshUI();
  });

  /* ------------------- Strike-through animation state ------------------- */
let justCompleted = null; // temporary animation flag

/* ------------------- Render time slots (with animation) ------------------- */
function renderTimeSlots() {
  const today = todayKey();
  const slots = generateSlotsForToday();
  if (!Array.isArray(slots) || slots.length === 0) {
    $timeSlots.html('<li class="text-muted">No scheduled sets today (test day or quiet hours)</li>');
    return;
  }

  const cs = currentSchedule();
  const items = slots.map(t => {
    const key = daySlotKey(today, t);
    const reps = setSizeFrom(state.base, cs.effectivePct);
    const isDone = state.completedSlots.includes(key);
    const isJustDone = key === justCompleted;

    const classes = [
      isDone ? 'done' : '',
      isJustDone ? 'just-done' : ''
    ].join(' ');

    return `
      <li>
        <label class="${classes}">
          <input type="checkbox" data-time="${t}" ${isDone ? 'checked' : ''}>
          <span class="slotTime">${t}</span>
          <span class="slotNote">~${reps} reps</span>
        </label>
      </li>
    `;
  });

  $timeSlots.html(items.join(''));

  // clear justCompleted flag after rendering once
  justCompleted = null;
}

/* ------------------- Checkbox change handler ------------------- */
$timeSlots.on('change', 'input[type="checkbox"]', function () {
  const t = $(this).data('time');
  const key = daySlotKey(todayKey(), t);

  if (this.checked) {
    if (!state.completedSlots.includes(key)) {
      state.completedSlots.push(key);
      justCompleted = key; // trigger animation
    }
  } else {
    state.completedSlots = state.completedSlots.filter(k => k !== key);
  }

  save('erc_completedSlots', state.completedSlots);
  refreshUI();
});


  // initial fill of input fields (values persisted)
  if ($base.length) $base.val(state.base);
  if ($quietStart.length) $quietStart.val(state.quietStart);
  if ($quietEnd.length) $quietEnd.val(state.quietEnd);
  if ($start.length) $start.val(state.startDate);

  // periodic updates (countdown / progress)
  refreshUI();
  setInterval(refreshUI, 1000);
}); // end DOM ready
