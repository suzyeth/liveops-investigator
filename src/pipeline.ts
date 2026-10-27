import fs from 'node:fs';
import {HMEM} from '../vendor/hmem/src/index.ts';
import {zetarisQuery,nightshiftChat} from './providers.ts';
import {diagnose,reconcileCohorts} from './investigation.ts';
import {cases,sqlFor,evaluate,plan,parsePriorities} from './cases.ts';
import {explain} from './evidence.ts';
import {renderWorkflow} from './workflow-report.ts';
// One full two-case investigation. emit() receives progress events for the terminal or the web app;
// any failure throws and leaves the previous reports untouched.
export type Emit=(event:{type:string,[k:string]:any})=>void;
const EXPECTED_ROWS:Record<string,number>={cohorts:4,platform:4};

export async function runQuery(c:any,kind:string){
 const sql=sqlFor(c,kind),start=Date.now(),res=await zetarisQuery(sql);
 const expected=EXPECTED_ROWS[kind]??2;
 if(!Array.isArray(res.records)||res.records.length!==expected||Number(res.totalCount)>expected)throw Error('Missing/truncated SQL evidence');
 return {kind,sql,rows:res.records,ms:Date.now()-start};
}

export async function runInvestigation(emit:Emit){
 const run=new Date().toISOString().replace(/[:.]/g,'-');
 // A fresh two-case replay avoids previous demo runs leaking future-case evidence.
 const dir=`.state/replays/${run}`,results:any[]=[];
 fs.mkdirSync('reports',{recursive:true});
 emit({type:'run',run});
 for(const c of cases){
  emit({type:'case',caseId:c.id,title:c.title,log:`\n${c.title}`});
  const trace:any[]=[];
  const step=(name:string,log:string,detail:any={})=>emit({type:'step',caseId:c.id,step:name,status:'done',log,...detail});
  const begin=(name:string)=>emit({type:'step',caseId:c.id,step:name,status:'running'});
  async function query(kind:string){
   begin(kind);
   const t=await runQuery(c,kind);trace.push(t);
   step(kind,`[Zetaris] ${kind}`,{rows:t.rows.length,ms:t.ms});
   return t.rows;
  }
  const overview=diagnose(await query('overview'));
  reconcileCohorts(overview,overview.drillDown?await query('cohorts'):[]);
  begin('recall');
  const memory=new HMEM({persistDir:dir});
  const recalled=memory.query('game revenue payment conversion investigation',{threshold:0.1,topN:3});
  const prior=recalled.memories.map(m=>m.memory),order=plan(prior),data:any={};
  step('recall',`[H-MEM] ${prior.length} prior records; plan ${order.join(' → ')}`,{records:prior.length,order});
  const prompt=`Return ONLY one JSON array ["checkout","offer"] or ["offer","checkout"]. Choose an investigation priority for a game revenue decline. Historical evidence: ${recalled.context||'No prior evidence'}. Both checks will run; history is not proof for this incident.`;
  // Small local models sometimes break format; retry, and keep every raw reply for the audit trail.
  begin('model');
  const attempts:string[]=[];let routing:any,suggestion:string[]|null=null;
  for(let i=0;i<3&&!suggestion;i++){routing=await nightshiftChat(prompt);attempts.push(routing.content);suggestion=parsePriorities(routing.content);}
  if(!suggestion)throw Error(`Nightshift returned invalid investigation priorities after ${attempts.length} attempts`);
  step('model',`[Nightshift] suggestion ${suggestion.join(' → ')} (attempt ${attempts.length})`,{suggestion,attempts:attempts.length});
  // Memory routing is deterministic and auditable; model advice does not skip evidence checks.
  for(const s of order)data[s]=await query(s);
  const verdict=evaluate(data.checkout,data.offer,overview);
  begin('store');
  const content=`Synthetic game revenue payment conversion investigation ${c.id}. ${JSON.stringify(verdict)}. Historical evidence must be rechecked for every new incident.`;
  const tags=verdict.paymentDrop?['payment-drop']:['payment-healthy'];
  const stored=memory.add({content,source:`synthetic:${c.id}:reports/${run}.json`,type:'factual',layer:'working',confidence:1,tags,provenance:{origin:'document',learnedAt:Date.now(),label:'Zetaris funnel/config evidence',refs:[`reports/${run}.json`]}});
  const persisted=new HMEM({persistDir:dir}).query('game revenue payment conversion investigation',{threshold:0.1,topN:5}).memories.some(m=>m.memory.id===stored.id);
  if(!persisted)throw Error('Memory reload verification failed');
  step('store',`[H-MEM] saved ${stored.id} (${tags[0]}); reload verified`,{id:stored.id,tag:tags[0]});
  const result={id:c.id,title:c.title,overview,trace,verdict,order,baseline:plan([]),prior:prior.map(m=>({id:m.id,source:m.source,content:m.content,tags:m.tags||[]})),model:{name:routing.model,suggestion,attempts},storedId:stored.id,persisted};
  results.push({...result,evidence:explain(result)});
 }
 const report={run,status:'complete',results};
 fs.writeFileSync(`reports/${run}.json`,JSON.stringify(report,null,2));
 fs.writeFileSync('reports/latest.json',JSON.stringify(report,null,2));
 fs.writeFileSync('reports/demo.html',renderWorkflow(report));
 return report;
}
