import fs from 'node:fs';
import {HMEM} from '../vendor/hmem/src/index.ts';
import {zetarisQuery,nightshiftChat} from './providers.ts';
import {CASES,investigate,type Lesson} from './agent/investigate.ts';
// The full investigation of every case against the three Zetaris datasources. emit() receives
// progress events for the terminal or the web app; any failure throws and nothing is written.
export type Emit=(event:{type:string,[k:string]:any})=>void;
const RECALL='Community Day revenue investigation lesson';
// A lesson a reviewer rejected (tagged "review", lower confidence) no longer steers later cases.
const TRUSTED=0.9;

// Every SELECT goes through Zetaris; anything but a complete set of row objects fails the run.
export async function query(sql:string){
 const start=Date.now(),res=await zetarisQuery(sql);
 const total=Number(res.totalCount);
 if(!Array.isArray(res.records)||!Number.isInteger(total)||total!==res.records.length||!res.records.every((r:unknown)=>r!==null&&typeof r==='object'&&!Array.isArray(r)))
  throw Error('Missing or truncated SQL evidence');
 return {rows:res.records,ms:Date.now()-start};
}

// Nightshift may name exactly one of the candidate ids; anything else (an echo of the list, several ids,
// no id, or an error) counts as no choice and the default order applies.
export function pickFrom(reply:string,ids:string[]){
 const found=ids.filter(id=>new RegExp(`(^|[^A-Za-z0-9_:.])${id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?![A-Za-z0-9_:.])`).test(reply));
 return found.length===1?found[0]:null;
}
export async function choose(prompt:string,ids:string[]){
 const replies:string[]=[];let model:string|null=null;
 for(let i=0;i<3;i++){
  try{
   const out=await nightshiftChat(prompt);model=out.model??model;replies.push(out.content);
   const pick=pickFrom(out.content,ids);
   if(pick)return {pick,replies,model};
  }catch(e){replies.push(`error: ${e instanceof Error?e.message:String(e)}`);break;}
 }
 return {pick:null,replies,model};
}

// Write to a temporary file and rename, so a reader never sees half a report.
export function writeJson(file:string,data:unknown){
 fs.writeFileSync(`${file}.tmp`,JSON.stringify(data,null,2));
 fs.renameSync(`${file}.tmp`,file);
}

export async function runInvestigation(emit:Emit){
 const run=new Date().toISOString().replace(/[:.]/g,'-');
 // A fresh replay per run: a case can only learn from the cases before it, never from an earlier run.
 const dir=`.state/replays/${run}`,results:any[]=[];
 fs.mkdirSync('reports',{recursive:true});
 emit({type:'run',run});
 for(const c of CASES){
  emit({type:'case',caseId:c.id,title:c.title,log:`\n${c.title}`});
  const memory=new HMEM({persistDir:dir});
  const recalled=memory.query(RECALL,{threshold:0.1,topN:5}).memories.map(m=>m.memory).filter(m=>m.tags.includes('lesson'));
  const usable=recalled.filter(m=>!m.tags.includes('review')&&m.confidence>=TRUSTED);
  const lessons:Lesson[]=usable.map(m=>({id:m.id,lead:(m.tags.find(t=>t.startsWith('lead:'))??'').slice(5),content:m.content})).filter(l=>l.lead);
  emit({type:'step',caseId:c.id,step:'recall',title:'Recall lessons (H-MEM)',status:'done',log:`[H-MEM] ${lessons.length} lesson(s) recalled${lessons.length?`: start with ${lessons[0].lead}`:''}`});
  const out=await investigate(c,{query,choose,lessons,emit});
  let stored=null;
  if(out.lead){
   const content=`${RECALL}: in ${c.id} the main explanation, "${out.hypotheses.find(h=>h.id===out.lead)!.label}", first appeared in ${out.leadProbe}. New incidents must be rechecked against fresh data.`;
   const record=memory.add({content,source:`liveops:${c.id}:reports/${run}.json`,type:'factual',layer:'working',confidence:1,tags:['lesson',`lead:${out.leadProbe}`,`case:${c.id}`],
    provenance:{origin:'document',learnedAt:Date.now(),label:'Zetaris evidence from the investigation steps',refs:[`reports/${run}.json`]}});
   const persisted=new HMEM({persistDir:dir}).query(RECALL,{threshold:0.1,topN:10}).memories.some(m=>m.memory.id===record.id);
   if(!persisted)throw Error('Memory reload verification failed');
   stored={id:record.id,lead:out.leadProbe,persisted};
   emit({type:'step',caseId:c.id,step:'store',title:'Save lesson (H-MEM)',status:'done',log:`[H-MEM] saved ${record.id}: lead found by ${out.leadProbe}; reload verified`});
  }
  results.push({id:c.id,title:c.title,before:c.before,after:c.after,...out,
   memory:{recalled:recalled.map(m=>({id:m.id,source:m.source,content:m.content,tags:m.tags,confidence:m.confidence})),lessons,stored}});
 }
 const report={run,status:'complete',version:3,results};
 writeJson(`reports/${run}.json`,report);
 writeJson('reports/latest.json',report);
 return report;
}
