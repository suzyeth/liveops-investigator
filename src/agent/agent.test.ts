import test from 'node:test';
import assert from 'node:assert/strict';
import {PROBES} from './probes.ts';
import {dropped,zTwoProportions} from './stats.ts';
import {investigate,assess,attribution,defaultPath} from './investigate.ts';
import {parseMetric} from './parse.ts';
import {pickFrom} from '../pipeline.ts';
const ctx={before:'cd_01',after:'cd_02',window:{from:'2026-01-17T14:00:00Z',to:'2026-02-14T17:00:00Z'}};
const rows=(cols:string[],data:any[][])=>data.map(r=>Object.fromEntries(cols.map((c,i)=>[c,String(r[i])])));

test('cells must be numbers or decimal strings',()=>{
 for(const bad of ['',' ',true,false,null,undefined,[],'12abc','-1'])assert.throws(()=>parseMetric(bad,'bad'),/bad/);
 assert.equal(parseMetric(' 99.990000 ','x'),99.99);
});
test('a drop needs more than five points, enough orders, and a z-test beyond noise',()=>{
 assert.equal(dropped({ok:940,n:1000},{ok:880,n:1000}),true);
 assert.equal(dropped({ok:94,n:100},{ok:80,n:100}),false,'too few orders');
 assert.equal(dropped({ok:940,n:1000},{ok:895,n:1000}),false,'exactly at the threshold or less');
 assert.ok(zTwoProportions(940,1000,880,1000)<-3);
});
test('SQL parameters outside the safe character set are refused',()=>{
 assert.throws(()=>PROBES.payment_by_version.sql(ctx,{provider:"google_play' OR '1'='1"}),/Unsafe/);
});
test('a model choice counts only when the reply names exactly one candidate',()=>{
 const ids=['revenue_by_product','payment_by_provider','segment_mix'];
 assert.equal(pickFrom('payment_by_provider',ids),'payment_by_provider');
 assert.equal(pickFrom('Run `segment_mix` next.',ids),'segment_mix');
 assert.equal(pickFrom(ids.join(', '),ids),null,'an echoed list is no choice');
 assert.equal(pickFrom('payment_by_provider_extra',ids),null);
 assert.equal(pickFrom('payment_by_version:google_play_extra',['payment_by_version:google_play']),null);
});
test('the overview splits the revenue change exactly and measures the shortfall against the turnout',()=>{
 const r=PROBES.overview.analyze(rows(['event_id','participants','payers','revenue'],[['cd_01',1000,100,1000],['cd_02',1500,90,900]]),ctx,{},{});
 const s=r.metrics.split;
 assert.ok(Math.abs(s.players+s.conversion+s.spend-(-100))<1e-9);
 assert.equal(r.metrics.expected,1500);assert.equal(r.metrics.shortfall,600);assert.equal(r.metrics.investigate,true);
 const up=PROBES.overview.analyze(rows(['event_id','participants','payers','revenue'],[['cd_01',1000,100,1000],['cd_02',1500,150,1520]]),ctx,{},{});
 assert.equal(up.metrics.investigate,false);assert.deepEqual(up.next,[]);
});
test('payment probe flags a failing store only with enough orders, and checks the two sources agree',()=>{
 const cols=['event_id','provider','orders','completed_orders','canceled_orders','attempts','ok_attempts'];
 const data=rows(cols,[['cd_01','google_play',1000,940,30,1040,940],['cd_02','google_play',2000,1300,60,2600,1300],['cd_01','app_store',800,760,20,820,760],['cd_02','app_store',900,855,25,930,855]]);
 const r=PROBES.payment_by_provider.analyze(data,ctx,{},{});
 assert.deepEqual(r.metrics.failing,['google_play']);assert.equal(r.checks[0].ok,true);
 assert.deepEqual(r.next.map(x=>x.probe),['payment_loss','payment_by_version']);
 assert.equal(PROBES.payment_by_provider.analyze(data.map((x,i)=>i?x:{...x,ok_attempts:'939'}),ctx,{},{}).checks[0].ok,false);
});
test('offer probe follows up only changed offers that fell short, and names the bystanders',()=>{
 const data=rows(['event_id','sku','name','price_usd','contents'],[['cd_01','cd_ticket','Ticket','1.99','A'],['cd_02','cd_ticket','Ticket','4.99','A'],['cd_01','cd_box_web','Box','4.99','X, Y'],['cd_02','cd_box_web','Box','4.99','X, Y, Z']]);
 const r=PROBES.offer_changes.analyze(data,ctx,{},{revenue_by_product:{losers:['cd_ticket']}});
 assert.equal(r.metrics.changes.length,2);assert.deepEqual(r.next.map(x=>x.params.sku),['cd_ticket']);
 assert.match(r.summary,/Box changed but did not fall short/);
});

