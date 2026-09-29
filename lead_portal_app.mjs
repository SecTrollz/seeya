#!/usr/bin/env node
// AI Lead Portal: standalone single-file web app. Node 18+, no npm install, no n8n or other service needed.
//
//   node lead_portal_app.mjs                          (open http://localhost:8787)
//   PORTAL_PASS='secret' node lead_portal_app.mjs      (optional password, user "admin" or PORTAL_USER)
//
// Data is saved to lead_portal_data.json next to this file (override with DATA_FILE).
// On first start it loads leads_seed.json if present. Import more with the Import button (JSON array or CSV).
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const DATA_FILE = process.env.DATA_FILE || path.join(DIR, 'lead_portal_data.json');
const SEED_FILE = path.join(DIR, 'leads_seed.json');
const USER = process.env.PORTAL_USER || 'admin';
const PASS = process.env.PORTAL_PASS || '';
const AUTH = PASS ? 'Basic ' + Buffer.from(USER + ':' + PASS).toString('base64') : '';

const TZ = 'America/New_York';
const CALL_HOURS = [10, 14];
const CALL_DAYS = 7;
const VOICEMAIL_LIMIT = 3;
const STOP = { dnc: 'do_not_call', talked: 'talked_to_decision_maker', interested: 'interested' };
const OUTCOMES = ['no_answer', 'voicemail', 'talked', 'interested', 'dnc'];

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== '')) rows.push(row);
  const head = (rows.shift() || []).map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

function importRows(d, rows) {
  const have = new Set(d.profiles.map((p) => p.report_ref));
  let added = 0;
  for (const r of rows || []) {
    if (!r || typeof r !== 'object' || !r.business_name) continue;
    const ref = String(r.report_ref || 'LOCAL-' + Date.now() + '-' + added);
    if (have.has(ref)) continue;
    have.add(ref);
    const p = Object.assign({}, r, { report_ref: ref, status: r.status || 'new' });
    p.priority_score = Number(p.priority_score) || 0;
    p.confidence = Number(p.confidence) || 0;
    d.profiles.push(p);
    added++;
  }
  return added;
}

function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE);
}

let db;
try {
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
} catch {
  db = { profiles: [], slots: [], nextSlotId: 1 };
  if (fs.existsSync(SEED_FILE)) console.log('Loaded ' + importRows(db, JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'))) + ' lead profiles from leads_seed.json');
  save();
}

const tzParts = (t) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
  .formatToParts(new Date(t)).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
function zonedToUtc(y, m, d, h) {
  const guess = Date.UTC(y, m - 1, d, h);
  const p = tzParts(guess);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess;
  return guess - offset;
}
const slotLabel = (t) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t)) + ' ET';

function scheduleSlots(p) {
  const now = Date.now();
  const end = now + CALL_DAYS * 86400000;
  const t0 = tzParts(now);
  const times = [];
  for (let d = 0; d <= CALL_DAYS; d++) {
    const day = new Date(Date.UTC(t0.year, t0.month - 1, t0.day + d));
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (const h of CALL_HOURS) {
      const t = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), h);
      if (t > now && t <= end) times.push(t);
    }
  }
  return times.map((t, i) => ({
    id: db.nextSlotId++, report_ref: p.report_ref, business_name: p.business_name, phone: p.phone || 'UNVERIFIED',
    website: p.website || '', tier: p.tier || 'C', priority_score: Number(p.priority_score) || 0,
    talking_points: p.talking_points || '', call_script: p.call_script || '',
    slot_at: new Date(t).toISOString(), slot_label: slotLabel(t), slot_number: i + 1, total: times.length,
    status: 'pending', no_voicemail: false
  }));
}

