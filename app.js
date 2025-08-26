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

function prettySchedule() {
  return `Week 1
Mon 100% test, then 30% every 60 min
Tue 50% every 60 min
Wed 60% every 45 min
Thu 25% every 60 min
Fri 45% every 30 min
Sat 40% every 60 min
Sun 20% every 90 min

Week 2
Mon 100% re-test, then 35% every 45 min
Tue 55% every 20 min
Wed 30% every 15 min
Thu 65% every 60 min
Fri 35% every 45 min
Sat 45% every 60 min
Sun 25% every 120 min

Week 3
Mon 100% re-test`;
}

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

  const sch = currentSchedule();
  $dayLabel.text(sch.spec.label);
  $freqLabel.text(sch.every ? `every ${sch.every} min` : 'test day');
  const setSize = setSizeFrom(state.base, sch.effectivePct);
  bump($setSize, setSize);
  $('#todayPlan').addClass('pop');
  setTimeout(() => $('#todayPlan').removeClass('pop'), 350);
  $setSize.text(setSize);
  $todayPercent.text(Math.round(sch.effectivePct * 100) + '%');
  $todayEvery.text(sch.every);
  $todayNote.text(sch.spec.note ? `Note: ${sch.spec.note}` : '');
  $setsToday.text(state.setsToday);
  $repsToday.text(state.repsToday);
  const estDailySets = Math.floor((15*60) / (sch.every ? sch.every : 60));
  const p = Math.min(100, estDailySets ? Math.round((state.setsToday / estDailySets) * 100) : 0);
  $progressBar.css('width', p + '%');
  updateCountdown();
}
function bump($el,value){ $el.text(value).addClass('pop'); setTimeout(()=>{$el.removeClass('pop')},350); }
function nextDueTime() {
  const now = new Date();
  const sch = currentSchedule();
  const freq = (sch.every || 60) * 60000;
  let due = state.lastDoneISO ? new Date(state.lastDoneISO) : new Date(now.getTime() - freq);
  due = new Date(due.getTime() + freq);
  if (inQuietHours(due, state.quietStart, state.quietEnd)) {
    const {h:he,m:me} = parseHM(state.quietEnd);
    const end = new Date(due);
    end.setHours(he,me,0,0);
    if (inQuietHours(now,state.quietStart,state.quietEnd) && now > end) end.setDate(end.getDate()+1);
    due = end;
  }
  return due;
}
function humanTimeDiff(ms) {
  const s = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return (h?h+':':'')+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
}

function updateCountdown() {
  const now = new Date();
  const due = nextDueTime();
  const delta = due - now;
  if (delta <= 0) {
    $nextDue.text('Due now!').addClass('glow');
    $dueExplain.text('Time to drop and do your set.');
  } else {
    $nextDue.removeClass('glow');
    $nextDue.text(humanTimeDiff(delta));
    const inQuiet = inQuietHours(now,state.quietStart,state.quietEnd);
    $dueExplain.text(inQuiet ? 'Quiet hours active — countdown resumes after quiet hours.' : 'Time remaining until your next set.');
  }
}

function markSetDone() {
  const sch = currentSchedule();
  const reps = setSizeFrom(state.base, sch.effectivePct);
  state.setsToday += 1;
  state.repsToday += reps;
  state.lastDoneISO = new Date().toISOString();
  save('erc_setsToday', state.setsToday);
  save('erc_repsToday', state.repsToday);
  save('erc_lastDoneISO', state.lastDoneISO);
  bump($setsToday, state.setsToday);
  bump($repsToday, state.repsToday);
  updateCountdown();
}

// Init
$(function(){
  if(state.base) $base.val(state.base);
  if(state.quietStart) $quietStart.val(state.quietStart);
  if(state.quietEnd) $quietEnd.val(state.quietEnd);
  if(state.startDate){
    const d = new Date(state.startDate);
    $('#start').val(d.toISOString().slice(0,10));
  }
  applyDark(state.dark);
  $schedulePreview.text(prettySchedule());

  if(!state.startDate){
    const t = todayKey();
    state.startDate = t;
    save('erc_start', t);
    $('#start').val(t);
  }

  $base.on('input', ()=>{
    state.base = Math.max(1, Math.round(Number($base.val()||1)));
    save('erc_base', state.base);
    refreshUI();
  });
  $start.on('change', ()=>{
    state.startDate = $start.val();
    save('erc_start', state.startDate);
    refreshUI();
  });
  $quietStart.on('change', ()=>{
    state.quietStart = $quietStart.val();
    save('erc_qstart', state.quietStart);
    refreshUI();
  });
  $quietEnd.on('change', ()=>{
    state.quietEnd = $quietEnd.val();
    save('erc_qend', state.quietEnd);
    refreshUI();
  });

  $('#darkToggle').on('click', ()=>applyDark(!document.body.classList.contains('dark')));
  $('#markDone').on('click', markSetDone);

  refreshUI();
  setInterval(updateCountdown, 1000);
});
