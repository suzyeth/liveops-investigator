import test from 'node:test';
import assert from 'node:assert/strict';
import {PROBES,dropped} from './probes.ts';
import {investigate,assess,defaultPath} from './investigate.ts';
import {parseMetric} from './parse.ts';
const ctx={before:'cd_01',after:'cd_02',window:{from:'2026-01-17T14:00:00Z',to:'2026-02-14T17:00:00Z'}};

test('cells must be numbers or decimal strings',()=>{
 for(const bad of ['',' ',true,false,null,undefined,[],'12abc','-1'])assert.throws(()=>parseMetric(bad,'bad'),/bad/);
 assert.equal(parseMetric(' 99.990000 ','x'),99.99);
});
test('a drop of exactly the threshold does not count; more than it does',()=>{
 assert.equal(dropped(0.80,0.75),false);assert.equal(dropped(0.80,0.749),true);assert.equal(dropped(null,0.5),false);
});
test('SQL parameters outside the safe character set are refused',()=>{
 assert.throws(()=>PROBES.payment_by_version.sql(ctx,{provider:"google_play' OR '1'='1"}),/Unsafe/);
});
test('payment probe flags the failing store and checks the two sources agree',()=>{
 const rows=[['cd_01','google_play',100,94,104,94],['cd_02','google_play',200,80,330,80],['cd_01','app_store',50,47,52,47],['cd_02','app_store',60,57,62,57]]
  .map(([event_id,provider,orders,completed_orders,attempts,ok_attempts])=>({event_id,provider,orders:String(orders),completed_orders:String(completed_orders),attempts:String(attempts),ok_attempts:String(ok_attempts)}));
 const r=PROBES.payment_by_provider.analyze(rows,ctx,{},{});
 assert.deepEqual(r.metrics.failing,['google_play']);assert.equal(r.checks[0].ok,true);
 assert.deepEqual(r.next.map(x=>x.probe),['payment_by_version']);
 const broken=rows.map((x,i)=>i?x:{...x,ok_attempts:'93'});
 assert.equal(PROBES.payment_by_provider.analyze(broken,ctx,{},{}).checks[0].ok,false);
});
test('offer probe only follows up on changed offers that also lost revenue',()=>{
 const rows=[['cd_01','cd_ticket','Ticket','1.99','A'],['cd_02','cd_ticket','Ticket','4.99','A'],['cd_01','coins_550','550 PokéCoins','4.99','C'],['cd_02','coins_550','550 PokéCoins','5.99','C']]
  .map(([event_id,sku,name,price_usd,contents])=>({event_id,sku,name,price_usd,contents}));
 const r=PROBES.offer_changes.analyze(rows,ctx,{},{revenue_by_product:{losers:['cd_ticket']}});
 assert.equal(r.metrics.changes.length,2);assert.deepEqual(r.next.map(x=>x.params.sku),['cd_ticket']);
});

// A fake Zetaris that answers each probe with canned rows, keyed by a fragment of its SQL.
function fakeQuery(answers:[string,any[]][]){
 return async(sql:string)=>{const a=answers.find(([k])=>sql.includes(k));if(!a)throw Error(`no answer for ${sql.slice(0,60)}`);return {rows:a[1],ms:1};};
}
const overview=[{event_id:'cd_01',participants:'1000',payers:'100',revenue:'1000'},{event_id:'cd_02',participants:'1500',payers:'90',revenue:'850'}];
const healthy=['cd_01','cd_02'].map(e=>({event_id:e,provider:'app_store',orders:'100',completed_orders:'95',attempts:'101',ok_attempts:'95'}));
const products=[{event_id:'cd_01',sku:'coins_550',name:'550',kind:'coins',price_usd:'4.99',orders:'1',revenue:'1000'},{event_id:'cd_02',sku:'coins_550',name:'550',kind:'coins',price_usd:'4.99',orders:'1',revenue:'850'}];
const mix=['active','returning'].flatMap(s=>[{event_id:'cd_01',segment:s,participants:'500',payers:'50',revenue:'500'},{event_id:'cd_02',segment:s,participants:'750',payers:'45',revenue:'450'}]);
const offers=['cd_01','cd_02'].map(e=>({event_id:e,sku:'coins_550',name:'550',price_usd:'4.99',contents:'550 PokéCoins'}));
const answers:[string,any[]][]=[['COUNT(*) AS participants FROM game_telemetry.event_participation WHERE',overview],['payments.payment_attempts a ON a.order_id',healthy],
 ['JOIN liveops.offers f',products],['COUNT(o.player_id) AS payers',mix],['FROM liveops.offers WHERE',offers]];
const noModel=async()=>({pick:null,replies:['?']});

test('every check that opens is run, whatever the order of choices',async()=>{
 const out=await investigate({id:'x',before:'cd_01',after:'cd_02'},{query:fakeQuery(answers),choose:noModel,lessons:[],emit:()=>{}});
 assert.deepEqual(out.steps.map(s=>s.key).sort(),['offer_changes','overview','payment_by_provider','revenue_by_product','segment_mix'].sort());
 assert.equal(out.steps[1].decision.by,'default');
 assert.deepEqual(defaultPath(out.steps),out.steps.map(s=>s.key));
});
test('a memory lesson outranks the model, and the model outranks the default order',async()=>{
 const pickMix=async(_p:string,ids:string[])=>({pick:ids.find(i=>i==='segment_mix')??null,replies:['segment_mix']});
 const byModel=await investigate({id:'x',before:'cd_01',after:'cd_02'},{query:fakeQuery(answers),choose:pickMix,lessons:[],emit:()=>{}});
 assert.equal(byModel.steps[1].key,'segment_mix');assert.equal(byModel.steps[1].decision.by,'model');
 const byMemory=await investigate({id:'x',before:'cd_01',after:'cd_02'},{query:fakeQuery(answers),choose:pickMix,lessons:[{id:'mem-1',lead:'payment_by_provider',content:''}],emit:()=>{}});
 assert.equal(byMemory.steps[1].key,'payment_by_provider');assert.equal(byMemory.steps[1].decision.by,'memory');
});
test('a failed cross-source check stops the investigation',async()=>{
 const bad:[string,any[]][]=answers.map(([k,v])=>k.startsWith('payments')?[k,v.map((r:any)=>({...r,ok_attempts:'94'}))]:[k,v]);
 await assert.rejects(investigate({id:'x',before:'cd_01',after:'cd_02'},{query:fakeQuery(bad),choose:noModel,lessons:[],emit:()=>{}}),/OK attempts/);
});
test('hypotheses are only supported by the evidence that was collected',()=>{
 const h=assess({payment_by_provider:{failing:['google_play']},payment_by_version:{provider:'google_play',suspect:'0.393.1'},error_codes:{provider:'google_play',version:'0.393.1',concentrated:true},release_notes:{version:'0.393.1',release:{version:'0.393.1'}},offer_changes:{relevant:[]},segment_mix:{contributes:false}});
 assert.equal(h[0].status,'supported, corroborated by three sources');assert.equal(h[1].status,'not supported');assert.equal(h[2].status,'not supported');
 assert.equal(assess({payment_by_provider:{failing:['google_play']}})[0].status,'supported');
 assert.equal(assess({})[1].status,'not checked');
 // Corroboration must come from the failing store's own drill-down, not another store's.
 const other=assess({payment_by_provider:{failing:['google_play']},payment_by_version:{runs:[{provider:'app_store',suspect:'0.393.1'}]},error_codes:{provider:'app_store',version:'0.393.1',concentrated:true},release_notes:{version:'0.393.1',release:{}}});
 assert.equal(other[0].status,'supported');
});
