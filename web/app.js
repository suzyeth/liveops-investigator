// Page controller: loads the last run, starts a new one, streams progress, and handles challenges.
(()=>{
 const {esc,QUERY,METRIC,FIELD,TARGET}=Render;
 const $=s=>document.querySelector(s);
 const STEP={overview:'Query the overview',cohorts:'Check cohorts add up',recall:'Recall memory (H-MEM)',model:'Ask Nightshift for advice',checkout:'Query the payment funnel',offer:'Query the event offer',store:'Save evidence to memory'};
 let state=null,pending=null;

 async function api(path,init){
  const res=await fetch(path,init?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(init)}:undefined);
  const data=await res.json().catch(()=>({error:`HTTP ${res.status}`}));
  if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);
  return data;
 }
 function show(data){
  state=data;
  $('#runinfo').textContent=`Showing run ${data.report.run}.`;
  $('#cases').innerHTML=data.report.results.map((r,i)=>Render.caseView(r,i,data)).join('');
 }
 const caseOf=id=>state.report.results.find(r=>r.id===id);

 // Progress: one row of steps per case, filled in as the server reports them.
 function progress(e){
  const box=$('#progress');box.hidden=false;
  if(e.type==='case')box.querySelector('.steps').insertAdjacentHTML('beforeend',`<div class="pcase" data-case="${esc(e.caseId)}"><p class="eyebrow">${esc(e.title)}</p><ol></ol></div>`);
  if(e.type==='step'){
   const list=box.querySelector(`.pcase[data-case="${e.caseId}"] ol`);
   let li=list.querySelector(`[data-step="${e.step}"]`);
   if(!li){list.insertAdjacentHTML('beforeend',`<li data-step="${esc(e.step)}"><b>${esc(STEP[e.step]||e.step)}</b><span></span></li>`);li=list.lastElementChild;}
   li.className=e.status;
   li.querySelector('span').textContent=e.status==='running'?'running…':e.log.replace(/^\[[^\]]+\]\s*/,'');
  }
 }
 function listen(passive=false){
  const source=new EventSource(passive?'/api/events?passive=1':'/api/events');
  source.onmessage=async m=>{
   const e=JSON.parse(m.data);
   if(e.type==='idle'){source.close();return;}
   if(e.type==='run'){$('#progress .steps').innerHTML='';$('#progress .status').textContent='Running against Zetaris, Nightshift and H-MEM on this machine…';}
   progress(e);
   if(e.type==='complete'){source.close();$('#progress .status').textContent='Finished. Both cases passed every check.';$('#run').disabled=false;show(await api(`/api/report?run=${e.run}`));document.querySelector('.case')?.scrollIntoView({behavior:'smooth'});}
   if(e.type==='failed'){source.close();$('#progress .status').textContent=`Stopped: ${e.message}. No new report was written.`;$('#run').disabled=false;}
  };
  source.onerror=()=>{source.close();$('#run').disabled=false;};
 }
 async function run(){
  $('#run').disabled=true;
  try{await api('/api/run',{});listen();}
  catch(e){$('#progress').hidden=false;$('#progress .status').textContent=e.message;$('#run').disabled=false;}
 }

 // Evidence drawer: the SQL and rows behind a number, with that cell highlighted.
 function drawer(caseId,query,period,column){
  const r=caseOf(caseId),t=r.trace.find(x=>x.kind===query);
  const cols=Object.keys(t.rows[0]);
  const rows=t.rows.map(row=>`<tr>${cols.map(c=>`<td class="${row.period===period&&c===column?'hit':''}">${esc(row[c])}</td>`).join('')}</tr>`).join('');
  const name=METRIC[column]||FIELD[column]||column;
  $('#drawer .body').innerHTML=`<p class="eyebrow">${esc(r.title)}</p><h3>${esc(QUERY[query]||query)}</h3>
   ${column?`<p>The highlighted cell is <b>${esc(name)}</b>, period <b>${esc(period)}</b>.</p>`:''}
   <p class="muted">Returned ${t.rows.length} rows in ${t.ms} ms. Zetaris returns every cell as text; the app parses it strictly and stops on blanks.</p>
   <table class="rows"><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr>${rows}</table><p class="eyebrow">SQL</p><pre>${esc(t.sql)}</pre>
   ${column?`<div class="actions"><button class="ghost" data-flag="1">This value looks wrong</button></div>`:''}`;
  $('#drawer').dataset.ref=JSON.stringify({caseId,query,period,column});
  $('#drawer').hidden=false;
 }

 // Challenge dialog.
 function openReview(caseId,target,opts={}){
  pending={caseId,target,ref:opts.ref||null};
  const form=$('#review form');form.reset();
  // No default kind: rejecting a finding changes stored memory, so the reviewer must choose it.
  form.kind.value=opts.kind||(opts.compare?'missing':'');
  form.compare.value=opts.compare||'';
  form.compare.querySelector('[value="cohort"]').disabled=!caseOf(caseId).trace.some(t=>t.kind==='cohorts');
  $('#review .about').textContent=`About ${TARGET[target]} in “${caseOf(caseId).title}”`+(opts.ref?` · ${QUERY[opts.ref.query]}, ${opts.ref.period}, ${METRIC[opts.ref.column]||FIELD[opts.ref.column]||opts.ref.column}`:'');
  $('#review .error').textContent='';
  sync();$('#review').showModal();
 }
 function sync(){const f=$('#review form');f.querySelector('.compare').hidden=f.kind.value!=='missing';}
 async function submit(e){
  e.preventDefault();
  const f=$('#review form'),btn=f.querySelector('[type=submit]');
  if(!f.kind.value){$('#review .error').textContent='Choose what kind of challenge this is.';return;}
  btn.disabled=true;btn.textContent='Checking…';
  try{
   const out=await api('/api/reviews',{run:state.report.run,caseId:pending.caseId,target:pending.target,kind:f.kind.value,note:f.note.value,compare:f.kind.value==='missing'&&f.compare.value||null,ref:pending.ref});
   $('#review').close();show({...state,reviews:out.reviews,status:out.status});
   document.querySelector(`#case-${pending.caseId} .thread li:last-child`)?.scrollIntoView({behavior:'smooth',block:'center'});
  }catch(err){$('#review .error').textContent=err.message;}
  finally{btn.disabled=false;btn.textContent='Send to the agent';}
 }

 document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.id==='run')return run();
  if(b.classList.contains('src')||b.classList.contains('query'))return drawer(b.dataset.case,b.dataset.q,b.dataset.p,b.dataset.c);
  if(b.dataset.flag){const ref=JSON.parse($('#drawer').dataset.ref);$('#drawer').hidden=true;const target=ref.query==='overview'?'symptom':ref.query==='offer'?'config':'payment';return openReview(ref.caseId,target,{kind:'data',ref:{query:ref.query,period:ref.period,column:ref.column}});}
  if(b.dataset.review)return openReview(b.dataset.review,b.dataset.target,{compare:b.dataset.compare});
  if(b.dataset.resolve){
   try{const out=await api('/api/reviews/resolve',{run:state.report.run,id:b.dataset.resolve});return show({...state,reviews:out.reviews,status:out.status});}
   catch(err){b.textContent=`Could not resolve: ${err.message}`;return;}
  }
  if(b.dataset.close)return b.closest('dialog')?b.closest('dialog').close():($('#drawer').hidden=true);
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#drawer').hidden=true;});
 $('#review form').addEventListener('change',sync);
 $('#review form').addEventListener('submit',submit);

 api('/api/latest').then(show).catch(()=>{$('#runinfo').textContent='No finished run yet. Start one to see the evidence.';});
 listen(true); // picks up a run that is already in progress
})();
