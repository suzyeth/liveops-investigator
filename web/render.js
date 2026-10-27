// Renders one finished case as a chain of evidence: finding, symptom, where it looked first,
// each tested explanation with its rule and data, consistency checks, reviews, and the raw SQL.
const Render=(()=>{
 const {esc,bars,legend}=Charts;
 const pct=x=>x===null||x===undefined?'n/a':`${Math.round(x*1000)/10}%`;
 const num=x=>Number(x).toLocaleString('en-US');
 const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
 const pts=x=>x===null?'n/a':`${x>0?'+':''}${Math.round(x*10)/10} pts`;
 const QUERY={overview:'Overview',cohorts:'Player cohorts',checkout:'Payment funnel',offer:'Event offer config',platform:'Payment by platform'};
 const METRIC={participants:'Players taking part',payers:'Paying players',revenue:'Revenue',shop_views:'Visited the shop',attempts:'Tried to pay',successes:'Paid successfully'};
 const FIELD={version:'Config version',price:'Price',reward_units:'Reward units'};
 const KIND={data:'The data looks wrong',missing:'Something is missing',distrust:'I don’t trust this'};
 const TARGET={symptom:'the symptom',payment:'the payment check',config:'the offer check',finding:'the finding'};
 const STATE={'data disputed':'Data disputed','disputed':'Disputed by a reviewer','needs more evidence':'More evidence requested'};

 // A number that opens its source row in the evidence drawer.
 const src=(caseId,cell,text)=>`<button class="src" data-case="${esc(caseId)}" data-q="${esc(cell.ref.query)}" data-p="${esc(cell.ref.period)}" data-c="${esc(cell.ref.column)}" title="Show where this number comes from">${esc(text??num(cell.value))}</button>`;
 const challenge=(caseId,target,extra='')=>`<div class="actions"><button class="ghost" data-review="${esc(caseId)}" data-target="${target}">Challenge this</button>${extra}</div>`;
 const flag=s=>s&&s.state!=='unchallenged'?`<span class="badge warn" title="${esc(s.reasons.join('\n'))}">${esc(STATE[s.state])}</span>`:'';
 const verdict=ok=>`<span class="badge ${ok?'yes':'no'}">${ok?'Supported':'Not supported'}</span>`;

 function symptom(r,ev,st){
  const charts=ev.symptom.map(m=>{
   const change=m.before.value?(m.after.value-m.before.value)/m.before.value:null;
   return `<figure class="mini"><figcaption>${esc(METRIC[m.metric])}<b class="${change<0?'down':'up'}">${change===null?'':`${change>0?'+':''}${Math.round(change*100)}%`}</b></figcaption>
   ${bars([{label:'',before:m.before.value,after:m.after.value}],{format:num,label:METRIC[m.metric]})}
   <p class="from">${src(r.id,m.before)} → ${src(r.id,m.after)}</p></figure>`;
  }).join('');
  return `<section class="block"><h3><span class="n">1</span>The symptom ${flag(st.symptom)}</h3>
  <p>${!ev.revenueFell?'Revenue did not fall, so there is nothing to explain.':ev.symptom[0].after.value>ev.symptom[0].before.value?'More players took part, but revenue fell. That is the anomaly to explain.':'Revenue fell. That is the anomaly to explain.'} Click any number to see the SQL row it came from.</p>
  <div class="trio">${charts}</div>${legend}${challenge(r.id,'symptom')}</section>`;
 }

 function memory(r,ev,i){
  const m=ev.memory,label=s=>s==='checkout'?'Payment funnel':'Event offer';
  const recalled=m.recalled.length?m.recalled.map(x=>`<code>${esc(x.id)}</code> tagged <b>${esc(x.tags.join(', ')||'none')}</b> <span class="muted">from ${esc(x.source)}</span>`).join('<br>'):`Nothing recalled.${i===0?' This is the first case in this run.':''}`;
  return `<section class="block"><h3><span class="n">2</span>Where it looked first, and why</h3>
  <div class="flow"><div><p class="eyebrow">Recalled from H-MEM</p><p>${recalled}</p></div><div class="arrow">→</div>
  <div><p class="eyebrow">Rule</p><p>${esc(m.rule)} ${m.triggered?'<b>Triggered.</b>':'<b>Not triggered.</b>'}</p></div><div class="arrow">→</div>
  <div><p class="eyebrow">Checked in this order</p><p><b>${m.order.map(label).join(' → ')}</b></p><p class="muted">Without memory: ${m.baseline.map(label).join(' → ')}. Both checks always run.</p></div></div>
  <p class="muted">Nightshift (${esc(m.model.name)}) suggested ${m.model.suggestion.map(label).join(' → ')} after ${m.model.attempts} attempt(s). The suggestion is recorded, not used to decide.</p></section>`;
 }

 function payment(r,c,st,hasCohorts){
  const s=c.success,line=(p,x)=>`<li>${p}: ${src(r.id,x.num)} paid ÷ ${src(r.id,x.den)} tried = <b>${pct(x.value)}</b></li>`;
  const extra=`<button class="ghost" data-review="${esc(r.id)}" data-target="payment" data-compare="platform">Compare by platform</button>${hasCohorts?`<button class="ghost" data-review="${esc(r.id)}" data-target="payment" data-compare="cohort">Compare by player cohort</button>`:''}`;
  return `<div class="card"><p class="eyebrow">Explanation A</p><h4>${esc(c.question)}</h4><div class="badges">${verdict(c.supported)}${flag(st.payment)}</div>
  ${bars([{label:'Payment success',before:s.before.value,after:s.after.value}],{format:pct,max:1,label:'Payment success rate'})}
  <ul class="calc">${line('Before',s.before)}${line('After',s.after)}<li>Change: <b>${pts(c.points)}</b></li></ul>
  <p class="rule"><b>Rule:</b> ${esc(c.rule)}</p><p class="out">${esc(c.verdict)}</p>${challenge(r.id,'payment',extra)}</div>`;
 }

 function config(r,c,st){
  const rows=c.fields.map(f=>`<tr class="${f.changed?'changed':''}"><td>${esc(FIELD[f.field])}</td><td>${src(r.id,f.before,f.before.value)}</td><td>${src(r.id,f.after,f.after.value)}</td><td>${f.changed?'Changed':'Same'}</td></tr>`).join('');
  return `<div class="card"><p class="eyebrow">Explanation B</p><h4>${esc(c.question)}</h4><div class="badges">${verdict(c.supported)}${flag(st.config)}</div>
  <table class="diff"><tr><th></th><th>Before</th><th>After</th><th></th></tr>${rows}</table>
  <p class="rule"><b>Rule:</b> ${esc(c.rule)}</p><p class="out">${esc(c.verdict)}</p>${challenge(r.id,'config')}</div>`;
 }

 function funnel(r,ev){
  const g=ev.funnel.map(f=>({label:METRIC[f.stage],before:f.before.value,after:f.after.value}));
  return `<div class="card wide"><p class="eyebrow">Supporting view</p><h4>Where players dropped out of the shop funnel</h4>${bars(g,{format:num,label:'Shop funnel'})}${legend}
  <p>Share of shop visitors who tried to pay: ${src(r.id,ev.intent.before.num,pct(ev.intent.before.value))} → ${src(r.id,ev.intent.after.num,pct(ev.intent.after.value))}. This is context; it has no verdict of its own.</p></div>`;
 }

 function checks(ev){
  return `<section class="block"><h3><span class="n">4</span>Consistency checks the data passed</h3><p>If any of these fail, the run stops instead of reporting a finding.</p>
  <ul class="checks">${ev.reconciliations.map(x=>`<li class="${x.ok?'ok':'bad'}">${x.ok?'✓':'✗'} ${esc(x.label)}: ${num(x.left)} = ${num(x.right)}</li>`).join('')}</ul></section>`;
 }

 function breakdown(b){
  const g=b.segments.map(s=>({label:s.name,before:s.before,after:s.after}));
  return `<figure class="follow">${bars(g,{format:pct,max:1,label:b.metric})}<figcaption>${esc(b.metric)}</figcaption></figure>`;
 }
 function response(x){
  const detail=x.rows?`<details><summary>${esc(QUERY[x.query]||x.query)} · ${x.ms} ms · ${x.rows.length} rows</summary><pre>${esc(x.sql)}</pre>${table(x.rows)}</details>`:'';
  return `<div class="reply"><p class="eyebrow">Agent</p><p>${esc(x.text)}</p>${x.breakdown?breakdown(x.breakdown):''}${detail}</div>`;
 }
 function reviews(r,list){
  const mine=list.filter(x=>x.caseId===r.id);
  const items=mine.map(x=>`<li class="${x.resolved?'resolved':''}"><div class="you"><p class="eyebrow">Reviewer · ${esc(x.id)} · ${esc(KIND[x.kind])} · ${esc(TARGET[x.target])}${x.resolved?' · resolved':''}</p>
   ${x.ref?`<p>About ${esc(QUERY[x.ref.query])}, ${esc(x.ref.period)}, ${esc(METRIC[x.ref.column]||FIELD[x.ref.column]||x.ref.column)}.</p>`:''}${x.compare?`<p>Asked to compare by ${esc(x.compare==='platform'?'platform':'player cohort')}.</p>`:''}${x.note?`<p>“${esc(x.note)}”</p>`:''}</div>
   ${x.responses.map(response).join('')}${x.resolved?'':`<div class="actions"><button class="ghost" data-resolve="${esc(x.id)}">Mark resolved</button></div>`}</li>`).join('');
  return `<section class="block"><h3><span class="n">5</span>Reviews and follow-up checks</h3>${mine.length?`<ul class="thread">${items}</ul>`:'<p class="muted">No challenges yet. Use “Challenge this” on any part above, or click a number and flag it.</p>'}</section>`;
 }
 function table(rows){
  const cols=Object.keys(rows[0]||{});
  return `<table class="rows"><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr>${rows.map(row=>`<tr>${cols.map(c=>`<td>${esc(row[c])}</td>`).join('')}</tr>`).join('')}</table>`;
 }
 function sql(r){
  return `<section class="block"><h3><span class="n">6</span>SQL actually executed on Zetaris</h3><div class="queries">${r.trace.map(t=>`<button class="query" data-case="${esc(r.id)}" data-q="${esc(t.kind)}">${esc(QUERY[t.kind]||t.kind)}<span>${t.rows.length} rows · ${t.ms} ms</span></button>`).join('')}</div></section>`;
 }

 function finding(r,ev,st){
  const s=st.finding,warn=s.state!=='unchallenged';
  return `<div class="finding ${warn?'challenged':''}"><p class="eyebrow">Finding ${flag(s)}</p><p class="big">${esc(ev.finding)}</p>
  ${warn?`<p class="warning">A reviewer has challenged this finding or the data behind it. Treat it as unconfirmed until the reviews below are resolved.</p>`:''}
  <p class="muted">Derived from the checks below. It points to where to look next; it is not proof of cause.</p>${challenge(r.id,'finding')}</div>`;
 }

 function caseView(r,i,state){
  const ev=r.evidence,st=state.status[r.id],[lead,...rest]=r.title.split(':');
  return `<article class="case" id="case-${esc(r.id)}"><header><p class="eyebrow">${esc(lead)}</p><h2>${esc(cap(rest.join(':').trim()||r.title))}</h2></header>
  ${finding(r,ev,st)}${symptom(r,ev,st)}${memory(r,ev,i)}
  <section class="block"><h3><span class="n">3</span>Testing each explanation</h3><div class="grid">${payment(r,ev.checks[0],st,r.trace.some(t=>t.kind==='cohorts'))}${config(r,ev.checks[1],st)}${funnel(r,ev)}</div></section>
  ${checks(ev)}${reviews(r,state.reviews)}${sql(r)}</article>`;
 }
 return {caseView,table,QUERY,METRIC,FIELD,TARGET,esc};
})();
