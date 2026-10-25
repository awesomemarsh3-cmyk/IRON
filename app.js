// IRON — adaptive hybrid training planner (Muay Thai + lifting + 70.3)
// All data lives in localStorage on this device. Use Settings → Export to back up.

'use strict';

// ---------- date helpers (local dates as YYYY-MM-DD) ----------
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const diffDays = (a, b) => Math.round((fromKey(a) - fromKey(b)) / 86400000);
const todayKey = () => toKey(new Date());
const mondayOf = (k) => addDays(k, -((fromKey(k).getDay() + 6) % 7));
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (k) => fromKey(k).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// ---------- state ----------
const STORE = 'iron-v1';
const DEFAULTS = {
  settings: {
    startDate: '2026-10-26',
    fightDate: '2027-04-03',
    raceDate: '2027-07-11',
    offSundayAnchor: '2026-11-01', // any Sunday you have off; alternates every 2 weeks
    fightWeight: 150,
    oneRM: { 'Back Squat': 245, 'Bench Press': 225, 'Deadlift': 225, 'Overhead Press': 135, 'Barbell Row': 185, 'Romanian Deadlift': 185 },
  },
  logs: {},       // sessionId -> {status:'done'|'skipped', rpe, minutes, notes, lifts:{name:{weight, hit}}}
  moves: {},      // sessionId -> new date key
  readiness: {},  // date -> {sleep, energy, soreness, knee}
  weights: {},    // date -> bodyweight lb
  food: {},       // date -> {cal, protein}
  lifts: {},      // "Lift|scheme" -> {weight, fails}
  overrides: {},  // sessionId -> {title, minutes, intensity, details, drop, reason} (from Claude coach)
  coach: [],      // [{at, q, a}] recent coach conversations
};
let S = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s) return { ...structuredClone(DEFAULTS), ...s, settings: { ...DEFAULTS.settings, ...s.settings } };
  } catch (e) { /* fall through */ }
  return structuredClone(DEFAULTS);
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { alert('Could not save: ' + e.message); } }

// ---------- phases ----------
function phases() {
  const { startDate, fightDate, raceDate } = S.settings;
  const campStart = addDays(fightDate, -56);
  const prepStart = addDays(campStart, -42);
  return [
    { id: 'base', name: 'Base / Hypertrophy', start: startDate, end: addDays(prepStart, -1) },
    { id: 'prep', name: 'Strength / Pre-camp', start: prepStart, end: addDays(campStart, -1) },
    { id: 'camp', name: 'Fight Camp', start: campStart, end: addDays(fightDate, -8) },
    { id: 'fightweek', name: 'Fight Week', start: addDays(fightDate, -7), end: fightDate },
    { id: 'recovery', name: 'Post-fight Recovery', start: addDays(fightDate, 1), end: addDays(fightDate, 7) },
    { id: 'tri', name: 'Tri Build', start: addDays(fightDate, 8), end: addDays(raceDate, -22) },
    { id: 'peak', name: 'Peak', start: addDays(raceDate, -21), end: addDays(raceDate, -11) },
    { id: 'taper', name: 'Taper', start: addDays(raceDate, -10), end: raceDate },
    { id: 'off', name: 'Off-season', start: addDays(raceDate, 1), end: '2099-01-01' },
  ];
}
const phaseOf = (k) => phases().find((p) => k >= p.start && k <= p.end) || { id: 'pre', name: 'Pre-season', start: k, end: k };

// ---------- lifting ----------
const LOWER = new Set(['Back Squat', 'Deadlift', 'Romanian Deadlift']);
const PCT = { '4x10': 0.62, '3x10': 0.65, '4x8': 0.7, '4x6': 0.77, '5x5': 0.8, '4x4': 0.82, '3x3': 0.82, '3x6': 0.75, '3x5': 0.78 };
const round5 = (x) => Math.round(x / 5) * 5;
function liftWeight(name, scheme) {
  const key = `${name}|${scheme}`;
  if (!S.lifts[key]) S.lifts[key] = { weight: round5((S.settings.oneRM[name] || 100) * (PCT[scheme] || 0.7)), fails: 0 };
  return S.lifts[key].weight;
}
function progressLift(name, scheme, hit, rpe) {
  const key = `${name}|${scheme}`; liftWeight(name, scheme);
  const L = S.lifts[key];
  if (hit && (rpe || 8) <= 8) { L.weight += LOWER.has(name) ? 5 : 2.5; L.fails = 0; }
  else if (!hit) { L.fails += 1; if (L.fails >= 2) { L.weight = round5(L.weight * 0.9); L.fails = 0; } }
}
const LIFT_DAYS = {
  base: {
    upper: { title: 'Upper — hypertrophy', lifts: [['Bench Press', '4x8'], ['Barbell Row', '4x10'], ['Overhead Press', '3x10']], acc: 'Pull-ups 3×AMRAP · DB curls 3×12 · Rope pushdowns 3×12 · Neck harness 3×15' },
    lower: { title: 'Lower — hypertrophy', lifts: [['Back Squat', '4x8'], ['Romanian Deadlift', '3x10']], acc: 'Bulgarian split squat 3×10 (knee-friendly depth) · Calf raises 4×12 · Hanging knee raises 3×12' },
    full: { title: 'Full body — hypertrophy', lifts: [['Deadlift', '3x6'], ['Bench Press', '3x10']], acc: 'Incline DB press 3×10 · Lat pulldown 3×12 · Leg press 3×12 · Lateral raises 3×15' },
  },
  prep: {
    upper: { title: 'Upper — strength', lifts: [['Bench Press', '5x5'], ['Barbell Row', '4x6'], ['Overhead Press', '4x6']], acc: 'Weighted pull-ups 4×6 · Dips 3×8 · Neck 3×15' },
    lower: { title: 'Lower — strength', lifts: [['Back Squat', '5x5'], ['Romanian Deadlift', '3x6']], acc: 'Step-ups 3×8 · Copenhagen plank 3×20s · Calves 3×12' },
    full: { title: 'Full body — strength', lifts: [['Deadlift', '4x4'], ['Bench Press', '3x6']], acc: 'Box jumps 4×3 · Med-ball rotational throws 3×5/side · Farmer carry 3×40m' },
  },
  camp: {
    upper: { title: 'Power — upper', lifts: [['Bench Press', '3x3']], acc: 'Med-ball chest pass 4×5 · Landmine punch 3×5/side · Pull-ups 3×6 · Neck 3×15' },
    lower: { title: 'Power — lower', lifts: [['Back Squat', '3x3']], acc: 'Trap-bar jumps 4×3 · Single-leg RDL 3×6 · Core anti-rotation 3×10' },
  },
  tri: {
    full: { title: 'Maintenance — full body', lifts: [['Back Squat', '3x6'], ['Bench Press', '3x6'], ['Barbell Row', '3x5']], acc: 'Single-leg RDL 3×8 · Pull-ups 3×AMRAP · Core 3 rounds' },
    full2: { title: 'Maintenance — full body B', lifts: [['Deadlift', '3x5'], ['Overhead Press', '3x6']], acc: 'Step-ups 3×10 · Push-ups 3×AMRAP · Calves 3×15' },
  },
};

