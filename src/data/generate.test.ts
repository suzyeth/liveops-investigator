import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from './generate.ts';
import {EVENTS} from './catalog.ts';
const d=generate();
const completed=(e:string)=>d.game.store_orders.filter(o=>o.event_id===e&&o.status==='completed');
const revenue=(e:string)=>completed(e).reduce((s,o)=>s+o.price_usd,0);
const players=(e:string)=>d.game.event_participation.filter(p=>p.event_id===e).length;

test('the generator is deterministic',()=>{
 const again=generate();
 assert.equal(again.game.store_orders.length,d.game.store_orders.length);
 assert.deepEqual(again.billing.payment_attempts[1234],d.billing.payment_attempts[1234]);
});
test('every completed order has exactly one OK attempt in the purchase log, and no other order has one',()=>{
 const ok=new Map<string,number>();
 for(const a of d.billing.payment_attempts)if(a.response_code==='OK')ok.set(a.order_id,(ok.get(a.order_id)??0)+1);
 for(const o of d.game.store_orders)assert.equal(ok.get(o.order_id)??0,o.status==='completed'?1:0,o.order_id);
});
test('all three cases show more players and less revenue',()=>{
 for(const [b,a] of [['cd_01','cd_02'],['cd_03','cd_04'],['cd_04','cd_05']]){
  assert.ok(players(a)>players(b),`${a} has more players`);
  assert.ok(revenue(a)<revenue(b),`${a} has less revenue`);
 }
});
test('order prices match the live-ops offer for that event',()=>{
 const price=new Map(d.liveops.offers.map(o=>[`${o.event_id}:${o.sku}`,o.price_usd]));
 for(const o of d.game.store_orders)assert.equal(o.price_usd,price.get(`${o.event_id}:${o.sku}`));
});
test('segments follow their definitions: new installed within 30 days, active played the previous event',()=>{
 const first=new Map(d.game.players.map(p=>[p.player_id,Date.parse(p.first_seen)]));
 const played=new Map<string,Set<string>>();
 for(const p of d.game.event_participation)(played.get(p.event_id)??played.set(p.event_id,new Set()).get(p.event_id)!).add(p.player_id);
 for(const [k,e] of EVENTS.entries()){
  const start=Date.parse(e.starts_at),prev=k?played.get(EVENTS[k-1].event_id)!:null;
  for(const p of d.game.event_participation.filter(x=>x.event_id===e.event_id)){
   const isNew=first.get(p.player_id)!>=start-30*864e5;
   assert.equal(p.segment==='new',isNew,`${p.player_id} in ${e.event_id}`);
   if(prev&&!isNew)assert.equal(p.segment==='active',prev.has(p.player_id),`${p.player_id} in ${e.event_id}`);
  }
 }
});
test('spending is long-tailed: the top tenth of payers bring over half the revenue',()=>{
 const byPlayer=new Map<string,number>();
 for(const o of completed('cd_01'))byPlayer.set(o.player_id,(byPlayer.get(o.player_id)??0)+o.price_usd);
 const spend=[...byPlayer.values()].sort((a,b)=>b-a);
 assert.ok(spend.slice(0,Math.ceil(spend.length/10)).reduce((s,x)=>s+x,0)/revenue('cd_01')>0.5);
});
