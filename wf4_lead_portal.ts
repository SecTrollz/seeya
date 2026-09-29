import { workflow, node, trigger, sticky, newCredential, ifElse, switchCase, expr } from '@n8n/workflow-sdk';

const reportsTable = { __rl: true, mode: 'id', value: 'uNC0yfMxQPaZKwkU', cachedResultName: 'Legislative Reports' };
const slotsTable = { __rl: true, mode: 'id', value: 'l6eg5rMAHifwRx2d', cachedResultName: 'Call Slots' };
const portalAuth = { httpBasicAuth: newCredential('Portal login') };
const jsonHeaders = { entries: [{ name: 'Cache-Control', value: 'no-store' }] };

const portalHtml = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AI Lead Portal</title>
<style>
:root{--bg:#0b1020;--card:#141b31;--line:#27304d;--txt:#e8ecf8;--mut:#9aa5c4;--acc:#7c9cff;--ok:#2fd18a;--no:#ff5d73;--warn:#ffc857}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
header{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;padding:14px 16px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:5}
header h1{font-size:18px;margin:0}.tabs{margin-left:auto;display:flex;gap:6px}
.tab{background:none;border:1px solid var(--line);color:var(--mut);padding:7px 12px;border-radius:999px;cursor:pointer}.tab.on{color:var(--txt);border-color:var(--acc);background:#1b2447}
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
.warn{color:var(--warn)}.empty{text-align:center;color:var(--mut);padding:60px 10px}
#toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#1b2447;border:1px solid var(--acc);padding:10px 16px;border-radius:12px;opacity:0;transition:opacity .3s}
.foot{color:var(--mut);font-size:12px;text-align:center;margin:24px 0}
</style></head><body>
<header><h1>🤖 AI Lead Portal</h1><span id="counts" class="mut small"></span>
<nav class="tabs"><button class="tab on" data-t="review">Review</button><button class="tab" data-t="dialer">Dialer</button></nav></header>
<main><section id="review"></section><section id="dialer" hidden></section>
<p class="foot">Profiles are researched and written by AI. Verify phone numbers and facts before calling. Not legal advice.</p></main>
<div id="toast"></div>
<script>
var queue=[];var busy=false;
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined&&text!==null)e.textContent=String(text);return e;}
function add(p){for(var i=1;i<arguments.length;i++){if(arguments[i])p.appendChild(arguments[i]);}return p;}
function toast(m){var t=document.getElementById('toast');t.textContent=m;t.style.opacity=1;setTimeout(function(){t.style.opacity=0;},2600);}
function api(path,body){var o={headers:{'Content-Type':'application/json'},credentials:'same-origin'};if(body){o.method='POST';o.body=JSON.stringify(body);}return fetch('lead-portal-api/'+path,o).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});}
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
if(!queue.length){add(s,el('div','empty','🎉 Queue is empty. New AI-researched profiles arrive every Monday 7 AM ET.'));return;}
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
var r=el('div','row');if(x.phone&&x.phone!=='UNVERIFIED'){var a=el('a','phone','📞 '+x.phone);a.href='tel:'+x.phone.replace(/[^0-9+]/g,'');add(r,a);}else add(r,el('span','warn','No verified phone: look it up before calling'));
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
loadQueue();loadDialer();setInterval(loadDialer,60000);
</script></body></html>`;

const pageHook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Open Portal',
    parameters: { httpMethod: 'GET', path: 'lead-portal', authentication: 'basicAuth', responseMode: 'responseNode', options: {} },
    credentials: portalAuth
  },
  output: [{ headers: {}, query: {} }]
});

const servePage = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Serve Portal Page',
    parameters: {
      respondWith: 'text',
      responseBody: portalHtml,
      options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] } }
    }
  }
});

const queueHook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'API: Review Queue',
    parameters: { httpMethod: 'GET', path: 'lead-portal-api/queue', authentication: 'basicAuth', responseMode: 'responseNode', options: {} },
    credentials: portalAuth
  },
  output: [{ headers: {}, query: {} }]
});

const getQueued = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Get Queued Profiles',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: reportsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'status', condition: 'eq', keyValue: 'new' }] },
      returnAll: true
    }
  },
  output: [{ id: 1, report_ref: 'LIR-12-9', business_name: 'Luxor Staffing', status: 'new', priority_score: 77, report_json: '{}' }]
});

const shapeQueue = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Profile Cards',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: "const rows = $input.all().map(function (i) { return i.json; }).filter(function (r) { return r && r.id && r.report_ref; });\nconst cards = rows.map(function (r) {\n  let rep = {};\n  try { rep = JSON.parse(r.report_json || '{}'); } catch (e) { rep = {}; }\n  const snap = rep.company_snapshot || {};\n  const offer = rep.customized_service_offer || {};\n  const ww = rep.wait_warning || {};\n  return {\n    id: r.id, report_ref: r.report_ref, business_name: r.business_name, location: r.location, industry: r.industry,\n    phone: r.phone, website: r.website, employee_count: r.employee_count, priority_score: Number(r.priority_score) || 0,\n    tier: r.tier || 'C', confidence: Number(r.confidence) || 0, score_breakdown: r.score_breakdown || '',\n    company_about: r.company_about || snap.what_they_do || '', executive_summary: r.executive_summary || rep.executive_summary || '',\n    decision_maker: snap.decision_maker && !/unverified/i.test(snap.decision_maker) ? snap.decision_maker : '',\n    talking_points: r.talking_points || '', triggering_change: r.triggering_change || '', call_script: r.call_script || '',\n    changes: (rep.applicable_legislative_changes || []).slice(0, 4).map(function (c) { return { title: c.title, what_changed: c.what_changed || c.summary || '', deadline: c.deadline || '', penalty_exposure: c.penalty_exposure || '' }; }),\n    approaches: (offer.what_we_do || []).concat((offer.n8n_solutions || []).map(function (s) { return s.name + ': ' + (s.what_it_does || ''); })).slice(0, 6),\n    if_they_wait: (ww.if_they_wait || []).concat(ww.penalties || []).slice(0, 4)\n  };\n}).sort(function (a, b) { return b.priority_score - a.priority_score; });\nreturn [{ json: { count: cards.length, cards: cards } }];"
    }
  },
  output: [{ count: 1, cards: [{ report_ref: 'LIR-12-9', business_name: 'Luxor Staffing', priority_score: 77 }] }]
});

const respondQueue = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Return Queue', parameters: { respondWith: 'firstIncomingItem', options: { responseHeaders: jsonHeaders } } }
});

const swipeHook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'API: Swipe',
    parameters: { httpMethod: 'POST', path: 'lead-portal-api/swipe', authentication: 'basicAuth', responseMode: 'responseNode', options: {} },
    credentials: portalAuth
  },
  output: [{ body: { report_ref: 'LIR-12-9', decision: 'ship' } }]
});

const normSwipe = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Read Swipe',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'ref', name: 'report_ref', value: expr("{{ String(($json.body || {}).report_ref || '') }}"), type: 'string' },
          { id: 'dec', name: 'decision', value: expr("{{ ($json.body || {}).decision === 'ship' ? 'ship' : 'reject' }}"), type: 'string' }
        ]
      },
      options: {}
    }
  },
  output: [{ report_ref: 'LIR-12-9', decision: 'ship' }]
});

const getSwiped = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Get Swiped Profile',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: reportsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'report_ref', condition: 'eq', keyValue: expr('{{ $json.report_ref }}') }] },
      returnAll: false,
      limit: 1
    }
  },
  output: [{ id: 1, report_ref: 'LIR-12-9', business_name: 'Luxor Staffing', phone: '(336) 555-0100', website: 'https://example.com/', tier: 'A', priority_score: 77, talking_points: 'a | b', call_script: 'OPENER: ...' }]
});

const isShip = ifElse({
  version: 2.2,
  config: {
    name: 'Shipped?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
        conditions: [{ leftValue: expr('{{ $("Read Swipe").item.json.decision }}'), operator: { type: 'string', operation: 'equals' }, rightValue: 'ship' }],
        combinator: 'and'
      }
    }
  }
});

const markShipped = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark Shipped',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: reportsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'report_ref', condition: 'eq', keyValue: expr('{{ $("Read Swipe").item.json.report_ref }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: 'shipped', call_status: 'active', calls_made: 0, voicemails: 0, reviewed_at: expr('{{ $now.toISO() }}') },
        schema: [
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'call_status', displayName: 'call_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'calls_made', displayName: 'calls_made', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'voicemails', displayName: 'voicemails', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'reviewed_at', displayName: 'reviewed_at', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: true }
        ]
      },
      options: {}
    }
  },
  output: [{ id: 1 }]
});

const buildSlots = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Schedule Call Slots',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: "const r = $('Get Swiped Profile').first().json || {};\nif (!r.report_ref) return [];\nconst HOURS = [10, 14];\nconst DAYS = 7;\nconst now = DateTime.now().setZone('America/New_York');\nconst end = now.plus({ days: DAYS });\nconst slots = [];\nfor (let d = 0; d <= DAYS; d++) {\n  const day = now.startOf('day').plus({ days: d });\n  if (day.weekday > 5) continue;\n  for (const h of HOURS) {\n    const t = day.set({ hour: h, minute: 0, second: 0, millisecond: 0 });\n    if (t > now && t <= end) slots.push(t);\n  }\n}\nreturn slots.map(function (t, i) {\n  return { json: {\n    report_ref: r.report_ref, business_name: r.business_name, phone: r.phone || 'UNVERIFIED', website: r.website || '',\n    tier: r.tier || 'C', priority_score: Number(r.priority_score) || 0, talking_points: r.talking_points || '', call_script: r.call_script || '',\n    slot_at: t.toUTC().toISO(), slot_label: t.toFormat(\"ccc LLL d, h:mm a\") + ' ET', slot_number: i + 1, status: 'pending', no_voicemail: false\n  } };\n});"
    }
  },
  output: [{ report_ref: 'LIR-12-9', business_name: 'Luxor Staffing', phone: '(336) 555-0100', slot_at: '2026-09-30T14:00:00.000Z', slot_label: 'Wed Sep 30, 10:00 AM ET', slot_number: 1, status: 'pending', no_voicemail: false }]
});

const insertSlots = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Save Call Slots',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'insert',
      dataTableId: slotsTable,
      columns: {
        mappingMode: 'defineBelow',
        value: {
          report_ref: expr('{{ $json.report_ref }}'), business_name: expr('{{ $json.business_name }}'), phone: expr('{{ $json.phone }}'),
          website: expr('{{ $json.website }}'), tier: expr('{{ $json.tier }}'), priority_score: expr('{{ $json.priority_score }}'),
          talking_points: expr('{{ $json.talking_points }}'), call_script: expr('{{ $json.call_script }}'), slot_at: expr('{{ $json.slot_at }}'),
          slot_label: expr('{{ $json.slot_label }}'), slot_number: expr('{{ $json.slot_number }}'), status: 'pending', no_voicemail: false
        },
        schema: [
          { id: 'report_ref', displayName: 'report_ref', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'business_name', displayName: 'business_name', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'phone', displayName: 'phone', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'website', displayName: 'website', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'tier', displayName: 'tier', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'priority_score', displayName: 'priority_score', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'talking_points', displayName: 'talking_points', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'call_script', displayName: 'call_script', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'slot_at', displayName: 'slot_at', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: true },
          { id: 'slot_label', displayName: 'slot_label', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'slot_number', displayName: 'slot_number', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'no_voicemail', displayName: 'no_voicemail', required: false, defaultMatch: false, display: true, type: 'boolean', canBeUsedToMatch: true }
        ]
      },
      options: {}
    }
  },
  output: [{ id: 1 }]
});

const respondShipped = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return Shipped',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ JSON.stringify({ ok: true, decision: "ship", report_ref: $("Read Swipe").first().json.report_ref, slots: $("Schedule Call Slots").all().length }) }}'),
      options: { responseHeaders: jsonHeaders }
    }
  }
});

const markRejected = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark Passed',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: reportsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'report_ref', condition: 'eq', keyValue: expr('{{ $("Read Swipe").item.json.report_ref }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: 'rejected', reviewed_at: expr('{{ $now.toISO() }}') },
        schema: [
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'reviewed_at', displayName: 'reviewed_at', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: true }
        ]
      },
      options: {}
    }
  },
  output: [{ id: 1 }]
});

const respondRejected = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return Passed',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ JSON.stringify({ ok: true, decision: "reject", report_ref: $("Read Swipe").first().json.report_ref }) }}'),
      options: { responseHeaders: jsonHeaders }
    }
  }
});

const dialerHook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'API: Dialer',
    parameters: { httpMethod: 'GET', path: 'lead-portal-api/dialer', authentication: 'basicAuth', responseMode: 'responseNode', options: {} },
    credentials: portalAuth
  },
  output: [{ headers: {}, query: {} }]
});

const getPendingSlots = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Get Pending Slots',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: slotsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'status', condition: 'eq', keyValue: 'pending' }] },
      returnAll: true
    }
  },
  output: [{ id: 1, report_ref: 'LIR-12-9', business_name: 'Luxor Staffing', slot_at: '2026-09-30T14:00:00.000Z', slot_number: 1, status: 'pending' }]
});

const shapeDialer = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Build Call List',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: "const now = Date.now();\nconst rows = $input.all().map(function (i) { return i.json; }).filter(function (r) { return r && r.id && r.report_ref; });\nconst total = {};\nrows.forEach(function (r) { total[r.report_ref] = Math.max(total[r.report_ref] || 0, Number(r.slot_number) || 0); });\nconst dueRows = rows.filter(function (r) { return Date.parse(r.slot_at) <= now; }).sort(function (a, b) { return Date.parse(b.slot_at) - Date.parse(a.slot_at); });\nconst byRef = {};\ndueRows.forEach(function (r) {\n  if (!byRef[r.report_ref]) { byRef[r.report_ref] = Object.assign({}, r, { missed: 0 }); }\n  else { byRef[r.report_ref].missed++; }\n});\nconst due = Object.keys(byRef).map(function (k) { const x = byRef[k]; x.total = Math.max(total[k] || 0, x.slot_number || 0); return x; })\n  .sort(function (a, b) { return (b.priority_score || 0) - (a.priority_score || 0); });\nconst upcoming = rows.filter(function (r) { return Date.parse(r.slot_at) > now; })\n  .sort(function (a, b) { return Date.parse(a.slot_at) - Date.parse(b.slot_at); }).slice(0, 30)\n  .map(function (r) { return { report_ref: r.report_ref, business_name: r.business_name, slot_label: r.slot_label, slot_number: r.slot_number }; });\nreturn [{ json: { now: new Date(now).toISOString(), due: due, upcoming: upcoming } }];"
    }
  },
  output: [{ now: '2026-09-30T14:05:00.000Z', due: [], upcoming: [] }]
});

const respondDialer = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: { name: 'Return Call List', parameters: { respondWith: 'firstIncomingItem', options: { responseHeaders: jsonHeaders } } }
});

const outcomeHook = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'API: Call Outcome',
    parameters: { httpMethod: 'POST', path: 'lead-portal-api/outcome', authentication: 'basicAuth', responseMode: 'responseNode', options: {} },
    credentials: portalAuth
  },
  output: [{ body: { slot_id: 1, report_ref: 'LIR-12-9', outcome: 'voicemail', notes: '' } }]
});

const normOutcome = node({
  type: 'n8n-nodes-base.set',
  version: 3.4,
  config: {
    name: 'Read Outcome',
    parameters: {
      mode: 'manual',
      includeOtherFields: false,
      assignments: {
        assignments: [
          { id: 'sid', name: 'slot_id', value: expr('{{ Number(($json.body || {}).slot_id) || 0 }}'), type: 'number' },
          { id: 'ref', name: 'report_ref', value: expr("{{ String(($json.body || {}).report_ref || '') }}"), type: 'string' },
          { id: 'out', name: 'outcome', value: expr("{{ ['no_answer', 'voicemail', 'talked', 'interested', 'dnc'].includes(($json.body || {}).outcome) ? $json.body.outcome : 'no_answer' }}"), type: 'string' },
          { id: 'nts', name: 'notes', value: expr("{{ String(($json.body || {}).notes || '').slice(0, 1000) }}"), type: 'string' }
        ]
      },
      options: {}
    }
  },
  output: [{ slot_id: 1, report_ref: 'LIR-12-9', outcome: 'voicemail', notes: '' }]
});

const completeSlot = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Complete Slot',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: slotsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'id', condition: 'eq', keyValue: expr('{{ $("Read Outcome").item.json.slot_id }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: 'done', outcome: expr('{{ $("Read Outcome").item.json.outcome }}'), notes: expr('{{ $("Read Outcome").item.json.notes }}'), completed_at: expr('{{ $now.toISO() }}') },
        schema: [
          { id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'outcome', displayName: 'outcome', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'notes', displayName: 'notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'completed_at', displayName: 'completed_at', required: false, defaultMatch: false, display: true, type: 'dateTime', canBeUsedToMatch: true }
        ]
      },
      options: {}
    }
  },
  output: [{ id: 1 }]
});

const markMissed = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Mark Earlier Slots Missed',
    alwaysOutputData: true,
    executeOnce: true,
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: slotsTable,
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'report_ref', condition: 'eq', keyValue: expr('{{ $("Read Outcome").first().json.report_ref }}') },
        { keyName: 'status', condition: 'eq', keyValue: 'pending' },
        { keyName: 'slot_at', condition: 'lt', keyValue: expr('{{ $now.toISO() }}') }
      ] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: 'missed' },
        schema: [{ id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }]
      },
      options: {}
    }
  },
  output: [{ id: 2 }]
});

const getProfileForOutcome = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Get Profile For Outcome',
    alwaysOutputData: true,
    executeOnce: true,
    parameters: {
      resource: 'row',
      operation: 'get',
      dataTableId: reportsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'report_ref', condition: 'eq', keyValue: expr('{{ $("Read Outcome").first().json.report_ref }}') }] },
      returnAll: false,
      limit: 1
    }
  },
  output: [{ id: 1, report_ref: 'LIR-12-9', calls_made: 0, voicemails: 0, rep_notes: '' }]
});

const decideNext = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Apply Stop Rules',
    parameters: {
      mode: 'runOnceForAllItems',
      jsCode: "const VOICEMAIL_LIMIT = 3;\nconst STOP = { dnc: 'do_not_call', talked: 'talked_to_decision_maker', interested: 'interested' };\nconst n = $('Read Outcome').first().json;\nconst r = $input.first().json || {};\nconst calls = (Number(r.calls_made) || 0) + 1;\nconst vm = (Number(r.voicemails) || 0) + (n.outcome === 'voicemail' ? 1 : 0);\nconst stop = Object.prototype.hasOwnProperty.call(STOP, n.outcome);\nconst line = new Date().toISOString().slice(0, 10) + ' ' + n.outcome + (n.notes ? ': ' + n.notes : '');\nconst notes = [r.rep_notes || '', line].filter(Boolean).join(String.fromCharCode(10)).slice(-4000);\nreturn [{ json: { report_ref: n.report_ref, calls_made: calls, voicemails: vm, call_status: stop ? STOP[n.outcome] : 'active', last_outcome: n.outcome, rep_notes: notes, stop: stop, voicemail_limit: !stop && vm >= VOICEMAIL_LIMIT } }];"
    }
  },
  output: [{ report_ref: 'LIR-12-9', calls_made: 1, voicemails: 1, call_status: 'active', last_outcome: 'voicemail', rep_notes: '', stop: false, voicemail_limit: false }]
});

const saveProfileCalls = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Update Profile Call Status',
    alwaysOutputData: true,
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: reportsTable,
      matchType: 'allConditions',
      filters: { conditions: [{ keyName: 'report_ref', condition: 'eq', keyValue: expr('{{ $json.report_ref }}') }] },
      columns: {
        mappingMode: 'defineBelow',
        value: {
          calls_made: expr('{{ $json.calls_made }}'), voicemails: expr('{{ $json.voicemails }}'), call_status: expr('{{ $json.call_status }}'),
          last_outcome: expr('{{ $json.last_outcome }}'), rep_notes: expr('{{ $json.rep_notes }}')
        },
        schema: [
          { id: 'calls_made', displayName: 'calls_made', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'voicemails', displayName: 'voicemails', required: false, defaultMatch: false, display: true, type: 'number', canBeUsedToMatch: true },
          { id: 'call_status', displayName: 'call_status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'last_outcome', displayName: 'last_outcome', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true },
          { id: 'rep_notes', displayName: 'rep_notes', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }
        ]
      },
      options: {}
    }
  },
  output: [{ id: 1 }]
});

const routeStop = switchCase({
  version: 3.2,
  config: {
    name: 'Stop Calling?',
    parameters: {
      rules: {
        values: [
          { renameOutput: true, outputKey: 'Stop cadence', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $("Apply Stop Rules").first().json.stop }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } },
          { renameOutput: true, outputKey: 'Voicemail limit', conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, conditions: [{ leftValue: expr('{{ $("Apply Stop Rules").first().json.voicemail_limit }}'), operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' } }
        ]
      },
      options: { fallbackOutput: 'extra', renameFallbackOutput: 'Keep calling' }
    }
  }
});

const cancelSlots = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Cancel Remaining Slots',
    alwaysOutputData: true,
    executeOnce: true,
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: slotsTable,
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'report_ref', condition: 'eq', keyValue: expr('{{ $("Apply Stop Rules").first().json.report_ref }}') },
        { keyName: 'status', condition: 'eq', keyValue: 'pending' }
      ] },
      columns: {
        mappingMode: 'defineBelow',
        value: { status: 'cancelled' },
        schema: [{ id: 'status', displayName: 'status', required: false, defaultMatch: false, display: true, type: 'string', canBeUsedToMatch: true }]
      },
      options: {}
    }
  },
  output: [{ id: 3 }]
});

const flagNoVoicemail = node({
  type: 'n8n-nodes-base.dataTable',
  version: 1.1,
  config: {
    name: 'Flag No More Voicemails',
    alwaysOutputData: true,
    executeOnce: true,
    parameters: {
      resource: 'row',
      operation: 'update',
      dataTableId: slotsTable,
      matchType: 'allConditions',
      filters: { conditions: [
        { keyName: 'report_ref', condition: 'eq', keyValue: expr('{{ $("Apply Stop Rules").first().json.report_ref }}') },
        { keyName: 'status', condition: 'eq', keyValue: 'pending' }
      ] },
      columns: {
        mappingMode: 'defineBelow',
        value: { no_voicemail: true },
        schema: [{ id: 'no_voicemail', displayName: 'no_voicemail', required: false, defaultMatch: false, display: true, type: 'boolean', canBeUsedToMatch: true }]
      },
      options: {}
    }
  },
  output: [{ id: 3 }]
});

const respondOutcome = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return Outcome',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ JSON.stringify({ ok: true, stopped: $("Apply Stop Rules").first().json.stop, call_status: $("Apply Stop Rules").first().json.call_status, voicemails: $("Apply Stop Rules").first().json.voicemails }) }}'),
      options: { responseHeaders: jsonHeaders }
    }
  }
});

const aboutNote = sticky('## 🤖 AI Lead Portal\nOpen **/webhook/lead-portal** (password protected).\n\n**Review tab:** AI-researched business profiles (status `new` in Legislative Reports), best score first. Swipe right = ship, left = pass. Unswiped profiles stay in the queue.\n\n**Ship:** schedules call slots at **10 AM and 2 PM ET on weekdays for 7 days** in the Call Slots table.\n\n**Dialer tab:** calls due now with tap-to-call, talking points and script. Outcome buttons log the call.\n\n**Stop rules:** Do-not-call, Talked to decision-maker or Interested cancels the remaining slots. After 3 voicemails the dialer says not to leave more.', [], { color: 5 });

const setupNote = sticky('## ⚙️ Setup\n1. Create a **Basic Auth** credential named *Portal login* (pick a username + strong password) and select it on all 5 webhook triggers\n2. Publish this workflow\n3. Open `https://trasch.app.n8n.cloud/webhook/lead-portal` and log in\n\nTune call times in **Schedule Call Slots** (`HOURS`, `DAYS`) and the voicemail limit in **Apply Stop Rules**.', [], { color: 3 });

