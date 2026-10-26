import fs from 'node:fs';
import {HMEM} from '../vendor/hmem/src/index.ts';
import {loadConfig,zetarisQuery,nightshiftChat} from './providers.ts';
import {diagnose,reconcileCohorts} from './investigation.ts';
import {cases,sqlFor,evaluate,plan,parsePriorities} from './cases.ts';
import {renderWorkflow} from './workflow-report.ts';
loadConfig();
const run=new Date().toISOString().replace(/[:.]/g,'-');
// A fresh two-case replay avoids previous demo runs leaking future-case evidence.
const dir=`.state/replays/${run}`,results:any[]=[];
fs.mkdirSync('reports',{recursive:true});
try{
 for(const c of cases){
  console.log(`\n${c.title}`);
  const trace:any[]=[];
  async function query(kind:string){
   const sql=sqlFor(c,kind),start=Date.now(),res=await zetarisQuery(sql);
   const expected=kind==='cohorts'?4:2;
   if(!Array.isArray(res.records)||res.records.length!==expected||Number(res.totalCount)>expected)throw Error('Missing/truncated SQL evidence');
   trace.push({kind,sql,rows:res.records,ms:Date.now()-start});console.log(`[Zetaris] ${kind}`);return res.records;
  }
  const overview=diagnose(await query('overview'));
  reconcileCohorts(overview,overview.drillDown?await query('cohorts'):[]);
  const memory=new HMEM({persistDir:dir});
  const recalled=memory.query('game revenue payment conversion investigation',{threshold:0.1,topN:3});
  const prior=recalled.memories.map(m=>m.memory),order=plan(prior),data:any={};
  console.log(`[H-MEM] ${prior.length} prior records; plan ${order.join(' → ')}`);
  const prompt=`Return ONLY one JSON array ["checkout","offer"] or ["offer","checkout"]. Choose an investigation priority for a game revenue decline. Historical evidence: ${recalled.context||'No prior evidence'}. Both checks will run; history is not proof for this incident.`;
  // Small local models sometimes break format; retry, and keep every raw reply for the audit trail.
  const attempts:string[]=[];let routing:any,suggestion:string[]|null=null;
  for(let i=0;i<3&&!suggestion;i++){routing=await nightshiftChat(prompt);attempts.push(routing.content);suggestion=parsePriorities(routing.content);}
  if(!suggestion)throw Error(`Nightshift returned invalid investigation priorities after ${attempts.length} attempts`);
  console.log(`[Nightshift] suggestion ${suggestion.join(' → ')} (attempt ${attempts.length})`);
  // Memory routing is deterministic and auditable; model advice does not skip evidence checks.
  for(const step of order)data[step]=await query(step);
  const verdict=evaluate(data.checkout,data.offer,overview);
  const content=`Synthetic game revenue payment conversion investigation ${c.id}. ${JSON.stringify(verdict)}. Historical evidence must be rechecked for every new incident.`;
  const stored=memory.add({content,source:`synthetic:${c.id}:reports/${run}.json`,type:'factual',layer:'working',confidence:1,tags:verdict.paymentDrop?['payment-drop']:['payment-healthy'],provenance:{origin:'document',learnedAt:Date.now(),label:'Zetaris funnel/config evidence',refs:[`reports/${run}.json`]}});
  const persisted=new HMEM({persistDir:dir}).query('game revenue payment conversion investigation',{threshold:0.1,topN:5}).memories.some(m=>m.memory.id===stored.id);
  if(!persisted)throw Error('Memory reload verification failed');
  results.push({id:c.id,title:c.title,overview,trace,verdict,order,baseline:plan([]),prior:prior.map(m=>({id:m.id,source:m.source,content:m.content})),model:{name:routing.model,suggestion,attempts},storedId:stored.id,persisted});
 }
 const report={run,status:'complete',results};
 fs.writeFileSync(`reports/${run}.json`,JSON.stringify(report,null,2));
 fs.writeFileSync('reports/latest.json',JSON.stringify(report,null,2));
 fs.writeFileSync('reports/demo.html',renderWorkflow(report));
 console.log('\nSUCCESS: reports/demo.html; both real-service cases complete');
}catch(e){console.error('FAILED — previous successful report has not been updated:',e instanceof Error?e.message:String(e));process.exitCode=1;}
