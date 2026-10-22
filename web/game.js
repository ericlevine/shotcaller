(() => {
'use strict';

/* =========================================================
   Geometry, map, constants
   ========================================================= */
const WORLD = 2400;
const TAU = Math.PI * 2;
const LANES = ['top', 'mid', 'bot'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = a => a[Math.floor(Math.random() * a.length)];
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

const FOUNT = [{x:135,y:2265},{x:2265,y:135}];
const ANC_POS = [{x:240,y:2160},{x:2160,y:240}];
// lane polylines, radiant end first
const LANE_PATH = {
  top: [{x:300,y:2040},{x:300,y:300},{x:2100,y:300}],
  mid: [{x:360,y:2040},{x:2040,y:360}],
  bot: [{x:360,y:2100},{x:2100,y:2100},{x:2100,y:360}],
};
const LG = {};
for (const l of LANES) {
  const pts = LANE_PATH[l]; const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i-1] + dist(pts[i-1], pts[i]));
  LG[l] = {pts, acc, len: acc[acc.length-1]};
}
function projLane(l, p) {
  const {pts, acc, len} = LG[l]; let bd = 1e9, bs = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i+1], vx = b.x - a.x, vy = b.y - a.y, L2 = vx*vx + vy*vy;
    const t = clamp(((p.x-a.x)*vx + (p.y-a.y)*vy) / L2, 0, 1);
    const d = Math.hypot(a.x + vx*t - p.x, a.y + vy*t - p.y);
    if (d < bd) { bd = d; bs = acc[i] + t * Math.sqrt(L2); }
  }
  return {d: bd, t: bs / len};
}
function lanePoint(l, t) {
  const {pts, acc, len} = LG[l]; const s = clamp(t, 0, 1) * len;
  for (let i = 0; i < pts.length - 1; i++) {
    if (s <= acc[i+1] || i === pts.length - 2) {
      const f = (s - acc[i]) / (acc[i+1] - acc[i]);
      return {x: pts[i].x + (pts[i+1].x - pts[i].x) * f, y: pts[i].y + (pts[i+1].y - pts[i].y) * f};
    }
  }
}
function laneOf(p, maxD = 260) {
  let best = null, bd = maxD;
  for (const l of LANES) { const d = projLane(l, p).d; if (d < bd) { bd = d; best = l; } }
  return best;
}
// radiant tower layout; dire is the point reflection through the map centre (top <-> bot)
const TOWER_DEF = [
  {lane:'top',tier:1,x:300,y:1150},{lane:'top',tier:2,x:300,y:1700},
  {lane:'mid',tier:1,x:950,y:1450},{lane:'mid',tier:2,x:660,y:1740},
  {lane:'bot',tier:1,x:1250,y:2100},{lane:'bot',tier:2,x:700,y:2100},
];
const MIRROR_LANE = {top:'bot', mid:'mid', bot:'top'};

const KITS = {
  tank:   {role:'Tank · initiator', melee:true, hp:[720,95], mp:[250,26], dmg:[50,3.5], armor:[4,.45], range:75,  atk:1.35, spd:150,
           q:{name:'Charge', cd:10, cost:80, range:450, desc:'dashes onto an enemy hero within 450, stunning it for 1.2s'},
           r:{name:'Earthquake', cd:45, cost:150, radius:230, desc:'stuns and damages every enemy within 230 of him for 1.6s'}},
  mage:   {role:'Mage · burst', hp:[520,62], mp:[420,48], dmg:[42,2.2], armor:[1,.3], range:300, atk:1.6, spd:146,
           q:{name:'Fireball', cd:7, cost:90, range:520, radius:130, desc:'area blast at range 520, good on heroes and creep waves'},
           r:{name:'Meteor', cd:50, cost:200, range:620, radius:210, desc:'huge delayed area blast at range 620 that also stuns'}},
  carry:  {role:'Carry · marksman', hp:[560,72], mp:[220,22], dmg:[48,5.5], armor:[2,.55], range:290, atk:1.3, spd:148,
           q:{name:'Volley', cd:8, cost:60, desc:'shoots up to 4 enemies in range at once'},
           r:{name:'Deadeye', cd:40, cost:120, desc:'6s of double attack speed and +30% damage'}},
  support:{role:'Support · healer', hp:[540,66], mp:[380,42], dmg:[38,2], armor:[2,.3], range:270, atk:1.5, spd:150,
           q:{name:'Mend', cd:8, cost:80, range:500, desc:'heals the most hurt ally within 500'},
           r:{name:'Sanctuary', cd:55, cost:180, radius:520, desc:'heals every ally within 520 and cuts their damage taken by 40% for 4s'}},
};
const ROSTER = [
  {key:'brakka',team:0,name:'Brakka',kit:'tank',color:'#6fb3ff',lane:'top',aliases:['tank','big guy','bruiser','initiator','offlaner'],hear:['braka','bracka','brocka','barca','bracca','brakkah','rocka','braca'],persona:'gruff, loves starting fights, short sentences',voice:{pitch:.55,rate:1},acks:['On it.','Moving.','Hah. Going.'],build:['armor','armor','damage','regen','armor','damage']},
  {key:'lyra',team:0,name:'Lyra',kit:'mage',color:'#c49bff',lane:'mid',aliases:['mage','wizard','caster','nuker','midlaner'],hear:['lira','liar','lyre','laura','leera','lara','lyrah','leira'],persona:'confident and a little vain about her spells',voice:{pitch:1.25,rate:1.08},acks:['Fine.','On my way.','Watch this.'],build:['magic','regen','magic','armor','magic','armor']},
  {key:'vex',team:0,name:'Vex',kit:'carry',color:'#5fe0a8',lane:'bot',aliases:['carry','marksman','archer','adc','shooter','sniper'],hear:['vecks','vax','vets','vicks','vic','rex','vexx','fex'],persona:'cocky sharpshooter who guards his farm',voice:{pitch:1,rate:1.15},acks:['Copy.','Got it.','Sure thing.'],build:['damage','speed','damage','speed','damage','armor']},
  {key:'sola',team:0,name:'Sola',kit:'support',color:'#ffd27a',lane:'bot',aliases:['support','healer','medic','supp','sup'],hear:['sona','soula','soler','zola','sela','solah','soda'],persona:'calm, protective, dry humor',voice:{pitch:1.4,rate:1},acks:['Understood.','On it.','Right behind you.'],build:['regen','magic','armor','regen','armor','magic']},
  {key:'grukk',team:1,name:'Grukk',kit:'tank',color:'#ff9a76',lane:'bot',aliases:['their tank','enemy tank'],hear:['gruk','grook','crook','groke','grock'],persona:'',build:['armor','armor','damage','regen','armor','damage']},
  {key:'nyx',team:1,name:'Nyx',kit:'mage',color:'#ff7ab8',lane:'mid',aliases:['their mage','enemy mage','their mid','enemy mid'],hear:['nix','nicks','knicks','nyxx','niks'],persona:'',build:['magic','regen','magic','armor','magic','armor']},
  {key:'shade',team:1,name:'Shade',kit:'carry',color:'#ffbf5a',lane:'top',aliases:['their carry','enemy carry','their marksman'],hear:['shayde','shaid','shaded'],persona:'',build:['damage','speed','damage','speed','damage','armor']},
  {key:'morrow',team:1,name:'Morrow',kit:'support',color:'#e3d46e',lane:'top',aliases:['their support','enemy support','their healer'],hear:['marrow','morro','moro','marro'],persona:'',build:['regen','magic','armor','regen','armor','magic']},
];
const ITEMS = {
  damage:{label:'Blade', cost:450, dmg:14},
  armor: {label:'Plate', cost:450, armor:3.5, hp:150},
  speed: {label:'Gloves',cost:450, as:.16},
  magic: {label:'Focus', cost:450, amp:.12, mp:120},
  regen: {label:'Ring',  cost:300, regen:3},
};
const XP_NEED = [200,500,900,1400,2000,2700,3500,4400,5400,6500,7700];

/* =========================================================
   Game state
   ========================================================= */