// A fake Zetaris that answers each probe with canned rows, keyed by a fragment of its SQL.
function fakeQuery(answers:[string,any[]][]){
 return async(sql:string)=>{const a=answers.find(([k])=>sql.includes(k));if(!a)throw Error(`no answer for ${sql.slice(0,60)}`);return {rows:a[1],ms:1};};
}
const overview=rows(['event_id','participants','payers','revenue'],[['cd_01',1000,100,1000],['cd_02',1500,90,850]]);
const healthy=rows(['event_id','provider','orders','completed_orders','canceled_orders','attempts','ok_attempts'],[['cd_01','app_store',400,376,10,410,376],['cd_02','app_store',420,395,10,430,395]]);
const products=rows(['event_id','sku','name','segment','participants','orders','revenue'],[['cd_01','coins_550','550','active',500,1,500],['cd_01','coins_550','550','returning',500,1,500],['cd_02','coins_550','550','active',750,1,425],['cd_02','coins_550','550','returning',750,1,425]]);
const mix=rows(['event_id','segment','participants','payers','revenue'],[['cd_01','active',500,50,500],['cd_01','returning',500,50,500],['cd_02','active',750,45,425],['cd_02','returning',750,45,425]]);
const offers=rows(['event_id','sku','name','price_usd','contents'],[['cd_01','coins_550','550','4.99','550 PokéCoins'],['cd_02','coins_550','550','4.99','550 PokéCoins']]);
const answers:[string,any[]][]=[['COUNT(*) AS participants FROM game_telemetry.event_participation WHERE',overview],['payments.payment_attempts a ON a.order_id',healthy],
 ['JOIN liveops.offers f',products],['COUNT(o.player_id) AS payers',mix],['FROM liveops.offers WHERE',offers]];
const noModel=async()=>({pick:null,replies:['?']});

test('every check that opens is run, and nothing found is reported as unexplained',async()=>{
 const out=await investigate({id:'x',before:'cd_01',after:'cd_02'},{query:fakeQuery(answers),choose:noModel,lessons:[],emit:()=>{}});
 assert.deepEqual(out.steps.map(s=>s.key).sort(),['offer_changes','overview','payment_by_provider','revenue_by_product','segment_mix'].sort());
 assert.equal(out.steps[1].decision.by,'default');
 assert.deepEqual(defaultPath(out.steps),out.steps.map(s=>s.key));
 assert.equal(out.lead,null);
 assert.match(out.finding,/None of the checked explanations accounts for most of the shortfall/);
 assert.match(out.finding,/\$650 \(100%\) is not explained/);
});
test('a memory lesson outranks the model, and the model outranks the default order',async()=>{
 const pickMix=async(_p:string,ids:string[])=>({pick:ids.find(i=>i==='segment_mix')??null,replies:['segment_mix']});
 const byModel=await investigate({id:'x',before:'cd_01',after:'cd_02'},{query:fakeQuery(answers),choose:pickMix,lessons:[],emit:()=>{}});
 assert.equal(byModel.steps[1].key,'segment_mix');assert.equal(byModel.steps[1].decision.by,'model');
 const byMemory=await investigate({id:'x',before:'cd_01',after:'cd_02'},{query:fakeQuery(answers),choose:pickMix,lessons:[{id:'mem-1',lead:'payment_by_provider',content:''}],emit:()=>{}});
 assert.equal(byMemory.steps[1].key,'payment_by_provider');assert.equal(byMemory.steps[1].decision.by,'memory');
});
test('a failed cross-source check stops the investigation',async()=>{
 const bad:[string,any[]][]=answers.map(([k,v])=>k.startsWith('payments')?[k,v.map((r:any)=>({...r,ok_attempts:'1'}))]:[k,v]);
 await assert.rejects(investigate({id:'x',before:'cd_01',after:'cd_02'},{query:fakeQuery(bad),choose:noModel,lessons:[],emit:()=>{}}),/OK attempts/);
});
test('verdicts and dollars depend only on the collected evidence, and corroboration must match store and platform',()=>{
 const m={overview:{shortfall:1000},payment_by_provider:{failing:['google_play']},payment_loss:{provider:'google_play',lost:600},
  payment_by_version:{provider:'google_play',suspect:'0.393.1'},error_codes:{provider:'google_play',version:'0.393.1',concentrated:true},
  release_notes:{platform:'android',version:'0.393.1',release:{}},offer_changes:{relevant:[]},segment_mix:{contributes:true,mixDollars:-300}};
 const h=assess(m);
 assert.equal(h[0].status,'supported, corroborated by three sources');assert.equal(h[0].dollars,600);
 assert.equal(h[1].status,'not supported');assert.equal(h[2].status,'contributes');assert.equal(h[2].dollars,300);
 const a=attribution(m,h);
 assert.equal(a.explained,900);assert.equal(a.unexplained,100);assert.equal(a.overlap,false);
 const iosRelease=assess({...m,release_notes:{platform:'ios',version:'0.393.1',release:{}}});
 assert.equal(iosRelease[0].status,'supported','an iOS release does not corroborate a Google Play failure');
 assert.equal(assess({})[1].status,'not checked');
});