// ---------- weekly templates ----------
// Each entry: [slot, type, title, baseMinutes, intensity, key, details]
// Types: lift(ref), muaythai, swim, bike, run, brick, conditioning, mobility
const L = (ref) => ['lift', ref];
function template(phaseId, dow, workSunday) {
  const T = {
    base: {
      1: [['AM', ...L('upper'), 60, 'moderate', true]],
      2: [['AM', 'run', 'Long easy run (Zone 2)', 40, 'easy', true, 'Conversational pace. Walk breaks are fine. Knee check after.'],
          ['PM', 'muaythai', 'Muay Thai class (6–7)', 60, 'hard', true]],
      3: [['AM', ...L('lower'), 60, 'moderate', true],
          ['AM', 'swim', 'Technique swim', 30, 'easy', false, 'Drills: catch-up, 6-kick switch, bilateral breathing. 8×50 easy.']],
      4: [['AM', 'bike', 'Easy spin (Zone 2)', 45, 'easy', false, 'Home or club spin bike. Cadence 85–95.'],
          ['PM', 'muaythai', 'Muay Thai class (6–7)', 60, 'hard', true]],
      5: [['AM', 'swim', 'Aerobic swim', 40, 'easy', false, 'Build continuous swimming: 4×200 w/ 30s rest.'],
          ['PM', 'muaythai', 'Muay Thai class (7–8:30)', 90, 'hard', true]],
      6: [['AM', 'run', 'Easy run + strides', 30, 'easy', false, 'Zone 2 then 4×20s relaxed strides.'],
          ['PM', ...L('full'), 60, 'moderate', true]],
      0: workSunday ? [['AM', 'mobility', 'Mobility + core', 20, 'easy', false, 'Hips, ankles, t-spine. Knee prehab: terminal knee extensions, wall sits.']]
                    : [['AM', 'bike', 'Long easy ride', 75, 'easy', true, 'Outdoors if >40°F and dry, otherwise home spin bike.']],
    },
    prep: {
      1: [['AM', ...L('upper'), 60, 'hard', true]],
      2: [['AM', 'run', 'Easy run (Zone 2)', 40, 'easy', false],
          ['PM', 'muaythai', 'Muay Thai class (6–7)', 60, 'hard', true]],
      3: [['AM', ...L('lower'), 60, 'hard', true],
          ['AM', 'muaythai', 'Skills: pads / bag rounds', 40, 'moderate', true, '8×3 min bag or partner pads, 1 min rest. Footwork and combos.']],
      4: [['AM', 'swim', 'Aerobic swim', 40, 'easy', false],
          ['PM', 'muaythai', 'Muay Thai class (6–7)', 60, 'hard', true]],
      5: [['AM', 'bike', 'Easy spin (home bike)', 40, 'easy', false],
          ['PM', 'muaythai', 'Muay Thai class (7–8:30)', 90, 'hard', true]],
      6: [['AM', 'run', 'Tempo run', 30, 'moderate', false, '10′ easy, 3×5′ comfortably hard (Z3–4), easy cooldown.'],
          ['PM', ...L('full'), 60, 'hard', true]],
      0: workSunday ? [['AM', 'mobility', 'Mobility + core', 20, 'easy', false]]
                    : [['AM', 'swim', 'Swim + easy run', 60, 'easy', false, '30′ swim, then 25′ easy run.']],
    },
    camp: {
      1: [['AM', ...L('upper'), 45, 'moderate', true]],
      2: [['AM', 'conditioning', 'Fight intervals (run)', 35, 'hard', true, '10′ warmup, 6×3′ hard / 1′ walk (mimics rounds).'],
          ['PM', 'muaythai', 'Muay Thai class — sparring (6–7)', 60, 'hard', true]],
      3: [['AM', ...L('lower'), 45, 'moderate', true],
          ['AM', 'muaythai', 'Pads / clinch session', 45, 'hard', true]],
      4: [['AM', 'swim', 'Recovery swim', 25, 'easy', false, 'Very easy. Flush the legs.'],
          ['PM', 'muaythai', 'Muay Thai class (6–7)', 60, 'hard', true]],
      5: [['AM', 'mobility', 'Mobility + neck/core', 20, 'easy', false],
          ['PM', 'muaythai', 'Muay Thai class — sparring (7–8:30)', 90, 'hard', true]],
      6: [['AM', 'run', 'Easy run', 30, 'easy', false],
          ['PM', 'muaythai', 'Technique + bag (solo)', 45, 'moderate', false, '6×3′ bag rounds, 1′ rest, then 3 rounds shadow focusing on your game plan.']],
      0: workSunday ? [['AM', 'mobility', 'Recovery walk + stretch', 30, 'easy', false]]
                    : [['AM', 'bike', 'Easy recovery ride', 45, 'easy', false]],
    },
    fightweek: {
      1: [['AM', 'muaythai', 'Light pads (sharpness)', 40, 'moderate', true]],
      2: [['AM', 'run', 'Shakeout jog', 20, 'easy', false], ['PM', 'muaythai', 'Light technique, no hard sparring', 45, 'moderate', true]],
      3: [['AM', 'mobility', 'Mobility', 20, 'easy', false]],
      4: [['PM', 'muaythai', 'Shadow + light pads', 30, 'easy', false]],
      5: [['AM', 'mobility', 'Walk + stretch — rest', 20, 'easy', false]],
      6: [['AM', 'mobility', 'Shadowbox 3 rounds, visualize', 15, 'easy', false]],
      0: [['AM', 'mobility', 'Rest', 0, 'easy', false]],
    },
    recovery: {
      2: [['AM', 'mobility', 'Easy walk', 30, 'easy', false]],
      4: [['AM', 'swim', 'Easy swim', 25, 'easy', false]],
      6: [['AM', 'bike', 'Easy spin', 30, 'easy', false]],
      0: [['AM', 'mobility', 'Easy walk', 30, 'easy', false]],
    },
    tri: {
      1: [['AM', 'swim', 'Swim — endurance', 45, 'moderate', true, 'Main set: 5×300 steady, 30s rest. Practice sighting.']],
      2: [['AM', 'bike', 'Long ride', 120, 'easy', true, 'Outdoors. Fuel 60–90 g carbs/hr. Last 20′ at race effort.'],
          ['AM', 'run', 'Brick run off the bike', 20, 'moderate', true]],
      3: [['AM', ...L('full'), 50, 'moderate', true],
          ['AM', 'run', 'Run intervals', 45, 'hard', true, '15′ easy, 5×4′ at 10K effort / 2′ jog, cooldown.']],
      4: [['AM', 'bike', 'Bike — sweet spot', 60, 'moderate', true, '3×12′ at 88–92% FTP (hard but steady).'],
          ['PM', 'muaythai', 'Muay Thai class (6–7)', 60, 'moderate', false]],
      5: [['AM', 'swim', 'Swim — speed', 40, 'hard', false, '10×100 hard, 20s rest.'],
          ['PM', 'muaythai', 'Muay Thai class (7–8:30)', 90, 'moderate', false]],
      6: [['AM', 'run', 'Easy run', 40, 'easy', false],
          ['PM', ...L('full2'), 45, 'moderate', false]],
      0: workSunday ? [['AM', 'swim', 'Open water / easy swim', 30, 'easy', false, 'Open water only with a buddy.']]
                    : [['AM', 'run', 'Long run (Zone 2)', 70, 'easy', true, 'Build toward 10–11 mi max. Knee check.']],
    },
  };
  T.peak = T.tri;
  T.taper = T.tri;
  T.off = { 2: [['AM', 'muaythai', 'Muay Thai — for fun', 60, 'moderate', false]], 4: [['AM', ...L('full'), 50, 'moderate', false]] };
  return (T[phaseId] && T[phaseId][dow]) || [];
}

