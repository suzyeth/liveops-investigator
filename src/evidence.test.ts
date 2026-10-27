import test from 'node:test';
import assert from 'node:assert/strict';
import {explain} from './evidence.ts';
import {cases,fakeResult} from './test-fixtures.ts';
test('every number in the derivation points at the query, period and column it came from',()=>{
 const e=explain(fakeResult(cases[0]));
 const payment=e.checks[0] as any;
 assert.deepEqual(payment.success.after.num.ref,{query:'checkout',period:'after',column:'successes'});
 assert.equal(payment.success.after.num.value,90);assert.equal(payment.success.after.den.value,150);
 assert.equal(e.symptom[2].before.ref.query,'overview');
 assert.equal(Math.round(payment.points),-20);
});
test('case one finding names the payment step; case two finding names the offer change',()=>{
 const one=explain(fakeResult(cases[0])),two=explain(fakeResult(cases[1],[{id:'mem-1',source:'s',tags:['payment-drop']}]));
 assert.match(one.finding,/payment step first: payment success went from 80% to 60%/);
 assert.match(two.finding,/not the lead.*reward units 100 → 60.*20% to 11\.1%/);
 assert.equal(two.memory.triggered,true);assert.deepEqual(two.memory.order,['checkout','offer']);
 assert.ok(one.reconciliations.every(r=>r.ok));assert.equal(one.reconciliations.length,8);
});
test('a drop of exactly five points agrees with evaluate() instead of aborting the run',()=>{
 const edge={...cases[0],before:[1000,20,1000],after:[1500,19,900],funnel:[[500,20,20],[750,20,19]],cohorts:[['before','new',400,10,400],['before','returning',600,10,600],['after','new',900,9,300],['after','returning',600,10,600]]};
 const r=fakeResult(edge);
 assert.equal(r.verdict.paymentDrop,false);
 assert.equal(explain(r).checks[0].supported,false);
});
test('a verdict that does not match the evidence rows is rejected',()=>{
 const r=fakeResult(cases[0]);
 assert.throws(()=>explain({...r,verdict:{...r.verdict,paymentDrop:false}}),/does not match/);
});
test('the finding does not claim a cause when revenue did not fall',()=>{
 const flat={...cases[0],after:[1500,100,1000],funnel:[[500,125,100],[750,150,100]]};
 assert.match(explain(fakeResult(flat)).finding,/no revenue drop to explain/);
});
