import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnose,metrics,reconcileCohorts} from './investigation.ts';
test('revenue drop triggers drilldown despite higher participation',()=>{
 const d=diagnose([{period:'after',participants:'1500',payers:'90',revenue:'900'},{period:'before',participants:'1000',payers:'100',revenue:'1000'}]);
 assert.equal(d.drillDown,true);assert.equal(d.after.conversion,0.06);assert.equal(d.after.arppu,10);
});
test('zero denominators are unknown; flat revenue skips drilldown',()=>{
 assert.equal(metrics({participants:0,payers:0,revenue:0}).arppu,null);
 assert.equal(diagnose(['before','after'].map(period=>({period,participants:0,payers:0,revenue:0}))).drillDown,false);
});
test('invalid or incomplete evidence fails',()=>{
 assert.throws(()=>metrics({participants:1,payers:2,revenue:3}));assert.throws(()=>diagnose([]));
});
test('blank, boolean and non-numeric metric cells fail instead of becoming zero',()=>{
 for(const bad of ['',' ',true,false,null,undefined,[],'12abc','-1'])assert.throws(()=>metrics({participants:bad,payers:0,revenue:0}),/Invalid metrics/);
 assert.deepEqual(metrics({participants:' 1500 ',payers:'90',revenue:900.5}).revenue,900.5);
});
test('flat revenue needs no cohort query; a revenue drop needs reconciled cohorts',()=>{
 const flat=diagnose(['before','after'].map(period=>({period,participants:1500,payers:150,revenue:1500})));
 assert.doesNotThrow(()=>reconcileCohorts(flat,[]));
 const drop=diagnose([{period:'before',participants:1000,payers:100,revenue:1000},{period:'after',participants:1500,payers:90,revenue:900}]);
 const cohorts=[['before','new',400,20,200],['before','returning',600,80,800],['after','new',900,18,180],['after','returning',600,72,720]].map(([period,cohort,participants,payers,revenue])=>({period,cohort,participants,payers,revenue}));
 assert.doesNotThrow(()=>reconcileCohorts(drop,cohorts));
 assert.throws(()=>reconcileCohorts(drop,[]),/reconcile/);
 assert.throws(()=>reconcileCohorts(drop,cohorts.map((r,i)=>i?r:{...r,revenue:201})),/reconcile/);
 assert.throws(()=>reconcileCohorts(drop,cohorts.map((r,i)=>i?r:{...r,revenue:''})),/Invalid metrics/);
 assert.throws(()=>reconcileCohorts(drop,[...cohorts,{period:'during',cohort:'new',participants:0,payers:0,revenue:0}]),/period/);
});