// ---------- plan generation ----------
function isWorkSunday(k) {
  const weeks = Math.floor(diffDays(k, S.settings.offSundayAnchor) / 7);
  return Math.abs(weeks) % 2 === 1;
}
function weekMultiplier(k) {
  // adapts endurance volume from the previous week's completion + RPE
  const prevMon = addDays(mondayOf(k), -7);
  const sessions = [];
  for (let i = 0; i < 7; i++) sessions.push(...baseSessions(addDays(prevMon, i)));
  const past = sessions.filter((s) => s.date < todayKey());
  if (past.length < 3) return { mult: 1, why: 'Not enough history yet' };
  const done = past.filter((s) => S.logs[s.id] && S.logs[s.id].status === 'done');
  const completion = done.length / past.length;
  const rpes = done.map((s) => +S.logs[s.id].rpe).filter(Boolean);
  const avg = rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 7;
  if (completion < 0.7 || avg > 8.5) return { mult: 0.85, why: `Last week: ${Math.round(completion * 100)}% done, RPE ${avg.toFixed(1)} → −15%` };
  if (completion >= 0.9 && avg <= 6.5) return { mult: 1.05, why: `Last week: ${Math.round(completion * 100)}% done, RPE ${avg.toFixed(1)} → +5%` };
  return { mult: 1, why: `Last week: ${Math.round(completion * 100)}% done, RPE ${avg.toFixed(1)} → hold` };
}
const mmCache = {};
function cachedMult(k) { const m = mondayOf(k); return (mmCache[m] ||= weekMultiplier(m)); }