let S, uid = 0;
const settings = {fast:true, batch:true, voice:true, open:false, diff:'normal'};
try { Object.assign(settings, JSON.parse(localStorage.getItem('shotcaller.settings') || '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem('shotcaller.settings', JSON.stringify(settings)); } catch {} };

function mk(o) {
  const u = Object.assign({id:++uid, alive:true, x:0, y:0, r:10, hp:100, maxHp:100, armor:0, dmg:10, range:40,
    atkTime:1, atkCd:0, speed:0, target:null, stun:0, shield:0, think:Math.random()*.25, face:0}, o);
  S.units.push(u); return u;
}
function newGame() {
  uid = 0;
  S = {t:0, units:[], projs:[], fx:[], pending:[], heroes:{}, kills:[0,0], over:null, nextWave:4, paused:false,
       speed:S ? S.speed : 1, feed:[], coachT:0, fountT:[0,0], selected:null, landmarks:[]};
  for (const team of [0,1]) {
    for (const d of TOWER_DEF) {
      const x = team ? WORLD - d.x : d.x, y = team ? WORLD - d.y : d.y;
      const lane = team ? MIRROR_LANE[d.lane] : d.lane;
      const hp = d.tier === 1 ? 1700 : 2100;
      mk({type:'tower', team, lane, tier:d.tier, x, y, r:22, hp, maxHp:hp, armor:10, dmg:115, range:245, atkTime:1, proj:true});
    }
    mk({type:'ancient', team, x:ANC_POS[team].x, y:ANC_POS[team].y, r:46, hp:4500, maxHp:4500, armor:12});
  }
  for (const R of ROSTER) {
    const h = mk({type:'hero', team:R.team, key:R.key, name:R.name, kit:R.kit, color:R.color, r:19, lvl:1, xp:0, gold:200,
      items:[], cd:{q:0, r:0}, buffs:{}, kills:0, deaths:0, lastHits:0, proj:!KITS[R.kit].melee,
      standing:{mode:'lane', lane:R.lane, aggression:'normal', focus:'any', ult:'auto'}, order:null, shop:null,
      build:[...R.build], retreating:false, castReq:null, say:'', sayT:-99, pending:0,
      statMult: R.team === 1 ? ({easy:.85, normal:1, hard:1.12})[settings.diff] : 1});
    h.x = FOUNT[h.team].x + (Math.random()-.5)*60; h.y = FOUNT[h.team].y + (Math.random()-.5)*60;
    recompute(h); h.hp = h.maxHp; h.mp = h.maxMp;
    S.heroes[R.key] = h;
  }
  buildLandmarks();
}
function buildLandmarks() {
  const L = S.landmarks = [];
  for (const u of S.units) if (u.type === 'tower')
    L.push({id:`${u.team?'their':'our'}_${u.lane}_t${u.tier}`, label:`${u.team?'their':'our'} ${u.lane} T${u.tier} tower`, x:u.x, y:u.y, unit:u});
  L.push({id:'our_base', label:'our base / fountain', ...FOUNT[0]}, {id:'their_base', label:'their base / fountain', ...FOUNT[1]});
  L.push({id:'our_ancient', label:'our ancient', ...ANC_POS[0]}, {id:'their_ancient', label:'their ancient', ...ANC_POS[1]});
  L.push({id:'top_river', label:'top river', x:640, y:640}, {id:'mid_river', label:'mid river (map centre)', x:1200, y:1200}, {id:'bot_river', label:'bot river', x:1760, y:1760});
  L.push({id:'top_corner', label:'top lane corner', x:300, y:300}, {id:'bot_corner', label:'bot lane corner', x:2100, y:2100});
  L.push({id:'our_top_jungle', label:'our top jungle', x:700, y:1300}, {id:'our_bot_jungle', label:'our bot jungle', x:1150, y:1720});
  L.push({id:'their_top_jungle', label:'their top jungle', x:1250, y:680}, {id:'their_bot_jungle', label:'their bot jungle', x:1700, y:1100});
}
function nearestLandmark(p) {
  let best = null, bd = 1e9;
  for (const l of S.landmarks) { const d = dist(l, p); if (d < bd) { bd = d; best = l; } }
  return best;
}
function describePos(p) {
  const lm = nearestLandmark(p), lane = laneOf(p);
  const near = dist(lm, p) < 260 ? 'at' : 'near';
  return `${near} ${lm.label}${lane ? ` (${lane} lane)` : ''}`;
}

function recompute(h) {
  const k = KITS[h.kit], L = h.lvl - 1, m = h.statMult || 1;
  let hp = k.hp[0] + k.hp[1]*L, mp = k.mp[0] + k.mp[1]*L, dmg = k.dmg[0] + k.dmg[1]*L, ar = k.armor[0] + k.armor[1]*L;
  let as = h.kit === 'carry' ? .045*L : .015*L, amp = 0, regen = 1.6 + .18*L;
  for (const it of h.items) { const I = ITEMS[it]; hp += I.hp||0; mp += I.mp||0; dmg += I.dmg||0; ar += I.armor||0; as += I.as||0; amp += I.amp||0; regen += I.regen||0; }
  const hr = h.maxHp ? h.hp / h.maxHp : 1, mr = h.maxMp ? h.mp / h.maxMp : 1;
  h.maxHp = hp * m; h.maxMp = mp; h.baseDmg = dmg * m; h.armor = ar; h.asBase = as; h.amp = amp; h.regen = regen;
  h.range = k.range; h.speed = k.spd;
  h.hp = h.maxHp * hr; h.mp = h.maxMp * mr;
}
const heroAtkTime = h => KITS[h.kit].atk / (1 + h.asBase + (h.buffs.deadeye > S.t ? 1 : 0));
const heroDmg = h => h.baseDmg * (h.buffs.deadeye > S.t ? 1.3 : 1);
const armorMult = a => 1 - (.06*a) / (1 + .06*Math.abs(a));

/* =========================================================
   Combat
   ========================================================= */
function invuln(u) {
  if (u.type === 'tower' && u.tier === 2) return S.units.some(t => t.type === 'tower' && t.alive && t.team === u.team && t.lane === u.lane && t.tier === 1);
  if (u.type === 'ancient') return S.units.filter(t => t.type === 'tower' && t.tier === 2 && t.team === u.team).every(t => t.alive);
  return false;
}
function damage(src, tgt, amt, kind = 'phys') {
  if (!tgt.alive || invuln(tgt)) return;
  let m = kind === 'phys' ? armorMult(tgt.armor) : (tgt.type === 'hero' ? .75 : 1);
  if (kind === 'magic' && src && src.type === 'hero') m *= 1 + (src.amp || 0);
  if (tgt.shield > S.t) m *= .6;
  tgt.hp -= amt * m;
  tgt.hurtT = S.t; tgt.lastAttacker = src;
  // hero-on-hero aggression pulls nearby enemy towers onto the attacker
  if (src && src.type === 'hero' && tgt.type === 'hero') {
    for (const t of S.units) if (t.type === 'tower' && t.alive && t.team === tgt.team && dist(t, src) < t.range + 20) t.target = src;
  }
  if (tgt.hp <= 0) kill(tgt, src);
}
function giveXp(team, around, amount, radius) {
  const hs = Object.values(S.heroes).filter(h => h.alive && h.team === team && dist(h, around) < radius);
  for (const h of hs) addXp(h, amount / hs.length);
}
function addXp(h, x) {
  h.xp += x;
  while (h.lvl < 12 && h.xp >= XP_NEED[h.lvl - 1]) {
    h.lvl++; recompute(h);
    if (h.team === 0 && h.lvl === 6) feed(`${h.name} reached level 6 — ultimate ready`, 'r');
  }
}
function kill(t, src) {
  t.alive = false; t.hp = 0;
  const foe = 1 - t.team;
  if (t.type === 'creep') {
    if (src && src.type === 'hero') { src.gold += t.bounty; src.lastHits++; addFx({type:'text', x:t.x, y:t.y - 14, text:'+' + t.bounty, color:'#e9c46a', dur:.9}); }
    giveXp(foe, t, t.xpv, 650);
  } else if (t.type === 'hero') {
    S.kills[foe]++;
    t.deaths++; t.respawnAt = S.t + 4 + t.lvl * 1.8; t.retreating = false; t.dash = null;
    if (t.order && t.order.mode !== 'lane' && t.order.mode !== 'push' && t.order.mode !== 'defend') t.order = null;
    const killer = src && src.type === 'hero' ? src : null;
    if (killer) { killer.kills++; killer.gold += 150 + 12 * t.lvl; }
    giveXp(foe, t, 90 + 28 * t.lvl, 900);
    feed(killer ? `${killer.name} killed ${t.name}` : `${t.name} died`, foe ? 'd' : 'r');
    addFx({type:'ring', x:t.x, y:t.y, r:60, color:'#ef6461', dur:.7});
    for (const h of Object.values(S.heroes)) if (h.order && h.order.mode === 'gank' && h.order.target === t.key) {
      h.order = null; if (h.team === 0) heroSay(h, pick(['Got him.', 'Done.', 'Target down.']), true);
    }
  } else if (t.type === 'tower') {
    for (const h of Object.values(S.heroes)) if (h.team === foe) h.gold += 120;
    feed(`${t.team ? 'Their' : 'Our'} ${t.lane} T${t.tier} tower fell`, foe ? 'd' : 'r');
    addFx({type:'ring', x:t.x, y:t.y, r:90, color:'#e9c46a', dur:1});
  } else if (t.type === 'ancient') {
    S.over = foe === 0 ? 'win' : 'loss';
    showOver();
  }
}
function doAttack(u, t) {
  u.atkCd = u.type === 'hero' ? heroAtkTime(u) : u.atkTime;
  u.face = Math.atan2(t.y - u.y, t.x - u.x);
  const dmg = u.type === 'hero' ? heroDmg(u) : u.dmg;
  if (u.proj) S.projs.push({x:u.x, y:u.y, tgt:t, src:u, dmg, speed:u.type === 'tower' ? 720 : 950, color:u.type === 'hero' ? u.color : (u.team ? '#f0884a' : '#4fd1c5'), big:u.type === 'tower'});
  else damage(u, t, dmg);
}
function addFx(f) { f.t0 = S.t; S.fx.push(f); }
function later(dt, fn) { S.pending.push({at:S.t + dt, fn}); }

/* =========================================================
   Creeps, towers, fountains
   ========================================================= */
function spawnWave() {
  const scale = 1 + S.t / 60 * .025;
  for (const team of [0,1]) for (const lane of LANES) {
    const pts = LANE_PATH[lane].map(p => ({...p}));
    const path = team === 0 ? [...pts, ANC_POS[1]] : [...pts.reverse(), ANC_POS[0]];
    for (let i = 0; i < 4; i++) {
      const melee = i < 3, back = i * 26;
      const a = path[0], b = path[1], dl = dist(a, b);
      const x = a.x - (b.x - a.x) / dl * back + (Math.random()-.5)*14, y = a.y - (b.y - a.y) / dl * back + (Math.random()-.5)*14;
      const hp = (melee ? 550 : 320) * scale;
      mk({type:'creep', team, lane, path, wp:1, melee, x, y, r:melee ? 11 : 9, hp, maxHp:hp, armor:melee ? 2 : 0,
        dmg:(melee ? 21 : 25) * scale, range:melee ? 42 : 165, atkTime:1, speed:96, proj:!melee, bounty:melee ? 38 : 48, xpv:melee ? 55 : 65});
    }
  }
}
function creepUpdate(c, dt) {
  c.think -= dt;
  if (c.think <= 0) {
    c.think = .25 + Math.random()*.1;
    if (c.target && (!c.target.alive || dist(c, c.target) > 420)) c.target = null;
    if (!c.target || c.target.type !== 'creep') {
      let best = null, bs = 1e9;
      for (const u of S.units) {
        if (!u.alive || u.team === c.team) continue;
        const d = dist(c, u);
        const lim = u.type === 'creep' ? 300 : u.type === 'hero' ? 230 : 320;
        if (d > lim) continue;
        const s = d + (u.type === 'creep' ? 0 : u.type === 'hero' ? 160 : 60);
        if (s < bs) { bs = s; best = u; }
      }
      if (best) c.target = best;
    }
  }
  if (c.target) {
    const d = dist(c, c.target) - c.target.r;
    if (d <= c.range) { if (c.atkCd <= 0) doAttack(c, c.target); return; }
    moveToward(c, c.target, dt); return;
  }
  const wp = c.path[c.wp];
  if (wp) { moveToward(c, wp, dt); if (dist(c, wp) < 30 && c.wp < c.path.length - 1) c.wp++; }
}
function towerUpdate(t, dt) {
  if (t.target && (!t.target.alive || dist(t, t.target) > t.range + t.target.r)) t.target = null;
  if (!t.target) {
    let best = null, bs = 1e9;
    for (const u of S.units) {
      if (!u.alive || u.team === t.team || (u.type !== 'creep' && u.type !== 'hero')) continue;
      const d = dist(t, u); if (d > t.range + u.r) continue;
      const s = d + (u.type === 'hero' ? 400 : 0);
      if (s < bs) { bs = s; best = u; }
    }
    t.target = best;
  }
  if (t.target && t.atkCd <= 0) doAttack(t, t.target);
}
function fountainUpdate(dt) {
  for (const team of [0,1]) {
    const f = FOUNT[team];
    for (const u of S.units) {
      if (!u.alive || u.type !== 'hero') continue;
      if (u.team === team && dist(u, f) < 260) { u.hp = Math.min(u.maxHp, u.hp + u.maxHp*.07*dt); u.mp = Math.min(u.maxMp, u.mp + u.maxMp*.07*dt); }
    }
    S.fountT[team] -= dt;
    if (S.fountT[team] <= 0) {
      const foe = S.units.find(u => u.alive && u.team !== team && (u.type === 'hero' || u.type === 'creep') && dist(u, f) < 400);
      if (foe) { S.fountT[team] = .7; S.projs.push({x:f.x, y:f.y, tgt:foe, src:null, dmg:230, speed:1100, color:team ? '#f0884a' : '#4fd1c5', big:true, pure:true}); }
    }
  }
}

/* =========================================================
   Movement
   ========================================================= */
function moveToward(u, p, dt, stopAt = 0) {
  const dx = p.x - u.x, dy = p.y - u.y, d = Math.hypot(dx, dy);
  if (d <= stopAt + .5) return;
  const step = Math.min(d - stopAt, u.speed * dt);
  const nx = u.x + dx / d * step, ny = u.y + dy / d * step;
  if (u.type === 'hero' && !u.ignoreTowers) {
    const danger = towerDanger(u, {x:nx, y:ny});
    if (danger && !towerDanger(u, u)) return; // refuse to step under an untanked tower
  }
  u.x = nx; u.y = ny; u.face = Math.atan2(dy, dx);
}
function towerDanger(h, p) {
  const d = directive(h);
  for (const t of S.units) {
    if (t.type !== 'tower' || !t.alive || t.team === h.team) continue;
    if (dist(t, p) > t.range + h.r + 10) continue;
    const tanked = t.target && t.target.alive && t.target !== h && t.target.type === 'creep';
    if (d.aggression === 'aggressive' && (tanked || h.hp / h.maxHp > .5)) continue;
    if (tanked && (d.mode === 'push' || d.focus === 'towers' || d.mode === 'gank')) continue;
    return t;
  }
  return null;
}
function enemyTowerCovering(p, team) {
  return S.units.find(t => t.type === 'tower' && t.alive && t.team !== team && dist(t, p) < t.range + 15) || null;
}
// soft separation on a coarse grid
function separate() {
  const cell = 64, grid = new Map();
  const movers = S.units.filter(u => u.alive && (u.type === 'creep' || u.type === 'hero'));
  for (const u of movers) { const k = (u.x / cell | 0) + ',' + (u.y / cell | 0); (grid.get(k) || grid.set(k, []).get(k)).push(u); }
  for (const u of movers) {
    const cx = u.x / cell | 0, cy = u.y / cell | 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const arr = grid.get((cx+i) + ',' + (cy+j)); if (!arr) continue;
      for (const v of arr) {
        if (v.id <= u.id) continue;
        const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy) || .01, min = (u.r + v.r) * .85;
        if (d < min) { const push = (min - d) / 2 * .5, ox = dx / d * push, oy = dy / d * push; u.x -= ox; u.y -= oy; v.x += ox; v.y += oy; }
      }
    }
  }
  const structs = S.units.filter(s => s.alive && (s.type === 'tower' || s.type === 'ancient'));
  for (const u of movers) {
    for (const s of structs) {
      const dx = u.x - s.x, dy = u.y - s.y, d = Math.hypot(dx, dy) || .01, min = s.r + u.r;
      if (d < min) { u.x = s.x + dx / d * min; u.y = s.y + dy / d * min; }
    }
    u.x = clamp(u.x, 20, WORLD - 20); u.y = clamp(u.y, 20, WORLD - 20);
  }
}

/* =========================================================
   Hero autopilot — executes the current directive
   ========================================================= */
const DEFAULT_DIR = {mode:'lane', aggression:'normal', focus:'any', ult:'auto'};
function directive(h) {
  if (h.order && S.t > h.order.until) { h.order = null; if (h.team === 0 && h.alive) setChipFlash(h); }
  return h.order || h.standing;
}
function laneFrontT(lane, team) {
  let best = null;
  for (const u of S.units) {
    if (!u.alive || u.type !== 'creep' || u.team !== team || u.lane !== lane) continue;
    const t = projLane(lane, u).t;
    if (best === null || (team === 0 ? t > best : t < best)) best = t;
  }
  if (best !== null) return best;
  return outerTowerT(lane, team);
}
function outerTowerT(lane, team) {
  let best = team === 0 ? .03 : .97;
  for (const u of S.units) {
    if (u.type !== 'tower' || !u.alive || u.team !== team || u.lane !== lane) continue;
    const t = projLane(lane, u).t;
    if (team === 0 ? t > best : t < best) best = t;
  }
  return best;
}
function outerTower(lane, team) {
  let best = null, bt = null;
  for (const u of S.units) {
    if (u.type !== 'tower' || !u.alive || u.team !== team || u.lane !== lane) continue;
    const t = projLane(lane, u).t;
    if (bt === null || (team === 0 ? t > bt : t < bt)) { bt = t; best = u; }
  }
  return best;
}
function anchorFor(h, d) {
  const dir = h.team === 0 ? 1 : -1, lane = d.lane || h.standing.lane || 'mid';
  switch (d.mode) {
    case 'push':  return lanePoint(lane, laneFrontT(lane, h.team) + dir * .005);
    case 'defend': { const t = outerTower(lane, h.team); if (!t) return ANC_POS[h.team]; const tt = projLane(lane, t).t - dir * .02; return lanePoint(lane, tt); }
    case 'gank':  { const e = S.heroes[d.target]; return e && e.alive ? e : lanePoint(lane, laneFrontT(lane, h.team)); }
    case 'follow':{ const a = S.heroes[d.follow]; return a && a.alive && a !== h ? {x:a.x - Math.cos(a.face)*70, y:a.y - Math.sin(a.face)*70} : FOUNT[h.team]; }
    case 'hold': case 'roam': { const lm = S.landmarks.find(l => l.id === d.point); if (lm) return lm; return lanePoint(lane, laneFrontT(lane, h.team) - dir * .03); }
    case 'group': {
      if (d.point) { const lm = S.landmarks.find(l => l.id === d.point); if (lm) return lm; }
      if (d.lane) { const t = outerTower(d.lane, h.team); if (t) return lanePoint(d.lane, projLane(d.lane, t).t - dir * .02); }
      const mates = Object.values(S.heroes).filter(o => o.alive && o.team === h.team && o !== h);
      if (!mates.length) return h;
      return {x:mates.reduce((s, o) => s + o.x, 0) / mates.length, y:mates.reduce((s, o) => s + o.y, 0) / mates.length};
    }
    default: { // lane / farm
      let t = laneFrontT(lane, h.team) - dir * .028;
      return lanePoint(lane, t);
    }
  }
}
const LEASH = {lane:520, push:620, defend:720, hold:520, roam:520, group:650, follow:560, gank:1e9, retreat:0};

function heroThink(h) {
  const d = directive(h);
  const thr = ({safe:.5, normal:.3, aggressive:.15})[d.aggression || 'normal'];
  const enemies = [];
  for (const u of S.units) { if (!u.alive || u.team === h.team) continue; const dd = dist(u, h); if (dd < 1100) enemies.push([u, dd]); }
  const hpP = h.hp / h.maxHp;
  const threat = enemies.some(([u, dd]) => (u.type === 'hero' && dd < 750) || (u.type === 'tower' && u.target === h));
  if (!h.retreating && hpP < thr && threat) {
    h.retreating = true;
    if (h.team === 0) heroSay(h, pick(['Backing off!', 'Low — going home.', 'Need to heal.']), true);
  }
  if (d.mode === 'retreat') h.retreating = true;
  if (h.retreating) {
    const atF = dist(h, FOUNT[h.team]) < 240;
    if (atF && hpP > .95 && h.mp / h.maxMp > .55) { h.retreating = false; if (h.order && h.order.mode === 'retreat') h.order = null; }
    else if (!atF && hpP > .7 && d.mode !== 'retreat' && !threat) { h.retreating = false; }
    else { h.intent = null; h.moveTo = FOUNT[h.team]; tryAbilities(h, d, enemies, true); return; }
  }
  const anchor = anchorFor(h, d);
  h.anchor = anchor;
  const leash = LEASH[d.mode] ?? 520;
  const acq = d.mode === 'gank' ? 950 : Math.max(h.range + 180, 430);
  let best = null, bs = -1e9;
  for (const [u, dd] of enemies) {
    if (dd > acq) continue;
    const isGankTarget = d.mode === 'gank' && u.key === d.target;
    if (!isGankTarget && dist(u, anchor) > leash) continue;
    let s = -dd / 25;
    if (u.type === 'hero') {
      s += 55;
      if (d.focus === 'heroes') s += 40;
      if (d.focus === 'creeps' || d.focus === 'towers') s -= 30;
      if (d.target === u.key) s += 220;
      if (u.hp / u.maxHp < .35) s += 35;
      if (d.mode === 'lane' && dd > h.range + 40 && !isGankTarget) s -= 55;
      if (d.aggression === 'safe' && !isGankTarget) s -= 25;
      if (enemyTowerCovering(u, h.team) && d.aggression !== 'aggressive' && u.hp / u.maxHp > .2 && !isGankTarget) s -= 200;
    } else if (u.type === 'creep') {
      s += 30;
      if (u.hp <= heroDmg(h) * armorMult(u.armor) * 1.05) s += 70;
      if (d.mode === 'push' || d.focus === 'creeps') s += 15;
      if (d.focus === 'heroes') s -= 20;
      if (d.mode === 'gank') s -= 90;
      const tw = enemyTowerCovering(u, h.team);
      if (tw && !(tw.target && tw.target.type === 'creep') && d.aggression !== 'aggressive') s -= 120;
    } else if (u.type === 'tower' || u.type === 'ancient') {
      if (invuln(u)) continue;
      const tanked = u.type === 'ancient' || (u.target && u.target !== h && u.target.alive);
      if (!tanked && d.aggression !== 'aggressive') continue;
      s += 15;
      if (d.mode === 'push' || d.focus === 'towers') s += 60;
      if (d.mode === 'lane') s -= 10;
      if (d.mode === 'gank') s -= 60;
      if (enemies.some(([e]) => e.type === 'hero' && dist(e, u) < 500)) s -= 30;
      if (u.type === 'ancient') s += 40;
    } else continue;
    if (s > bs) { bs = s; best = u; }
  }
  h.intent = best;
  h.moveTo = best ? null : anchor;
  h.ignoreTowers = !!(best && d.mode === 'gank' && best.key === d.target && (d.aggression === 'aggressive' || best.hp / best.maxHp < .25));
  tryAbilities(h, d, enemies, false);
}

function tryAbilities(h, d, enemies, fleeing) {
  const k = KITS[h.kit];
  const req = h.castReq && S.t < h.castReq.until ? h.castReq.key : null;
  if (h.castReq && S.t >= h.castReq.until) h.castReq = null;
  const ultPol = req === 'r' ? 'now' : (d.ult || 'auto');
  const canQ = h.cd.q <= 0 && h.mp >= k.q.cost;
  const canR = h.lvl >= 6 && h.cd.r <= 0 && h.mp >= k.r.cost && ultPol !== 'hold';
  const eh = enemies.filter(([u]) => u.type === 'hero');
  const allies = Object.values(S.heroes).filter(o => o.alive && o.team === h.team);
  const spend = (key) => { h.mp -= k[key].cost; h.cd[key] = k[key].cd; if (req === key) h.castReq = null; };
  const around = (p, r, list) => list.filter(([u]) => dist(u, p) <= r);

  if (h.kit === 'tank') {
    if (canR) {
      const n = around(h, k.r.radius, eh);
      if ((ultPol === 'now' && n.length) || n.length >= 2 || (n.length && n.some(([u]) => u.hp / u.maxHp < .45) && allies.some(a => a !== h && dist(a, h) < 650))) {
        spend('r'); quake(h); return;
      }
    }
    if (canQ && !fleeing) {
      const c = eh.filter(([u, dd]) => dd < k.q.range && dd > 90).sort((a, b) => a[1] - b[1]);
      for (const [u] of c) {
        const want = req === 'q' || (d.mode === 'gank' && u.key === d.target) ||
          (d.aggression !== 'safe' && (u.hp / u.maxHp < .55 || allies.some(a => a !== h && dist(a, u) < 600)));
        if (!want) continue;
        if (enemyTowerCovering(u, h.team) && d.aggression !== 'aggressive' && u.hp / u.maxHp > .25) continue;
        spend('q'); charge(h, u); return;
      }
    }
  } else if (h.kit === 'mage') {
    if (canR) {
      for (const [u, dd] of eh) {
        if (dd > k.r.range) continue;
        const n = around(u, k.r.radius, eh).length;
        if (ultPol === 'now' || n >= 2 || u.hp < (320 + 45*h.lvl) * .75 * (1 + h.amp)) { spend('r'); meteor(h, u); return; }
      }
    }
    if (canQ) {
      const hs = eh.filter(([, dd]) => dd < k.q.range).sort((a, b) => a[0].hp / a[0].maxHp - b[0].hp / b[0].maxHp);
      if (hs.length && (req === 'q' || d.aggression !== 'safe' || hs[0][0].hp / hs[0][0].maxHp < .5 || h.mp / h.maxMp > .6)) { spend('q'); fireball(h, hs[0][0]); return; }
      if (!fleeing && (d.mode === 'push' || d.focus === 'creeps' || h.mp / h.maxMp > .8 || req === 'q')) {
        const creeps = enemies.filter(([u, dd]) => u.type === 'creep' && dd < k.q.range);
        for (const [u] of creeps) if (around(u, k.q.radius, creeps).length >= 3) { spend('q'); fireball(h, u); return; }
      }
    }
  } else if (h.kit === 'carry') {
    if (canR && !fleeing) {
      const inR = eh.filter(([, dd]) => dd < h.range + 80);
      if ((ultPol === 'now' && (inR.length || eh.some(([, dd]) => dd < 700))) || (inR.length && h.hp / h.maxHp > .35)) {
        spend('r'); h.buffs.deadeye = S.t + 6; addFx({type:'ring', x:h.x, y:h.y, r:44, color:h.color, dur:.6, follow:h}); return;
      }
    }
    if (canQ) {
      const inRange = enemies.filter(([u, dd]) => (u.type === 'hero' || u.type === 'creep') && dd < h.range + 60).sort((a, b) => (a[0].type === 'hero' ? -1 : 0) - (b[0].type === 'hero' ? -1 : 0) || a[1] - b[1]);
      const heroes = inRange.filter(([u]) => u.type === 'hero').length;
      if (req === 'q' && inRange.length || heroes >= 1 || ((d.mode === 'push' || d.focus === 'creeps' || h.mp / h.maxMp > .7) && inRange.length >= 3)) {
        spend('q'); for (const [u] of inRange.slice(0, 4)) S.projs.push({x:h.x, y:h.y, tgt:u, src:h, dmg:55 + 16*h.lvl, speed:1100, color:h.color}); return;
      }
    }
  } else if (h.kit === 'support') {
    const near = allies.filter(a => dist(a, h) < (k.r.radius));
    if (canR) {
      const hurt = near.filter(a => a.hp / a.maxHp < .55).length;
      const fight = eh.some(([, dd]) => dd < 800);
      if ((ultPol === 'now' && near.some(a => a.hp / a.maxHp < .92)) || hurt >= 2 || (fight && near.some(a => a.hp / a.maxHp < .25))) {
        spend('r'); for (const a of near) { a.hp = Math.min(a.maxHp, a.hp + 180 + 30*h.lvl); a.shield = S.t + 4; }
        addFx({type:'ring', x:h.x, y:h.y, r:k.r.radius, color:'#ffd27a', dur:.9}); return;
      }
    }
    if (canQ) {
      const cand = allies.filter(a => dist(a, h) < k.q.range && a.hp / a.maxHp < (req === 'q' ? .97 : .72)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      if (cand.length) { const a = cand[0]; spend('q'); a.hp = Math.min(a.maxHp, a.hp + 100 + 32*h.lvl); addFx({type:'ring', x:a.x, y:a.y, r:34, color:'#7bd88f', dur:.6, follow:a}); return; }
    }
  }
}
function charge(h, u) {
  h.dash = {target:u, speed:950, until:S.t + .8};
  addFx({type:'line', x:h.x, y:h.y, x2:u.x, y2:u.y, color:h.color, dur:.35});
}
function quake(h) {
  for (const u of S.units) if (u.alive && u.team !== h.team && (u.type === 'hero' || u.type === 'creep') && dist(u, h) < KITS.tank.r.radius) {
    u.stun = Math.max(u.stun, S.t + 1.6); damage(h, u, 160 + 22*h.lvl, 'magic');
  }
  addFx({type:'ring', x:h.x, y:h.y, r:KITS.tank.r.radius, color:h.color, dur:.8, fill:true});
}
function fireball(h, u) {
  const p = {x:u.x, y:u.y}, travel = dist(h, p) / 900;
  addFx({type:'bolt', x:h.x, y:h.y, x2:p.x, y2:p.y, color:'#ff9f43', dur:travel});
  later(travel, () => {
    for (const v of S.units) if (v.alive && v.team !== h.team && (v.type === 'hero' || v.type === 'creep') && dist(v, p) < KITS.mage.q.radius) damage(h, v, 100 + 25*h.lvl, 'magic');
    addFx({type:'ring', x:p.x, y:p.y, r:KITS.mage.q.radius, color:'#ff9f43', dur:.45, fill:true});
  });
}
function meteor(h, u) {
  const p = {x:u.x, y:u.y};
  addFx({type:'warn', x:p.x, y:p.y, r:KITS.mage.r.radius, color:'#ff5e3a', dur:.85});
  later(.85, () => {
    for (const v of S.units) if (v.alive && v.team !== h.team && (v.type === 'hero' || v.type === 'creep') && dist(v, p) < KITS.mage.r.radius) {
      damage(h, v, 320 + 45*h.lvl, 'magic'); if (v.alive) v.stun = Math.max(v.stun, S.t + .8);
    }
    addFx({type:'ring', x:p.x, y:p.y, r:KITS.mage.r.radius, color:'#ff5e3a', dur:.8, fill:true});
  });
}
function autoBuy(h) {
  if (h.items.length >= 6) return;
  const next = h.shop || h.build[0];
  if (!next) return;
  const I = ITEMS[next];
  if (h.gold >= I.cost) {
    h.gold -= I.cost; h.items.push(next); recompute(h);
    if (h.shop) h.shop = null; else h.build.shift();
    if (h.team === 0) feed(`${h.name} bought ${I.label}`, 'r');
  }
}

function heroUpdate(h, dt) {
  if (!h.alive) {
    if (S.t >= h.respawnAt) {
      h.alive = true; h.hp = h.maxHp; h.mp = h.maxMp; h.x = FOUNT[h.team].x; h.y = FOUNT[h.team].y; h.stun = 0; h.retreating = false;
      if (h.team === 0) heroSay(h, pick(['Back in.', 'Respawned.', 'Ready.']), false);
    }
    return;
  }
  h.hp = Math.min(h.maxHp, h.hp + h.regen * dt); h.mp = Math.min(h.maxMp, h.mp + (1.2 + .1*h.lvl) * dt);
  h.cd.q = Math.max(0, h.cd.q - dt); h.cd.r = Math.max(0, h.cd.r - dt);
  h.gold += 1.6 * dt;
  if (h.stun > S.t) return;
  if (h.dash) {
    const u = h.dash.target;
    if (!u.alive || S.t > h.dash.until) { h.dash = null; }
    else {
      const d = dist(h, u);
      const step = h.dash.speed * dt;
      if (d <= step + u.r + h.r) { h.dash = null; u.stun = Math.max(u.stun, S.t + 1.2); damage(h, u, 80 + 22*h.lvl, 'magic'); addFx({type:'ring', x:u.x, y:u.y, r:40, color:h.color, dur:.4}); }
      else { h.x += (u.x - h.x) / d * step; h.y += (u.y - h.y) / d * step; }
      return;
    }
  }
  h.think -= dt;
  if (h.think <= 0) { h.think = .15; heroThink(h); autoBuy(h); }
  const t = h.intent;
  if (t && t.alive) {
    const d = dist(h, t) - t.r - h.r * .3;
    if (d <= h.range) { if (h.atkCd <= 0) doAttack(h, t); }
    else moveToward(h, t, dt);
  } else if (h.moveTo) {
    moveToward(h, h.moveTo, dt, 18);
  }
}

/* enemy coach: sets the Dire heroes' directives with simple scripted strategy */
function coach(dt) {
  S.coachT -= dt; if (S.coachT > 0) return; S.coachT = 4;
  const dire = Object.values(S.heroes).filter(h => h.team === 1);
  const rad = Object.values(S.heroes).filter(h => h.team === 0 && h.alive);
  const agg = settings.diff === 'hard' ? 'aggressive' : settings.diff === 'easy' ? 'safe' : 'normal';
  if (S.t > 480) {
    // group and push the lane where Radiant's outer tower is weakest
    let lane = 'mid', worst = 1e9;
    for (const l of LANES) { const t = outerTower(MIRROR_LANE[l] === l ? l : l, 0); const v = t ? t.hp + t.tier * 800 : 0; if (v < worst) { worst = v; lane = l; } }
    const regroupWindow = Math.floor(S.t / 90) % 3 !== 2; // farm one cycle in three
    for (const h of dire) h.standing = regroupWindow ? {mode:'push', lane, aggression:agg, focus:'any', ult:'auto'} : {mode:'lane', lane:ROSTER.find(r => r.key === h.key).lane, aggression:agg, focus:'any', ult:'auto'};
  } else {
    for (const h of dire) h.standing = {...h.standing, aggression:agg};
  }
  // opportunistic ganks on an isolated, hurt Radiant hero
  for (const v of rad) {
    if (v.hp / v.maxHp > .6) continue;
    if (rad.some(o => o !== v && dist(o, v) < 900)) continue;
    const hunters = dire.filter(h => h.alive && !h.retreating && dist(h, v) < 1300 && h.hp / h.maxHp > .5).slice(0, 2);
    if (hunters.length >= (settings.diff === 'easy' ? 3 : 1)) for (const h of hunters) h.order = {...h.standing, mode:'gank', target:v.key, until:S.t + 14};
  }
}

/* =========================================================
   Simulation step
   ========================================================= */
function step(dt) {
  if (S.over || S.paused) return;
  S.t += dt;
  if (S.t >= S.nextWave) { spawnWave(); S.nextWave += 30; }
  for (const p of S.pending.slice()) if (S.t >= p.at) { S.pending.splice(S.pending.indexOf(p), 1); p.fn(); }
  for (const u of S.units) {
    if (u.atkCd > 0) u.atkCd -= dt;
    if (u.type === 'hero') heroUpdate(u, dt);
    else if (!u.alive) continue;
    else if (u.stun > S.t) continue;
    else if (u.type === 'creep') creepUpdate(u, dt);
    else if (u.type === 'tower') towerUpdate(u, dt);
  }
  for (const p of S.projs) {
    const t = p.tgt; if (!t.alive) { p.dead = true; continue; }
    const d = dist(p, t), s = p.speed * dt;
    if (d <= s + 6) { p.dead = true; if (p.pure) { t.hp -= p.dmg; if (t.hp <= 0) kill(t, null); } else if (p.src && p.src.alive !== undefined) damage(p.src, t, p.dmg); }
    else { p.x += (t.x - p.x) / d * s; p.y += (t.y - p.y) / d * s; }
  }
  S.projs = S.projs.filter(p => !p.dead);
  fountainUpdate(dt);
  coach(dt);
  separate();
  S.units = S.units.filter(u => u.alive || u.type !== 'creep');
  S.fx = S.fx.filter(f => S.t - f.t0 < f.dur);
}

/* =========================================================
   Rendering
   ========================================================= */
const stage = document.getElementById('stage');
const view = document.getElementById('view'), ctx = view.getContext('2d');
const mini = document.getElementById('minimap'), mctx = mini.getContext('2d');
const cam = {x:640, y:1820, z:.8, init:false};
let cssW = 800, cssH = 600, dpr = 1;
const terrain = document.createElement('canvas'); terrain.width = WORLD; terrain.height = WORLD;
const miniBase = document.createElement('canvas');

function paintTerrain() {
  const g = terrain.getContext('2d'), rng = mulberry32(11);
  g.fillStyle = '#17261f'; g.fillRect(0, 0, WORLD, WORLD);
  for (let i = 0; i < 1400; i++) { g.fillStyle = rng() < .5 ? 'rgba(30,48,37,.5)' : 'rgba(16,30,23,.55)'; g.beginPath(); g.arc(rng()*WORLD, rng()*WORLD, 30 + rng()*90, 0, TAU); g.fill(); }
  // team tint
  let gr = g.createLinearGradient(0, WORLD, WORLD, 0);
  gr.addColorStop(0, 'rgba(79,209,197,.10)'); gr.addColorStop(.48, 'rgba(0,0,0,0)'); gr.addColorStop(.52, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(240,136,74,.10)');
  g.fillStyle = gr; g.fillRect(0, 0, WORLD, WORLD);
  // river
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = '#1b3a46'; g.lineWidth = 150; g.beginPath(); g.moveTo(330, 330); g.lineTo(2070, 2070); g.stroke();
  g.strokeStyle = '#21495a'; g.lineWidth = 90; g.stroke();
  g.strokeStyle = 'rgba(120,190,210,.12)'; g.lineWidth = 6; g.setLineDash([30, 40]); g.stroke(); g.setLineDash([]);
  // lanes
  for (const l of LANES) {
    const pts = LANE_PATH[l];
    const path = () => { g.beginPath(); g.moveTo(ANC_POS[0].x, ANC_POS[0].y); for (const p of pts) g.lineTo(p.x, p.y); g.lineTo(ANC_POS[1].x, ANC_POS[1].y); };
    g.strokeStyle = '#2b2a20'; g.lineWidth = 116; path(); g.stroke();
    g.strokeStyle = '#3d3a2b'; g.lineWidth = 92; path(); g.stroke();
    g.strokeStyle = 'rgba(255,240,200,.04)'; g.lineWidth = 40; path(); g.stroke();
  }
  // bases
  for (const team of [0,1]) {
    const c = team ? {x:2120, y:280} : {x:280, y:2120};
    g.fillStyle = team ? 'rgba(80,46,30,.75)' : 'rgba(26,62,60,.75)';
    g.beginPath(); g.arc(c.x, c.y, 360, 0, TAU); g.fill();
    g.strokeStyle = team ? 'rgba(240,136,74,.35)' : 'rgba(79,209,197,.35)'; g.lineWidth = 4; g.stroke();
    g.fillStyle = team ? 'rgba(240,136,74,.12)' : 'rgba(79,209,197,.12)';
    g.beginPath(); g.arc(FOUNT[team].x, FOUNT[team].y, 260, 0, TAU); g.fill();
  }
  // trees
  const clear = p => LANES.every(l => projLane(l, p).d > 105) && Math.abs(p.x - p.y) / Math.SQRT2 > 110 && dist(p, {x:280, y:2120}) > 420 && dist(p, {x:2120, y:280}) > 420;
  for (let i = 0; i < 1500; i++) {
    const p = {x:40 + rng()*(WORLD-80), y:40 + rng()*(WORLD-80)};
    if (!clear(p)) continue;
    const r = 16 + rng()*16;
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(p.x + 5, p.y + 6, r, 0, TAU); g.fill();
    g.fillStyle = rng() < .5 ? '#10221a' : '#132a1f'; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(70,120,80,.18)'; g.beginPath(); g.arc(p.x - r*.3, p.y - r*.3, r*.5, 0, TAU); g.fill();
  }
  miniBase.width = mini.width; miniBase.height = mini.height;
  miniBase.getContext('2d').drawImage(terrain, 0, 0, mini.width, mini.height);
}

function resize() {
  cssW = Math.max(200, view.clientWidth); cssH = Math.max(200, view.clientHeight); dpr = Math.min(2, window.devicePixelRatio || 1);
  view.width = Math.round(cssW * dpr); view.height = Math.round(cssH * dpr);
  if (!cam.init) { cam.init = true; cam.z = clamp(Math.max(cssW, cssH) / 1250, .45, 1); }
  const mr = mini.getBoundingClientRect();
  if (mr.width && Math.round(mr.width) !== mini.width) { mini.width = Math.round(mr.width); mini.height = Math.round(mr.height); miniBase.width = mini.width; miniBase.height = mini.height; miniBase.getContext('2d').drawImage(terrain, 0, 0, mini.width, mini.height); }
  clampCam();
}
function clampCam() {
  cam.z = clamp(cam.z, .32, 1.6);
  const hw = cssW / 2 / cam.z, hh = cssH / 2 / cam.z;
  cam.x = clamp(cam.x, Math.min(hw, WORLD/2), Math.max(WORLD - hw, WORLD/2));
  cam.y = clamp(cam.y, Math.min(hh, WORLD/2), Math.max(WORLD - hh, WORLD/2));
}
const w2s = p => ({x:(p.x - cam.x) * cam.z + cssW / 2, y:(p.y - cam.y) * cam.z + cssH / 2});
const s2w = (x, y) => ({x:(x - cssW / 2) / cam.z + cam.x, y:(y - cssH / 2) / cam.z + cam.y});
function inView(p, pad = 0) { const s = w2s(p); return s.x > -pad && s.x < cssW + pad && s.y > -pad && s.y < cssH + pad; }
function camRect() { const a = s2w(0, 0), b = s2w(cssW, cssH); return {x0:a.x, y0:a.y, x1:b.x, y1:b.y}; }

function teamCol(team, a = 1) { return team ? `rgba(240,136,74,${a})` : `rgba(79,209,197,${a})`; }

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b1214'; ctx.fillRect(0, 0, view.width, view.height);
  const z = cam.z * dpr;
  ctx.setTransform(z, 0, 0, z, dpr * (cssW/2 - cam.x*cam.z), dpr * (cssH/2 - cam.y*cam.z));
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(terrain, 0, 0);

  // enemy tower ranges for the selected hero, faint
  for (const u of S.units) {
    if (u.type !== 'tower' || !u.alive || u.team !== 1 || !inView(u, 300)) continue;
    ctx.strokeStyle = 'rgba(240,136,74,.13)'; ctx.lineWidth = 2 / cam.z; ctx.setLineDash([10/cam.z, 10/cam.z]);
    ctx.beginPath(); ctx.arc(u.x, u.y, u.range, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  // ground effects
  for (const f of S.fx) {
    const k = (S.t - f.t0) / f.dur;
    if (f.type === 'warn') {
      ctx.fillStyle = `rgba(255,94,58,${.12 + .2*k})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,94,58,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * k, 0, TAU); ctx.stroke();
    }
  }
  // structures
  for (const u of S.units) {
    if ((u.type !== 'tower' && u.type !== 'ancient') || !inView(u, 80)) continue;
    if (u.type === 'tower') {
      ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(Math.PI/4);
      if (u.alive) {
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(-20, -14, 40, 40);
        ctx.fillStyle = teamCol(u.team, .95); ctx.fillRect(-20, -20, 40, 40);
        ctx.fillStyle = '#0e1618'; ctx.fillRect(-11, -11, 22, 22);
        ctx.fillStyle = invuln(u) ? 'rgba(220,230,230,.5)' : teamCol(u.team, .8); ctx.fillRect(-5, -5, 10, 10);
      } else { ctx.fillStyle = 'rgba(90,90,80,.6)'; ctx.fillRect(-14, -14, 12, 12); ctx.fillRect(2, -4, 12, 10); ctx.fillRect(-8, 6, 10, 8); }
      ctx.restore();
    } else {
      ctx.save(); ctx.translate(u.x, u.y);
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI/6; ctx.lineTo(Math.cos(a) * 48, Math.sin(a) * 48); } ctx.closePath();
      ctx.fillStyle = u.alive ? teamCol(u.team, .9) : 'rgba(90,90,80,.6)'; ctx.fill();
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + Math.PI/6; ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28); } ctx.closePath();
      ctx.fillStyle = '#0e1618'; ctx.fill();
      ctx.restore();
    }
  }
  // fountains
  for (const team of [0,1]) { const f = FOUNT[team]; ctx.strokeStyle = teamCol(team, .7); ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, 34, 0, TAU); ctx.stroke(); ctx.fillStyle = teamCol(team, .25); ctx.fill(); }
  // creeps
  for (const u of S.units) {
    if (u.type !== 'creep' || !u.alive || !inView(u, 20)) continue;
    ctx.fillStyle = teamCol(u.team, .92); ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2;
    if (u.melee) { ctx.beginPath(); ctx.arc(u.x, u.y, u.r, 0, TAU); ctx.fill(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(u.x, u.y - u.r - 2); ctx.lineTo(u.x + u.r + 2, u.y); ctx.lineTo(u.x, u.y + u.r + 2); ctx.lineTo(u.x - u.r - 2, u.y); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  }
  // heroes
  for (const h of Object.values(S.heroes)) {
    if (!h.alive || !inView(h, 40)) continue;
    if (S.selected === h.key) { ctx.strokeStyle = '#e9c46a'; ctx.lineWidth = 2.5 / cam.z; ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 9, 0, TAU); ctx.stroke(); }
    if (h.shield > S.t) { ctx.fillStyle = 'rgba(255,210,122,.18)'; ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 7, 0, TAU); ctx.fill(); }
    if (h.buffs.deadeye > S.t) { ctx.strokeStyle = h.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(h.x, h.y, h.r + 5 + Math.sin(S.t*14)*2, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.arc(h.x + 3, h.y + 5, h.r, 0, TAU); ctx.fill();
    ctx.fillStyle = h.color; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, TAU); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = teamCol(h.team); ctx.stroke();
    ctx.strokeStyle = '#0e1618'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(h.x + Math.cos(h.face) * 8, h.y + Math.sin(h.face) * 8); ctx.lineTo(h.x + Math.cos(h.face) * (h.r + 6), h.y + Math.sin(h.face) * (h.r + 6)); ctx.stroke();
    ctx.fillStyle = '#0e1618'; ctx.font = '700 18px "Saira Condensed", "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(h.name[0], h.x, h.y + 1);
    if (h.stun > S.t) { ctx.fillStyle = '#e9c46a'; for (let i = 0; i < 3; i++) { const a = S.t * 6 + i * TAU / 3; ctx.beginPath(); ctx.arc(h.x + Math.cos(a) * 14, h.y - h.r - 6 + Math.sin(a) * 4, 3, 0, TAU); ctx.fill(); } }
  }
  // projectiles & fx
  for (const p of S.projs) { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.big ? 6 : 4, 0, TAU); ctx.fill(); }
  for (const f of S.fx) {
    const k = clamp((S.t - f.t0) / f.dur, 0, 1);
    const fx = f.follow ? f.follow.x : f.x, fy = f.follow ? f.follow.y : f.y;
    if (f.type === 'ring') {
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(fx, fy, f.r * (.4 + .6*k), 0, TAU); ctx.stroke();
      if (f.fill) { ctx.fillStyle = f.color; ctx.globalAlpha = (1 - k) * .25; ctx.fill(); }
      ctx.globalAlpha = 1;
    } else if (f.type === 'line') {
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.color; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (f.type === 'bolt') {
      const x = f.x + (f.x2 - f.x) * k, y = f.y + (f.y2 - f.y) * k;
      ctx.fillStyle = f.color; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,230,180,.8)'; ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
    }
  }

  // ---- screen-space overlays
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bar = (p, w, frac, col, yoff, hgt = 4) => {
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(p.x - w/2 - 1, p.y + yoff - 1, w + 2, hgt + 2);
    ctx.fillStyle = col; ctx.fillRect(p.x - w/2, p.y + yoff, w * clamp(frac, 0, 1), hgt);
  };
  for (const u of S.units) {
    if (!u.alive || !inView(u, 30)) continue;
    const s = w2s(u);
    if (u.type === 'creep') { if (u.hp < u.maxHp) bar(s, 22 * Math.max(.6, cam.z), u.hp / u.maxHp, teamCol(u.team), -u.r * cam.z - 7, 3); }
    else if (u.type === 'tower' || u.type === 'ancient') bar(s, 56, u.hp / u.maxHp, invuln(u) ? 'rgba(200,210,210,.7)' : teamCol(u.team), -(u.r + 22) * cam.z - 6, 4);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  for (const h of Object.values(S.heroes)) {
    if (!h.alive || !inView(h, 60)) continue;
    const s = w2s(h), top = s.y - h.r * cam.z - 16;
    bar(s, 54, h.hp / h.maxHp, h.team ? '#ef6461' : '#7bd88f', top - s.y - 6, 5);
    bar(s, 54, h.mp / h.maxMp, '#6aa8ff', top - s.y + 1, 2);
    ctx.font = '600 13px "Saira Condensed", "Arial Narrow", sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillText(`${h.name} ${h.lvl}`, s.x + 1, top - 10);
    ctx.fillStyle = h.team ? '#ffcfb5' : '#dff7f3'; ctx.fillText(`${h.name} ${h.lvl}`, s.x, top - 11);
    if (h.team === 0) {
      ctx.font = '500 10.5px "IBM Plex Mono", ui-monospace, monospace';
      const lbl = orderLabel(h);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; const tw = ctx.measureText(lbl).width + 8; ctx.fillRect(s.x - tw/2, s.y + h.r * cam.z + 6, tw, 14);
      ctx.fillStyle = h.order ? '#e9c46a' : h.retreating ? '#ef6461' : '#8aa39e'; ctx.fillText(lbl, s.x, s.y + h.r * cam.z + 17);
      if (h.pending > 0) { ctx.fillStyle = '#e9c46a'; for (let i = 0; i < 3; i++) { const on = Math.floor(performance.now() / 220) % 3 === i; ctx.globalAlpha = on ? 1 : .35; ctx.beginPath(); ctx.arc(s.x + 30 + i * 7, top - 15, 2.5, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1; }
    }
    if (h.say && S.t - h.sayT < 3.5) {
      ctx.font = '500 13px "Barlow", system-ui, sans-serif';
      const txt = h.say.length > 44 ? h.say.slice(0, 43) + '…' : h.say;
      const w = ctx.measureText(txt).width + 14, bx = s.x - w/2, by = top - 44;
      ctx.fillStyle = h.team ? 'rgba(60,30,20,.92)' : 'rgba(18,30,32,.94)'; ctx.strokeStyle = h.color; ctx.lineWidth = 1.5;
      roundRect(ctx, bx, by, w, 22, 5); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.x - 5, by + 22); ctx.lineTo(s.x, by + 28); ctx.lineTo(s.x + 5, by + 22); ctx.fill();
      ctx.fillStyle = '#eef4f2'; ctx.fillText(txt, s.x, by + 15.5);
    }
  }
  for (const f of S.fx) {
    if (f.type !== 'text') continue;
    const k = (S.t - f.t0) / f.dur, s = w2s({x:f.x, y:f.y - k * 20});
    ctx.globalAlpha = 1 - k; ctx.font = '600 12px "IBM Plex Mono", monospace'; ctx.fillStyle = f.color; ctx.fillText(f.text, s.x, s.y); ctx.globalAlpha = 1;
  }
  // dead markers
  ctx.font = '500 11px "IBM Plex Mono", monospace';
  for (const h of Object.values(S.heroes)) if (!h.alive && h.team === 0) {
    const f = FOUNT[0]; if (!inView(f, 0)) continue; const s = w2s(f);
    ctx.fillStyle = '#ef6461'; ctx.fillText(`${h.name} ${Math.ceil(h.respawnAt - S.t)}s`, s.x, s.y - 48 - 13 * Object.values(S.heroes).filter(o => !o.alive && o.team === 0).indexOf(h));
  }
  drawMini();
}
function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function drawMini() {
  const W = mini.width, k = W / WORLD;
  mctx.drawImage(miniBase, 0, 0);
  for (const u of S.units) {
    if (!u.alive) continue;
    if (u.type === 'creep') { mctx.fillStyle = teamCol(u.team, .8); mctx.fillRect(u.x*k - 1, u.y*k - 1, 2, 2); }
    else if (u.type === 'tower' || u.type === 'ancient') { mctx.fillStyle = teamCol(u.team); const s = u.type === 'ancient' ? 7 : 5; mctx.fillRect(u.x*k - s/2, u.y*k - s/2, s, s); }
  }
  for (const h of Object.values(S.heroes)) {
    if (!h.alive) continue;
    mctx.fillStyle = h.color; mctx.strokeStyle = teamCol(h.team); mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.arc(h.x*k, h.y*k, 4, 0, TAU); mctx.fill(); mctx.stroke();
    if (S.selected === h.key) { mctx.strokeStyle = '#e9c46a'; mctx.beginPath(); mctx.arc(h.x*k, h.y*k, 7, 0, TAU); mctx.stroke(); }
  }
  const r = camRect();
  mctx.strokeStyle = 'rgba(255,255,255,.75)'; mctx.lineWidth = 1;
  mctx.strokeRect(r.x0*k, r.y0*k, (r.x1 - r.x0)*k, (r.y1 - r.y0)*k);
}
function orderLabel(h) {
  if (!h.alive) return 'DEAD';
  if (h.retreating) return 'RETREAT';
  const d = directive(h);
  const tgt = d.target && S.heroes[d.target] ? S.heroes[d.target].name.toUpperCase() : '';
  const fol = d.follow && S.heroes[d.follow] ? S.heroes[d.follow].name.toUpperCase() : '';
  const lm = d.point ? (S.landmarks.find(l => l.id === d.point) || {}).label : '';
  const base = {lane:`LANE ${(d.lane||'').toUpperCase()}`, push:`PUSH ${(d.lane||'').toUpperCase()}`, defend:`DEFEND ${(d.lane||'').toUpperCase()}`,
    gank:`GANK ${tgt}`, follow:`WITH ${fol}`, group:'GROUP', hold:`HOLD ${(lm||'').toUpperCase()}`, roam:`ROAM ${(lm||'').toUpperCase()}`, retreat:'RETREAT'}[d.mode] || d.mode.toUpperCase();
  const ag = d.aggression && d.aggression !== 'normal' ? ` · ${d.aggression.toUpperCase()}` : '';
  return (base + ag).trim();
}

/* =========================================================
   DOM: score, squad cards, feed, trace
   ========================================================= */
const $ = id => document.getElementById(id);
const allies = () => ROSTER.filter(r => r.team === 0).map(r => S.heroes[r.key]);
const enemiesH = () => ROSTER.filter(r => r.team === 1).map(r => S.heroes[r.key]);
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
function feed(text, side) { S.feed.push({text, side, t:performance.now()}); if (S.feed.length > 4) S.feed.shift(); renderFeed(); }
function renderFeed() {
  const now = performance.now(); S.feed = S.feed.filter(f => now - f.t < 5000);
  $('feed').replaceChildren(...S.feed.map(f => { const d = document.createElement('div'); d.className = f.side; d.textContent = f.text; return d; }));
}
function buildSquad() {
  const box = $('squad'); box.replaceChildren();
  allies().forEach((h, i) => {
    const R = ROSTER.find(r => r.key === h.key);
    const el = document.createElement('article');
    el.className = 'hc'; el.dataset.key = h.key; el.tabIndex = 0;
    el.innerHTML = `<div class="hc-head"><span class="hc-key">${i + 1}</span><span class="sw" style="background:${h.color}"></span><span class="hc-name">${h.name}</span><span class="hc-role">${KITS[h.kit].role}</span><span class="hc-lvl"></span></div>
      <div class="bars"><i class="hp"><b></b></i><i class="mp"><b></b></i></div>
      <div class="hc-row"><span class="chip"></span><span class="gold"></span><span class="cds"><span class="cd q" title="${KITS[h.kit].q.name}">Q</span><span class="cd r" title="${KITS[h.kit].r.name}">R</span></span></div>
      <p class="hc-say"></p><span class="think" hidden>thinking…</span>`;
    el.addEventListener('click', () => selectHero(h.key, true));
    el.addEventListener('keydown', e => { if (e.key === 'Enter') selectHero(h.key, true); });
    box.appendChild(el);
  });
}
function renderSquad() {
  for (const h of allies()) {
    const el = document.querySelector(`.hc[data-key="${h.key}"]`); if (!el) continue;
    el.classList.toggle('sel', S.selected === h.key); el.classList.toggle('dead', !h.alive);
    el.querySelector('.hc-lvl').textContent = h.alive ? `Lv ${h.lvl}` : `${Math.ceil(h.respawnAt - S.t)}s`;
    el.querySelector('.hp b').style.width = (h.hp / h.maxHp * 100).toFixed(1) + '%';
    el.querySelector('.mp b').style.width = (h.mp / h.maxMp * 100).toFixed(1) + '%';
    const chip = el.querySelector('.chip'); chip.textContent = orderLabel(h);
    chip.className = 'chip' + (h.retreating || !h.alive ? ' ret' : h.order ? ' tmp' : '');
    chip.title = h.order ? `Temporary order, ${Math.max(0, Math.ceil(h.order.until - S.t))}s left` : 'Standing order';
    el.querySelector('.gold').textContent = `${Math.floor(h.gold)}g · ${h.items.length} items`;
    const k = KITS[h.kit];
    const q = el.querySelector('.cd.q'), r = el.querySelector('.cd.r');
    q.textContent = h.cd.q > 0 ? Math.ceil(h.cd.q) : 'Q'; q.classList.toggle('ready', h.cd.q <= 0 && h.mp >= k.q.cost);
    r.textContent = h.lvl < 6 ? '6' : h.cd.r > 0 ? Math.ceil(h.cd.r) : 'R'; r.classList.toggle('ready', h.lvl >= 6 && h.cd.r <= 0 && h.mp >= k.r.cost);
    r.title = h.lvl < 6 ? `${k.r.name} unlocks at level 6` : k.r.name;
    el.querySelector('.hc-say').textContent = h.say ? `“${h.say}”` : '';
    el.querySelector('.think').hidden = !(h.pending > 0);
  }
  $('killsR').textContent = S.kills[0]; $('killsD').textContent = S.kills[1]; $('clock').textContent = fmtTime(S.t);
  const tc = team => S.units.filter(u => u.type === 'tower' && u.alive && u.team === team).length;
  $('towerCount').textContent = `Towers ${tc(0)} – ${tc(1)}`;
  renderFeed();
}
function setChipFlash() {}
function flashHero(h) {
  if (h.team !== 0) return;
  const el = document.querySelector(`.hc[data-key="${h.key}"]`);
  if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  if (h.alive) addFx({type:'ring', x:h.x, y:h.y, r:46, color:'#e9c46a', dur:.9, follow:h});
  renderSquad();
}
function selectHero(key, center) {
  if (S.selected === key && center) { const h = S.heroes[key]; if (h.alive) { cam.x = h.x; cam.y = h.y; clampCam(); } }
  S.selected = key; renderSquad();
}
function heroSay(h, text, speakIt) {
  h.say = text; h.sayT = S.t;
  if (speakIt) speak(h, text);
}
function showOver() {
  $('overlay').hidden = false;
  $('ovTitle').textContent = S.over === 'win' ? 'Victory' : 'Defeat';
  $('ovTitle').style.color = S.over === 'win' ? 'var(--radiant)' : 'var(--dire)';
  $('ovText').textContent = `${fmtTime(S.t)} · kills ${S.kills[0]}–${S.kills[1]} · ${cmdCount} orders given`;
}

/* =========================================================
   Voice out (TTS)
   ========================================================= */
let ttsVoices = [];
function loadVoices() { try { ttsVoices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); } catch {} }
if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function speak(h, text) {
  if (!settings.voice || !('speechSynthesis' in window) || h.team !== 0) return;
  try {
    if (speechSynthesis.pending) speechSynthesis.cancel();
    const R = ROSTER.find(r => r.key === h.key), u = new SpeechSynthesisUtterance(text);
    u.pitch = R.voice.pitch; u.rate = R.voice.rate * 1.08; u.volume = .9;
    if (ttsVoices.length) u.voice = ttsVoices[ROSTER.indexOf(R) % ttsVoices.length];
    speechSynthesis.speak(u);
  } catch {}
}

/* =========================================================
   Models: Claude in the viewer, the Anthropic API locally
   ========================================================= */
const AI = {mode:'detecting', model:'', ok:0};
async function initAI() {
  try {
    const r = await fetch('/api/health');
    const j = await r.json();
    AI.model = j.model || '';
    AI.mode = j.llm ? 'api' : 'local';
    LOG.on = true;
  } catch { AI.mode = 'local'; }
  renderProvider(); renderLogStatus();
}
function renderProvider() {
  const line = $('provLine');
  const short = $('provShort');
  if (AI.mode === 'api') { line.innerHTML = `<span class="dot on"></span>Agents: <b>${esc(AI.model)}</b> via the server`; short.textContent = AI.model + ' · server'; }
  else if (AI.mode === 'local') { line.innerHTML = '<span class="dot warn"></span>Agents offline. Simple orders still work; set ANTHROPIC_API_KEY in the server’s .env and restart it for the full router.'; short.textContent = 'agents offline'; }
  else { line.innerHTML = '<span class="dot"></span>Connecting to the server…'; short.textContent = ''; }
  if (AI.mode === 'local' && !noticeShown.offline) showNotice('Router and hero agents need the server to have an API key. Simple orders like “Vex go mid” or “everyone back” still run instantly. Set ANTHROPIC_API_KEY in .env and restart the server.', 'offline');
}
async function llmJSON(prompt, signal, meta) {
  if (AI.mode !== 'api') throw {code:'offline', message:'No model available'};
  const r = await fetch('/api/llm', {method:'POST', signal, headers:{'content-type':'application/json'},
    body:JSON.stringify({prompt, session:LOG.session, ...(meta || {})})});
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok) throw {code:(j && j.error && j.error.code) || 'http_' + r.status, message:(j && j.error && j.error.message) || r.statusText};
  AI.ok++;
  return j.result;
}
function handleAIError(e) {
  const code = e && e.code || 'error';
  if (code === 'no_api_key') { AI.mode = 'local'; renderProvider(); return 'The server has no API key, so only simple orders work now.'; }
  if (code === 'rate_limited') return 'The Claude API is rate-limiting the server. Give it a few seconds.';
  if (code === 'auth_failed') return 'The API key in the server’s .env was rejected.';
  if (code === 'cancelled') return 'Replaced by a newer order.';
  return (e && e.message) ? `Model error: ${e.message}` : 'Model error.';
}

/* =========================================================
   Game state → prompt text
   ========================================================= */
function heroLine(h, mine) {
  const d = directive(h);
  const st = h.alive ? `alive, lvl ${h.lvl}, hp ${Math.round(h.hp / h.maxHp * 100)}%, mana ${Math.round(h.mp / h.maxMp * 100)}%, ${describePos(h)}` : `DEAD (respawns in ${Math.ceil(h.respawnAt - S.t)}s)`;
  if (!mine) return `- ${h.key} (${h.name}, ${KITS[h.kit].role}): ${st}`;
  const ord = h.order ? `temporary order ${JSON.stringify(stripDir(h.order))} for ${Math.ceil(h.order.until - S.t)}s more, then back to standing` : 'no temporary order';
  return `- ${h.key} (${h.name}, ${KITS[h.kit].role}): ${st}; standing ${JSON.stringify(stripDir(h.standing))}; ${ord}${h.retreating ? '; currently retreating to heal' : ''}`;
}
function stripDir(d) { const o = {}; for (const k of ['mode','lane','target','follow','point','aggression','focus','ult']) if (d[k] !== undefined && d[k] !== null) o[k] = d[k]; return o; }
function screenContext() {
  const r = camRect(), c = {x:(r.x0 + r.x1)/2, y:(r.y0 + r.y1)/2};
  const visA = allies().filter(h => h.alive && inView(h)).map(h => h.key);
  const visE = enemiesH().filter(h => h.alive && inView(h)).map(h => h.key);
  return {centre:describePos(c), lane:laneOf(c, 400) || 'none', visA, visE, selected:S.selected};
}
function aliasText(team) {
  return ROSTER.filter(r => r.team === team).map(r => `${r.key}: "${r.name}", also ${r.aliases.map(a => `"${a}"`).join(', ')}${r.hear.length ? `; may be misheard as ${r.hear.slice(0, 5).join(', ')}` : ''}`).join('\n');
}
const cmdHistory = [];
function routerPrompt(text) {
  const sc = screenContext();
  const recent = cmdHistory.slice(-4).map(c => `- "${c.text}" → ${c.routedTo.join(', ') || 'nobody'}`).join('\n') || '- none yet';
  return `You are the order router for a real-time MOBA. The player is the shotcaller for 4 AI heroes on the Radiant team (base bottom-left; enemy Dire base top-right). Decide which of our heroes each part of a spoken command is for, and rewrite each part as a clear, standalone instruction for that one hero. Respond fast and only with JSON.

The command came from speech-to-text and can contain misheard names or words.

OUR HEROES (ids and what the player may call them)
${aliasText(0)}

ENEMY HEROES
${aliasText(1)}

GAME STATE at ${fmtTime(S.t)} (kills ${S.kills[0]}-${S.kills[1]})
Ours:
${allies().map(h => heroLine(h, true)).join('\n')}
Enemies:
${enemiesH().map(h => heroLine(h, false)).join('\n')}

PLAYER'S SCREEN: camera centred ${sc.centre}; lane on screen: ${sc.lane}. Our heroes on screen: ${sc.visA.join(', ') || 'none'}. Enemies on screen: ${sc.visE.join(', ') || 'none'}. Selected hero: ${sc.selected || 'none'}.

RECENT COMMANDS (oldest first)
${recent}

ROUTING RULES
1. A name, nickname, role word, or "everyone/team/all/guys" decides who an order is for. "Everyone else" means our heroes not named elsewhere in the command.
2. With no addressee: the selected hero; else our heroes on the player's screen; else whoever was addressed last; else everyone.
3. "you", "you too", "same for X", "also" refer back to recent commands.
4. Split compound commands into one route per hero. A hero may appear only once; merge its parts.
5. In each instruction, replace pronouns and vague places ("him", "there", "that tower", "here") with concrete names from the state, e.g. "here" → the place the camera is centred on.
6. Dead heroes can still get orders (they apply on respawn).

Reply with only JSON: {"routes":[{"hero":"<our hero id>","instruction":"<standalone instruction>"}],"note":"<under 12 words: why>"}
If it is not an order for our heroes, reply {"routes":[],"note":"<why>"}.

COMMAND: "${text.replace(/"/g, "'")}"`;
}
const KIT_DESC = h => { const k = KITS[h.kit]; return `Q ${k.q.name}: ${k.q.desc}. R ${k.r.name} (ultimate${h.lvl < 6 ? ', NOT unlocked until level 6' : h.cd.r > 0 ? `, on cooldown ${Math.ceil(h.cd.r)}s` : ', ready'}): ${k.r.desc}.`; };
const DIRECTIVE_SPEC = `DIRECTIVE FIELDS (include only fields the order changes; your autopilot already moves, last-hits, aims and casts sensibly on its own)
- mode: "lane" (farm and hold a lane) | "push" (advance with creeps and hit towers) | "defend" (guard our outermost tower in a lane) | "gank" (hunt one enemy hero) | "group" (gather with the team, at a lane's tower or a point) | "follow" (stick to an ally) | "hold" (stay at a landmark) | "roam" (go to a landmark, then fight nearby) | "retreat" (go back to base and heal)
- lane: "top" | "mid" | "bot"
- target: enemy hero id (who to hunt in gank mode, or who to focus)
- follow: our hero id
- point: landmark id
- aggression: "safe" | "normal" | "aggressive" (aggressive dives towers and fights at lower health)
- focus: "heroes" | "creeps" | "towers" | "any"
- ult: "hold" (save it) | "auto" | "now" (cast at the first chance)
- cast: "q" (use Q at the first chance)
- shop: "damage" | "armor" | "speed" | "magic" | "regen" (what to buy next)
- duration: seconds for a temporary order, 5-120 (default 30)
"persist": true when the order changes your standing job ("farm bot from now on", "play safe this game", "you're mid now"); false for a one-off action (gank, retreat, group for a fight, push for a bit), after which you return to standing orders.
"say": what you reply out loud, at most 7 words, in character, no emoji. If you are dead, say so; the directive applies on respawn.`;
function landmarkText() { return S.landmarks.filter(l => !l.unit || l.unit.alive).map(l => `${l.id} (${l.label})`).join('; '); }
function agentPrompt(h, instruction, command) {
  const R = ROSTER.find(r => r.key === h.key);
  return `You are ${h.name}, a ${KITS[h.kit].role} hero in a real-time MOBA, on the Radiant team (base bottom-left). Personality: ${R.persona}. Your shotcaller just gave you an order. Turn it into a behavior directive for your autopilot. Respond fast and only with JSON.

YOUR KIT: ${KIT_DESC(h)}
YOU: ${heroLine(h, true).slice(2)}
TEAMMATES:
${allies().filter(o => o !== h).map(o => heroLine(o, true)).join('\n')}
ENEMIES:
${enemiesH().map(o => heroLine(o, false)).join('\n')}
TIME ${fmtTime(S.t)}, kills ${S.kills[0]}-${S.kills[1]}.
LANDMARKS (ids for "point"): ${landmarkText()}

${DIRECTIVE_SPEC}

Reply with only JSON: {"directive":{...},"persist":true|false,"say":"..."}

FULL SPOKEN COMMAND: "${command.replace(/"/g, "'")}"
YOUR PART OF IT: "${instruction.replace(/"/g, "'")}"`;
}
function batchPrompt(routes, command) {
  const hs = routes.map(r => S.heroes[r.hero]);
  return `You control several heroes on the Radiant team in a real-time MOBA (our base bottom-left). The shotcaller gave an order to each of them. Turn each order into a behavior directive for that hero's autopilot, each in that hero's own voice. Respond fast and only with JSON.

HEROES RECEIVING ORDERS
${hs.map(h => { const R = ROSTER.find(r => r.key === h.key); return `${h.key} (${h.name}), personality: ${R.persona}. Kit: ${KIT_DESC(h)}\n  State: ${heroLine(h, true).slice(2)}`; }).join('\n')}
OTHER TEAMMATES:
${allies().filter(o => !hs.includes(o)).map(o => heroLine(o, true)).join('\n') || 'none'}
ENEMIES:
${enemiesH().map(o => heroLine(o, false)).join('\n')}
TIME ${fmtTime(S.t)}, kills ${S.kills[0]}-${S.kills[1]}.
LANDMARKS (ids for "point"): ${landmarkText()}

${DIRECTIVE_SPEC}

ORDERS
${routes.map(r => `- ${r.hero}: "${r.instruction.replace(/"/g, "'")}"`).join('\n')}
FULL SPOKEN COMMAND: "${command.replace(/"/g, "'")}"

Reply with only JSON: {"heroes":{"<hero id>":{"directive":{...},"persist":true|false,"say":"..."}}}`;
}

/* =========================================================
   Applying directives
   ========================================================= */
const MODES = ['lane','push','defend','gank','group','follow','hold','roam','retreat'];
function sanitize(h, d) {
  const o = {}; if (!d || typeof d !== 'object') return o;
  const enemyKeys = enemiesH().map(e => e.key), allyKeys = allies().map(a => a.key);
  const norm = v => typeof v === 'string' ? v.toLowerCase().trim() : v;
  const m = norm(d.mode); if (m === 'farm') o.mode = 'lane'; else if (MODES.includes(m)) o.mode = m;
  const l = norm(d.lane); if (l) { const L = l === 'middle' ? 'mid' : l === 'bottom' ? 'bot' : l; if (LANES.includes(L)) o.lane = L; }
  const resolveHero = (v, keys) => { v = norm(v); if (!v) return null; if (keys.includes(v)) return v; const R = ROSTER.find(r => keys.includes(r.key) && r.name.toLowerCase() === v); return R ? R.key : null; };
  const t = resolveHero(d.target, enemyKeys); if (t) o.target = t;
  const f = resolveHero(d.follow, allyKeys); if (f && f !== h.key) o.follow = f;
  const p = norm(d.point); if (p && S.landmarks.some(x => x.id === p)) o.point = p;
  const ag = norm(d.aggression); if (['safe','normal','aggressive'].includes(ag)) o.aggression = ag;
  const fo = norm(d.focus); if (['heroes','creeps','towers','any'].includes(fo)) o.focus = fo;
  const u = norm(d.ult); if (['hold','auto','now'].includes(u)) o.ult = u;
  const c = norm(d.cast); if (c === 'q' || c === 'r') o.cast = c;
  const s = norm(d.shop); if (ITEMS[s]) o.shop = s;
  const du = Number(d.duration); if (du > 0) o.duration = clamp(du, 5, 120);
  if (o.mode === 'gank' && !o.target) o.mode = undefined;
  if (o.mode === 'follow' && !o.follow) o.mode = undefined;
  if ((o.mode === 'hold' || o.mode === 'roam') && !o.point) o.mode = undefined;
  if (o.mode === undefined) delete o.mode;
  return o;
}
function applyDirective(h, raw, persist, say, src) {
  const before = JSON.stringify([h.standing, h.order && stripDir(h.order), h.castReq, h.shop, h.retreating]);
  const d = sanitize(h, raw);
  const patch = {...d}; delete patch.cast; delete patch.shop; delete patch.duration;
  if (patch.ult === 'now') { h.castReq = {key:'r', until:S.t + 20}; delete patch.ult; }
  if (d.cast) h.castReq = {key:d.cast, until:S.t + 12};
  if (d.shop) h.shop = d.shop;
  const hasMove = Object.keys(patch).length > 0;
  if (patch.mode === 'retreat') persist = false; // a standing retreat would never clear and strand the hero in base
  if (hasMove) {
    if (persist || (patch.mode && ['lane','push','defend'].includes(patch.mode) && persist !== false && !d.duration)) {
      h.standing = {...DEFAULT_DIR, ...h.standing, ...patch};
      if (patch.mode && patch.mode !== 'retreat') { if (patch.mode !== 'gank') delete h.standing.target; if (patch.mode !== 'follow') delete h.standing.follow; }
      h.order = null;
    } else {
      const base = {...h.standing};
      if (patch.mode && patch.mode !== h.standing.mode) { delete base.target; delete base.follow; delete base.point; }
      h.order = {...base, ...patch, until:S.t + (d.duration || (patch.mode === 'retreat' ? 45 : 30))};
    }
    if (patch.mode === 'retreat') h.retreating = true;
    else if (h.retreating && patch.mode) h.retreating = false;
    h.think = 0;
  }
  if (say) heroSay(h, String(say).slice(0, 60), true);
  const changed = before !== JSON.stringify([h.standing, h.order && stripDir(h.order), h.castReq, h.shop, h.retreating]);
  flashHero(h);
  return {...d, persist:!!persist, changed};
}

/* =========================================================
   Instant path: deterministic parsing for simple orders
   ========================================================= */
const ALL_WORDS = /\b(everyone|everybody|every one|all of you|you all|y'all|team|guys|squad|all)\b/g;
function normText(t) { return ' ' + t.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }
function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9; const d = Array.from({length:m + 1}, (_, i) => [i]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1)); return d[m][n]; }
function extractHeroes(text, team) {
  let s = text; const found = [];
  for (const R of ROSTER.filter(r => r.team === team)) {
    const terms = [...R.aliases, R.name.toLowerCase(), ...R.hear].sort((a, b) => b.length - a.length);
    for (const f of new Set(terms)) {
      const re = new RegExp(`\\b(the )?${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      if (re.test(s)) { s = s.replace(re, ' '); if (!found.includes(R.key)) found.push(R.key); }
    }
    // fuzzy single-word match on the name
    s = s.replace(/\b[a-z]{3,8}\b/g, w => {
      const n = R.name.toLowerCase();
      if (w !== n && n.length >= 4 && lev(w, n) <= 1 && !COMMON.has(w)) { if (!found.includes(R.key)) found.push(R.key); return ' '; }
      return w;
    });
  }
  return {rest:s, found};
}
const COMMON = new Set(['back','bait','base','bark','more','bot','top','mid','safe','push','gank','sola','solo','vets','lyre','go','now','all']);
const LANE_W = '(top|mid|middle|bot|bottom)';
function laneNorm(w) { return w === 'middle' ? 'mid' : w === 'bottom' ? 'bot' : w; }
function fastParse(raw) {
  let t = normText(raw);
  const allHit = ALL_WORDS.test(t); ALL_WORDS.lastIndex = 0;
  t = t.replace(ALL_WORDS, ' ');
  // enemies first ("their tank") so ally aliases don't steal them
  const en = extractHeroes(t, 1); t = en.rest;
  const al = extractHeroes(t, 0); t = al.rest;
  t = t.replace(/\b(lets|let us|please|ok|okay|hey|alright|right|quick|quickly|now|you|guys|and|both|of|lane|the|go go|everyone else)\b/g, ' ').replace(/\s+/g, ' ').trim();
  let action = null, m;
  if ((m = t.match(/^(go |head |move |get |run )?(back|home|to base|base|to fountain)$/)) || /^(retreat|fall back|back off|get out( of there)?|bail|disengage|run|abort)$/.test(t)) action = {mode:'retreat', persist:false};
  else if ((m = t.match(new RegExp(`^(go |head |move |get |rotate |farm |play )?(to )?${LANE_W}$`)))) action = {mode:'lane', lane:laneNorm(m[3]), persist:true};
  else if ((m = t.match(new RegExp(`^push (to )?${LANE_W}$`)))) action = {mode:'push', lane:laneNorm(m[2]), persist:false, duration:60};
  else if ((m = t.match(new RegExp(`^(defend|def|protect|hold) ${LANE_W}( tower)?$`)))) action = {mode:'defend', lane:laneNorm(m[2]), persist:false, duration:45};
  else if (/^(group( up)?|regroup|gather( up)?|stick together|come together)$/.test(t)) action = {mode:'group', persist:false, duration:40};
  else if ((m = t.match(new RegExp(`^(group|gather|regroup)( up)? ${LANE_W}$`)))) action = {mode:'group', lane:laneNorm(m[3]), persist:false, duration:45};
  else if (/^(ult|ulti|ultimate|use (your )?(ult|ultimate)|pop (your )?(ult|ultimate)|press r)$/.test(t)) action = {ult:'now', persist:false};
  else if (/^(play )?(safe|careful|carefully|passive)$/.test(t)) action = {aggression:'safe', persist:true};
  else if (/^(play |be )?(aggressive|aggro|aggresive)$/.test(t)) action = {aggression:'aggressive', persist:true};
  else if (en.found.length === 1 && /^(kill|focus|gank|attack|jump|hit|go on|dive|get|hunt|go kill|go gank|focus fire)$/.test(t)) action = {mode:'gank', target:en.found[0], persist:false, duration:25};
  if (!action) return null;
  if (en.found.length && action.mode !== 'gank') return null;
  let targets;
  if (allHit) targets = allies().map(h => h.key);
  else if (al.found.length) targets = al.found;
  else if (S.selected) targets = [S.selected];
  let why = allHit ? 'everyone' : al.found.length ? 'named' : 'selected hero';
  if (!targets) {
    const sc = screenContext(), lastCmd = cmdHistory[cmdHistory.length - 1];
    if (sc.visA.length) { targets = sc.visA; why = 'heroes on screen'; }
    else if (lastCmd && lastCmd.routedTo.length) { targets = lastCmd.routedTo; why = 'last addressed'; }
    else { targets = allies().map(h => h.key); why = 'nobody named or on screen, so everyone'; }
  }
  return {targets, action, why};
}