export default workflow('ai-lead-portal', 'AI Lead Portal: Swipe Review + Dialer')
  .add(pageHook)
  .to(servePage)
  .add(queueHook)
  .to(getQueued)
  .to(shapeQueue)
  .to(respondQueue)
  .add(swipeHook)
  .to(normSwipe)
  .to(getSwiped)
  .to(isShip
    .onTrue(markShipped.to(buildSlots).to(insertSlots).to(respondShipped))
    .onFalse(markRejected.to(respondRejected)))
  .add(dialerHook)
  .to(getPendingSlots)
  .to(shapeDialer)
  .to(respondDialer)
  .add(outcomeHook)
  .to(normOutcome)
  .to(completeSlot)
  .to(markMissed)
  .to(getProfileForOutcome)
  .to(decideNext)
  .to(saveProfileCalls)
  .to(routeStop
    .onCase(0, cancelSlots.to(respondOutcome))
    .onCase(1, flagNoVoicemail.to(respondOutcome))
    .onCase(2, respondOutcome))
  .add(aboutNote)
  .add(setupNote)
  .group('Review queue API', [getQueued, shapeQueue, respondQueue], { description: 'Returns unswiped AI profiles as swipe cards, highest score first' })
  .group('Swipe: ship or pass', [normSwipe, getSwiped, isShip, markShipped, buildSlots, insertSlots, respondShipped, markRejected, respondRejected], { description: 'Ship schedules 10 AM + 2 PM ET weekday call slots for 7 days; pass removes it from the queue' })
  .group('Dialer API', [getPendingSlots, shapeDialer, respondDialer], { description: 'Calls due now (one per business, missed slots counted) plus upcoming slots' })
  .group('Call outcome + stop rules', [normOutcome, completeSlot, markMissed, getProfileForOutcome, decideNext, saveProfileCalls, routeStop, cancelSlots, flagNoVoicemail, respondOutcome], { description: 'Logs the call; DNC, talked or interested cancels remaining slots; 3 voicemails stops voicemails' });
