// Renders one finished case: the finding, the verdict on each explanation, how memory and the
// model steered the path, and every investigation step with its chart, conclusion and raw rows.
const Render=(()=>{
 const {esc,bars,legend}=Charts;
 const pct=x=>x===null||x===undefined?'n/a':`${Math.round(x*1000)/10}%`;
 const usd=x=>`$${Math.round(x).toLocaleString('en-US')}`;
 const num=x=>Number(x).toLocaleString('en-US');
 const SHORT={cd_ticket:'Ticket',cd_box_web:'Box',coins_550:'550 coins',coins_1200:'1,200 coins',coins_2500:'2,500 coins',coins_5200:'5,200 coins',coins_14500:'14,500 coins'};
 const SOURCE={game_telemetry:'Game telemetry',payments:'Payment gateway',liveops:'Live-ops config'};
 const KIND={data:'The data looks wrong',missing:'Something is missing',distrust:'I don’t trust this'};
 const STATE={'data disputed':'Data disputed','disputed':'Disputed by a reviewer','needs more evidence':'More evidence requested'};
 const flag=s=>s&&s.state!=='unchallenged'?`<span class="badge warn" title="${esc(s.reasons.join('\n'))}">${esc(STATE[s.state])}</span>`:'';
 const challenge=(caseId,target,label='Challenge this')=>`<button class="ghost" data-review="${esc(caseId)}" data-target="${esc(target)}">${esc(label)}</button>`;
 const verdict=s=>`<span class="badge ${s.startsWith('supported')?'yes':s==='contributes'?'mid':'no'}">${esc(s.charAt(0).toUpperCase()+s.slice(1))}</span>`;

 // One chart per kind of check, drawn from the metrics the server computed.
 function chart(probe,m){
  if(probe==='overview')return `<div class="trio">${[['Players','participants',num],['Paying players','payers',num],['Revenue','revenue',usd]].map(([t,k,f])=>`<figure class="mini"><figcaption>${t}</figcaption>${bars([{label:'',before:m.before[k],after:m.after[k]}],{format:f})}</figure>`).join('')}</div>${legend()}`;
  if(probe==='revenue_by_product')return bars([...m.items].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,5).map(x=>({label:SHORT[x.sku]||x.sku,before:x.before,after:x.after})),{format:usd,label:'Revenue by product'})+legend();
  if(probe==='payment_by_provider')return bars(m.stores.map(s=>({label:s.provider,before:s.before,after:s.after})),{format:pct,max:1,label:'Order success by store'})+legend();
  if(probe==='payment_by_version')return bars(m.builds.map(b=>({label:b.version,before:m.baseline,after:b.rate})),{format:pct,max:1,label:'Order success by build'})+legend(`${m.provider}, event before`,'This build, event after');
  if(probe==='error_codes'){
   const share=(g,c)=>g.failures?(g.codes.find(x=>x.code===c)?.attempts??0)/g.failures:0;
   const codes=[...new Set([...m.suspect.codes,...m.other.codes].filter(x=>x.code!=='OK').sort((a,b)=>b.attempts-a.attempts).map(x=>x.code))].slice(0,4);
   return bars(codes.map(c=>({label:c.replace(/_/g,' ').toLowerCase(),before:share(m.other,c),after:share(m.suspect,c)})),{format:pct,max:1,label:'Share of failed attempts by code'})+legend('Other builds','Suspect build');
  }
  if(probe==='segment_mix')return bars(m.segments.map(s=>({label:s.segment,before:s.shareBefore,after:s.shareAfter})),{format:pct,max:1,label:'Share of participants'})+legend();
  if(probe==='product_conversion')return bars(m.segments.map(s=>({label:s.segment,before:s.before,after:s.after})),{format:pct,label:'Share of participants who bought'})+legend();
  if(probe==='revenue_by_country')return bars([...m.items].sort((a,b)=>b.before-a.before).slice(0,6).map(x=>({label:x.country,before:x.before,after:x.after})),{format:usd,label:'Revenue by country'})+legend();
  if(probe==='offer_changes')return m.changes.length?`<table class="diff"><tr><th>Offer</th><th>Before</th><th>After</th></tr>${m.changes.map(x=>`<tr class="changed"><td>${esc(x.name)}</td><td>$${esc(x.priceBefore)} · ${esc(x.contentsBefore)}</td><td>$${esc(x.priceAfter)} · ${esc(x.contentsAfter)}</td></tr>`).join('')}</table>`:'';
  if(probe==='release_notes')return m.release?`<div class="release"><b>${esc(m.release.version)}</b> · ${esc(m.release.platform)} · ${esc(String(m.release.released_at).slice(0,16).replace('T',' '))} UTC<br>${esc(m.release.notes)} <span class="muted">(synthetic release record)</span></div>`:'';
  return '';
 }
 function rows(caseId,key,list,clickable=true){
  const cols=Object.keys(list[0]||{});
  const cell=(row,i,c)=>clickable?`<button class="cell" data-case="${esc(caseId)}" data-step="${esc(key)}" data-row="${i}" data-col="${esc(c)}" title="Flag this value">${esc(row[c])}</button>`:esc(row[c]);
  return `<table class="rows"><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr>${list.map((row,i)=>`<tr>${cols.map(c=>`<td>${cell(row,i,c)}</td>`).join('')}</tr>`).join('')}</table>`;
 }
 function why(s){
  const d=s.decision,by={memory:`Chosen by a memory lesson (${esc(d.memory?.lesson)})`,model:'Chosen by Nightshift',default:'Default order (Nightshift gave no valid choice)','only option':'The only open check'}[d.by];
  const open=d.candidates.length>1?` from ${d.candidates.length} open checks: ${d.candidates.map(c=>`<code>${esc(c.key)}</code>`).join(', ')}.`:'.';
  const model=d.model&&d.by!=='model'?` Nightshift suggested <code>${esc(d.model.pick??'nothing valid')}</code>.`:'';
  return `<p class="why"><b>Why:</b> ${esc(s.reason)} ${by}${open}${model}</p>`;
 }
 function step(r,s,st){
  return `<section class="step" id="step-${esc(r.id)}-${esc(s.key)}"><div class="stephead"><span class="n">${s.n}</span><h4>${esc(s.title)}</h4>${s.sources.map(x=>`<span class="src-tag ${esc(x)}">${esc(SOURCE[x]||x)}</span>`).join('')}${flag(st[s.key])}</div>
  <p class="q">${esc(s.question)}</p>${why(s)}<div class="viz">${chart(s.probe,s.result.metrics)}</div><p class="out">${esc(s.result.summary)}</p>
  <details><summary>Zetaris returned ${s.rows.length} rows in ${s.ms} ms · SQL and rows</summary><pre>${esc(s.sql)}</pre>${rows(r.id,s.key,s.rows)}</details>
  <div class="actions">${challenge(r.id,s.key)}</div></section>`;
 }
 function hypotheses(r,st){
  const stepOf=p=>r.steps.filter(s=>s.probe===p).map(s=>s.n);
  return `<table class="verdicts"><tr><th>Explanation</th><th>Verdict</th><th>Evidence</th><th></th></tr>${r.hypotheses.map(h=>`<tr><td>${esc(h.label)}</td><td>${verdict(h.status)} ${flag(st[h.id])}</td>
   <td>${h.evidence.flatMap(stepOf).map(n=>`<a href="#step-${esc(r.id)}-${esc(r.steps[n-1].key)}">step ${n}</a>`).join(', ')||'none'}</td><td>${challenge(r.id,h.id,'Challenge')}</td></tr>`).join('')}</table>`;
 }
 function memory(r){
  const m=r.memory,lessons=m.lessons.length?m.lessons.map(l=>`<code>${esc(l.id)}</code>: start with <b>${esc(l.lead)}</b>`).join('<br>'):'None. This is the first case in this run.';
  const lead=r.firstLead?`The lead first appeared at step ${r.firstLead}${r.firstLeadWithoutMemory?`; the default order would have reached it at step ${r.firstLeadWithoutMemory}`:''}.`:'No explanation was supported.';
  return `<div class="flow"><div><p class="eyebrow">Recalled from H-MEM</p><p>${lessons}</p></div><div class="arrow">→</div>
   <div><p class="eyebrow">How the path was chosen</p><p>A lesson goes first; otherwise Nightshift picks among the open checks; otherwise the first one. Every open check still runs.</p></div><div class="arrow">→</div>
   <div><p class="eyebrow">Result</p><p>${lead}</p><p class="muted">${m.stored?`Saved lesson <code>${esc(m.stored.id)}</code> (lead: ${esc(m.stored.lead)}); reload verified.`:'No lesson saved.'}</p></div></div>`;
 }
 function response(caseId,x){
  const detail=x.rows?`<details><summary>${esc(x.title||'Re-run')} · ${x.ms} ms · ${x.rows.length} rows</summary><pre>${esc(x.sql)}</pre>${rows(caseId,'',x.rows,false)}</details>`:'';
  return `<div class="reply"><p class="eyebrow">Agent${x.sources?` · ${x.sources.map(s=>esc(SOURCE[s]||s)).join(' + ')}`:''}</p><p>${esc(x.text)}</p>${x.result?`<div class="viz">${chart(x.probe,x.result.metrics)}</div>`:''}${detail}</div>`;
 }
 function reviews(r,list,labels){
  const mine=list.filter(x=>x.caseId===r.id);
  const items=mine.map(x=>`<li class="${x.resolved?'resolved':''}"><div class="you"><p class="eyebrow">Reviewer · ${esc(x.id)} · ${esc(KIND[x.kind])} · ${esc(labels[x.target]||x.target)}${x.resolved?' · resolved':''}</p>
   ${x.ref?`<p>About the value in ${esc(x.ref.column)}, row ${x.ref.row+1} of “${esc(labels[x.ref.step]||x.ref.step)}”.</p>`:''}${x.compare?`<p>Asked for: ${esc(labels[x.compare]||x.compare)}.</p>`:''}${x.note?`<p>“${esc(x.note)}”</p>`:''}</div>
   ${x.responses.map(y=>response(r.id,y)).join('')}${x.resolved?'':`<div class="actions"><button class="ghost" data-resolve="${esc(x.id)}">Mark resolved</button></div>`}</li>`).join('');
  return `<section class="block"><h3>Reviews and follow-up checks</h3>${mine.length?`<ul class="thread">${items}</ul>`:'<p class="muted">No challenges yet. Use “Challenge” on the finding, an explanation or any step, or open a step’s rows and click a value.</p>'}</section>`;
 }
 function caseView(r,state){
  const st=state.status[r.id],[lead,...rest]=r.title.split(':'),s=st.finding,warn=s.state!=='unchallenged';
  const labels=Object.fromEntries([['finding','the finding'],...r.hypotheses.map(h=>[h.id,h.label]),...r.steps.map(x=>[x.key,x.title]),...(state.comparisons[r.id]||[]).map(c=>[c.key,c.title])]);
  return `<article class="case" id="case-${esc(r.id)}"><header><p class="eyebrow">${esc(lead)} · ${esc(r.before)} → ${esc(r.after)}</p><h2>${esc(rest.join(':').trim())}</h2></header>
  <div class="finding ${warn?'challenged':''}"><p class="eyebrow">Finding ${flag(s)}</p><p class="big">${esc(r.finding)}</p>
   ${warn?'<p class="warning">A reviewer has challenged this finding or the data behind it. Treat it as unconfirmed until the reviews below are resolved.</p>':''}
   ${hypotheses(r,st)}<div class="actions">${challenge(r.id,'finding','Challenge the finding')}</div></div>
  <section class="block"><h3>Memory and path</h3>${memory(r)}</section>
  <section class="block"><h3>How the agent got there: ${r.steps.length} checks across ${new Set(r.steps.flatMap(x=>x.sources)).size} data sources</h3>${r.steps.map(x=>step(r,x,st)).join('')}</section>
  ${reviews(r,state.reviews,labels)}</article>`;
 }
 return {caseView,esc,SOURCE};
})();