function toCard(r) {
  let rep = {};
  try { rep = typeof r.report_json === 'string' ? JSON.parse(r.report_json || '{}') : (r.report_json || {}); } catch { rep = {}; }
  const snap = rep.company_snapshot || {};
  const offer = rep.customized_service_offer || {};
  const ww = rep.wait_warning || {};
  return {
    report_ref: r.report_ref, business_name: r.business_name, location: r.location, industry: r.industry,
    phone: r.phone, website: r.website, employee_count: r.employee_count, priority_score: Number(r.priority_score) || 0,
    tier: r.tier || 'C', confidence: Number(r.confidence) || 0, score_breakdown: r.score_breakdown || '',
    company_about: r.company_about || snap.what_they_do || '', executive_summary: r.executive_summary || rep.executive_summary || '',
    decision_maker: snap.decision_maker && !/unverified/i.test(snap.decision_maker) ? snap.decision_maker : '',
    talking_points: r.talking_points || '', triggering_change: r.triggering_change || '', call_script: r.call_script || '',
    changes: (rep.applicable_legislative_changes || []).slice(0, 4).map((c) => ({ title: c.title, what_changed: c.what_changed || c.summary || '', deadline: c.deadline || '', penalty_exposure: c.penalty_exposure || '' })),
    approaches: (offer.what_we_do || []).concat((offer.n8n_solutions || []).map((s) => s.name + ': ' + (s.what_it_does || ''))).slice(0, 6),
    if_they_wait: (ww.if_they_wait || []).concat(ww.penalties || []).slice(0, 4)
  };
}

const api = {
  'GET /api/queue': () => {
    const cards = db.profiles.filter((p) => p.status === 'new').map(toCard).sort((a, b) => b.priority_score - a.priority_score);
    return { count: cards.length, cards };
  },
  'POST /api/swipe': (b) => {
    const p = db.profiles.find((x) => x.report_ref === String(b.report_ref || ''));
    if (!p) return [404, { error: 'profile not found' }];
    const now = new Date().toISOString();
    if (b.decision === 'ship') {
      db.slots.forEach((s) => { if (s.report_ref === p.report_ref && s.status === 'pending') s.status = 'cancelled'; });
      Object.assign(p, { status: 'shipped', call_status: 'active', calls_made: 0, voicemails: 0, reviewed_at: now });
      const slots = scheduleSlots(p);
      db.slots.push(...slots);
      save();
      return { ok: true, decision: 'ship', report_ref: p.report_ref, slots: slots.length };
    }
    Object.assign(p, { status: 'rejected', reviewed_at: now });
    save();
    return { ok: true, decision: 'reject', report_ref: p.report_ref };
  },
  'GET /api/dialer': () => {
    const now = Date.now();
    const rows = db.slots.filter((s) => s.status === 'pending');
    const byRef = {};
    rows.filter((r) => Date.parse(r.slot_at) <= now).sort((a, b) => Date.parse(b.slot_at) - Date.parse(a.slot_at)).forEach((r) => {
      if (!byRef[r.report_ref]) byRef[r.report_ref] = Object.assign({}, r, { missed: 0 });
      else byRef[r.report_ref].missed++;
    });
    const due = Object.values(byRef).sort((a, b) => b.priority_score - a.priority_score);
    const upcoming = rows.filter((r) => Date.parse(r.slot_at) > now).sort((a, b) => Date.parse(a.slot_at) - Date.parse(b.slot_at)).slice(0, 30)
      .map((r) => ({ report_ref: r.report_ref, business_name: r.business_name, slot_label: r.slot_label, slot_number: r.slot_number }));
    return { now: new Date(now).toISOString(), due, upcoming };
  },
  'POST /api/outcome': (b) => {
    const slot = db.slots.find((s) => s.id === Number(b.slot_id));
    if (!slot) return [404, { error: 'slot not found' }];
    const outcome = OUTCOMES.includes(b.outcome) ? b.outcome : 'no_answer';
    const notes = String(b.notes || '').slice(0, 1000);
    const now = Date.now();
    Object.assign(slot, { status: 'done', outcome, notes, completed_at: new Date(now).toISOString() });
    db.slots.forEach((s) => { if (s.report_ref === slot.report_ref && s.status === 'pending' && Date.parse(s.slot_at) < now) s.status = 'missed'; });
    const p = db.profiles.find((x) => x.report_ref === slot.report_ref) || {};
    p.calls_made = (Number(p.calls_made) || 0) + 1;
    p.voicemails = (Number(p.voicemails) || 0) + (outcome === 'voicemail' ? 1 : 0);
    const stop = Object.prototype.hasOwnProperty.call(STOP, outcome);
    p.call_status = stop ? STOP[outcome] : 'active';
    p.last_outcome = outcome;
    p.rep_notes = [p.rep_notes || '', new Date(now).toISOString().slice(0, 10) + ' ' + outcome + (notes ? ': ' + notes : '')].filter(Boolean).join('\n').slice(-4000);
    const pending = db.slots.filter((s) => s.report_ref === slot.report_ref && s.status === 'pending');
    if (stop) pending.forEach((s) => { s.status = 'cancelled'; });
    else if (p.voicemails >= VOICEMAIL_LIMIT) pending.forEach((s) => { s.no_voicemail = true; });
    save();
    return { ok: true, stopped: stop, call_status: p.call_status, voicemails: p.voicemails };
  },
  'POST /api/import': (b) => {
    const rows = Array.isArray(b.rows) ? b.rows : (typeof b.csv === 'string' ? parseCsv(b.csv) : []);
    const added = importRows(db, rows);
    save();
    return { ok: true, added, total: db.profiles.length };
  }
};

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push('http://' + a.address + ':' + PORT);
  }
  return out;
}

