import {PROBES,usd,type Ctx,type Next} from './probes.ts';
import {EVENTS} from '../data/catalog.ts';
// The agent loop. It starts from the overview and follows the follow-ups each result unlocks.
// When several checks are open it picks one: a memory lesson wins, else Nightshift's choice if it
// names exactly one valid candidate, else the first candidate. Every check that becomes open is run,
// so the choice changes the path and how soon the lead appears, never which evidence is collected.
// Case ids are neutral on purpose: nothing the agent sees names the cause.
export const CASES=[
 {id:'cd01-cd02',title:'Case one: Community Day 2',before:'cd_01',after:'cd_02'},
 {id:'cd03-cd04',title:'Case two: Community Day 4',before:'cd_03',after:'cd_04'},
 {id:'cd04-cd05',title:'Case three: Community Day 5',before:'cd_04',after:'cd_05'}
];
const MAX_STEPS=20;
export type Lesson={id:string,lead:string,content:string};
export type Deps={
 query:(sql:string)=>Promise<{rows:any[],ms:number}>,
 choose:(prompt:string,ids:string[])=>Promise<{pick:string|null,replies:string[],model?:string|null}>,
 lessons:Lesson[],
 emit:(e:any)=>void
};
const keyOf=(x:Next)=>`${x.probe}${Object.values(x.params).length?`:${Object.values(x.params).join(':')}`:''}`;

export function context(c:{before:string,after:string}):Ctx{
 const ev=(id:string)=>{const e=EVENTS.find(x=>x.event_id===id);if(!e)throw Error(`Unknown event ${id}`);return e;};
 return {before:c.before,after:c.after,window:{from:ev(c.before).starts_at,to:ev(c.after).ends_at}};
}

function prompt(steps:any[],candidates:Next[]){
 return [`You help a game analyst explain a revenue shortfall after a live event. Findings so far:`,
  ...steps.map(s=>`- ${s.title}: ${s.result.summary}`),
  `Candidate checks:`,...candidates.map(c=>`- ${keyOf(c)}: ${PROBES[c.probe].question} (${c.reason})`),
  `Which one check is most likely to explain the shortfall? Reply with only its id.`].join('\n');
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
   const lesson=deps.lessons.find(l=>open.some(x=>x.probe===l.lead));
   if(lesson)memory={lesson:lesson.id,pick:keyOf(open.find(x=>x.probe===lesson.lead)!)};
   model=await deps.choose(prompt(steps,open),open.map(keyOf));
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
  // A probe can run more than once with different parameters (one per store or offer); keep every run,
  // and a claim that must hold "everywhere" must hold in all of them.
  const prev=metrics[chosen.probe];
  metrics[chosen.probe]=prev?{...prev,runs:[...(prev.runs??[prev]),result.metrics],everywhere:prev.everywhere!==false&&result.metrics.everywhere!==false}:result.metrics;
  steps.push({n:steps.length+1,key:k,probe:chosen.probe,params:chosen.params,title:probe.title,question:probe.question,sources:probe.sources,reason:chosen.reason,
   decision:{candidates:open.map(x=>({key:keyOf(x),reason:x.reason})),by,model,memory},sql,rows,ms,result});
  deps.emit({type:'step',caseId:c.id,step:k,title:probe.title,status:'done',log:`[Zetaris] ${probe.title} (${probe.sources.join(' + ')}): ${result.summary}`,by});
  frontier.push(...result.next.filter(x=>!seen.has(keyOf(x))));
 }
 if(frontier.some(x=>!seen.has(keyOf(x))))throw Error(`Stopped after ${MAX_STEPS} checks with checks still open`);
 const hypotheses=assess(metrics);
 const supported=hypotheses.filter(h=>h.status.startsWith('supported')).sort((x,y)=>y.dollars-x.dollars);
 const lead=supported[0];
 const firstLead=lead?steps.findIndex(s=>s.probe===lead.surfacedBy)+1:null;
 const baseline=defaultPath(steps);
 return {steps,hypotheses,attribution:attribution(metrics,hypotheses),finding:finding(metrics,hypotheses),lead:lead?.id??null,leadProbe:lead?.surfacedBy??null,
  firstLead,firstLeadWithoutMemory:lead?baseline.findIndex(k=>k.startsWith(lead.surfacedBy))+1:null};
}

// Every run of a probe (a probe can run once per store or per offer).
export const runs=(m:Record<string,any>,probe:string):any[]=>m[probe]?.runs??(m[probe]?[m[probe]]:[]);
// The drill-down for the first failing store: its build, that build's error codes and its release on the same platform.
export function trail(m:Record<string,any>){
 const store=m.payment_by_provider?.failing?.[0],platform=store==='google_play'?'android':store==='app_store'?'ios':null;
 const ver=runs(m,'payment_by_version').find(r=>r.provider===store&&r.suspect);
 return {store,ver,err:ver&&runs(m,'error_codes').find(r=>r.provider===store&&r.version===ver.suspect),
  rel:ver&&runs(m,'release_notes').find(r=>r.version===ver.suspect&&r.platform===platform&&r.release)};
}

