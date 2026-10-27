import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from './generate.ts';
const d=generate();
const completed=(e:string)=>d.game.store_orders.filter(o=>o.event_id===e&&o.status==='completed');
const revenue=(e:string)=>completed(e).reduce((s,o)=>s+o.price_usd,0);
const players=(e:string)=>d.game.event_participation.filter(p=>p.event_id===e).length;

test('the generator is deterministic',()=>{
 const again=generate();
 assert.equal(again.game.store_orders.length,d.game.store_orders.length);
 assert.deepEqual(again.billing.payment_attempts[1234],d.billing.payment_attempts[1234]);
});
test('every completed order has exactly one OK attempt in the payment log, and no other order has one',()=>{
 const ok=new Map<string,number>();
 for(const a of d.billing.payment_attempts)if(a.response_code==='OK')ok.set(a.order_id,(ok.get(a.order_id)??0)+1);
 for(const o of d.game.store_orders)assert.equal(ok.get(o.order_id)??0,o.status==='completed'?1:0,o.order_id);
});
test('both cases show more players and less revenue',()=>{
 for(const [b,a] of [['cd_01','cd_02'],['cd_03','cd_04']]){
  assert.ok(players(a)>players(b),`${a} has more players`);
  assert.ok(revenue(a)<revenue(b),`${a} has less revenue`);
 }
});
test('order prices match the live-ops offer for that event',()=>{
 const price=new Map(d.liveops.offers.map(o=>[`${o.event_id}:${o.sku}`,o.price_usd]));
 for(const o of d.game.store_orders)assert.equal(o.price_usd,price.get(`${o.event_id}:${o.sku}`));
});
