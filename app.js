/* storage helpers */
function setCookie(name,value,days){const d=new Date();d.setTime(d.getTime()+days*24*60*60*1000);document.cookie=`${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`}
function getCookie(name){const m=document.cookie.match(new RegExp('(?:^|; )'+name.replace(/([.$?*|{}()\\[\\]\\\\/+^])/g,'\\$1')+'=([^;]*)'));return m?decodeURIComponent(m[1]):null}
function save(key,val){try{localStorage.setItem(key,JSON.stringify(val))}catch(e){}setCookie(key,JSON.stringify(val),365)}
function load(key,def){try{const v=localStorage.getItem(key);if(v) return JSON.parse(v)}catch(e){}const c=getCookie(key);return c?JSON.parse(c):def}

/* schedule / constants */
const SCHEDULE=[
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

/* application state */
const state = {
  base: load('erc_base', 10),
  startDate: load('erc_start', null),
  quietStart: load('erc_qstart', '22:00'),
  quietEnd: load('erc_qend', '07:00'),
  lastDoneISO: load('erc_lastDoneISO', null),
  completedSlots: load('erc_completedSlots', []), // array of "YYYY-MM-DD|HH:MM" to keep per-day uniqueness
  manualCompletions: load('erc_manualCompletions', 0), // counts from "Mark set done" button
  todayStr: null,
  dark: load('erc_dark', false)
};

/* jquery handles */
const $base = $('#base'), $start = $('#start'), $quietStart = $('#quietStart'), $quietEnd = $('#quietEnd');
const $dayLabel = $('#dayLabel'), $freqLabel = $('#freqLabel'), $setSize = $('#setSize');
const $todayPercent = $('#todayPercent'), $todayReps = $('#todayReps'), $todayEvery = $('#todayEvery'), $todayNote = $('#todayNote');
const $nextDue = $('#nextDue'), $dueExplain = $('#dueExplain');
const $setsToday = $('#setsToday'), $repsToday = $('#repsToday'), $progressBar = $('#progressBar');
const $schedulePreview = $('#schedulePreview'), $timeSlots = $('#timeSlots');
const $nextDueMini = $('#nextDueMini'), $dueExplainMini = $('#dueExplainMini');

/* helpers */
function applyDark(on){document.body.classList.toggle('dark',!!on);$('#darkToggle').text(on?'☀️ Light mode':'🌙 Dark mode');save('erc_dark',!!on)}
function todayKey(d=new Date()){return d.toISOString().slice(0,10)}
function daySlotKey(dateStr,time){return `${dateStr}|${time}`} // unique slot id
function parseHM(hm){const [h,m]=hm.split(':').map(Number);return {h,m}}
function minutesToHM(min){const h=Math.floor(min/60)%24;const m=min%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`}
function setSizeFrom(base,pct){return Math.max(1,Math.round(base*pct))}

/* schedule math helpers */
function daysBetween(a,b){const ms=86400000;const da=new Date(a);da.setHours(0,0,0,0);const db=new Date(b);db.setHours(0,0,0,0);return Math.floor((db-da)/ms)}
function currentSchedule(){
  if(!state.startDate) return {index:0,spec:SCHEDULE[0],effectivePct:0.30,every:60,needsTest:true};
  const idx=Math.max(0,Math.min(14,daysBetween(state.startDate,new Date())));
  const spec=SCHEDULE[Math.min(idx,SCHEDULE.length-1)];
  let effectivePct=spec.pct, every=spec.every, needsTest=false;
  if(spec.every===null){
    needsTest=true;
    if(idx===0){ effectivePct=0.30; every=60 }
    else if(idx===7){ effectivePct=0.35; every=45 }
    else { every=60 }
  }
  return {index:idx,spec,effectivePct,every,needsTest};
}

/* compute active intervals in minutes [start,end) where sets are allowed (0..1440) */
function getActiveIntervals(){
  const {h:qs,m:qm}=parseHM(state.quietStart);
  const {h:qe,m:qm2}=parseHM(state.quietEnd);
  const qStart = qs*60 + qm;
  const qEnd = qe*60 + qm2;
  const total = 24*60;
  const intervals=[];
  if(qStart < qEnd){
    // quiet within same day -> active = [0,qStart) and [qEnd,1440)
    if(qStart>0) intervals.push({start:0,end:qStart});
    if(qEnd<total) intervals.push({start:qEnd,end:total});
  } else if(qStart > qEnd){
    // quiet crosses midnight -> active = [qEnd,qStart)
    if(qEnd < qStart) intervals.push({start:qEnd,end:qStart});
  } else {
    // qStart == qEnd -> quiet full day (unlikely) => no active intervals
    // treat as no active minutes
  }
  return intervals;
}

/* generate today slots (array of "HH:MM" strings) based on schedule and active intervals */
function generateSlotsForToday(){
  const cs = currentSchedule();
  if(!cs.every) return []; // test day => none
  const intervals = getActiveIntervals();
  const slots=[];
  intervals.forEach(iv=>{
    // start at iv.start, step by cs.every, ensure slot < iv.end
    // we want reasonable first slot: round up to next multiple based on iv.start
    let t = iv.start;
    // produce slots starting at t, then t + every, etc.
    while(t < iv.end){
      slots.push(minutesToHM(t));
      t += cs.every;
    }
  });
  // remove duplicates & sort
  const uniq = Array.from(new Set(slots));
  uniq.sort();
  return uniq;
}

/* compute expectedSets for today based on active minutes and frequency */
function computeExpectedSets(cs){
  if(!cs.every) return 0;
  const intervals = getActiveIntervals();
  let total = 0;
  intervals.forEach(iv => total += Math.max(0, iv.end - iv.start));
  if(total <= 0) return 0;
  return Math.max(1, Math.floor(total / cs.every));
}

/* compute completed counts from state.completedSlots (only count today's entries) + manual completions */
function computeTodayCounts(){
  const today = todayKey();
  const slotPrefix = today + '|';
  const completedForToday = state.completedSlots.filter(s => s.startsWith(slotPrefix)).length;
  const sets = completedForToday + (state.manualCompletions || 0);
  const cs = currentSchedule();
  const repsPerSet = setSizeFrom(state.base, cs.effectivePct);
  return {sets, reps: sets * repsPerSet, completedForToday};
}

/* render week overview dynamically (percentages and reps) */
function prettySchedule(){
  // build readable schedule showing percent and computed reps based on base
  let out = '';
  out += 'Week 1\n';
  for(let i=0;i<7;i++){
    const d=SCHEDULE[i];
    out += formatWeekLine(d);
  }
  out += '\nWeek 2\n';
  for(let i=7;i<14;i++){
    const d=SCHEDULE[i];
    out += formatWeekLine(d);
  }
  out += '\nWeek 3\nMon 100% test';
  return out;
}
function formatWeekLine(d){
  const dayName = d.label.split('•')[1].trim();
  if(d.every){
    return `${dayName} ${Math.round(d.pct*100)}% → ~${setSizeFrom(state.base,d.pct)} reps every ${d.every} min\n`;
  } else {
    // use note where present to show the after-test prescription
    return `${dayName} Test day${d.note ? ' — ' + d.note : ''}\n`;
  }
}

/* render the time slot list with checkboxes for today */
function renderTimeSlots(){
  const today = todayKey();
  const slots = generateSlotsForToday();
  if(slots.length === 0){
    $timeSlots.html(`<li class="text-muted">No scheduled sets today (test day or quiet hours cover whole day)</li>`);
    return;
  }
  const html = slots.map(t=>{
    const key = daySlotKey(today,t);
    const checked = state.completedSlots.includes(key) ? 'checked' : '';
    return `<li><label><input type="checkbox" data-time="${t}" ${checked}/> <span class="slotTime">${t}</span> <span class="slotNote">~${setSizeFrom(state.base,currentSchedule().effectivePct)} reps</span></label></li>`;
  }).join('');
  $timeSlots.html(html);
}

/* compute next due time (next unchecked slot or next allowed time) */
function computeNextDue(){
  const now = new Date();
  const today = todayKey();
  const slots = generateSlotsForToday();
  // find first slot that is >= current time and not completed
  for(const t of slots){
    const [hh,mm]=t.split(':').map(Number);
    const dt = new Date();
    dt.setHours(hh,mm,0,0);
    // if slot time already passed, skip
    if(dt.getTime() < now.getTime()) continue;
    const key = daySlotKey(today,t);
    if(!state.completedSlots.includes(key)) return dt;
  }
  // if none found later today, maybe next day's first slot — return null (we'll show ready/none)
  return null;
}

/* update UI */
function refreshUI(){
  // ensure today reset logic (completed slots are per-day keys so no auto-reset needed)
  $base.val(state.base);
  if(state.startDate) $start.val(new Date(state.startDate).toISOString().slice(0,10));
  $quietStart.val(state.quietStart);
  $quietEnd.val(state.quietEnd);

  const cs = currentSchedule();
  $dayLabel.text(cs.spec.label.split('•')[1].trim());
  $freqLabel.text(cs.needsTest ? 'test today' : `every ${cs.every} min`);
  const setSize = setSizeFrom(state.base, cs.effectivePct);
  $setSize.text(setSize);
  $todayPercent.text(`${Math.round(cs.effectivePct*100)}%`);
  $todayReps.text(setSize);
  $todayEvery.text(cs.every || '—');
  $todayNote.text(cs.spec.note || '');

  // week overview
  $schedulePreview.text(prettySchedule());

  // render slots and compute expected/actual
  renderTimeSlots();
  const expected = computeExpectedSets(cs);
  const counts = computeTodayCounts();
  $setsToday.text(counts.sets);
  $repsToday.text(counts.reps);

  // progress
  let progressPct = expected > 0 ? Math.min(100, Math.round((counts.sets / expected) * 100)) : (counts.sets>0?100:0);
  $progressBar.css('width', progressPct + '%');

  // next due (main countdown area)
  const next = computeNextDue();
  const now = new Date();
  if(next){
    const delta = next - now;
    if(delta <= 0){
      $('#nextDue').text('Due now!').addClass('glow');
      $('#dueExplain').text('Time to drop and do your set.');
      $nextDueMini.text('Due now!'); $dueExplainMini.text('Do your set.');
    } else {
      const h = Math.floor(delta / 3600000);
      const m = Math.floor((delta % 3600000) / 60000);
      const s = Math.floor((delta % 60000) / 1000);
      const formatted = (h? (h+':') : '') + String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
      $('#nextDue').removeClass('glow').text(formatted);
      $('#dueExplain').text(`Next scheduled at ${next.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`);
      $nextDueMini.text(formatted);
      $dueExplainMini.text(`Next at ${next.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`);
    }
  } else {
    $('#nextDue').removeClass('glow').text('No more scheduled sets today');
    $('#dueExplain').text('');
    $nextDueMini.text('No more today');
    $dueExplainMini.text('');
  }
}

/* mark a specific slot as done/undone */
function toggleSlotForToday(time, checked){
  const key = daySlotKey(todayKey(), time);
  if(checked){
    if(!state.completedSlots.includes(key)) state.completedSlots.push(key);
  } else {
    state.completedSlots = state.completedSlots.filter(s => s !== key);
  }
  save('erc_completedSlots', state.completedSlots);
  refreshUI();
}

/* mark set done button: increments manualCompletions and store timestamp */
function markSetDone(){
  state.manualCompletions = (state.manualCompletions || 0) + 1;
  state.lastDoneISO = new Date().toISOString();
  save('erc_manualCompletions', state.manualCompletions);
  save('erc_lastDoneISO', state.lastDoneISO);
  // visual pop
  $('#markDone').addClass('pop'); setTimeout(()=>$('#markDone').removeClass('pop'),350);
  refreshUI();
}

/* initialization & event wiring */
$(function(){
  // init fields
  if(state.base) $base.val(state.base);
  if(state.quietStart) $quietStart.val(state.quietStart);
  if(state.quietEnd) $quietEnd.val(state.quietEnd);
  if(state.startDate) $start.val(new Date(state.startDate).toISOString().slice(0,10));
  applyDark(state.dark);

  // default start to today if not set
  if(!state.startDate){
    const t = todayKey();
    state.startDate = t;
    save('erc_start', t);
    $start.val(t);
  }

  // input handlers
  $base.on('input', function(){
    state.base = Math.max(1, Math.round(Number($base.val()||1)));
    save('erc_base', state.base);
    refreshUI();
  });
  $start.on('change', function(){
    state.startDate = $start.val() ? new Date($start.val()).toISOString() : null;
    save('erc_start', state.startDate);
    refreshUI();
  });
  $quietStart.on('change', function(){ state.quietStart = $quietStart.val(); save('erc_qstart', state.quietStart); refreshUI(); });
  $quietEnd.on('change', function(){ state.quietEnd = $quietEnd.val(); save('erc_qend', state.quietEnd); refreshUI(); });

  $('#darkToggle').on('click', ()=>{ state.dark = !state.dark; applyDark(state.dark); });

  // slot checkbox handler (delegated)
  $timeSlots.on('change', 'input[type="checkbox"]', function(){
    const t = $(this).data('time');
    toggleSlotForToday(t, this.checked);
  });

  // mark done button
  $('#markDone').on('click', markSetDone);

  // periodic UI refresh
  refreshUI();
  setInterval(refreshUI, 1000);
});