/* =========================================================
   Command pipeline
   ========================================================= */
let cmdCount = 0;
const inflight = {};   // hero key -> {seq, ctl}
let seqN = 0;
const latestCmd = {};  // hero key -> seq of the newest command that claimed it; an older command's late reply never overrides it
let cmdSeqN = 0;
async function runCommand(text, source, sttMs) {
  text = text.trim(); if (!text) return;
  cmdCount++;
  const cmdSeq = ++cmdSeqN;
  const entry = traceAdd(text, source, sttMs);
  const st0 = liveStatus(text);
  const t0 = performance.now();
  const secs = () => ((performance.now() - t0) / 1000).toFixed(1) + 's';
  const rec = logStart(text, source, sttMs);
  const st = {live:st0.live, done:(html, cls) => { st0.done(html, cls); rec.result = html.replace(/<[^>]+>/g, ''); rec.ok = cls !== 'err'; rec.totalMs = Math.round(performance.now() - t0); logFinish(rec); }};
  if (settings.fast || AI.mode === 'local') {
    const fp = fastParse(text);
    if (fp) {
      const ms = Math.round(performance.now() - t0);
      entry.tag('INSTANT', 'fast');
      entry.step(`<b>instant path</b> ${ms}ms → ${fp.targets.map(k => S.heroes[k].name).join(', ')} <em>(${fp.why})</em>`);
      const results = [];
      for (const k of fp.targets) {
        const h = S.heroes[k]; latestCmd[k] = cmdSeq; if (inflight[k]) { inflight[k].ctl.abort(); delete inflight[k]; h.pending = 0; }
        const {persist, ...dir} = fp.action;
        const R = ROSTER.find(r => r.key === k);
        let say = !h.alive ? 'Dead — will do on respawn.' : fp.action.mode === 'retreat' ? pick(['Falling back.', 'Going home.', 'Backing off.']) : pick(R.acks);
        if (dir.ult === 'now' && h.alive) say = h.lvl < 6 ? 'Ult unlocks at six.' : h.cd.r > 0 ? `Ult back in ${Math.ceil(h.cd.r)}.` : say;
        const ap = applyDirective(h, dir, persist, say);
        rec.agents.push({hero:k, applied:stripDir(dir), persist:!!persist, changed:ap.changed, label:orderLabel(h), say});
        entry.step(`<b>${h.name}</b> ${esc(JSON.stringify(stripDir(dir)))}`);
        results.push(`<b>${h.name}</b> ${esc(dir.ult === 'now' ? 'ULT NOW' : orderLabel(h))}`);
      }
      cmdHistory.push({text, routedTo:fp.targets});
      rec.path = 'instant'; rec.routedTo = fp.targets; rec.why = fp.why;
      st.done(`Instant · ${results.join(' · ')}`, 'ok');
      return;
    }
    if (AI.mode === 'local') {
      rec.path = 'not_understood';
      entry.tag('NOT UNDERSTOOD', 'err'); entry.step('Without Claude only simple orders run: names + go top/mid/bot, push, defend, group, back, ult, kill &lt;enemy&gt;.');
      st.done('Not understood. The agents are offline, so only simple orders work (see Settings).', 'err'); return;
    }
  }
  if (AI.mode === 'detecting') { rec.path = 'not_ready'; entry.tag('WAIT', 'err'); entry.step('Still connecting to Claude, try again in a second.'); st.done('Still connecting to Claude. Try again in a moment.', 'err'); return; }
  // ---- router
  entry.tag('ROUTING…', 'live');
  st.live(`Routing <b>“${esc(text)}”</b>`);
  const sc = screenContext();
  entry.step(`<b>router</b> … <em>screen: ${sc.lane} lane, ${sc.visA.length ? sc.visA.join('+') : 'no allies'} visible${S.selected ? ', selected ' + S.selected : ''}</em>`);
  const guess = guessTargets(text);
  for (const k of guess) S.heroes[k].pending++;
  let routes, note = '';
  rec.path = 'routed';
  try {
    const r = await llmJSON(routerPrompt(text), undefined, {kind:'router', order:rec.n});
    rec.router = {ms:Math.round(performance.now() - t0), raw:r};
    routes = (Array.isArray(r.routes) ? r.routes : []).map(x => ({hero:resolveAlly(x.hero), instruction:String(x.instruction || text)})).filter(x => x.hero);
    const seen = new Set(); routes = routes.filter(x => !seen.has(x.hero) && seen.add(x.hero));
    note = r.note ? String(r.note) : '';
    entry.replaceLast(`<b>router</b> ${Math.round(performance.now() - t0)}ms → ${routes.map(x => `${S.heroes[x.hero].name}: “${esc(x.instruction)}”`).join(' · ') || 'nobody'}${note ? ` <em>(${esc(note)})</em>` : ''}`);
  } catch (e) {
    for (const k of guess) S.heroes[k].pending = Math.max(0, S.heroes[k].pending - 1);
    const msg = handleAIError(e);
    rec.router = {ms:Math.round(performance.now() - t0), error:{code:e && e.code || null, message:msg}};
    entry.tag('ERROR', 'err'); entry.replaceLast(`<b>router</b> failed: ${esc(msg)}`);
    st.done(`Router failed: ${esc(msg)}`, 'err'); return;
  }
  for (const k of guess) S.heroes[k].pending = Math.max(0, S.heroes[k].pending - 1);
  cmdHistory.push({text, routedTo:routes.map(r => r.hero)});
  rec.routedTo = routes.map(r => r.hero); rec.routes = routes;
  if (!routes.length) {
    entry.tag('NO ROUTE', 'err');
    st.done(`The router didn’t find an order for your heroes${note ? `: ${esc(note)}` : '.'}`, 'err'); return;
  }
  // a newer command already claimed these heroes while this one was routing
  const stale = routes.filter(r => (latestCmd[r.hero] || 0) > cmdSeq);
  if (stale.length) {
    for (const r of stale) { rec.agents.push({hero:r.hero, instruction:r.instruction, superseded:true}); entry.step(`<b>${S.heroes[r.hero].name}</b> superseded by a newer order`); }
    routes = routes.filter(r => !stale.includes(r));
    if (!routes.length) { entry.tag('SUPERSEDED'); st.done('Superseded by a newer order.', 'ok'); return; }
  }
  for (const r of routes) latestCmd[r.hero] = cmdSeq;
  // ---- hero agents
  entry.tag('THINKING…', 'live');
  st.live(`Routed to <b>${routes.map(x => S.heroes[x.hero].name).join(', ')}</b> · agents deciding`);
  const t1 = performance.now();
  const results = []; let anyErr = false;
  const claims = routes.map(r => { const seq = ++seqN; if (inflight[r.hero]) inflight[r.hero].ctl.abort(); const ctl = new AbortController(); inflight[r.hero] = {seq, ctl}; S.heroes[r.hero].pending++; return {...r, seq, ctl}; });
  const finish = (c, out, err) => {
    const h = S.heroes[c.hero]; h.pending = Math.max(0, h.pending - 1);
    const mine = inflight[c.hero] && inflight[c.hero].seq === c.seq;
    if (mine) delete inflight[c.hero];
    const ams = Math.round(performance.now() - t1);
    if (!mine) { rec.agents.push({hero:c.hero, instruction:c.instruction, ms:ams, superseded:true, raw:out}); entry.step(`<b>${h.name}</b> superseded by a newer order`); results.push(`<b>${h.name}</b> superseded`); return; }
    if (err) { anyErr = true; const m = handleAIError(err); rec.agents.push({hero:c.hero, instruction:c.instruction, ms:ams, error:{code:err.code || null, message:m}}); entry.step(`<b>${h.name}</b> ${esc(m)}`); results.push(`<b>${h.name}</b> failed`); return; }
    const applied = applyDirective(h, out && out.directive, out && out.persist, out && out.say);
    const what = applied.changed ? esc(applied.cast === 'r' || (out && out.directive && String(out.directive.ult).toLowerCase() === 'now') ? orderLabel(h) + ' · ULT' : orderLabel(h)) : 'kept current orders';
    results.push(`<b>${h.name}</b> ${what}`);
    rec.agents.push({hero:c.hero, instruction:c.instruction, ms:ams, raw:out, applied:stripDir(applied), persist:applied.persist, changed:applied.changed, label:orderLabel(h), say:out && out.say || ''});
    entry.step(`<b>${h.name}</b> ${Math.round(performance.now() - t1)}ms ${esc(JSON.stringify(stripDir(applied)))}${applied.changed ? (applied.persist ? ' <em>standing</em>' : ' <em>temporary</em>') : ' <em>no change</em>'} — “${esc(out && out.say || '')}”`);
    st.live(`Routed to <b>${routes.map(x => S.heroes[x.hero].name).join(', ')}</b> · ${results.join(' · ')}`);
  };
  if (settings.batch && claims.length >= 3) {
    rec.batched = true;
    entry.step(`<b>agents</b> one batched call for ${claims.length} heroes…`);
    try {
      const out = await llmJSON(batchPrompt(claims, text), undefined, {kind:'batch', order:rec.n, heroes:claims.map(c => c.hero)});
      const map = (out && (out.heroes || out)) || {};
      for (const c of claims) { const o = map[c.hero] || map[S.heroes[c.hero].name]; finish(c, o || null, o ? null : {message:'no directive returned'}); }
    } catch (e) { for (const c of claims) finish(c, null, e); }
  } else {
    await Promise.all(claims.map(async c => {
      try { finish(c, await llmJSON(agentPrompt(S.heroes[c.hero], c.instruction, text), c.ctl.signal, {kind:'agent', order:rec.n, heroes:[c.hero]}), null); }
      catch (e) { finish(c, null, e); }
    }));
  }
  entry.step(`<b>total</b> ${Math.round(performance.now() - t0)}ms${sttMs ? ` + speech ${sttMs}ms` : ''}`);
  entry.tag(anyErr ? 'PARTLY FAILED' : `DONE ${secs()}`, anyErr ? 'err' : 'ok');
  st.done(`${results.join(' · ')} · ${secs()}`, anyErr ? 'err' : 'ok');
}

