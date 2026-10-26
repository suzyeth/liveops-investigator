import test from 'node:test';
import assert from 'node:assert/strict';
import {cases,evaluate,plan,parsePriorities} from './cases.ts';
import {diagnose} from './investigation.ts';
function evidence(c:any){return {overview:diagnose([c.before,c.after].map((x:any,i:number)=>({period:i?'after':'before',participants:x[0],payers:x[1],revenue:x[2]}))),funnel:c.funnel.map((x:any,i:number)=>({period:i?'after':'before',shop_views:x[0],attempts:x[1],successes:x[2]})),config:c.config.map((x:any,i:number)=>({period:i?'after':'before',version:x[0],price:x[1],reward_units:x[2]}))};}
test('case one supports payment issue; case two rejects remembered payment issue',()=>{
 const a=evidence(cases[0]),b=evidence(cases[1]);
 assert.equal(evaluate(a.funnel,a.config,a.overview).paymentDrop,true);
 const verdict=evaluate(b.funnel,b.config,b.overview);
 assert.equal(verdict.paymentDrop,false);assert.equal(verdict.configChanged,true);
 assert.ok(verdict.intentAfter!<verdict.intentBefore!);
 assert.deepEqual(plan([]),['offer','checkout']);
 assert.deepEqual(plan([{tags:['payment-drop']}]),['checkout','offer']);
});
test('inconsistent payment and payer counts fail validation',()=>{
 const e=evidence(cases[0]);e.funnel[1].successes=89;
 assert.throws(()=>evaluate(e.funnel,e.config,e.overview),/reconcile/);
});
test('missing period fails rather than confirming a hypothesis',()=>{
 const e=evidence(cases[0]);assert.throws(()=>evaluate(e.funnel.slice(0,1),e.config,e.overview));
});
test('blank or boolean funnel and config cells fail instead of becoming zero',()=>{
 const blankConfig=evidence(cases[0]);blankConfig.config[1].price='';blankConfig.config[1].reward_units='';
 assert.throws(()=>evaluate(blankConfig.funnel,blankConfig.config,blankConfig.overview),/Invalid config/);
 const boolFunnel=evidence(cases[0]);boolFunnel.funnel[0].shop_views=true;
 assert.throws(()=>evaluate(boolFunnel.funnel,boolFunnel.config,boolFunnel.overview),/Invalid funnel/);
 const stringCells=evidence(cases[1]);stringCells.funnel=stringCells.funnel.map((r:any)=>({...r,attempts:String(r.attempts)}));
 assert.equal(evaluate(stringCells.funnel,stringCells.config,stringCells.overview).paymentDrop,false);
});
test('missing or blank config version fails instead of reading as unchanged',()=>{
 for(const version of [undefined,null,'','  ']){
  const e=evidence(cases[0]);e.config=e.config.map((r:any)=>({...r,version}));
  assert.throws(()=>evaluate(e.funnel,e.config,e.overview),/Invalid config/);
 }
});
test('model priorities must be one valid ordered pair; anything else is rejected',()=>{
 assert.deepEqual(parsePriorities('```json\n["offer", "checkout"]\n```'),['offer','checkout']);
 assert.deepEqual(parsePriorities('["checkout","offer"]'),['checkout','offer']);
 for(const bad of ['checkout, offer','["checkout","checkout"]','["refund","offer"]','',"['checkout','offer']"])assert.equal(parsePriorities(bad),null);
});