function send(res, status, type, body, extra) {
  res.writeHead(status, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }, extra || {}));
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Lead Portal</title>
<style>
:root{--bg:#0b1020;--card:#141b31;--line:#27304d;--txt:#e8ecf8;--mut:#9aa5c4;--acc:#7c9cff;--ok:#2fd18a;--no:#ff5d73;--warn:#ffc857}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:14px 16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:5}
header h1{font-size:18px;margin:0}.tabs{margin-left:auto;display:flex;gap:6px}
.tab{text-decoration:none;background:none;border:1px solid var(--line);color:var(--mut);padding:7px 12px;border-radius:999px;cursor:pointer}.tab.on{color:var(--txt);border-color:var(--acc);background:#1b2447}
main{max-width:760px;margin:0 auto;padding:16px}
.stack{position:relative;min-height:420px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;box-shadow:0 10px 30px #0006;touch-action:pan-y;user-select:none}
.card.drag{transition:none}.card.fly{transition:transform .35s ease,opacity .35s}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.sp{justify-content:space-between}
.name{font-size:22px;font-weight:700;margin:0}.mut{color:var(--mut)}.small{font-size:13px}
.badge{padding:3px 9px;border-radius:999px;font-weight:700;font-size:13px;border:1px solid var(--line)}
.tA{background:#12351f;color:var(--ok)}.tB{background:#3a3212;color:var(--warn)}.tC{background:#3a1720;color:var(--no)}
.bars{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 12px;margin:10px 0}
.bar{font-size:12px;color:var(--mut)}.bar i{display:block;height:6px;background:#26304f;border-radius:4px;margin-top:3px;overflow:hidden}.bar i b{display:block;height:100%;background:var(--acc)}
h3{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:16px 0 6px}
ul{margin:0;padding-left:18px}li{margin:3px 0}
a{color:var(--acc)}details{margin-top:8px}summary{cursor:pointer;color:var(--acc)}pre{white-space:pre-wrap;font:13px/1.5 ui-monospace,Menlo,monospace;background:#0e1428;padding:10px;border-radius:10px}
.acts{display:flex;justify-content:center;gap:24px;margin:18px 0}
.big{width:64px;height:64px;border-radius:50%;border:2px solid var(--line);background:var(--card);font-size:26px;cursor:pointer}
.big.no{color:var(--no);border-color:var(--no)}.big.ok{color:var(--ok);border-color:var(--ok)}
.hint{text-align:center;color:var(--mut);font-size:12px}
.stamp{position:absolute;top:22px;padding:4px 10px;border:3px solid;border-radius:8px;font-weight:800;font-size:22px;opacity:0;transform:rotate(-12deg)}
.stamp.s{right:22px;color:var(--ok)}.stamp.p{left:22px;color:var(--no);transform:rotate(12deg)}
.call{margin-bottom:14px}.phone{display:inline-block;background:var(--ok);color:#04150c;font-weight:800;padding:10px 16px;border-radius:12px;text-decoration:none;font-size:18px}
.outs{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.outs button{background:#1b2447;color:var(--txt);border:1px solid var(--line);padding:8px 12px;border-radius:10px;cursor:pointer}
.outs button.stop{border-color:var(--no)}.outs button:disabled{opacity:.35;cursor:not-allowed}
textarea{width:100%;min-height:54px;background:#0e1428;color:var(--txt);border:1px solid var(--line);border-radius:10px;padding:8px;font:inherit}
.warn{color:var(--warn)}.card.oncall{border-color:var(--ok);box-shadow:0 0 0 2px var(--ok)}.empty{text-align:center;color:var(--mut);padding:60px 10px}
#toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#1b2447;border:1px solid var(--acc);padding:10px 16px;border-radius:12px;opacity:0;transition:opacity .3s}
.foot{color:var(--mut);font-size:12px;text-align:center;margin:24px 0}
</style></head><body>
<header><h1>🤖 AI Lead Portal</h1><span id="counts" class="mut small"></span><span class="mut small" title="Open this address on a phone on the same Wi-Fi to call with the phone dialer">📱 __LAN__</span>
<label class="tab" title="Import leads from a JSON or CSV file">⬆ Import<input id="imp" type="file" accept=".json,.csv" hidden></label><a class="tab" href="api/export" download="lead_portal_export.json">⬇ Export</a><nav class="tabs"><button class="tab on" data-t="review">Review</button><button class="tab" data-t="dialer">Dialer</button></nav></header>
<main><section id="review"></section><section id="dialer" hidden></section>
<p class="foot">Profiles are researched and written by AI. Verify phone numbers and facts before calling. Not legal advice.</p></main>
<div id="toast"></div>
<script>
var queue=[];var busy=false;
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined&&text!==null)e.textContent=String(text);return e;}
function add(p){for(var i=1;i<arguments.length;i++){if(arguments[i])p.appendChild(arguments[i]);}return p;}
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.style.opacity=1;setTimeout(function(){t.style.opacity=0;},2600);}
function api(path,body){var o={headers:{'Content-Type':'application/json'},credentials:'same-origin'};if(body){o.method='POST';o.body=JSON.stringify(body);}return fetch('api/'+path,o).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});}
function list(title,items){if(!items||!items.length)return null;var w=el('div');add(w,el('h3','',title));var u=el('ul');items.forEach(function(x){if(x)add(u,el('li','',x));});return add(w,u);}
function tierCls(t){return t==='A'?'tA':(t==='B'?'tB':'tC');}
function bars(txt){var g=el('div','bars');String(txt||'').split('·').forEach(function(p){var m=p.trim().match(/^(.*) (\\d)\\/5$/);if(!m)return;var b=el('div','bar',m[1]+' '+m[2]+'/5');var i=el('i');var f=el('b');f.style.width=(Number(m[2])*20)+'%';add(i,f);add(b,i);add(g,b);});return g;}
function contactRow(c){var r=el('div','row small');add(r,el('span','',c.phone&&c.phone!=='UNVERIFIED'?'📞 '+c.phone:'📞 phone unverified'));if(c.website){var a=el('a','',c.website);a.href=c.website;a.target='_blank';a.rel='noopener';add(r,el('span','','🌐 '),a);}add(r,el('span','','📍 '+(c.location||'')));add(r,el('span','','👥 '+(c.employee_count||'size unknown')));return r;}
function renderCard(c){var card=el('div','card');card.id='top';
add(card,el('div','stamp s','SHIP'),el('div','stamp p','PASS'));
var h=el('div','row sp');add(h,el('p','name',c.business_name));var b=el('span','badge '+tierCls(c.tier),'Tier '+c.tier+' · '+c.priority_score+'/100');add(h,b);add(card,h);
add(card,el('div','mut small',(c.industry||'')+' · confidence '+c.confidence+'%'));
add(card,bars(c.score_breakdown));add(card,contactRow(c));
if(c.decision_maker)add(card,el('div','small','👤 Ask for: '+c.decision_maker));
add(card,el('h3','','About the business'),el('div','',c.company_about||c.executive_summary||''));
add(card,el('h3','','Why now'),el('div','',c.triggering_change));
var ch=el('div');(c.changes||[]).forEach(function(x){var d=el('div','small');add(d,el('strong','',x.title),el('div','mut',[x.what_changed,x.deadline?'Deadline: '+x.deadline:'',x.penalty_exposure?'Penalty: '+x.penalty_exposure:''].filter(Boolean).join(' · ')));d.style.marginBottom='8px';add(ch,d);});
if((c.changes||[]).length)add(card,el('h3','','Legal changes that affect them'),ch);
add(card,list('How we can help',c.approaches));
add(card,list('If they wait',c.if_they_wait));
add(card,list('Talking points',String(c.talking_points||'').split(' | ').filter(Boolean)));
var det=el('details');add(det,el('summary','','Call script'),el('pre','',c.call_script||''));add(card,det);
return card;}
function renderReview(){var s=document.getElementById('review');s.textContent='';
if(!queue.length){add(s,el('div','empty','🎉 Queue is empty. Import more leads with ⬆ Import (JSON or CSV).'));return;}
var st=el('div','stack');var card=renderCard(queue[0]);add(st,card);add(s,st);
var acts=el('div','acts');var no=el('button','big no','✕');no.title='Pass (←)';var ok=el('button','big ok','✓');ok.title='Ship to dialer (→)';add(acts,no,ok);add(s,acts);
add(s,el('div','hint',queue.length+' in queue · swipe right to ship, left to pass · arrow keys work too'));
no.onclick=function(){decide('reject');};ok.onclick=function(){decide('ship');};drag(card);}
function drag(card){var x0=null,dx=0;card.addEventListener('pointerdown',function(e){if(e.target.closest('a,summary,pre'))return;x0=e.clientX;card.classList.add('drag');card.setPointerCapture(e.pointerId);});
card.addEventListener('pointermove',function(e){if(x0===null)return;dx=e.clientX-x0;card.style.transform='translateX('+dx+'px) rotate('+(dx/20)+'deg)';card.querySelector('.s').style.opacity=Math.max(0,dx/120);card.querySelector('.p').style.opacity=Math.max(0,-dx/120);});
card.addEventListener('pointerup',function(){if(x0===null)return;card.classList.remove('drag');x0=null;if(dx>120)decide('ship');else if(dx<-120)decide('reject');else{card.style.transform='';card.querySelector('.s').style.opacity=0;card.querySelector('.p').style.opacity=0;}dx=0;});}
function decide(d){if(busy||!queue.length)return;busy=true;var c=queue[0];var card=document.getElementById('top');if(card){card.classList.add('fly');card.style.transform='translateX('+(d==='ship'?900:-900)+'px) rotate('+(d==='ship'?30:-30)+'deg)';card.style.opacity=0;}
api('swipe',{report_ref:c.report_ref,decision:d}).then(function(r){queue.shift();toast(d==='ship'?'🚀 Shipped: '+(r.slots||0)+' call slots scheduled':'Passed on '+c.business_name);busy=false;renderReview();counts();}).catch(function(e){busy=false;toast('Could not save: '+e.message);renderReview();});}
function renderDialer(data){var s=document.getElementById('dialer');s.textContent='';
add(s,el('h3','','Due now'));if(!data.due.length)add(s,el('div','empty','No calls due. Slots run at 10 AM and 2 PM ET on weekdays.'));
data.due.forEach(function(x){var c=el('div','card call');var h=el('div','row sp');add(h,el('p','name',x.business_name),el('span','badge '+tierCls(x.tier),'Tier '+x.tier+' · '+x.priority_score));add(c,h);
add(c,el('div','mut small',x.slot_label+' · call '+x.slot_number+' of '+x.total+(x.missed?' · '+x.missed+' missed earlier':'')));
var r=el('div','row');if(x.phone&&x.phone!=='UNVERIFIED'){var a=el('a','phone','📞 '+x.phone);a.href='tel:'+x.phone.replace(/[^0-9+]/g,'');a.onclick=function(){c.classList.add('oncall');setTimeout(function(){toast('After the call, tap how it went');},800);};add(r,a);}else add(r,el('span','warn','No verified phone: look it up before calling'));
if(x.website){var w=el('a','small',x.website);w.href=x.website;w.target='_blank';w.rel='noopener';add(r,w);}add(c,r);
if(x.no_voicemail)add(c,el('div','warn small','⚠ 3 voicemails already left: do not leave another.'));
add(c,list('Talking points',String(x.talking_points||'').split(' | ').filter(Boolean)));
var det=el('details');add(det,el('summary','','Call script'),el('pre','',x.call_script||''));add(c,det);
var n=el('textarea');n.placeholder='Notes (optional)';add(c,n);
var o=el('div','outs');[['no_answer','No answer'],['voicemail','Left voicemail'],['talked','Talked to decision-maker'],['interested','Interested ✓'],['dnc','Do not call']].forEach(function(p){var bt=el('button',(p[0]==='talked'||p[0]==='interested'||p[0]==='dnc')?'stop':'',p[1]);if(p[0]==='voicemail'&&x.no_voicemail)bt.disabled=true;bt.onclick=function(){bt.disabled=true;api('outcome',{slot_id:x.id,report_ref:x.report_ref,outcome:p[0],notes:n.value}).then(function(res){toast(res.stopped?'Calls stopped: '+res.call_status:'Logged: '+p[1]);loadDialer();}).catch(function(e){bt.disabled=false;toast('Could not save: '+e.message);});};add(o,bt);});add(c,o);add(s,c);});
if(data.upcoming.length){add(s,el('h3','','Upcoming'));var u=el('ul','small');data.upcoming.forEach(function(x){add(u,el('li','',x.slot_label+' · '+x.business_name+' (call '+x.slot_number+')'));});add(s,u);}}
function loadQueue(){api('queue').then(function(d){queue=d.cards||[];renderReview();counts();}).catch(function(e){document.getElementById('review').textContent='Could not load queue: '+e.message;});}
var lastDialer={due:[],upcoming:[]};function loadDialer(){api('dialer').then(function(d){lastDialer=d;renderDialer(d);counts();}).catch(function(e){document.getElementById('dialer').textContent='Could not load dialer: '+e.message;});}
function counts(){document.getElementById('counts').textContent=queue.length+' to review · '+lastDialer.due.length+' calls due';}
document.querySelectorAll('.tab').forEach(function(t){t.onclick=function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.toggle('on',x===t);});document.getElementById('review').hidden=t.dataset.t!=='review';document.getElementById('dialer').hidden=t.dataset.t!=='dialer';if(t.dataset.t==='dialer')loadDialer();};});
document.addEventListener('keydown',function(e){if(document.getElementById('review').hidden)return;if(e.key==='ArrowRight')decide('ship');if(e.key==='ArrowLeft')decide('reject');});
document.getElementById('imp').onchange=function(e){var f=e.target.files[0];if(!f)return;f.text().then(function(t){var body;try{var j=JSON.parse(t);body={rows:Array.isArray(j)?j:(j.profiles||j.cards||j.data||[])};}catch(err){body={csv:t};}return api('import',body);}).then(function(r){toast('Imported '+r.added+' new profile(s)');loadQueue();}).catch(function(err){toast('Import failed: '+err.message);});e.target.value='';};
loadQueue();loadDialer();setInterval(loadDialer,60000);
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (AUTH && req.headers.authorization !== AUTH) {
    return send(res, 401, 'text/plain', 'Login required', { 'WWW-Authenticate': 'Basic realm="AI Lead Portal", charset="UTF-8"' });
  }
  if (req.method === 'GET' && url.pathname === '/') {
    return send(res, 200, 'text/html; charset=utf-8', HTML.replace('__LAN__', lanUrls()[0] || 'http://localhost:' + PORT));
  }
  if (req.method === 'GET' && url.pathname === '/api/export') {
    return send(res, 200, 'application/json', JSON.stringify(db, null, 1), { 'Content-Disposition': 'attachment; filename="lead_portal_export.json"' });
  }
  const handler = api[req.method + ' ' + url.pathname];
  if (!handler) return send(res, 404, 'application/json', '{"error":"not found"}');
  try {
    const body = req.method === 'POST' ? JSON.parse((await readBody(req, 5 * 1024 * 1024)) || '{}') : {};
    const out = handler(body);
    const [status, payload] = Array.isArray(out) ? out : [200, out];
    return send(res, status, 'application/json', JSON.stringify(payload));
  } catch (e) {
    return send(res, 400, 'application/json', JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('AI Lead Portal running (' + db.profiles.filter((p) => p.status === 'new').length + ' profiles to review)');
  console.log('  This computer:      http://localhost:' + PORT);
  for (const u of lanUrls()) console.log('  Phone (same Wi-Fi): ' + u + '  -> tap a number to call with the phone dialer');
  console.log('  Data file:          ' + DATA_FILE);
  if (!PASS) console.log('  Tip: set PORTAL_PASS to require a password (anyone on your Wi-Fi can open it otherwise).');
});