/* order log: one record per order, appended by the server to logs/orders.jsonl */
const LOG = {on:false, written:0, failed:0, session:'s' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 13) + '-' + Math.random().toString(36).slice(2, 6)};
function renderLogStatus() {
  const el = $('logLine'); if (!el) return;
  if (!LOG.on) { el.innerHTML = '<span class="dot"></span>Order log: off (server unreachable)'; return; }
  el.innerHTML = `<span class="dot ${LOG.failed ? 'warn' : 'on'}"></span>Order log: <b>on</b> · ${LOG.written} saved this session${LOG.failed ? ` · ${LOG.failed} failed` : ''}`;
}
function snapshotHero(h) {
  return {alive:h.alive, lvl:h.lvl, hp:Math.round(h.hp / h.maxHp * 100), pos:[Math.round(h.x), Math.round(h.y)], where:h.alive ? describePos(h) : 'dead', order:orderLabel(h),
    standing:stripDir(h.standing), temp:h.order ? stripDir(h.order) : null, retreating:h.retreating, kills:h.kills, deaths:h.deaths};
}
function logStart(text, source, sttMs) {
  const sc = screenContext();
  return {session:LOG.session, n:cmdCount, at:new Date().toISOString(), gameTime:fmtTime(S.t), gameT:Math.round(S.t * 10) / 10,
    text, source, sttMs:sttMs || null, aiMode:AI.mode, model:AI.model, settings:{fast:settings.fast, batch:settings.batch, diff:settings.diff},
    screen:{centre:sc.centre, lane:sc.lane, alliesOnScreen:sc.visA, enemiesOnScreen:sc.visE, selected:sc.selected, cam:[Math.round(cam.x), Math.round(cam.y), +cam.z.toFixed(2)]},
    score:S.kills.slice(), before:Object.fromEntries(allies().map(h => [h.key, snapshotHero(h)])),
    enemies:Object.fromEntries(enemiesH().map(h => [h.key, {alive:h.alive, hp:Math.round(h.hp / h.maxHp * 100), where:h.alive ? describePos(h) : 'dead'}])),
    path:null, routedTo:[], router:null, agents:[], batched:false};
}
function logFinish(rec) {
  if (!LOG.on || rec.saved) return;
  rec.saved = true;
  const id = `${rec.session}-${String(rec.n).padStart(4, '0')}`;
  const clean = JSON.parse(JSON.stringify(rec));
  delete clean.saved;
  const post = body => fetch('/api/orders', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body)})
    .then(r => { if (!r.ok) throw new Error(r.statusText); });
  const p = post({id, ...clean}).then(() => { LOG.written++; renderLogStatus(); }).catch(() => { LOG.failed++; renderLogStatus(); });
  // ten seconds later, record what the routed heroes are actually doing
  setTimeout(async () => {
    try { await p; if (!S) return;
      const keys = rec.routedTo && rec.routedTo.length ? rec.routedTo : allies().map(h => h.key);
      await post({id, session:rec.session, n:rec.n, after10s:{gameTime:fmtTime(S.t), score:S.kills.slice(), heroes:Object.fromEntries(keys.map(k => [k, snapshotHero(S.heroes[k])]))}});
    } catch {}
  }, 10000);
}

