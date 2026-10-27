import {PROBES,type Ctx,type Next} from './probes.ts';
import {EVENTS} from '../data/catalog.ts';
// The agent loop. It starts from the overview and follows the follow-ups each result unlocks.
// When several checks are open it picks one: a memory lesson wins, else Nightshift's choice if it
// names a valid candidate, else the first candidate. Every check that becomes open is run, so the
// choice changes the path and how soon the lead appears, never which evidence is collected.
export const CASES=[
 {id:'payment-incident',title:'Case one: Community Day 2, more players and less revenue',before:'cd_01',after:'cd_02'},
 {id:'offer-change',title:'Case two: Community Day 4, the same symptom again',before:'cd_03',after:'cd_04'}
];
const MAX_STEPS=12;
export type Lesson={id:string,lead:string,content:string};
export type Deps={
 query:(sql:string)=>Promise<{rows:any[],ms:number}>,
 choose:(prompt:string,ids:string[])=>Promise<{pick:string|null,replies:string[]}>,
 lessons:Lesson[],
 emit:(e:any)=>void
};
const keyOf=(x:Next)=>`${x.probe}${Object.values(x.params).length?`:${Object.values(x.params).join(':')}`:''}`;

export function context(c:{before:string,after:string}):Ctx{
 const ev=(id:string)=>{const e=EVENTS.find(x=>x.event_id===id);if(!e)throw Error(`Unknown event ${id}`);return e;};
 return {before:c.before,after:c.after,window:{from:ev(c.before).starts_at,to:ev(c.after).ends_at}};
}

function prompt(steps:any[],candidates:Next[]){
 return [`You help a game analyst choose the next check in a revenue investigation. Findings so far:`,
  ...steps.map(s=>`- ${s.title}: ${s.result.summary}`),
  `Candidate checks:`,...candidates.map(c=>`- ${keyOf(c)}: ${PROBES[c.probe].question} (${c.reason})`),
  `Reply with only the id of the one check to run next.`].join('\n');
}

// Replays the recorded results with "first candidate" choices: the path the agent takes without memory or model.
export function defaultPath(steps:any[]){
 const byKey=new Map(steps.map(s=>[s.key,s]));
 const frontier:Next[]=[{probe:'overview',params:{},reason:''}],seen=new Set<string>(),path:string[]=[];
 while(frontier.length){
  const next=frontier.shift()!,k=keyOf(next);
  if(seen.has(k))continue;seen.add(k);path.push(k);
  const s=byKey.get(k);if(s)frontier.push(...s.result.next);
 }
 return path;
}

export async function investigate(c:{id:string,before:string,after:string},deps:Deps){
 const ctx=context(c),metrics:Record<string,any>={},steps:any[]=[];
 const frontier:Next[]=[{probe:'overview',params:{},reason:'Start by measuring the symptom.'}],seen=new Set<string>();
 while(frontier.length&&steps.length<MAX_STEPS){
  const open=frontier.filter((x,i)=>frontier.findIndex(y=>keyOf(y)===keyOf(x))===i&&!seen.has(keyOf(x)));
  if(!open.length)break;
  let chosen=open[0],by='only option',model:any=null,memory:any=null;
  if(open.length>1){
   const ids=open.map(keyOf);
   model=await deps.choose(prompt(steps,open),ids);
   const lesson=deps.lessons.find(l=>open.some(x=>x.probe===l.lead));
   if(lesson)memory={lesson:lesson.id,pick:keyOf(open.find(x=>x.probe===lesson.lead)!)};
   chosen=memory?open.find(x=>keyOf(x)===memory.pick)!:model.pick?open.find(x=>keyOf(x)===model.pick)!:open[0];
   by=memory?'memory':model.pick?'model':'default';
  }
  const k=keyOf(chosen),probe=PROBES[chosen.probe];
  seen.add(k);frontier.splice(0,frontier.length,...frontier.filter(x=>!seen.has(keyOf(x))));
  deps.emit({type:'step',caseId:c.id,step:k,title:probe.title,status:'running'});
  const sql=probe.sql(ctx,chosen.params),{rows,ms}=await deps.query(sql);
  const result=probe.analyze(rows,ctx,chosen.params,metrics);
  const failed=result.checks.filter(x=>!x.ok);
  if(failed.length)throw Error(`${probe.title}: ${failed.map(x=>x.label).join('; ')} failed`);
  // A probe can run more than once with different parameters (one per changed offer, say);
  // keep every run, and a claim that must hold "everywhere" must hold in all of them.
  const prev=metrics[chosen.probe];
  metrics[chosen.probe]=prev?{...prev,runs:[...(prev.runs??[prev]),result.metrics],everywhere:prev.everywhere!==false&&result.metrics.everywhere!==false}:result.metrics;
  steps.push({n:steps.length+1,key:k,probe:chosen.probe,params:chosen.params,title:probe.title,question:probe.question,sources:probe.sources,reason:chosen.reason,
   decision:{candidates:open.map(x=>({key:keyOf(x),reason:x.reason})),by,model,memory},sql,rows,ms,result});
  deps.emit({type:'step',caseId:c.id,step:k,title:probe.title,status:'done',log:`[Zetaris] ${probe.title} (${probe.sources.join(' + ')}): ${result.summary}`,by});
  frontier.push(...result.next.filter(x=>!seen.has(keyOf(x))));
 }
 if(frontier.some(x=>!seen.has(keyOf(x))))throw Error(`Stopped after ${MAX_STEPS} checks with checks still open`);
 const hypotheses=assess(metrics);
 const lead=hypotheses.find(h=>h.status.startsWith('supported'));
 const firstLead=lead?steps.findIndex(s=>s.probe===lead.surfacedBy)+1:null;
 const baseline=defaultPath(steps);
 return {steps,hypotheses,finding:finding(metrics,hypotheses),lead:lead?.id??null,leadProbe:lead?.surfacedBy??null,
  firstLead,firstLeadWithoutMemory:lead?baseline.findIndex(k=>k.startsWith(lead.surfacedBy))+1:null};
}

