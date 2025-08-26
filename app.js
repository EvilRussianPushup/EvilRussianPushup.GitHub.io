function setCookie(name, value, days) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  setCookie(key, JSON.stringify(val), 365);
}
function load(key, def) {
  try {
    const v = localStorage.getItem(key);
    if (v) return JSON.parse(v);
  } catch (e) {}
  const c = getCookie(key);
  return c ? JSON.parse(c) : def;
}

const SCHEDULE = [
  {label:'Week 1 • Monday',pct:1.00,every:null,note:'Initial max test. After testing, use 30% every 60 min.'},
  {label:'Week 1 • Tuesday',pct:0.50,every:60},
  {label:'Week 1 • Wednesday',pct:0.60,every:45},
  {label:'Week 1 • Thursday',pct:0.25,every:60},
  {label:'Week 1 • Friday',pct:0.45,every:30},
  {label:'Week 1 • Saturday',pct:0.40,every:60},
  {label:'Week 1 • Sunday',pct:0.20,every:90},
  {label:'Week 2 • Monday',pct:1.00,every:null,note:'Re-test your max. After testing, use 35% every 45 min.'},
  {label:'Week 2 • Tuesday',pct:0.55,every:20},
  {label:'Week 2 • Wednesday',pct:0.30,every:15},
  {label:'Week 2 • Thursday',pct:0.65,every:60},
  {label:'Week 2 • Friday',pct:0.35,every:45},
  {label:'Week 2 • Saturday',pct:0.45,every:60},
  {label:'Week 2 • Sunday',pct:0.25,every:120},
  {label:'Week 3 • Monday',pct:1.00,every:null,note:'Re-test your max and plan next block.'}
];

const state = {
  base: load('erc_base', 10),
  startDate: load('erc_start', null),
  quietStart: load('erc_qstart', '22:00'),
  quietEnd: load('erc_qend', '07:00'),
  lastDoneISO: load('erc_lastDoneISO', null),
  setsToday: load('erc_setsToday', 0),
  repsToday: load('erc_repsToday', 0),
  todayStr: null,
  dark: load('erc_dark', false)
};

const $base = $('#base'),
      $start = $('#start'),
      $quietStart = $('#quietStart'),
      $quietEnd = $('#quietEnd'),
      $dayLabel = $('#dayLabel'),
      $freqLabel = $('#freqLabel'),
      $setSize = $('#setSize'),
      $todayPercent = $('#todayPercent'),
      $todayEvery = $('#todayEvery'),
      $todayNote = $('#todayNote'),
      $nextDue = $('#nextDue'),
      $dueExplain = $('#dueExplain'),
      $setsToday = $('#setsToday'),
      $repsToday = $('#repsToday'),
      $progressBar = $('#progressBar'),
      $schedulePreview = $('#schedulePreview');

function applyDark(on) {
  document.body.classList.toggle('dark', !!on);
  $('#darkToggle').text(on ? '☀️ Light mode' : '🌙 Dark mode');
  save('erc_dark', !!on);
}

function todayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
function parseHM(hm) { const [h, m] = hm.split(':').map(Number); return {h, m}; }
function inQuietHours(now, qStart, qEnd) {
  const {h:hs,m:ms} = parseHM(qStart);
  const {h:he,m:me} = parseHM(qEnd);
  const start = new Date(now); start.setHours(hs,ms,0,0);
  const end = new Date(now); end.setHours(he,me,0,0);
  if (end <= start) return now >= start || now <= end;
  return now >= start && now <= end;
}
function daysBetween(a,b) {
  const ms = 86400000;
  const da = new Date(a); da.setHours(0,0,0,0);
  const db = new Date(b); db.setHours(0,0,0,0);
  return Math.floor((db - da) / ms);
}
function currentSchedule() {
  if (!state.startDate) {
    return {index:0,spec:SCHEDULE[0],effectivePct:0.30,every:60,needsTest:true};
  }
  const idx = Math.max(0, Math.min(14, daysBetween(state.startDate,new Date())));
  const spec = SCHEDULE[Math.min(idx,SCHEDULE.length-1)];
  let effectivePct = spec.pct;
  let every = spec.every;
  let needsTest = false;
  if (spec.every === null) {
    needsTest = true;
    if (idx === 0) { effectivePct = 0.30; every = 60; }
    else if (idx === 7) { effectivePct = 0.35; every = 45; }
    else { every = 60; }
  }
  return {index:idx,spec,effectivePct,every,needsTest};
}
function setSizeFrom(base,pct){ return Math.max(1, Math.round(base * pct)); }