/* live status line above the order box: always shows what the latest order is doing */
let statusTok = 0, statusTimer = null, statusHide = null;
function liveStatus(text) {
  const tok = ++statusTok, el = $('status'), t0 = performance.now();
  const paint = (html, cls, live) => {
    if (tok !== statusTok) return;
    clearInterval(statusTimer); clearTimeout(statusHide);
    el.hidden = false; el.className = 'status ' + cls;
    const draw = () => {
      const sec = (performance.now() - t0) / 1000;
      const consent = live && AI.mode === 'claude' && !AI.ok && sec > 2.5 ? '<span class="hint2">Waiting on the first model call…</span>' : '';
      el.innerHTML = `<span class="st-dot"></span><span class="st-msg">${html}${live ? ` <span class="st-el">${sec.toFixed(1)}s</span>` : ''}${consent}</span>`;
    };
    draw();
    if (live) statusTimer = setInterval(draw, 100);
    else statusHide = setTimeout(() => { if (tok === statusTok) el.hidden = true; }, 9000);
  };
  return {live:html => paint(html, 'live', true), done:(html, cls) => paint(html, cls || 'ok', false)};
}
function resolveAlly(v) {
  if (!v) return null; v = String(v).toLowerCase().trim();
  const R = ROSTER.find(r => r.team === 0 && (r.key === v || r.name.toLowerCase() === v));
  return R ? R.key : null;
}
function guessTargets(text) {
  const t = normText(text);
  if (/\b(everyone|everybody|team|guys|all)\b/.test(t)) return allies().map(h => h.key);
  const f = extractHeroes(t, 0).found; if (f.length) return f;
  if (S.selected) return [S.selected];
  return screenContext().visA;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* trace panel */
function traceAdd(text, source, sttMs) {
  const box = $('trace'); const empty = box.querySelector('.empty'); if (empty) empty.remove();
  const el = document.createElement('div'); el.className = 'tr';
  el.innerHTML = `<div class="tr-top"><span class="tr-time">${fmtTime(S.t)}</span><span class="tr-text"></span><span class="tag">${source === 'voice' ? 'VOICE' : 'TYPED'}</span></div>`;
  el.querySelector('.tr-text').textContent = `“${text}”`;
  box.prepend(el);
  while (box.children.length > 25) box.lastChild.remove();
  let last = null;
  return {
    tag(label, cls) { let t = el.querySelector('.tag.k'); if (!t) { t = document.createElement('span'); t.className = 'tag k'; el.querySelector('.tr-top').appendChild(t); } t.className = 'tag k ' + (cls || ''); t.textContent = label; },
    step(html) { last = document.createElement('div'); last.className = 'step'; last.innerHTML = html; el.appendChild(last); },
    replaceLast(html) { if (last) last.innerHTML = html; else this.step(html); },
  };
}

/* =========================================================
   Voice in (speech-to-text)
   ========================================================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const STT = {rec:null, on:false, want:false, releasedAt:0};
const noticeShown = {};
function showNotice(text, key) {
  if (key) { if (noticeShown[key]) return; noticeShown[key] = true; }
  $('noticeText').textContent = text; $('notice').hidden = false;
}
$('noticeClose').addEventListener('click', () => { $('notice').hidden = true; });
function micStart() {
  if (STT.on) return;
  if (!SR) { showNotice('This browser has no built-in speech recognition. Use Chrome, Edge or Safari for voice, or type orders below.', 'nosr'); $('cmdInput').focus(); return; }
  STT.want = true;
  const rec = new SR(); STT.rec = rec;
  rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = settings.open; rec.maxAlternatives = 1;
  rec.onstart = () => { STT.on = true; $('micBtn').classList.add('live'); setInterim('Listening…', true); };
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { const txt = r[0].transcript; const ms = STT.releasedAt ? Math.max(0, Math.round(performance.now() - STT.releasedAt)) : 0; setInterim(`“${txt.trim()}”`, false); runCommand(txt, 'voice', ms); }
      else interim += r[0].transcript;
    }
    if (interim) setInterim(interim, true);
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
      STT.want = false;
      showNotice('The microphone is blocked here. Inside Claude, pages can’t use the mic, so type orders below. For voice, open the downloaded copy of this page in Chrome.', 'mic');
    } else if (e.error !== 'no-speech' && e.error !== 'aborted') setInterim(`Speech error: ${e.error}`, false);
  };
  rec.onend = () => {
    STT.on = false; $('micBtn').classList.remove('live');
    if (STT.want && settings.open) { try { micStart(); } catch {} } else if ($('interim').classList.contains('live')) setInterim('Hold Space or the mic to speak. Enter sends a typed order.', false);
  };
  STT.releasedAt = 0;
  try { rec.start(); } catch (e) { setInterim('Could not start the microphone.', false); }
}
function micStop() {
  STT.releasedAt = performance.now();
  if (settings.open) return;
  STT.want = false;
  if (STT.rec && STT.on) try { STT.rec.stop(); } catch {}
}
function setInterim(t, live) { const el = $('interim'); el.textContent = t; el.classList.toggle('live', !!live); }

/* =========================================================
   Input
   ========================================================= */
const mic = $('micBtn');
mic.addEventListener('pointerdown', e => { e.preventDefault(); if (settings.open) { if (STT.on || STT.want) { STT.want = false; STT.rec && STT.rec.stop(); } else micStart(); } else micStart(); });
mic.addEventListener('pointerup', () => { if (!settings.open) micStop(); });
mic.addEventListener('pointerleave', () => { if (!settings.open && STT.on) micStop(); });
// the viewer's sandbox never fires form submit, so Enter is handled on the input itself
$('cmdInput').addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing || e.keyCode === 229) return;
  e.preventDefault(); e.stopPropagation();
  const v = $('cmdInput').value; $('cmdInput').value = '';
  runCommand(v, 'typed', 0);
});

