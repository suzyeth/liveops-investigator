import fs from 'node:fs';
import {HMEM} from '../vendor/hmem/src/index.ts';
import {zetarisQuery,nightshiftChat} from './providers.ts';
import {CASES,investigate,type Lesson} from './agent/investigate.ts';
// One full investigation of both cases against the three Zetaris datasources. emit() receives
// progress events for the terminal or the web app; any failure throws and nothing is written.
export type Emit=(event:{type:string,[k:string]:any})=>void;
const RECALL='Community Day revenue investigation lesson';

// Every SELECT goes through Zetaris; a truncated result fails rather than reporting partial evidence.
export async function query(sql:string){
 const start=Date.now(),res=await zetarisQuery(sql);
 if(!Array.isArray(res.records)||Number(res.totalCount)>res.records.length)throw Error('Missing or truncated SQL evidence');
 return {rows:res.records,ms:Date.now()-start};
}

// Nightshift may name one of the candidate ids; anything else counts as no choice.
export async function choose(prompt:string,ids:string[]){
 const replies:string[]=[];
 for(let i=0;i<3;i++){
  const reply=(await nightshiftChat(prompt)).content;replies.push(reply);
  const hits=ids.map(id=>({id,at:reply.indexOf(id)})).filter(x=>x.at>=0).sort((a,b)=>a.at-b.at||b.id.length-a.id.length);
  if(hits.length)return {pick:hits[0].id,replies};
 }
 return {pick:null,replies};
}

export async function runInvestigation(emit:Emit){
 const run=new Date().toISOString().replace(/[:.]/g,'-');
 // A fresh replay per run: case two can only learn from case one, never from an earlier run.
 const dir=`.state/replays/${run}`,results:any[]=[];
 fs.mkdirSync('reports',{recursive:true});
 emit({type:'run',run});
 for(const c of CASES){
  emit({type:'case',caseId:c.id,title:c.title,log:`\n${c.title}`});
  const memory=new HMEM({persistDir:dir});
  const recalled=memory.query(RECALL,{threshold:0.1,topN:3}).memories.map(m=>m.memory).filter(m=>m.tags.includes('lesson'));
  const lessons:Lesson[]=recalled.map(m=>({id:m.id,lead:(m.tags.find(t=>t.startsWith('lead:'))??'').slice(5),content:m.content})).filter(l=>l.lead);
  emit({type:'step',caseId:c.id,step:'recall',title:'Recall lessons (H-MEM)',status:'done',log:`[H-MEM] ${lessons.length} lesson(s) recalled${lessons.length?`: start with ${lessons[0].lead}`:''}`});
  const out=await investigate(c,{query,choose,lessons,emit});
  let stored=null;
  if(out.lead){
   const content=`${RECALL}: in ${c.id} (${c.before} → ${c.after}) the lead "${out.hypotheses.find(h=>h.id===out.lead)!.label}" first appeared in ${out.leadProbe}. New incidents must be rechecked against fresh data.`;
   const record=memory.add({content,source:`liveops:${c.id}:reports/${run}.json`,type:'factual',layer:'working',confidence:1,tags:['lesson',`lead:${out.leadProbe}`,`case:${c.id}`],
    provenance:{origin:'document',learnedAt:Date.now(),label:'Zetaris evidence from the investigation steps',refs:[`reports/${run}.json`]}});
   const persisted=new HMEM({persistDir:dir}).query(RECALL,{threshold:0.1,topN:5}).memories.some(m=>m.memory.id===record.id);
   if(!persisted)throw Error('Memory reload verification failed');
   stored={id:record.id,lead:out.leadProbe,persisted};
   emit({type:'step',caseId:c.id,step:'store',title:'Save lesson (H-MEM)',status:'done',log:`[H-MEM] saved ${record.id}: lead found by ${out.leadProbe}; reload verified`});
  }
  results.push({id:c.id,title:c.title,before:c.before,after:c.after,...out,memory:{recalled:recalled.map(m=>({id:m.id,source:m.source,content:m.content,tags:m.tags})),lessons,stored}});
 }
 const report={run,status:'complete',version:2,results};
 fs.writeFileSync(`reports/${run}.json`,JSON.stringify(report,null,2));
 fs.writeFileSync('reports/latest.json',JSON.stringify(report,null,2));
 return report;
}
