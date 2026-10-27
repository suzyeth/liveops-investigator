import test from 'node:test';
import assert from 'node:assert/strict';
import {validateReview,assess,comparisons,dependsOn,sameRows} from './review.ts';
// A recorded case in the shape pipeline.ts writes, trimmed to what reviews use.
const step=(key:string,probe:string,rows:any[],metrics:any={})=>({key,probe,title:key,rows,sql:'SELECT 1',result:{metrics,summary:'',next:[],checks:[]}});
const result={id:'payment-incident',
 steps:[step('overview','overview',[{event_id:'cd_01',revenue:'1000'}]),
  step('payment_by_provider','payment_by_provider',[{event_id:'cd_02',provider:'google_play',orders:'10'}],{stores:[{provider:'google_play'},{provider:'app_store'}]}),
  step('payment_by_version:google_play','payment_by_version',[{event_id:'cd_02',app_version:'0.393.1',orders:'5'}]),
  step('offer_changes','offer_changes',[{event_id:'cd_02',sku:'cd_ticket'}])],
 hypotheses:[{id:'payment',evidence:['payment_by_provider','payment_by_version']},{id:'offer',evidence:['offer_changes']},{id:'mix',evidence:[]}]};
const report={results:[result]};

test('reviews are validated against the recorded steps',()=>{
 assert.deepEqual(validateReview({caseId:'payment-incident',target:'payment_by_provider',kind:'data',ref:{step:'payment_by_provider',row:0,column:'orders'}},report).ref,{step:'payment_by_provider',row:0,column:'orders'});
 assert.throws(()=>validateReview({caseId:'nope',target:'finding',kind:'distrust'},report),/Unknown case/);
 assert.throws(()=>validateReview({caseId:'payment-incident',target:'finding',kind:'data',ref:{step:'overview',row:0,column:'constructor'}},report),/Reference/);
 assert.throws(()=>validateReview({caseId:'payment-incident',target:'finding',kind:'data',ref:{step:'overview',row:'0',column:'revenue'}},report),/Reference/);
 assert.throws(()=>validateReview({caseId:'payment-incident',target:'finding',kind:'missing'},report),/comparison/);
 assert.throws(()=>validateReview({caseId:'payment-incident',target:'finding',kind:'missing',compare:'overview'},report),/not available/);
 assert.throws(()=>validateReview({caseId:'payment-incident',target:'finding',kind:'distrust',note:'x'.repeat(501)},report),/longer/);
});
test('comparisons offer only checks the case has not run',()=>{
 const keys=comparisons(result).map(x=>x.key);
 assert.ok(keys.includes('revenue_by_country'));assert.ok(keys.includes('payment_by_version:app_store'));
 assert.ok(!keys.includes('payment_by_version:google_play'));assert.ok(!keys.includes('offer_changes'));
});
test('disputed data marks every part of the analysis that rests on that step',()=>{
 assert.deepEqual(dependsOn(result,'payment'),['payment_by_provider','payment_by_version:google_play']);
 const s=assess(result,[{id:'R1',caseId:'payment-incident',kind:'data',target:'payment_by_version:google_play',ref:{step:'payment_by_version:google_play'},resolved:false}]);
 assert.equal(s['payment_by_version:google_play'].state,'data disputed');assert.equal(s.payment.state,'data disputed');assert.equal(s.finding.state,'data disputed');
 assert.equal(s.offer.state,'unchallenged');assert.equal(s.overview.state,'unchallenged');
});
test('a rejected hypothesis disputes the finding; resolved reviews no longer count',()=>{
 const open=assess(result,[{id:'R1',caseId:'payment-incident',kind:'distrust',target:'offer',resolved:false}]);
 assert.equal(open.offer.state,'disputed');assert.equal(open.finding.state,'disputed');
 assert.equal(assess(result,[{id:'R1',caseId:'payment-incident',kind:'distrust',target:'offer',resolved:true}]).finding.state,'unchallenged');
});
test('re-query comparison ignores row order but not values',()=>{
 const rows=[{a:'1',b:'2'},{a:'3',b:'4'}];
 assert.equal(sameRows(rows,[...rows].reverse()),true);assert.equal(sameRows(rows,[{a:'1',b:'2'},{a:'3',b:'5'}]),false);
});