function baseSessions(k) {
  const ph = phaseOf(k);
  const dow = fromKey(k).getDay();
  const weekIdx = Math.floor(diffDays(k, mondayOf(ph.start)) / 7);
  const totalWeeks = Math.max(1, Math.ceil((diffDays(ph.end, ph.start) + 1) / 7));
  const deload = ['base', 'prep', 'camp', 'tri'].includes(ph.id) && weekIdx % 4 === 3;
  const progress = Math.min(1, weekIdx / totalWeeks);
  return template(ph.id, dow, isWorkSunday(k)).map((t, i) => {
    let [slot, type, title, minutes, intensity, key, details] = t;
    let lifts = null;
    if (type === 'lift') {
      const day = (LIFT_DAYS[ph.id] || LIFT_DAYS[ph.id === 'peak' || ph.id === 'taper' || ph.id === 'off' ? 'tri' : 'base'])[title]
        || LIFT_DAYS.tri.full;
      lifts = day.lifts.map(([name, scheme]) => ({ name, scheme }));
      details = day.acc; title = day.title;
    } else if (type !== 'muaythai' && type !== 'mobility') {
      // endurance grows across the block (+40% for runs is capped by the knee rule below)
      const growth = type === 'run' ? 0.3 : 0.5;
      minutes = minutes * (1 + growth * progress);
      if (ph.id === 'peak') minutes *= 1.15;
      if (ph.id === 'taper') minutes *= Math.max(0.4, 1 - diffDays(k, ph.start) / 14);
    }
    if (deload) minutes *= 0.7;
    return { id: `${k}#${i}`, date: k, slot, type, title, minutes: Math.round(minutes / 5) * 5, intensity, key, details: details || '', lifts, deload };
  });
}

function sessionsFor(k) {
  // apply moves, week multiplier, readiness
  const out = [];
  const range = [-10, 10];
  for (let d = range[0]; d <= range[1]; d++) {
    const src = addDays(k, d);
    for (const s of baseSessions(src)) {
      const target = S.moves[s.id] || s.date;
      if (target === k) out.push({ ...s, date: k, movedFrom: S.moves[s.id] ? s.date : null });
    }
  }
  const wm = cachedMult(k);
  const r = readinessScore(k);
  const knee = S.readiness[k] && +S.readiness[k].knee >= 4;
  return out.map((s) => {
    const x = { ...s, notes: [] };
    if (!['lift', 'muaythai', 'mobility'].includes(x.type) && wm.mult !== 1) {
      x.minutes = Math.round((x.minutes * wm.mult) / 5) * 5; x.notes.push(wm.why);
    }
    if (knee && (x.type === 'run' || x.type === 'conditioning')) {
      x.type = 'bike'; x.title = x.title.replace(/run/i, 'ride') + ' (swapped: knee)';
      x.notes.push('Knee pain ≥4: run swapped for bike at the same effort.');
    }
    if (r !== null && r < 45) {
      x.intensity = 'easy'; x.minutes = Math.round((x.minutes * 0.6) / 5) * 5;
      if (x.type === 'muaythai') x.title += ' — technique only, no sparring';
      x.notes.push('Very low readiness: easy/technique only.');
    } else if (r !== null && r < 60 && x.intensity === 'hard') {
      x.intensity = 'moderate'; x.minutes = Math.round((x.minutes * 0.75) / 5) * 5;
      x.notes.push('Low readiness: dropped hard → moderate, −25%.');
    }
    const o = S.overrides[x.id];
    if (o) {
      if (o.drop) return null;
      for (const f of ['title', 'minutes', 'intensity', 'details']) if (o[f] !== undefined && o[f] !== null && o[f] !== '') x[f] = o[f];
      x.notes.push('🤖 Coach: ' + (o.reason || 'adjusted'));
    }
    return x;
  }).filter(Boolean).sort((a, b) => a.slot.localeCompare(b.slot));
}

function readinessScore(k) {
  const r = S.readiness[k]; if (!r) return null;
  const sleep = Math.min(1, Math.max(0, (+r.sleep - 4) / 4)); // 4h→0, 8h→1
  const energy = (+r.energy - 1) / 4, sore = (5 - +r.soreness) / 4;
  return Math.round(100 * (0.5 * sleep + 0.3 * energy + 0.2 * sore));
}

function rescheduleTarget(s) {
  // next day in the next 6 with the least planned minutes and no hard session
  let best = null;
  for (let d = 1; d <= 6; d++) {
    const k = addDays(s.date, d);
    const day = sessionsFor(k);
    const load = day.reduce((a, b) => a + b.minutes, 0) + (day.some((x) => x.intensity === 'hard') ? 60 : 0);
    if (!best || load < best.load) best = { k, load };
  }
  return best.k;
}