export function assess(m:Record<string,any>){
 const pay=m.payment_by_provider,{ver,err,rel}=trail(m);
 const offers=m.offer_changes,conv=m.product_conversion,mix=m.segment_mix,products=m.revenue_by_product;
 const lost=runs(m,'payment_loss').filter(r=>pay?.failing?.includes(r.provider)).reduce((s,r)=>s+r.lost,0);
 const offerGap=(offers?.relevant??[]).reduce((s:number,sku:string)=>s+Math.max(0,-(products?.items.find((x:any)=>x.sku===sku)?.gap??0)),0);
 const payment={id:'payment',label:'Purchases are failing at payment',surfacedBy:'payment_by_provider',
  status:!pay?'not checked':!pay.failing.length?'not supported':ver?.suspect&&err?.concentrated&&rel?.release?'supported, corroborated by three sources':'supported',
  dollars:pay?.failing?.length?lost:0,
  evidence:[pay&&'payment_by_provider',lost&&'payment_loss',ver?.suspect&&'payment_by_version',err&&'error_codes',rel&&'release_notes'].filter(Boolean) as string[]};
 const offer={id:'offer',label:'A changed offer lost buyers',surfacedBy:'offer_changes',
  // A changed offer that fell short is only a lead if fewer players bought it in every segment, beyond noise.
  status:!offers?'not checked':!offers.relevant.length||!conv?.everywhere?'not supported':'supported, and not explained by the player mix',
  dollars:offers?.relevant?.length&&conv?.everywhere?offerGap:0,
  evidence:[products&&'revenue_by_product',offers&&'offer_changes',conv&&'product_conversion'].filter(Boolean) as string[]};
 const players={id:'mix',label:'The event drew players who spend less',surfacedBy:'segment_mix',
  status:!mix?'not checked':mix.contributes?'contributes':'not supported',dollars:mix?.contributes?-mix.mixDollars:0,evidence:mix?['segment_mix']:[]};
 return [payment,offer,players];
}

// Sizes each supported explanation against the shortfall and states what is left unexplained.
export function attribution(m:Record<string,any>,h:any[]){
 const shortfall=Math.max(0,m.overview?.shortfall??0);
 const parts=h.filter(x=>x.dollars>0).map(x=>({id:x.id,label:x.label,dollars:x.dollars}));
 const explained=parts.reduce((s,x)=>s+x.dollars,0),unexplained=Math.max(0,shortfall-explained);
 return {shortfall,parts,explained,unexplained,overlap:explained>shortfall};
}

const pct=(x:number|null)=>x===null?'n/a':`${Math.round(x*1000)/10}%`;
function finding(m:Record<string,any>,h:any[]){
 const ov=m.overview;
 if(!ov?.investigate)return 'Revenue kept up with the turnout (any shortfall is under 5% of what was expected), so there is nothing to explain.';
 const a=attribution(m,h),share=(x:number)=>`${Math.round(x/a.shortfall*100)}%`;
 const out=[`Revenue was ${usd(a.shortfall)} below what the turnout predicted (${usd(ov.expected)} expected, ${usd(ov.after.revenue)} actual).`];
 if(h[0].status.startsWith('supported')){
  const s=m.payment_by_provider.stores.find((x:any)=>x.provider===m.payment_by_provider.failing[0]),{ver,err,rel}=trail(m);
  out.push(`About ${usd(h[0].dollars)} (${share(h[0].dollars)}) is failed ${s.provider} orders: completion fell from ${pct(s.before)} to ${pct(s.after)}`+
   (ver?`, concentrated on build ${ver.suspect}`:'')+(err?.concentrated?`, which fails mostly with ${err.topCode}`:'')+
   (rel?.release?`; that build shipped ${rel.hoursBefore} hours before the event ended`:'')+'.');
 }
 if(h[1].status.startsWith('supported')){
  const c=m.offer_changes.changes.filter((x:any)=>m.offer_changes.relevant.includes(x.sku));
  const items=(t:string)=>t.split(',').map(x=>x.trim()).filter(Boolean);
  const describe=(x:any)=>{
   if(x.priceBefore!==x.priceAfter)return `${x.name} went from $${x.priceBefore} to $${x.priceAfter}`;
   const removed=items(x.contentsBefore).filter(i=>!items(x.contentsAfter).includes(i));
   return removed.length?`${x.name} no longer includes ${removed.map(i=>`“${i}”`).join(' or ')}`:`${x.name} changed its contents`;
  };
  out.push(`About ${usd(h[1].dollars)} (${share(h[1].dollars)}) is the changed offer: ${c.map(describe).join(', and ')}; fewer players bought ${c.length>1?'them':'it'} in every segment with enough buyers to compare.`);
 }
 if(h[2].status==='contributes')out.push(`About ${usd(h[2].dollars)} (${share(h[2].dollars)}) is the shift toward players who spend less.`);
 const supported=h.some(x=>x.status.startsWith('supported'));
 if(!supported)out.push(`Payments held and no changed offer fell short${h[2].status==='contributes'?'; the player mix explains part of it':''}. None of the checked explanations accounts for most of the shortfall.`);
 if(a.overlap)out.push(`These estimates add up to ${usd(a.explained-a.shortfall)} more than the shortfall: they overlap, and revenue also varies by a few thousand dollars between events, so the split is approximate.`);
 else if(a.unexplained>=0.1*a.shortfall)out.push(`${usd(a.unexplained)} (${share(a.unexplained)}) is not explained by these checks${supported?'':'; it may be normal variation between events, or a cause that needs data this prototype does not have, such as how players received the event'}.`);
 out.push('The amounts are estimates; they show where to look next, not proof of cause.');
 return out.join(' ');
}
