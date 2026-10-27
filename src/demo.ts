import fs from 'node:fs';
import crypto from 'node:crypto';
import { HMEM } from '../vendor/hmem/src/index.ts';
import {loadConfig,zetarisQuery,nightshiftChat} from './providers.ts';
import {overviewSQL,cohortSQL,diagnose} from './investigation.ts';
import {renderReport} from './report.ts';
loadConfig();
const id=new Date().toISOString().replace(/[:.]/g,'-'),trace:any[]=[];
async function query(label:string,sql:string){
 console.log(`[Zetaris] ${label}`);
 const start=Date.now(),r=await zetarisQuery(sql);
 if(!Array.isArray(r.records)||Number(r.totalCount)>r.records.length)throw Error('Missing or truncated SQL results');
 trace.push({label,sql,rows:r.records,durationMs:Date.now()-start});return r.records;
}
try{
 const overview=diagnose(await query('Overview',overviewSQL));
 const rows=overview.drillDown?await query('Revenue drop: cohort drill-down',cohortSQL):[];
 const cohorts=[...new Set(rows.map((r:any)=>r.cohort))].map(cohort=>({cohort,...diagnose(rows.filter((r:any)=>r.cohort===cohort))}));
 const facts=`Synthetic game weekend event revenue conversion investigation. Descriptive evidence (not causal proof): ${JSON.stringify({overview,cohorts})}`;
 const memory=new HMEM({persistDir:'.state/liveops-v1'});
 const prior=memory.query('Synthetic game weekend event revenue conversion investigation',{threshold:0.1,topN:3});
 console.log(`[H-MEM] Recalled ${prior.memories.length} previous records`);
 console.log('[Nightshift] Analysing evidence');
 const options:any={acquisition:{hypothesis:'New traffic may have lower purchase intent',test:'Compare the new-player payment funnel by acquisition channel; check for a shift in channel mix.'},checkout:{hypothesis:'The purchase flow may have friction or payment failures',test:'Compare shop views, clicks, orders, payment success and error logs before and after the event.'},offer:{hypothesis:'The event offer or reward may have become less attractive',test:'Check event config changes, offer exposure and purchase rate; design a controlled experiment.'}};
 let analysis:any;
 for(let attempt=0;attempt<3;attempt++){
  const response=await nightshiftChat(`Choose two investigation hypotheses. Return ONLY a JSON array of two different IDs from ["acquisition","checkout","offer"]. No explanation. acquisition=traffic quality; checkout=payment friction; offer=reward attractiveness. Revenue and conversion declined, ARPPU stayed flat. New participants rose; returning participants stayed flat. Evidence: ${facts}\nHistorical evidence available: ${prior.memories.length} record(s). ${prior.context}\nOutput format: ["acquisition","checkout"]`);
  const match=response.content.match(/\[\s*"(?:acquisition|checkout|offer)"\s*,\s*"(?:acquisition|checkout|offer)"\s*\]/);
  if(match){const ids=JSON.parse(match[0]);if(new Set(ids).size===2){analysis={model:response.model,selected:ids,validation:'allowlisted hypothesis IDs only; no model-generated numeric claims accepted',content:ids.map((key:string)=>`${options[key].hypothesis} (to be verified)\nEvidence needed: ${options[key].test}`).join('\n\n')+'\n\nNext step: collect the matching funnel and config data before deciding whether to experiment or roll back.',raw:response.content};break;}}
 }
 if(!analysis)throw Error('Nightshift failed structured hypothesis validation after 3 attempts');
 const source='synthetic:weekend-v1:sha256:'+crypto.createHash('sha256').update(facts).digest('hex');
 const existing=prior.memories.find(m=>m.memory.source===source);
 const stored=existing?.memory||memory.add({content:facts,type:'factual',layer:'working',source,confidence:1,provenance:{origin:'document',learnedAt:Date.now(),label:'Zetaris results and deterministic calculations',refs:[`reports/${id}.json`]}});
 const reopened=new HMEM({persistDir:'.state/liveops-v1'});
 const persisted=reopened.query('Synthetic game weekend event revenue conversion investigation',{threshold:0.1,topN:3}).memories.some(m=>m.memory.id===stored.id);
 if(!persisted)throw Error('Memory persistence check failed');
 const report={id,status:'complete',dataKind:'SYNTHETIC inline SQL fixture; not production data',overview,cohorts,trace,analysis,memory:{prior:prior.memories.map(m=>({id:m.memory.id,source:m.memory.source,content:m.memory.content})),storedId:stored.id,reused:!!existing,persisted,auditEvents:reopened.ledger.history(stored.id).length}};
 fs.mkdirSync('reports',{recursive:true});
 fs.writeFileSync(`reports/${id}.json`,JSON.stringify(report,null,2));
 fs.writeFileSync('reports/latest.json',JSON.stringify(report,null,2));
 fs.writeFileSync('reports/demo.html',renderReport(report));
 console.log(JSON.stringify({status:'complete',model:analysis.model,priorMemories:prior.memories.length,persisted,report:'reports/demo.html'}));
}catch(e){console.error('Investigation failed; no new success report:',e instanceof Error?e.message:String(e));process.exitCode=1;}
