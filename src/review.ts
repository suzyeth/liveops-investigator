import {parseMetric} from './investigation.ts';
import {PAYMENT_DROP_POINTS} from './evidence.ts';
// Reviewer challenges: a person can dispute data, ask for more evidence, or reject a finding.
// Everything here is pure; review-actions.ts runs the follow-up queries and memory feedback.
export const KINDS=['data','missing','distrust'] as const;
export const TARGETS=['symptom','payment','config','finding'] as const;
export const COMPARISONS=['platform','cohort'] as const;
// Which Zetaris queries each part of the analysis rests on.
export const DEPENDS:Record<string,string[]>={symptom:['overview'],payment:['checkout'],config:['offer'],finding:['overview','checkout','offer']};
const NOTE_LIMIT=500;

export function validateReview(input:any,report:any){
 if(!input||typeof input!=='object')throw Error('Review must be an object');
 const result=report.results.find((r:any)=>r.id===input.caseId);
 if(!result)throw Error('Unknown case');
 if(!TARGETS.includes(input.target))throw Error('Unknown review target');
 if(!KINDS.includes(input.kind))throw Error('Unknown review kind');
 const note=typeof input.note==='string'?input.note.trim():'';
 if(note.length>NOTE_LIMIT)throw Error(`Note is longer than ${NOTE_LIMIT} characters`);
 const compare=input.compare??null;
 if(compare!==null&&!COMPARISONS.includes(compare))throw Error('Unknown comparison');
 if(compare==='cohort'&&!result.trace.some((t:any)=>t.kind==='cohorts'))throw Error('No cohort evidence for this case');
 let ref=null;
 if(input.ref!=null){
  const {query,period,column}=input.ref;
  const row=result.trace.find((t:any)=>t.kind===query)?.rows.find((r:any)=>r.period===period);
  if(!row||typeof column!=='string'||!(column in row))throw Error('Reference does not point at recorded evidence');
  ref={query,period,column};
 }
 if(input.kind==='data'&&!ref&&!note)throw Error('Say which value looks wrong, or pick one from the evidence');
 if(input.kind==='missing'&&!compare&&!note)throw Error('Pick a comparison or describe what is missing');
 return {caseId:input.caseId,target:input.target,kind:input.kind,note,ref,compare};
}

// Status of each part of a case after the open reviews are taken into account.
export function assess(caseId:string,reviews:any[]){
 const open=reviews.filter(r=>r.caseId===caseId&&!r.resolved);
 const status=Object.fromEntries(TARGETS.map(t=>[t,{state:'unchallenged',reasons:[] as string[]}]));
 const mark=(target:string,state:string,reason:string)=>{
  const s=status[target],rank=['unchallenged','needs more evidence','disputed','data disputed'];
  status[target]={state:rank.indexOf(state)>rank.indexOf(s.state)?state:s.state,reasons:[...s.reasons,reason]};
 };
 for(const r of open){
  const who=`review ${r.id}`;
  if(r.kind==='data'){
   const queries=r.ref?[r.ref.query]:DEPENDS[r.target];
   for(const t of TARGETS)if(DEPENDS[t].some(q=>queries.includes(q)))mark(t,'data disputed',`${who}: rests on disputed ${queries.join(', ')} data`);
  }
  if(r.kind==='distrust'){mark(r.target,'disputed',`${who}: reviewer does not trust this`);if(r.target!=='finding')mark('finding','disputed',`${who}: a supporting check is disputed`);}
  if(r.kind==='missing')mark(r.target,'needs more evidence',`${who}: reviewer asked for more evidence`);
 }
 return status;
}

const rate=(n:number,d:number)=>d?n/d:null;
const pct=(x:number|null)=>x===null?'n/a':`${Math.round(x*1000)/10}%`;

// Splits payment success by platform and checks the split adds up to the recorded funnel.
export function platformBreakdown(checkoutRows:any[],platformRows:any[]){
 for(const period of ['before','after']){
  const total=checkoutRows.find(r=>r.period===period),parts=platformRows.filter(r=>r.period===period);
  for(const column of ['attempts','successes']){
   const s=parts.reduce((a,r)=>a+parseMetric(r[column],'Invalid platform evidence'),0);
   if(!total||s!==parseMetric(total[column],'Invalid funnel'))throw Error('Platform split does not add up to the payment funnel');
  }
 }
 const names=[...new Set(platformRows.map(r=>String(r.platform)))];
 const segments=names.map(name=>{
  const at=(period:string)=>{const r=platformRows.find(x=>x.platform===name&&x.period===period);return rate(parseMetric(r.successes,'Invalid platform evidence'),parseMetric(r.attempts,'Invalid platform evidence'));};
  const before=at('before'),after=at('after'),points=before!==null&&after!==null?(after-before)*100:null;
  return {name,before,after,points,drop:points!==null&&points<-PAYMENT_DROP_POINTS};
 });
 const dropped=segments.filter(s=>s.drop);
 const summary=!dropped.length?`No platform shows payment success falling by more than ${PAYMENT_DROP_POINTS} points.`
  :dropped.length===segments.length?'Payment success fell on every platform.'
  :`The payment drop is concentrated on ${dropped.map(s=>`${s.name} (${pct(s.before)} → ${pct(s.after)})`).join(', ')}; ${segments.filter(s=>!s.drop).map(s=>`${s.name} held at ${pct(s.after)}`).join(', ')}.`;
 return {kind:'platform',metric:'Payment success (successes ÷ attempts)',segments,summary};
}

// Player conversion (payers ÷ participants) per cohort, from the cohort query.
export function cohortBreakdown(cohortRows:any[]){
 const names=[...new Set(cohortRows.map(r=>String(r.cohort)))];
 const segments=names.map(name=>{
  const at=(period:string)=>{const r=cohortRows.find(x=>x.cohort===name&&x.period===period);return rate(parseMetric(r.payers,'Invalid cohorts evidence'),parseMetric(r.participants,'Invalid cohorts evidence'));};
  const before=at('before'),after=at('after');
  return {name,before,after,points:before!==null&&after!==null?(after-before)*100:null};
 });
 const worst=[...segments].sort((a,b)=>(a.points??0)-(b.points??0))[0];
 return {kind:'cohort',metric:'Player conversion (payers ÷ participants)',segments,summary:`Conversion fell most for ${worst.name} players (${pct(worst.before)} → ${pct(worst.after)}).`};
}

// A re-run of a disputed query either returns the recorded rows again or it does not.
export function sameRows(recorded:any[],fresh:any[]){
 const key=(rows:any[])=>JSON.stringify(rows.map(r=>Object.keys(r).sort().map(k=>[k,String(r[k])])).sort());
 return key(recorded)===key(fresh);
}
