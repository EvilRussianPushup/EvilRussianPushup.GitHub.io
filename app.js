/* ====================== Storage Helpers ====================== */
function setCookie(name,value,days){
  const d=new Date();d.setTime(d.getTime()+days*24*60*60*1000);
  document.cookie=`${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
}
function getCookie(name){
  const m=document.cookie.match(new RegExp('(?:^|; )'+name.replace(/([.$?*|{}()\\[\\]\\\\/+^])/g,'\\$1')+'=([^;]*)'));
  return m?decodeURIComponent(m[1]):null;
}
function save(key,val){
  try{localStorage.setItem(key,JSON.stringify(val))}catch(e){}
  setCookie(key,JSON.stringify(val),365);
}
function load(key,def){
  try{const v=localStorage.getItem(key);if(v)return JSON.parse(v)}catch(e){}
  const c=getCookie(key);return c?JSON.parse(c):def;
}

/* ====================== Schedule Data ====================== */
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

/* ====================== Application State ====================== */
const state = {
  base: load('erc_base',10),
  startDate: load('erc_start', null),
  quietStart: load('erc_qstart','22:00'),
  quietEnd: load('erc_qend','07:00'),
  lastDoneISO: load('erc_lastDoneISO',null),
  completedSlots: load('erc_completedSlots',[]),
  manualCompletions: load('erc_manualCompletions',0),
  dark: load('erc_dark',false)
};

/* ====================== jQuery Handles ====================== */
const $base = $('#base'), $start = $('#start'), $quietStart = $('#quietStart'), $quietEnd = $('#quietEnd');
const $dayLabel = $('#dayLabel'), $freqLabel = $('#freqLabel'), $setSize = $('#setSize');
const $todayPercent = $('#todayPercent'), $todayReps = $('#todayReps'), $todayEvery = $('#todayEvery'), $todayNote = $('#todayNote');
const $nextDue = $('#nextDue'), $dueExplain = $('#dueExplain');
const $setsToday = $('#setsToday'), $repsToday = $('#repsToday'), $progressBar = $('#progressBar');
const $schedulePreview = $('#schedulePreview'), $timeSlots = $('#timeSlots');
const $nextDueMini = $('#nextDueMini'), $dueExplainMini = $('#dueExplainMini');

/* ====================== Helper Functions ====================== */
function applyDark(on){document.body.classList.toggle('dark',!!on);$('#darkToggle').text(on?'☀️ Light mode':'🌙 Dark mode');save('erc_dark',!!on);}
function todayKey(d=new Date()){return d.toISOString().slice(0,10);}
function daySlotKey(dateStr,time){return `${dateStr}|${time}`;}
function parseHM(hm){const [h,m]=hm.split(':').map(Number);return {h,m};}
function minutesToHM(min){const h=Math.floor(min/60)%24;const m=min%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;}
function setSizeFrom(base,pct){return Math.max(1,Math.round(base*pct));}
function daysBetween(a,b){const ms=86400000;const da=new Date(a);da.setHours(0,0,0,0);const db=new Date(b);db.setHours(0,0,0,0);return Math.floor((db-da)/ms);}

/* ====================== Schedule Helpers ====================== */
function currentSchedule(){
  if(!state.startDate) return {index:0,spec:SCHEDULE[0],effectivePct:0.30,every:60,needsTest:true};
  const idx=Math.max(0,Math.min(14,daysBetween(state.startDate,new Date())));
  const spec=SCHEDULE[Math.min(idx,SCHEDULE.length-1)];
  let effectivePct=spec.pct,every=spec.every,needsTest=false;
  if(spec.every===null){needsTest=true;if(idx===0){effectivePct=0.30;every=60;}else if(idx===7){effectivePct=0.35;every=45;}else{every=60;}}
  return {index:idx,spec,effectivePct,every,needsTest};
}

function getActiveIntervals(){
  const {h:qs,m:qm}=parseHM(state.quietStart);
  const {h:qe,m:qm2}=parseHM(state.quietEnd);
  const qStart = qs*60 + qm, qEnd = qe*60 + qm2, total=1440;
  const intervals=[];
  if(qStart===qEnd) return [{start:0,end:total}];
  if(qStart < qEnd){
    if(qStart>0) intervals.push({start:0,end:qStart});
    if(qEnd<total) intervals.push({start:qEnd,end:total});
  } else {
    intervals.push({start:qEnd,end:qStart+total});
  }
  return intervals;
}

function generateSlotsForToday(){
  const cs=currentSchedule();
  if(!cs.every) return [];
  const intervals=getActiveIntervals();
  const slots=[];
  intervals.forEach(iv=>{
    let t=iv.start, end=iv.end;
    while(t<end){slots.push(minutesToHM(t%1440)); t+=cs.every;}
  });
  return Array.from(new Set(slots)).sort();
}

function computeExpectedSets(cs){
  if(!cs.every) return 0;
  const intervals=getActiveIntervals();
  let total=0;
  intervals.forEach(iv=>total+=Math.max(0,iv.end-iv.start));
  if(total<=0) return 0;
  return Math.max(1,Math.floor(total/cs.every));
}

function computeTodayCounts(){
  const today=todayKey();
  const slotPrefix=today+'|';
  const completedForToday=state.completedSlots.filter(s=>s.startsWith(slotPrefix)).length;
  const sets=completedForToday+(state.manualCompletions||0);
  const cs=currentSchedule();
  const repsPerSet=setSizeFrom(state.base,cs.effectivePct);
  return {sets,reps:sets*repsPerSet,completedForToday};
}

/* ====================== Rendering ====================== */
function prettySchedule(){
  let out='';
  out+='Week 1\n';
  for(let i=0;i<7;i++){out+=formatWeekLine(SCHEDULE[i]);}
  out+='\nWeek 2\n';
  for(let i=7;i<14;i++){out+=formatWeekLine(SCHEDULE[i]);}
  out+='\nWeek 3\nMon 100% test';
  return out;
}
function formatWeekLine(d){
  const dayName=d.label.split('•')[1].trim();
  if(d.every){return `${dayName} ${Math.round(d.pct*100)}% → ~${setSizeFrom(state.base,d.pct)} reps every ${d.every} min\n`;}
  else{return `${dayName} Test day${d.note?' — '+d.note:''}\n`;}
}

function renderTimeSlots(){
  const today=todayKey();
  const slots=generateSlotsForToday();
  if(slots.length===0){$timeSlots.html(`<li class="text-muted">No scheduled sets today (test day or quiet hours)</li>`); return;}
  const html=slots.map(t=>{
    const key=daySlotKey(today,t);
    const checked=state.completedSlots.includes(key)?'checked':'';
    return `<li><label><input type="checkbox" data-time="${t}" ${checked}/> <span class="slotTime">${t}</span> <span class="slotNote">~${setSizeFrom(state.base,currentSchedule().effectivePct)} reps</span></label></li>`;
  }).join('');
  $timeSlots.html(html);
}

function computeNextDue(){
  const now=new Date();
  const today=todayKey();
  const slots=generateSlotsForToday();
  for(const t of slots){
    const [hh,mm]=t.split(':').map(Number);
    const dt=new Date();
    dt.setHours(hh,mm,0,0);
    if(dt.getTime() < now.getTime()) continue;
    const key=daySlotKey(today,t);
    if(!state.completedSlots.includes(key)) return dt;
  }
  return null;
}

function refreshUI(){
  const cs=currentSchedule();
  $dayLabel.text(cs.spec.label.split('•')[1].trim());
  $freqLabel.text(cs.needsTest?'test today':`every ${cs.every} min`);
  const setSize=setSizeFrom(state.base,cs.effectivePct);
  $setSize.text(setSize); $todayPercent.text(`${Math.round(cs.effectivePct*100)}%`);
  $todayReps.text(setSize); $todayEvery.text(cs.every||'—'); $todayNote.text(cs.spec.note||'');
  $schedulePreview.text(prettySchedule());
  renderTimeSlots();

  const expected=computeExpectedSets(cs);
  const counts=computeTodayCounts();
  $setsToday.text(counts.sets); $repsToday.text(counts.reps);
  const progressPct=expected>0? Math.min(100,Math.round((counts.sets/expected)*100)) : (counts.sets>0?100:0);
  $progressBar.css('width',progressPct+'%');

  const next=computeNextDue();
  const now=new Date();
  if(next){
    const delta=next-now;
    if(delta<=0){$('#nextDue,#nextDueMini').text('Due now!').addClass('glow');$('#dueExplain,#dueExplainMini').text('Time to drop and do your set.');}
    else{
      const h=Math.floor(delta/3600000), m=Math.floor((delta%3600000)/60000), s=Math.floor((delta%60000)/1000);
      const formatted=(h?(h+':'):'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
      $('#nextDue,#nextDueMini').removeClass('glow').text(formatted);
      $('#dueExplain,#dueExplainMini').text(`Next set at ${next.getHours()}:${String(next.getMinutes()).padStart(2,'0')}`);
    }
  } else {$('#nextDue,#nextDueMini').text('No more scheduled sets today').removeClass('glow');$('#dueExplain,#dueExplainMini').text('');}
}

/* ====================== Event Handlers ====================== */
function markSetDone(){
  state.manualCompletions = (state.manualCompletions||0)+1;
  save('erc_manualCompletions',state.manualCompletions);
  refreshUI();
}

$(function(){
  if(state.base) $base.val(state.base);
  if(state.quietStart) $quietStart.val(state.quietStart);
  if(state.quietEnd) $quietEnd.val(state.quietEnd);
  if(state.startDate) $start.val(state.startDate); else {$start.val(todayKey()); state.startDate=todayKey(); save('erc_start',todayKey());}
  applyDark(state.dark); $schedulePreview.text(prettySchedule()); refreshUI();

  $base.on('input',()=>{state.base=Math.max(1,Math.round(Number($base.val()||1))); save('erc_base',state.base); refreshUI();});
  $start.on('change',()=>{state.startDate=$start.val(); save('erc_start',state.startDate); refreshUI();});
  $quietStart.on('change',()=>{state.quietStart=$quietStart.val(); save('erc_qstart',state.quietStart); refreshUI();});
  $quietEnd.on('change',()=>{state.quietEnd=$quietEnd.val(); save('erc_qend',state.quietEnd); refreshUI();});
  $('#darkToggle').on('click',()=>applyDark(!document.body.classList.contains('dark')));
  $('#markDone').on('click',markSetDone);

  $timeSlots.on('change','input[type="checkbox"]',function(){
    const time=$(this).data('time'); const key=daySlotKey(todayKey(),time);
    if(this.checked){ if(!state.completedSlots.includes(key)) state.completedSlots.push(key);}
    else{state.completedSlots=state.completedSlots.filter(k=>k!==key);}
    save('erc_completedSlots',state.completedSlots); refreshUI();
  });

  setInterval(refreshUI,1000);
});
