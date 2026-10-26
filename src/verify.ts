import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {HMEM} from '../vendor/hmem/src/index.ts';
import {loadConfig,nightshiftToken,nightshiftModels,nightshiftChat,zetarisQuery} from './providers.ts';
loadConfig();
const results:any={checkedAt:new Date().toISOString(),components:{}};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'liveops-hmem-'));
try {
  const m=new HMEM({persistDir:dir});
  const record=m.add({content:'Synthetic activity revenue declined because payer conversion fell from 10 percent to 6 percent.',source:'synthetic:test-case',type:'factual',layer:'working',confidence:1});
  const restarted=new HMEM({persistDir:dir});
  const recall=restarted.query('activity revenue payer conversion',{threshold:0.1});
  assert(recall.memories.some(x=>x.memory.id===record.id));
  assert(restarted.ledger.history(record.id).length>0);
  assert.throws(()=>restarted.add({content:'unattributed',source:''}));
  results.components.hmem={status:'passed',checks:['persisted evidence survives restart','retrieval returns evidence ID','audit provenance exists','missing source rejected']};
}catch{results.components.hmem={status:'failed'};}
try {
  const result=await zetarisQuery('SELECT 1 AS one');
  assert.equal(result.records?.length,1);
  assert.equal(Number(result.records[0].one),1);
  const metrics=await zetarisQuery("SELECT period, SUM(revenue) AS revenue, SUM(payers) AS payers, SUM(participants) AS participants FROM (SELECT 'before' AS period, 1000 AS revenue, 100 AS payers, 1000 AS participants UNION ALL SELECT 'after' AS period, 900 AS revenue, 90 AS payers, 1500 AS participants) demo GROUP BY period ORDER BY period");
  assert.equal(metrics.records?.length,2);
  const after=metrics.records.find((r:any)=>r.period==='after');
  assert.equal(Number(after?.revenue),900);
  assert.equal(Number(after?.payers)/Number(after?.participants),0.06);
  results.components.zetaris={status:'passed',checks:['authenticated SELECT 1 AS one returns 1','synthetic LiveOps aggregation returns revenue 900 and conversion 6%'],records:metrics.records,data:'synthetic SQL literals, not real player data'};
}catch(e){results.components.zetaris={status:'blocked',reason:(e as Error).message};}
const base=process.env.NIGHTSHIFT_BASE_URL||'http://127.0.0.1:8088/v1';
try {
  const models=await nightshiftModels(base,nightshiftToken());
  results.components.nightshift={status:'models_reachable',models};
  if(process.argv.includes('--chat')) {
    const answer=await nightshiftChat('Reply with LIVEOPS_OK only. This is a connectivity test using no personal data.');
    assert.equal(answer.content.trim(),'LIVEOPS_OK');
    results.components.nightshift={status:'inference_passed',models,answer};
  }
}catch(e){results.components.nightshift={...results.components.nightshift,status:'blocked',modelsReachable:!!results.components.nightshift?.models,reason:(e as Error).message,tokenPresent:!!nightshiftToken()};}
fs.mkdirSync('reports',{recursive:true});
fs.writeFileSync('reports/connectivity.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));
process.exitCode=Object.values(results.components).every((x:any)=>x.status==='passed'||x.status==='inference_passed')?0:2;
