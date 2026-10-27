// Page controller: loads the last run, starts a new one, streams progress, and handles challenges.
(()=>{
 const {esc}=Render;
 const $=s=>document.querySelector(s);
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
  $('#cases').innerHTML=data.report.results.map(r=>Render.caseView(r,data)).join('');
 }
 const caseOf=id=>state.report.results.find(r=>r.id===id);
 const label=(r,key)=>key==='finding'?'the finding':r.hypotheses.find(h=>h.id===key)?.label||r.steps.find(s=>s.key===key)?.title||key;

 // Progress: one list of steps per case, filled in as the server reports them.
 function progress(e){
  const box=$('#progress');box.hidden=false;
  if(e.type==='case')box.querySelector('.steps').insertAdjacentHTML('beforeend',`<div class="pcase" data-case="${esc(e.caseId)}"><p class="eyebrow">${esc(e.title)}</p><ol></ol></div>`);
  if(e.type==='step'){
   const list=box.querySelector(`.pcase[data-case="${e.caseId}"] ol`);
   let li=[...list.children].find(x=>x.dataset.step===e.step);
   if(!li){list.insertAdjacentHTML('beforeend',`<li data-step="${esc(e.step)}"><b>${esc(e.title||e.step)}</b><span></span></li>`);li=list.lastElementChild;}
   li.className=e.status;
   li.querySelector('span').textContent=e.status==='running'?'running…':(e.log||'').replace(/^\[[^\]]+\]\s*/,'').replace(/^[^:]+: /,'');
  }
 }
 function listen(passive=false){
  const source=new EventSource(passive?'/api/events?passive=1':'/api/events');
  source.onmessage=async m=>{
   const e=JSON.parse(m.data);
   if(e.type==='idle'){source.close();return;}
   if(e.type==='run'){$('#progress .steps').innerHTML='';$('#progress .status').textContent='Running against Zetaris (three data sources), Nightshift and H-MEM on this machine…';}
   progress(e);
   if(e.type==='complete'){source.close();$('#progress .status').textContent='Finished. All cross-source consistency checks passed.';$('#run').disabled=false;show(await api(`/api/report?run=${e.run}`));document.querySelector('.case')?.scrollIntoView({behavior:'smooth'});}
   if(e.type==='failed'){source.close();$('#progress .status').textContent=`Stopped: ${e.message}. No new report was written.`;$('#run').disabled=false;}
  };
  source.onerror=()=>{source.close();$('#run').disabled=false;};
 }
 async function run(){
  $('#run').disabled=true;
  try{await api('/api/run',{});listen();}
  catch(e){$('#progress').hidden=false;$('#progress .status').textContent=e.message;$('#run').disabled=false;}
 }

 // Challenge dialog.
 function openReview(caseId,target,opts={}){
  pending={run:state.report.run,caseId,target,ref:opts.ref||null};
  const r=caseOf(caseId),form=$('#review form');form.reset();
  form.kind.value=opts.kind||'';
  form.compare.innerHTML='<option value="">(just record my note)</option>'+(state.comparisons[caseId]||[]).map(c=>`<option value="${esc(c.key)}">${esc(c.title)}: ${esc(c.question)}</option>`).join('');
  $('#review .about').textContent=`About ${label(r,target)} in “${r.title}”`+(opts.ref?` · value “${r.steps.find(s=>s.key===opts.ref.step).rows[opts.ref.row][opts.ref.column]}” in column ${opts.ref.column}`:'');
  $('#review .error').textContent='';
  sync();$('#review').showModal();
 }
 function sync(){const f=$('#review form');f.querySelector('.compare').hidden=f.kind.value!=='missing';}
 async function submit(e){
  e.preventDefault();
  const f=$('#review form'),btn=f.querySelector('[type=submit]');
  // No default kind: rejecting a finding changes stored memory, so the reviewer must choose it.
  if(!f.kind.value){$('#review .error').textContent='Choose what kind of challenge this is.';return;}
  btn.disabled=true;btn.textContent='Checking…';
  try{
   const out=await api('/api/reviews',{run:pending.run,caseId:pending.caseId,target:pending.target,kind:f.kind.value,note:f.note.value,compare:f.kind.value==='missing'&&f.compare.value||null,ref:pending.ref});
   $('#review').close();show({...state,reviews:out.reviews,status:out.status,comparisons:out.comparisons});
   document.querySelector(`#case-${pending.caseId} .thread li:last-child`)?.scrollIntoView({behavior:'smooth',block:'center'});
  }catch(err){$('#review .error').textContent=err.message;}
  finally{btn.disabled=false;btn.textContent='Send to the agent';}
 }

 document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.id==='run')return run();
  if(b.classList.contains('cell'))return openReview(b.dataset.case,b.dataset.step,{kind:'data',ref:{step:b.dataset.step,row:Number(b.dataset.row),column:b.dataset.col}});
  if(b.dataset.review)return openReview(b.dataset.review,b.dataset.target);
  if(b.dataset.resolve){
   try{const out=await api('/api/reviews/resolve',{run:state.report.run,id:b.dataset.resolve});return show({...state,reviews:out.reviews,status:out.status,comparisons:out.comparisons});}
   catch(err){b.textContent=`Could not resolve: ${err.message}`;return;}
  }
  if(b.dataset.close)return b.closest('dialog')?.close();
 });
 $('#review form').addEventListener('change',sync);
 $('#review form').addEventListener('submit',submit);

 api('/api/latest').then(show).catch(()=>{$('#runinfo').textContent='No finished run yet. Start one to see the evidence.';});
 listen(true); // picks up a run that is already in progress
})();