function calculateActiveMinutes() {
  const {h:qs,m:ms} = parseHM(state.quietStart);
  const {h:qe,m:me} = parseHM(state.quietEnd);
  const start = qs * 60 + ms;
  const end = qe * 60 + me;
  const totalMinutes = 24 * 60;
  if (end > start) return totalMinutes - (end - start);
  return end + (totalMinutes - start);
}

function prettySchedule() {
  let html = 'Week 1\n';
  for (let i = 0; i < 7; i++) {
    const day = SCHEDULE[i];
    html += formatDay(day);
  }
  html += '\nWeek 2\n';
  for (let i = 7; i < 14; i++) {
    const day = SCHEDULE[i];
    html += formatDay(day);
  }
  html += '\nWeek 3\nMon Test (max effort)';
  return html;
}

function formatDay(day) {
  if (day.every) {
    return `${day.label.split('•')[1].trim()} ${Math.round(day.pct*100)}% → ~${setSizeFrom(state.base, day.pct)} reps every ${day.every} min\n`;
  }
  return `${day.label.split('•')[1].trim()} Test (max effort)\n`;
}

function resetIfNewDay() {
  const key = todayKey();
  if (state.todayStr !== key) {
    state.todayStr = key;
    state.setsToday = 0;
    state.repsToday = 0;
    save('erc_setsToday',0);
    save('erc_repsToday',0);
  }
}

function refreshUI() {
  resetIfNewDay();
  $schedulePreview.text(prettySchedule());
  $base.val(state.base);
  if (state.startDate) {
    const d = new Date(state.startDate);
    $start.val(d.toISOString().slice(0,10));
  }
  $quietStart.val(state.quietStart);
  $quietEnd.val(state.quietEnd);

  const cs = currentSchedule();
  $dayLabel.text(cs.spec.label.split('•')[1].trim());
  $freqLabel.text(cs.needsTest ? 'test today' : `every ${cs.every} min`);
  $setSize.text(setSizeFrom(state.base, cs.effectivePct));
  $todayPercent.text(`${Math.round(cs.effectivePct*100)}%`);
  $todayEvery.text(cs.every);
  $todayNote.text(cs.spec.note || '');
  $setsToday.text(state.setsToday);
  $repsToday.text(state.repsToday);

  const activeMinutes = calculateActiveMinutes();
  const expectedSets = Math.max(1, Math.floor(activeMinutes / cs.every));
  const progressPct = Math.min(100, (state.setsToday / expectedSets) * 100);
  $progressBar.css('width', progressPct + '%');

  const now = new Date();
  if (!state.lastDoneISO) {
    $nextDue.text('ready when you are');
    $dueExplain.text('');
  } else {
    const last = new Date(state.lastDoneISO);
    const next = new Date(last.getTime() + cs.every * 60000);
    if (next <= now) {
      $nextDue.text('NOW!');
      $dueExplain.text('You can do a set right now.');
      $nextDue.addClass('glow');
    } else {
      const diff = next - now;
      const mm = Math.floor(diff/60000), ss = Math.floor((diff%60000)/1000);
      $nextDue.text(`${mm}:${String(ss).padStart(2,'0')}`);
      $dueExplain.text(`Next due at ${next.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`);
      $nextDue.removeClass('glow');
    }
  }
}

function recordSet() {
  const cs = currentSchedule();
  const reps = setSizeFrom(state.base, cs.effectivePct);
  state.setsToday++;
  state.repsToday += reps;
  state.lastDoneISO = new Date().toISOString();
  save('erc_setsToday', state.setsToday);
  save('erc_repsToday', state.repsToday);
  save('erc_lastDoneISO', state.lastDoneISO);
  refreshUI();
  $('#markDone').addClass('pop');
  setTimeout(() => $('#markDone').removeClass('pop'), 350);
}

$(function(){
  applyDark(state.dark);
  refreshUI();
  setInterval(refreshUI, 1000);

  $base.on('input', function(){
    state.base = parseInt(this.value,10) || 1;
    save('erc_base', state.base);
    refreshUI();
  });
  $start.on('change', function(){
    state.startDate = this.value ? new Date(this.value).toISOString() : null;
    save('erc_start', state.startDate);
    refreshUI();
  });
  $quietStart.on('change', function(){
    state.quietStart = this.value;
    save('erc_qstart', state.quietStart);
    refreshUI();
  });
  $quietEnd.on('change', function(){
    state.quietEnd = this.value;
    save('erc_qend', state.quietEnd);
    refreshUI();
  });
  $('#darkToggle').on('click', function(){ applyDark(!state.dark); state.dark = !state.dark; });
  $('#markDone').on('click', recordSet);
});