const keys = new Set();
let spaceDown = false, lastNum = {k:null, t:0};
window.addEventListener('keydown', e => {
  const typing = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT');
  if (typing) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  // leave browser and OS shortcuts alone; on macOS a letter held with Cmd often never gets a keyup, which would stick the pan keys
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // a keyboard-focused button keeps Enter and Space so it can be pressed
  if ((e.key === 'Enter' || e.code === 'Space') && document.activeElement && document.activeElement.tagName === 'BUTTON') return;
  if (e.code === 'Space') { e.preventDefault(); if (!spaceDown) { spaceDown = true; if (settings.open) { if (!STT.on) micStart(); } else micStart(); } return; }
  if (/^[1-4]$/.test(e.key)) { const k = allies()[+e.key - 1].key; const dbl = lastNum.k === k && performance.now() - lastNum.t < 350; lastNum = {k, t:performance.now()}; S.selected = k; if (dbl) selectHero(k, true); else renderSquad(); return; }
  if (e.key === 'Escape') { S.selected = null; renderSquad(); return; }
  if (e.key === 'p' || e.key === 'P') { togglePause(); return; }
  if (e.key === 'Enter') { $('cmdInput').focus(); e.preventDefault(); return; }
  if (e.key === '=' || e.key === '+') { zoomAt(1.15); return; }
  if (e.key === '-' || e.key === '_') { zoomAt(1 / 1.15); return; }
  keys.add(e.key.toLowerCase());
});
window.addEventListener('keyup', e => {
  if (e.code === 'Space' && spaceDown) { spaceDown = false; if (!settings.open) micStop(); return; }
  keys.delete(e.key.toLowerCase());
});
const releaseKeys = () => { keys.clear(); if (spaceDown) { spaceDown = false; micStop(); } };
window.addEventListener('blur', releaseKeys);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseKeys(); });
window.addEventListener('keyup', e => { if (e.key === 'Meta') keys.clear(); });
// a mouse click shouldn't leave the button focused, or the next Space would press it instead of opening the mic
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b && e.detail > 0) b.blur(); });

