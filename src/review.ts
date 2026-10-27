import {PROBES,ON_REQUEST} from './agent/probes.ts';
// Reviewer challenges: a person can dispute data, ask for more evidence, or reject a finding.
// Everything here is pure; review-actions.ts runs the follow-up queries and memory feedback.
export const KINDS=['data','missing','distrust'] as const;
const NOTE_LIMIT=500;

// Checks a reviewer can ask for that this case has not run yet.
export function comparisons(result:any){
 const ran=new Set(result.steps.map((s:any)=>s.key));
 const stores:string[]=result.steps.find((s:any)=>s.probe==='payment_by_provider')?.result.metrics.stores.map((x:any)=>x.provider)??[];
 return [
  ...ON_REQUEST.map(id=>({key:id,probe:id,params:{}})),
  ...stores.map(p=>({key:`payment_by_version:${p}`,probe:'payment_by_version',params:{provider:p}}))
 ].filter(x=>!ran.has(x.key)).map(x=>({...x,title:PROBES[x.probe].title,question:PROBES[x.probe].question}));
}

export function validateReview(input:any,report:any){
 if(!input||typeof input!=='object')throw Error('Review must be an object');
 const result=report.results.find((r:any)=>r.id===input.caseId);
 if(!result)throw Error('Unknown case');
 const targets=['finding',...result.hypotheses.map((h:any)=>h.id),...result.steps.map((s:any)=>s.key)];
 if(!targets.includes(input.target))throw Error('Unknown review target');
 if(!KINDS.includes(input.kind))throw Error('Unknown review kind');
 const note=typeof input.note==='string'?input.note.trim():'';
 if(note.length>NOTE_LIMIT)throw Error(`Note is longer than ${NOTE_LIMIT} characters`);
 const compare=input.compare??null;
 if(compare!==null&&!comparisons(result).some(x=>x.key===compare))throw Error('That comparison is not available for this case');
 let ref=null;
 if(input.ref!=null){
  const {step,row,column}=input.ref;
  const s=result.steps.find((x:any)=>x.key===step),r=Number.isInteger(row)?s?.rows[row]:undefined;
  if(!r||typeof column!=='string'||!Object.hasOwn(r,column))throw Error('Reference does not point at recorded evidence');
  ref={step,row,column};
 }
 if(input.kind==='data'&&!ref&&!note)throw Error('Say which value looks wrong, or pick one from the returned rows');
 if(input.kind==='missing'&&!compare&&!note)throw Error('Pick a comparison or describe what is missing');
 return {caseId:input.caseId,target:input.target,kind:input.kind,note,ref,compare};
}

// Which recorded steps each part of a case rests on.
export function dependsOn(result:any,target:string):string[]{
 if(target==='finding')return result.steps.map((s:any)=>s.key);
 const h=result.hypotheses.find((x:any)=>x.id===target);
 if(h)return result.steps.filter((s:any)=>h.evidence.includes(s.probe)).map((s:any)=>s.key);
 return [target];
}

// Status of every target in a case after its open reviews are applied.
export function assess(result:any,reviews:any[]){
 const open=reviews.filter(r=>r.caseId===result.id&&!r.resolved);
 const targets=['finding',...result.hypotheses.map((h:any)=>h.id),...result.steps.map((s:any)=>s.key)];
 const rank=['unchallenged','needs more evidence','disputed','data disputed'];
 const status:Record<string,{state:string,reasons:string[]}>=Object.fromEntries(targets.map(t=>[t,{state:'unchallenged',reasons:[]}]));
 const mark=(t:string,state:string,reason:string)=>{const s=status[t];status[t]={state:rank.indexOf(state)>rank.indexOf(s.state)?state:s.state,reasons:[...s.reasons,reason]};};
 for(const r of open){
  const who=`review ${r.id}`;
  if(r.kind==='data'){
   const disputed=r.ref?[r.ref.step]:dependsOn(result,r.target);
   for(const t of targets)if(dependsOn(result,t).some(k=>disputed.includes(k)))mark(t,'data disputed',`${who}: rests on disputed data from ${disputed.join(', ')}`);
  }
  if(r.kind==='distrust'){mark(r.target,'disputed',`${who}: the reviewer does not trust this`);if(r.target!=='finding')mark('finding','disputed',`${who}: a supporting part is disputed`);}
  if(r.kind==='missing')mark(r.target,'needs more evidence',`${who}: the reviewer asked for more evidence`);
 }
 return status;
}

// A re-run of a disputed query either returns the recorded rows again or it does not.
export function sameRows(recorded:any[],fresh:any[]){
 const key=(rows:any[])=>JSON.stringify(rows.map(r=>Object.keys(r).sort().map(k=>[k,String(r[k])])).sort());
 return key(recorded)===key(fresh);
}