// ---------- nutrition ----------
function latestWeight(k = todayKey()) {
  const ks = Object.keys(S.weights).filter((x) => x <= k).sort();
  return ks.length ? +S.weights[ks[ks.length - 1]] : 160;
}
function avgWeight(k, days = 7) {
  const v = []; for (let i = 0; i < days; i++) { const w = S.weights[addDays(k, -i)]; if (w) v.push(+w); }
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function nutritionTargets(k) {
  const bw = latestWeight(k), ph = phaseOf(k).id;
  const mins = sessionsFor(k).reduce((a, s) => a + s.minutes, 0);
  let cal = bw * 15 + mins * 9;
  if (ph === 'base' || ph === 'prep') cal += 250;
  if ((ph === 'camp' || ph === 'fightweek') && bw > S.settings.fightWeight) cal -= 300;
  const protein = Math.round(bw), fat = Math.round(bw * 0.35);
  cal = Math.round(cal / 50) * 50;
  const carbs = Math.max(100, Math.round((cal - protein * 4 - fat * 9) / 4));
  return { cal, protein, fat, carbs, mins };
}

// ---------- rendering ----------
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON = { lift: '🏋️', muaythai: '🥊', swim: '🏊', bike: '🚴', run: '🏃', conditioning: '🔥', mobility: '🧘', brick: '🔁' };
let view = 'today', cursor = todayKey();

function render() {
  for (const k in mmCache) delete mmCache[k];
  document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  const el = $('#main');
  if (view === 'today') el.innerHTML = renderDay(cursor);
  if (view === 'week') el.innerHTML = renderWeek(cursor);
  if (view === 'body') el.innerHTML = renderBody();
  if (view === 'progress') el.innerHTML = renderProgress();
  if (view === 'settings') el.innerHTML = renderSettings();
  if (view === 'coach') el.innerHTML = renderCoach();
}

function countdowns(k) {
  const f = diffDays(S.settings.fightDate, k), r = diffDays(S.settings.raceDate, k);
  return `<div class="pills">${f >= 0 ? `<span class="pill">🥊 Fight in ${f}d</span>` : ''}${r >= 0 ? `<span class="pill">🏁 70.3 in ${r}d</span>` : ''}</div>`;
}

function renderDay(k) {
  const ph = phaseOf(k), sessions = sessionsFor(k), r = S.readiness[k] || {}, score = readinessScore(k);
  const nt = nutritionTargets(k), food = S.food[k] || {};
  return `
  <div class="daynav"><button onclick="go(-1)">‹</button><div><h2>${fmt(k)}</h2><small>${esc(ph.name)}${sessions[0] && sessions[0].deload ? ' · deload week' : ''}</small></div><button onclick="go(1)">›</button></div>
  ${countdowns(k)}
  <section class="card">
    <h3>Morning check-in ${score !== null ? `<span class="score ${score < 45 ? 'bad' : score < 60 ? 'mid' : 'good'}">${score}</span>` : ''}</h3>
    <div class="grid4">
      <label>Sleep (h)<input type="number" step="0.5" id="r-sleep" value="${r.sleep ?? ''}"></label>
      <label>Energy 1–5<input type="number" min="1" max="5" id="r-energy" value="${r.energy ?? ''}"></label>
      <label>Soreness 1–5<input type="number" min="1" max="5" id="r-soreness" value="${r.soreness ?? ''}"></label>
      <label>Knee 0–10<input type="number" min="0" max="10" id="r-knee" value="${r.knee ?? ''}"></label>
    </div>
    <button class="primary" onclick="saveReadiness('${k}')">Save check-in</button>
    ${r.sleep && +r.sleep < 7 ? '<p class="warn">Under 7 h sleep. Aim for 7.5–8 h, it is your biggest recovery lever.</p>' : ''}
  </section>
  ${sessions.length ? sessions.map(renderSession).join('') : '<section class="card"><h3>Rest day 😴</h3><p>Walk, stretch, eat, sleep.</p></section>'}
  <section class="card">
    <h3>Fuel targets</h3>
    <p class="big">${nt.cal} kcal · ${nt.protein}g P · ${nt.carbs}g C · ${nt.fat}g F</p>
    <div class="grid2">
      <label>Calories eaten<input type="number" id="f-cal" value="${food.cal ?? ''}"></label>
      <label>Protein (g)<input type="number" id="f-protein" value="${food.protein ?? ''}"></label>
    </div>
    <label>Bodyweight (lb)<input type="number" step="0.1" id="f-bw" value="${S.weights[k] ?? ''}"></label>
    <button onclick="saveFood('${k}')">Save</button>
  </section>`;
}

function renderSession(s) {
  const log = S.logs[s.id] || {};
  const lifts = s.lifts ? `<table class="lifts">${s.lifts.map((l) => {
    const w = liftWeight(l.name, l.scheme), lw = (log.lifts || {})[l.name] || {};
    return `<tr><td>${esc(l.name)}</td><td>${l.scheme.replace('x', '×')}</td><td><input type="number" step="2.5" data-lift="${esc(l.name)}" data-scheme="${l.scheme}" value="${lw.weight ?? w}"> lb</td>
      <td><label class="chk"><input type="checkbox" data-hit="${esc(l.name)}" ${lw.hit ? 'checked' : ''}> all reps</label></td></tr>`;
  }).join('')}</table>` : '';
  return `
  <section class="card session ${log.status || ''} ${s.intensity}" id="s-${s.id}">
    <div class="shead"><span class="icon">${ICON[s.type] || '•'}</span>
      <div><h3>${esc(s.title)}</h3><small>${s.slot} · ${s.minutes}′ · ${s.intensity}${s.key ? ' · <b>key</b>' : ''}${s.movedFrom ? ` · moved from ${fmt(s.movedFrom)}` : ''}</small></div>
      ${log.status ? `<span class="status">${log.status === 'done' ? '✅' : '⏭️'}</span>` : ''}</div>
    ${s.details ? `<p>${esc(s.details)}</p>` : ''}
    ${s.notes.map((n) => `<p class="note">↻ ${esc(n)}</p>`).join('')}
    ${lifts}
    <div class="logrow">
      <label>RPE<input type="number" min="1" max="10" class="rpe" value="${log.rpe ?? ''}"></label>
      <label>Minutes<input type="number" class="mins" value="${log.minutes ?? s.minutes}"></label>
    </div>
    <input type="text" class="notes" placeholder="Notes (or paste Strava link)" value="${esc(log.notes || '')}">
    <div class="btns">
      <button class="primary" onclick="logSession('${s.id}','done')">Done</button>
      <button onclick="logSession('${s.id}','skipped')">Skipped</button>
      ${s.key && log.status !== 'done' ? `<button onclick="moveSession('${s.id}')">Reschedule</button>` : ''}
    </div>
  </section>`;
}

function renderWeek(k) {
  const mon = mondayOf(k), wm = cachedMult(mon);
  let html = `<div class="daynav"><button onclick="go(-7)">‹</button><div><h2>Week of ${fmt(mon)}</h2><small>${esc(phaseOf(mon).name)} · ${esc(wm.why)}</small></div><button onclick="go(7)">›</button></div>${countdowns(k)}`;
  let tot = { lift: 0, muaythai: 0, swim: 0, bike: 0, run: 0, conditioning: 0, mobility: 0 };
  for (let i = 0; i < 7; i++) {
    const d = addDays(mon, i), ss = sessionsFor(d);
    ss.forEach((s) => (tot[s.type] = (tot[s.type] || 0) + s.minutes));
    html += `<section class="card day ${d === todayKey() ? 'today' : ''}" onclick="cursor='${d}';view='today';render()">
      <h3>${fmt(d)}${d.endsWith && fromKey(d).getDay() === 0 ? (isWorkSunday(d) ? ' · work' : ' · off') : ''}</h3>
      ${ss.map((s) => `<div class="row ${(S.logs[s.id] || {}).status || ''}">${ICON[s.type]} <span>${s.slot}</span> ${esc(s.title)} <small>${s.minutes}′</small></div>`).join('') || '<div class="row">Rest</div>'}
    </section>`;
  }
  const hrs = Object.values(tot).reduce((a, b) => a + b, 0) / 60;
  html += `<section class="card"><h3>Week total: ${hrs.toFixed(1)} h</h3><p>${Object.entries(tot).filter(([, v]) => v).map(([t, v]) => `${ICON[t]} ${Math.round(v)}′`).join(' · ')}</p></section>`;
  return html;
}

function sparkline(points, h = 120) {
  if (points.length < 2) return '<p>Log at least 2 weigh-ins to see a trend.</p>';
  const ys = points.map((p) => p[1]), min = Math.min(...ys) - 1, max = Math.max(...ys) + 1, w = 320;
  const xy = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p[1] - min) / (max - min)) * h}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" class="spark" role="img" aria-label="Bodyweight trend"><polyline points="${xy}" fill="none" stroke="currentColor" stroke-width="2"/></svg>
    <small>${min + 1} – ${max - 1} lb</small>`;
}

function renderBody() {
  const ks = Object.keys(S.weights).sort(), t = todayKey();
  const a7 = avgWeight(t), a7prev = avgWeight(addDays(t, -7));
  const rate = a7 && a7prev ? a7 - a7prev : null;
  const pts = ks.slice(-60).map((k) => [k, +S.weights[k]]);
  const toGo = a7 ? a7 - S.settings.fightWeight : null;
  return `<h2>Body & fuel</h2>
  <section class="card"><h3>Bodyweight</h3>
    <p class="big">${a7 ? a7.toFixed(1) + ' lb (7-day avg)' : 'No data yet'}</p>
    ${rate !== null ? `<p>${rate >= 0 ? '+' : ''}${rate.toFixed(2)} lb/week</p>` : ''}
    ${toGo !== null ? `<p>Fight-weight target ${S.settings.fightWeight} lb: ${toGo > 0 ? toGo.toFixed(1) + ' lb above' : 'on target ✅'}</p>` : ''}
    ${sparkline(pts)}
  </section>
  <section class="card"><h3>Last 7 days of food</h3><table class="lifts">
    ${[...Array(7)].map((_, i) => { const d = addDays(t, -i), f = S.food[d] || {}, nt = nutritionTargets(d);
      return `<tr><td>${fmt(d)}</td><td>${f.cal ?? '–'} / ${nt.cal} kcal</td><td>${f.protein ?? '–'} / ${nt.protein} g P</td></tr>`; }).join('')}
  </table></section>`;
}

function renderProgress() {
  const names = Object.keys(S.lifts).sort();
  const t = todayKey(), mon = mondayOf(t);
  let done = 0, total = 0;
  for (let i = -28; i < 0; i++) { for (const s of sessionsFor(addDays(t, i))) { total++; if ((S.logs[s.id] || {}).status === 'done') done++; } }
  return `<h2>Progress</h2>
  <section class="card"><h3>Last 4 weeks</h3><p class="big">${total ? Math.round((100 * done) / total) : 0}% sessions completed (${done}/${total})</p></section>
  <section class="card"><h3>Working weights</h3><table class="lifts">
    ${names.map((n) => { const [name, sc] = n.split('|'); return `<tr><td>${esc(name)}</td><td>${sc.replace('x', '×')}</td><td>${S.lifts[n].weight} lb</td><td>${S.lifts[n].fails ? '⚠️ ' + S.lifts[n].fails + ' miss' : ''}</td></tr>`; }).join('') || '<tr><td>Log a lift session to start.</td></tr>'}
  </table><p class="note">Hit all reps at RPE ≤8 → +5 lb lower / +2.5 lb upper. 2 misses in a row → −10%.</p></section>
  <section class="card"><h3>Season</h3>${phases().filter((p) => p.id !== 'off').map((p) => `<div class="row ${t >= p.start && t <= p.end ? 'current' : ''}"><b>${esc(p.name)}</b> <small>${fmt(p.start)} → ${fmt(p.end)}</small></div>`).join('')}</section>`;
}

function renderSettings() {
  const st = S.settings;
  return `<h2>Settings</h2>
  <section class="card">
    <label>Plan start<input type="date" id="st-start" value="${st.startDate}"></label>
    <label>Fight date<input type="date" id="st-fight" value="${st.fightDate}"></label>
    <label>70.3 race date<input type="date" id="st-race" value="${st.raceDate}"></label>
    <label>A Sunday you have OFF<input type="date" id="st-sun" value="${st.offSundayAnchor}"></label>
    <label>Fight-weight target (lb)<input type="number" id="st-fw" value="${st.fightWeight}"></label>
    <h3>Estimated 1-rep maxes (lb)</h3>
    ${Object.entries(st.oneRM).map(([n, v]) => `<label>${esc(n)}<input type="number" data-orm="${esc(n)}" value="${v}"></label>`).join('')}
    <button class="primary" onclick="saveSettings()">Save settings</button>
  </section>
  <section class="card"><h3>Claude coach</h3>
    <p>Paste your Anthropic API key (console.anthropic.com → API Keys). It's saved only on this device and is never included in exports.</p>
    <input type="password" id="st-key" placeholder="sk-ant-..." value="${esc(getKey())}">
    <div class="btns"><button onclick="saveKey()">Save key</button><button onclick="clearKey()">Remove key</button></div>
  </section>
  <section class="card"><h3>Backup</h3>
    <p>Data is stored only on this phone/browser. Export a backup regularly.</p>
    <div class="btns"><button onclick="exportData()">Export</button><label class="btnlike">Import<input type="file" accept=".json" onchange="importData(this)" hidden></label>
    <button class="danger" onclick="resetData()">Reset</button></div>
  </section>`;
}

// ---------- actions ----------
function go(n) { cursor = addDays(cursor, n); render(); }
function saveReadiness(k) {
  const v = (id) => $(id).value;
  S.readiness[k] = { sleep: v('#r-sleep'), energy: v('#r-energy') || 3, soreness: v('#r-soreness') || 3, knee: v('#r-knee') || 0 };
  save(); render();
}
function saveFood(k) {
  S.food[k] = { cal: $('#f-cal').value || undefined, protein: $('#f-protein').value || undefined };
  const bw = $('#f-bw').value; if (bw) S.weights[k] = +bw; else delete S.weights[k];
  save(); render();
}
function logSession(id, status) {
  const card = document.getElementById('s-' + id);
  const rpe = +card.querySelector('.rpe').value || null;
  const prev = S.logs[id];
  const log = { status, rpe, minutes: +card.querySelector('.mins').value || null, notes: card.querySelector('.notes').value };
  const liftInputs = card.querySelectorAll('[data-lift]');
  if (liftInputs.length && status === 'done') {
    log.lifts = {};
    liftInputs.forEach((inp) => {
      const name = inp.dataset.lift, scheme = inp.dataset.scheme;
      const hit = card.querySelector(`[data-hit="${CSS.escape(name)}"]`).checked;
      log.lifts[name] = { weight: +inp.value, hit };
      if (!prev || prev.status !== 'done') { // progress only once per session
        S.lifts[`${name}|${scheme}`] = { ...(S.lifts[`${name}|${scheme}`] || { fails: 0 }), weight: +inp.value };
        progressLift(name, scheme, hit, rpe);
      }
    });
  }
  S.logs[id] = log; save(); render();
}
function moveSession(id) {
  const s = sessionsFor(cursor).find((x) => x.id === id) || baseSessions(id.split('#')[0]).find((x) => x.id === id);
  const target = rescheduleTarget({ ...s, date: cursor });
  if (confirm(`Move "${s.title}" to ${fmt(target)}?`)) { S.moves[id] = target; save(); render(); }
}
function saveSettings() {
  const st = S.settings;
  st.startDate = $('#st-start').value; st.fightDate = $('#st-fight').value; st.raceDate = $('#st-race').value;
  st.offSundayAnchor = $('#st-sun').value; st.fightWeight = +$('#st-fw').value;
  document.querySelectorAll('[data-orm]').forEach((i) => (st.oneRM[i.dataset.orm] = +i.value));
  save(); alert('Saved'); render();
}
function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = `iron-backup-${todayKey()}.json`; a.click();
}
function importData(input) {
  const f = input.files[0]; if (!f) return;
  f.text().then((t) => { try { S = { ...structuredClone(DEFAULTS), ...JSON.parse(t) }; save(); render(); alert('Imported'); } catch (e) { alert('Bad file'); } });
}
function resetData() { if (confirm('Delete ALL data on this device?')) { S = structuredClone(DEFAULTS); save(); render(); } }

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view; if (view === 'today') cursor = cursor || todayKey(); render(); }));
  render();
});

// ---------- Claude coach ----------
// Calls the Claude API directly from the browser with your own key (personal use only).
const KEY_STORE = 'iron-apikey';
const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.133.0/+esm';
function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
function saveKey() { try { localStorage.setItem(KEY_STORE, $('#st-key').value.trim()); alert('Key saved on this device'); } catch (e) { alert(e.message); } }
function clearKey() { try { localStorage.removeItem(KEY_STORE); } catch (e) { /* ignore */ } render(); }

const COACH_SYSTEM = `You are the personal coach for a 20-year-old male hybrid athlete (5'7", ~160 lb) who works 40-50 h/week.
Priorities, in order: 1) win his first amateur Muay Thai fight, 2) build muscle, 3) finish IRONMAN 70.3 Musselman in an average time.
History: 6 months Muay Thai, 5 years lifting, 5K ~27:00, torn meniscus ~4 years ago (protect the knee), sleeps ~6 h (push him toward 7.5-8 h).
Muay Thai classes: Tue 6-7 PM, Thu 6-7 PM, Fri 7-8:30 PM. Work: Sun 10-5 (alternate weeks), Mon 9-8, Wed 12-8, Thu 9-5, Fri 9-6, Sat 9-6, Tue off.
You receive his recent logs and upcoming plan as JSON. Give specific, practical coaching: what went well, what to change, and why.
Only propose adjustments to upcoming sessions (today or later) using session ids that appear in "upcoming". Keep adjustments few and purposeful; it's fine to propose none.
If he reports pain beyond normal soreness, a possible concussion, or illness, tell him to rest and see a doctor or physio.
Keep the message under 250 words, plain text, friendly and direct.`;

const COACH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['message', 'adjustments'],
  properties: {
    message: { type: 'string' },
    adjustments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sessionId', 'action', 'reason', 'title', 'minutes', 'intensity', 'details', 'moveTo'],
        properties: {
          sessionId: { type: 'string' },
          action: { type: 'string', enum: ['modify', 'drop', 'move'] },
          reason: { type: 'string' },
          title: { type: 'string', description: 'New title, or empty to keep' },
          minutes: { type: 'integer', description: 'New duration, or 0 to keep' },
          intensity: { type: 'string', enum: ['', 'easy', 'moderate', 'hard'] },
          details: { type: 'string', description: 'New details, or empty to keep' },
          moveTo: { type: 'string', description: 'YYYY-MM-DD for move, else empty' },
        },
      },
    },
  },
};

function coachContext() {
  const t = todayKey(), recent = [], upcoming = [];
  for (let i = -14; i < 0; i++) {
    const d = addDays(t, i);
    for (const s of sessionsFor(d)) {
      const l = S.logs[s.id] || {};
      recent.push({ date: d, title: s.title, type: s.type, planned: s.minutes, intensity: s.intensity, key: s.key, status: l.status || 'not logged', rpe: l.rpe, minutes: l.minutes, notes: l.notes, lifts: l.lifts });
    }
  }
  for (let i = 0; i < 10; i++) {
    const d = addDays(t, i);
    for (const s of sessionsFor(d)) upcoming.push({ id: s.id, date: d, title: s.title, type: s.type, minutes: s.minutes, intensity: s.intensity, key: s.key, details: s.details });
  }
  const days = (obj) => Object.fromEntries(Object.entries(obj).filter(([k]) => k >= addDays(t, -14)));
  return {
    today: t, phase: phaseOf(t).name, fightDate: S.settings.fightDate, raceDate: S.settings.raceDate, fightWeightTarget: S.settings.fightWeight,
    readiness: days(S.readiness), bodyweight: days(S.weights), food: days(S.food), nutritionTargetToday: nutritionTargets(t),
    workingWeights: S.lifts, recent, upcoming,
    previousCoachNotes: S.coach.slice(-3).map((c) => ({ at: c.at, question: c.q, answer: c.a })),
  };
}

let coachBusy = false, coachPending = null;
async function askCoach(weekly) {
  const key = getKey();
  if (!key) { alert('Add your API key in Settings first.'); return; }
  const q = weekly ? 'Do my weekly review: how did the last 2 weeks go, and adjust the next few days if needed.' : $('#coach-q').value.trim();
  if (!q) return;
  coachBusy = true; render();
  try {
    const { default: Anthropic } = await import(SDK_URL);
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: COACH_SCHEMA } },
      system: COACH_SYSTEM,
      messages: [{ role: 'user', content: `My data:\n${JSON.stringify(coachContext())}\n\nMy question: ${q}` }],
    });
    if (response.stop_reason === 'refusal') throw new Error('Claude declined this request. Try rephrasing.');
    if (response.stop_reason === 'max_tokens') throw new Error('The reply was cut off. Try again.');
    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const out = JSON.parse(text);
    const ids = new Set(coachContext().upcoming.map((u) => u.id));
    coachPending = (out.adjustments || []).filter((a) => ids.has(a.sessionId));
    S.coach.push({ at: new Date().toISOString(), q, a: out.message });
    S.coach = S.coach.slice(-20); save();
  } catch (e) {
    const status = e && e.status;
    alert(status === 401 ? 'API key was rejected. Check it in Settings.' : status === 429 ? 'Rate limited or out of credits. Try again later.' : 'Coach error: ' + (e.message || e));
  } finally { coachBusy = false; render(); }
}

function applyAdjustment(i) {
  const a = coachPending[i];
  if (a.action === 'move' && /^\d{4}-\d{2}-\d{2}$/.test(a.moveTo)) S.moves[a.sessionId] = a.moveTo;
  else if (a.action === 'drop') S.overrides[a.sessionId] = { drop: true, reason: a.reason };
  else S.overrides[a.sessionId] = { title: a.title, minutes: a.minutes || undefined, intensity: a.intensity, details: a.details, reason: a.reason };
  coachPending.splice(i, 1); save(); render();
}
function undoCoach() { if (confirm('Remove all coach adjustments?')) { S.overrides = {}; save(); render(); } }

function renderCoach() {
  const last = S.coach[S.coach.length - 1];
  const sessionName = (id) => { const d = id.split('#')[0]; const s = sessionsFor(d).find((x) => x.id === id) || baseSessions(d).find((x) => x.id === id); return s ? `${fmt(d)}: ${s.title}` : id; };
  return `<h2>Coach 🤖</h2>
  ${getKey() ? '' : '<section class="card"><p class="warn">Add your Anthropic API key in Settings to use the coach.</p></section>'}
  <section class="card">
    <button class="primary" ${coachBusy ? 'disabled' : ''} onclick="askCoach(true)">${coachBusy ? 'Thinking…' : 'Weekly review'}</button>
    <label>Or ask anything (e.g. "my shin is bruised from sparring" or "work is slammed this week")
      <textarea id="coach-q" rows="3"></textarea></label>
    <button ${coachBusy ? 'disabled' : ''} onclick="askCoach(false)">Ask</button>
  </section>
  ${last ? `<section class="card"><h3>Latest advice</h3><small>${new Date(last.at).toLocaleString()} · "${esc(last.q)}"</small><p style="white-space:pre-wrap">${esc(last.a)}</p></section>` : ''}
  ${coachPending && coachPending.length ? `<section class="card"><h3>Suggested changes</h3>${coachPending.map((a, i) => `
    <div class="row"><b>${a.action}</b> ${esc(sessionName(a.sessionId))}${a.action === 'move' ? ' → ' + esc(a.moveTo) : ''}${a.action === 'modify' ? ` → ${esc(a.title || '')} ${a.minutes ? a.minutes + '′' : ''} ${esc(a.intensity || '')}` : ''}
    <br><small>${esc(a.reason)}</small><br><button class="primary" onclick="applyAdjustment(${i})">Apply</button></div>`).join('')}</section>` : ''}
  ${Object.keys(S.overrides).length ? `<section class="card"><p>${Object.keys(S.overrides).length} coach adjustment(s) active.</p><button onclick="undoCoach()">Undo all coach changes</button></section>` : ''}
  <p class="note">Each request costs roughly a few cents on your Anthropic account.</p>`;
}