// canvas: drag to pan, click to select, wheel to zoom
let drag = null;
view.addEventListener('pointerdown', e => { view.setPointerCapture(e.pointerId); drag = {x:e.clientX, y:e.clientY, cx:cam.x, cy:cam.y, moved:false}; });
view.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 6) { drag.moved = true; view.classList.add('panning'); }
  if (drag.moved) { cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; clampCam(); }
});
view.addEventListener('pointerup', e => {
  view.classList.remove('panning');
  if (drag && !drag.moved) {
    const r = view.getBoundingClientRect(), w = s2w(e.clientX - r.left, e.clientY - r.top);
    let best = null, bd = 40 / cam.z + 10;
    for (const h of allies()) if (h.alive && dist(h, w) < bd) { bd = dist(h, w); best = h; }
    S.selected = best ? best.key : null; renderSquad();
  }
  drag = null;
});
// scroll / two-finger swipe pans the map; pinch (ctrl+wheel) or +/- zooms
view.addEventListener('wheel', e => {
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cssH : 1;
  if (e.ctrlKey) { zoomAt(Math.exp(-e.deltaY * unit * .01), e); return; }
  let dx = e.deltaX * unit, dy = e.deltaY * unit;
  if (e.shiftKey && !dx) { dx = dy; dy = 0; }
  cam.x += dx / cam.z; cam.y += dy / cam.z; clampCam();
}, {passive:false});
function zoomAt(f, e) {
  const r = view.getBoundingClientRect();
  const sx = e ? e.clientX - r.left : cssW / 2, sy = e ? e.clientY - r.top : cssH / 2;
  const before = s2w(sx, sy); cam.z *= f; clampCam();
  const after = s2w(sx, sy); cam.x += before.x - after.x; cam.y += before.y - after.y; clampCam();
}
let mdrag = false;
const miniJump = e => { const r = mini.getBoundingClientRect(); cam.x = (e.clientX - r.left) / r.width * WORLD; cam.y = (e.clientY - r.top) / r.height * WORLD; clampCam(); };
mini.addEventListener('pointerdown', e => { mdrag = true; mini.setPointerCapture(e.pointerId); miniJump(e); });
mini.addEventListener('pointermove', e => { if (mdrag) miniJump(e); });
mini.addEventListener('pointerup', () => { mdrag = false; });