// Every run of a probe (a probe can run once per store or per offer).
export const runs=(m:Record<string,any>,probe:string):any[]=>m[probe]?.runs??(m[probe]?[m[probe]]:[]);
// The drill-down for the first failing store: its build, that build's error codes and its release.
export function trail(m:Record<string,any>){
 const store=m.payment_by_provider?.failing?.[0];
 const ver=runs(m,'payment_by_version').find(r=>r.provider===store&&r.suspect);
 return {store,ver,err:ver&&runs(m,'error_codes').find(r=>r.provider===store&&r.version===ver.suspect),rel:ver&&runs(m,'release_notes').find(r=>r.version===ver.suspect)};
}
export function assess(m:Record<string,any>){
 const pay=m.payment_by_provider,{ver,err,rel}=trail(m);
 const offers=m.offer_changes,conv=m.product_conversion,mix=m.segment_mix;
 const payment={id:'payment',label:'Purchases are failing at payment',surfacedBy:'payment_by_provider',
  status:!pay?'not checked':!pay.failing.length?'not supported':ver?.suspect&&err?.concentrated&&rel?.release?'supported, corroborated by three sources':'supported',
  evidence:[pay&&'payment_by_provider',ver?.suspect&&'payment_by_version',err&&'error_codes',rel&&'release_notes'].filter(Boolean) as string[]};
 const offer={id:'offer',label:'A changed offer lost buyers',surfacedBy:'offer_changes',
  status:!offers?'not checked':!offers.relevant.length?'not supported':conv?.everywhere?'supported, and not explained by the player mix':'supported',
  evidence:[m.revenue_by_product&&'revenue_by_product',offers&&'offer_changes',conv&&'product_conversion'].filter(Boolean) as string[]};
 const players={id:'mix',label:'The event drew players who spend less',surfacedBy:'segment_mix',
  status:!mix?'not checked':mix.contributes?'contributes':'not supported',evidence:mix?['segment_mix']:[]};
 return [payment,offer,players];
}

const pct=(x:number|null)=>x===null?'n/a':`${Math.round(x*1000)/10}%`;
function finding(m:Record<string,any>,h:any[]){
 const ov=m.overview;
 if(!ov?.revenueFell)return 'Revenue did not fall, so there is no revenue drop to explain.';
 const parts:string[]=[];
 if(h[0].status.startsWith('supported')){
  const s=m.payment_by_provider.stores.find((x:any)=>x.provider===m.payment_by_provider.failing[0]);
  const {ver,err,rel}=trail(m);
  parts.push(`Look at payments first: ${s.provider} order success fell from ${pct(s.before)} to ${pct(s.after)}`+
   (ver?`, concentrated on build ${ver.suspect}`:'')+(err?.concentrated?`, which fails mostly with ${err.topCode}`:'')+
   (rel?.release?`; that build shipped ${rel.daysBefore} days before the event ended`:'')+'.');
 }
 if(h[1].status.startsWith('supported')){
  const c=m.offer_changes.changes.filter((x:any)=>m.offer_changes.relevant.includes(x.sku));
  const items=(t:string)=>t.split(',').map(x=>x.trim()).filter(Boolean);
  const describe=(x:any)=>{
   if(x.priceBefore!==x.priceAfter)return `${x.name} went from $${x.priceBefore} to $${x.priceAfter}`;
   const removed=items(x.contentsBefore).filter(i=>!items(x.contentsAfter).includes(i));
   return removed.length?`${x.name} no longer includes ${removed.map(i=>`“${i}”`).join(' or ')}`:`${x.name} changed its contents`;
  };
  parts.push(`${parts.length?'Also, the':'The'} offer changed: ${c.map(describe).join(', and ')}`+
   (m.product_conversion?.everywhere?`, and fewer players bought ${c.length>1?'them':'it'} in every segment`:'')+'.');
 }
 if(h[2].status==='contributes')parts.push(`The player mix shifted toward lower spenders, which by itself lowers revenue per participant by ${Math.round(-m.segment_mix.mixEffect*1000)/10}%.`);
 if(!parts.length)return 'None of the checked explanations is supported; the revenue drop needs other data.';
 return `${parts.join(' ')} This shows where to look next; it does not prove the cause.`;
}
