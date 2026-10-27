import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReview,assess,platformBreakdown,cohortBreakdown,sameRows} from './review.ts';
import {cases,fakeResult} from './test-fixtures.ts';
const report={run:'r',results:[fakeResult(cases[0]),fakeResult(cases[1])]};
const platformRows=(c:any)=>c.platforms.map((r:any[])=>({period:r[0],platform:r[1],attempts:String(r[2]),successes:String(r[3])}));

test('reviews are validated against the recorded evidence',()=>{
 assert.deepEqual(validateReview({caseId:'payment-incident',target:'payment',kind:'data',ref:{query:'checkout',period:'after',column:'successes'}},report).ref,{query:'checkout',period:'after',column:'successes'});
 assert.throws(()=>validateReview({caseId:'nope',target:'payment',kind:'data',note:'x'},report),/Unknown case/);
 assert.throws(()=>validateReview({caseId:'payment-incident',target:'payment',kind:'data',ref:{query:'checkout',period:'after',column:'password'}},report),/Reference/);
 assert.throws(()=>validateReview({caseId:'payment-incident',target:'payment',kind:'missing'},report),/comparison/);
 assert.throws(()=>validateReview({caseId:'payment-incident',target:'finding',kind:'distrust',note:'x'.repeat(501)},report),/longer/);
});
test('disputed data marks every part of the analysis that rests on it',()=>{
 const s=assess('payment-incident',[{id:'R1',caseId:'payment-incident',kind:'data',target:'payment',ref:{query:'checkout'},resolved:false}]);
 assert.equal(s.payment.state,'data disputed');assert.equal(s.finding.state,'data disputed');
 assert.equal(s.config.state,'unchallenged');assert.equal(s.symptom.state,'unchallenged');
});
test('a rejected check disputes the finding, and resolved reviews no longer count',()=>{
 const open=assess('payment-incident',[{id:'R1',caseId:'payment-incident',kind:'distrust',target:'config',resolved:false}]);
 assert.equal(open.config.state,'disputed');assert.equal(open.finding.state,'disputed');
 const done=assess('payment-incident',[{id:'R1',caseId:'payment-incident',kind:'distrust',target:'config',resolved:true}]);
 assert.equal(done.finding.state,'unchallenged');
});
test('platform split must add up to the funnel and shows where the payment drop is',()=>{
 const one=platformBreakdown(report.results[0].trace[2].rows,platformRows(cases[0]));
 assert.match(one.summary,/concentrated on android \(80% → 42\.5%\); ios held at 80%/);
 assert.match(platformBreakdown(report.results[1].trace[2].rows,platformRows(cases[1])).summary,/No platform/);
 const broken=platformRows(cases[0]);broken[3].successes='35';
 assert.throws(()=>platformBreakdown(report.results[0].trace[2].rows,broken),/does not add up/);
});
test('cohort split must add up to the overview and reports ties honestly',()=>{
 const [one,two]=report.results;
 assert.match(cohortBreakdown(one.trace[1].rows,one.overview).summary,/most for new players \(5% → 2%, -3 points\); returning 13\.3% → 12%/);
 assert.match(cohortBreakdown(two.trace[1].rows,two.overview).summary,/same 3\.3 points in each cohort/);
 const broken=one.trace[1].rows.map((r:any,i:number)=>i?r:{...r,payers:'21'});
 assert.throws(()=>cohortBreakdown(broken,one.overview),/reconcile/);
});
test('re-query comparison ignores row order but not values',()=>{
 const rows=report.results[0].trace[0].rows;
 assert.equal(sameRows(rows,[...rows].reverse()),true);
 assert.equal(sameRows(rows,[{...rows[0],revenue:'999'},rows[1]]),false);
});