function togglePause() { S.paused = !S.paused; $('pauseBtn').setAttribute('aria-pressed', S.paused); $('pauseBtn').textContent = S.paused ? 'Resume' : 'Pause'; }
$('pauseBtn').addEventListener('click', togglePause);
$('speedBtn').addEventListener('click', () => { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? .5 : 1; $('speedBtn').textContent = (S.speed === .5 ? '½' : S.speed) + '×'; });
$('settingsBtn').addEventListener('click', () => { const s = $('settings'); s.hidden = !s.hidden; $('settingsBtn').setAttribute('aria-expanded', !s.hidden); });
$('againBtn').addEventListener('click', () => { const sp = S.speed; newGame(); S.speed = sp; $('overlay').hidden = true; buildSquad(); renderSquad(); });
const bindCheck = (id, key, fn) => { const el = $(id); el.checked = settings[key]; el.addEventListener('change', () => { settings[key] = el.checked; saveSettings(); fn && fn(); }); };
bindCheck('optFast', 'fast'); bindCheck('optBatch', 'batch'); bindCheck('optVoice', 'voice', () => { if (!settings.voice) try { speechSynthesis.cancel(); } catch {} });
bindCheck('optOpen', 'open', () => { if (!settings.open) { STT.want = false; STT.rec && STT.on && STT.rec.stop(); } });
$('optDiff').value = settings.diff;
$('optDiff').addEventListener('change', e => { settings.diff = e.target.value; saveSettings(); for (const h of enemiesH()) { h.statMult = ({easy:.85, normal:1, hard:1.12})[settings.diff]; recompute(h); } });

const EXAMPLES = ['Brakka and Lyra, gank Nyx', 'Vex, farm bot and play safe', 'Sola, stick with Vex', 'Everyone group mid', 'Lyra save your ult for their carry', 'Fall back!', 'Everyone push top, Vex keep farming bot'];
$('examples').replaceChildren(...EXAMPLES.map(t => { const b = document.createElement('button'); b.className = 'ex'; b.type = 'button'; b.textContent = t; b.addEventListener('click', () => { b.blur(); runCommand(t, 'typed', 0); }); return b; }));

/* =========================================================
   Main loop
   ========================================================= */
let last = performance.now(), uiT = 0;
function frame(now) {
  const real = Math.min(.05, (now - last) / 1000); last = now;
  // keyboard pan
  const pan = 700 / cam.z * real;
  if (keys.has('w') || keys.has('arrowup')) cam.y -= pan;
  if (keys.has('s') || keys.has('arrowdown')) cam.y += pan;
  if (keys.has('a') || keys.has('arrowleft')) cam.x -= pan;
  if (keys.has('d') || keys.has('arrowright')) cam.x += pan;
  clampCam();
  const sim = real * S.speed;
  const sub = Math.ceil(sim / .034);
  for (let i = 0; i < sub; i++) step(sim / sub);
  draw();
  uiT -= real; if (uiT <= 0) { uiT = .2; renderSquad(); }
  requestAnimationFrame(frame);
}

newGame();
paintTerrain();
buildSquad();
new ResizeObserver(resize).observe(stage);
resize();
renderSquad();
renderProvider();
initAI();
requestAnimationFrame(frame);
window.__shotcaller = {get S() { return S; }, AI, LOG, step, fastParse, routerPrompt, agentPrompt, batchPrompt, runCommand, applyDirective, cam};
})();
