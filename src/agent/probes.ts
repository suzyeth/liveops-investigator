import {parseMetric} from './parse.ts';
// The checks the agent may run. Each probe is a fixed, reviewed SQL template over the Zetaris
// datasources plus a pure analysis of the returned rows. Parameters come only from the case
// definition or from an earlier probe's validated result, never from model text.
export const DROP_POINTS=5;
export type Ctx={before:string,after:string,window:{from:string,to:string}};
export type Params=Record<string,string>;
export type Next={probe:string,params:Params,reason:string};
export type Result={summary:string,metrics:Record<string,any>,checks:{label:string,ok:boolean}[],next:Next[]};
export type Probe={id:string,title:string,question:string,sources:string[],sql:(c:Ctx,p:Params)=>string,analyze:(rows:any[],c:Ctx,p:Params,prior:Record<string,any>)=>Result};

const SAFE=/^[A-Za-z0-9_.:-]+$/;
const lit=(v:string)=>{if(!SAFE.test(v))throw Error(`Unsafe SQL parameter: ${v}`);return `'${v}'`;};
const events=(c:Ctx)=>`(${lit(c.before)}, ${lit(c.after)})`;
const n=(v:unknown,what:string)=>parseMetric(v,`Invalid ${what}`);
const pct=(x:number|null)=>x===null?'n/a':`${Math.round(x*1000)/10}%`;
const usd=(x:number)=>`$${Math.round(x).toLocaleString('en-US')}`;
const rate=(a:number,b:number)=>b?a/b:null;
const points=(b:number|null,a:number|null)=>b===null||a===null?null:Math.round((a-b)*1000)/10;
// True when the later rate is more than DROP_POINTS below the earlier one.
export const dropped=(b:number|null,a:number|null)=>b!==null&&a!==null&&a<b-DROP_POINTS/100;
function byEvent(rows:any[],c:Ctx,key:string){
 const keys=[...new Set(rows.map(r=>String(r[key])))];
 return keys.map(k=>({key:k,before:rows.find(r=>String(r[key])===k&&r.event_id===c.before),after:rows.find(r=>String(r[key])===k&&r.event_id===c.after)}));
}

export const PROBES:Record<string,Probe>={
 overview:{id:'overview',title:'Event overview',question:'Did revenue really fall while more players took part?',sources:['game_telemetry'],
  sql:c=>`SELECT p.event_id, p.participants, COALESCE(o.payers, 0) AS payers, COALESCE(o.revenue, 0) AS revenue
FROM (SELECT event_id, COUNT(*) AS participants FROM game_telemetry.event_participation WHERE event_id IN ${events(c)} GROUP BY event_id) p
LEFT JOIN (SELECT event_id, COUNT(DISTINCT player_id) AS payers, SUM(price_usd) AS revenue FROM game_telemetry.store_orders
  WHERE status = 'completed' AND event_id IN ${events(c)} GROUP BY event_id) o ON o.event_id = p.event_id
ORDER BY p.event_id`,
  analyze:(rows,c)=>{
   const get=(id:string)=>{const r=rows.find(x=>x.event_id===id);if(!r)throw Error(`Overview has no row for ${id}`);return {participants:n(r.participants,'overview'),payers:n(r.payers,'overview'),revenue:n(r.revenue,'overview')};};
   const b=get(c.before),a=get(c.after),fell=a.revenue<b.revenue;
   const change=(x:number,y:number)=>`${y>=x?'+':''}${Math.round((y-x)/x*100)}%`;
   return {summary:`Participants ${b.participants.toLocaleString('en-US')} → ${a.participants.toLocaleString('en-US')} (${change(b.participants,a.participants)}); revenue ${usd(b.revenue)} → ${usd(a.revenue)} (${change(b.revenue,a.revenue)}).`,
    metrics:{before:b,after:a,revenueFell:fell,revenueGap:a.revenue-b.revenue},checks:[{label:'Payers never exceed participants',ok:b.payers<=b.participants&&a.payers<=a.participants}],
    next:fell?[
     {probe:'revenue_by_product',params:{},reason:'Revenue fell: find which products lost the most.'},
     {probe:'payment_by_provider',params:{},reason:'Revenue fell: check whether purchases are failing at payment.'},
     {probe:'segment_mix',params:{},reason:'More players joined: check whether the player mix shifted toward lower spenders.'}]:[]};
  }},

 revenue_by_product:{id:'revenue_by_product',title:'Revenue by product',question:'Which products account for the revenue gap?',sources:['game_telemetry','liveops'],
  sql:c=>`SELECT o.event_id, o.sku, f.name, f.kind, f.price_usd, COUNT(*) AS orders, SUM(o.price_usd) AS revenue
FROM game_telemetry.store_orders o JOIN liveops.offers f ON f.event_id = o.event_id AND f.sku = o.sku
WHERE o.status = 'completed' AND o.event_id IN ${events(c)}
GROUP BY o.event_id, o.sku, f.name, f.kind, f.price_usd ORDER BY o.sku, o.event_id`,
  analyze:(rows,c,_p,prior)=>{
   const items=byEvent(rows,c,'sku').map(({key,before,after})=>({sku:key,name:String((after??before).name),before:before?n(before.revenue,'product revenue'):0,after:after?n(after.revenue,'product revenue'):0,
    priceBefore:before?n(before.price_usd,'price'):null,priceAfter:after?n(after.price_usd,'price'):null})).map(x=>({...x,delta:x.after-x.before}));
   items.sort((x,y)=>x.delta-y.delta);
   const total=(k:'before'|'after')=>Math.round(items.reduce((s,x)=>s+x[k],0)*100)/100;
   const ov=prior.overview;
   const checks=ov?[{label:'Product revenue adds up to the overview (both events)',ok:Math.abs(total('before')-ov.before.revenue)<0.01&&Math.abs(total('after')-ov.after.revenue)<0.01}]:[];
   const losers=items.filter(x=>x.delta<0&&x.before>0&&-x.delta/x.before>0.1);
   return {summary:losers.length?`Largest losses: ${losers.slice(0,3).map(x=>`${x.name} ${usd(x.before)} → ${usd(x.after)}`).join('; ')}.`:'No product lost more than 10% of its revenue.',
    metrics:{items,losers:losers.map(x=>x.sku)},checks,
    next:losers.length?[{probe:'offer_changes',params:{},reason:`${losers.length} product(s) lost over 10% of revenue: check whether their offer changed.`}]:[]};
  }},

 payment_by_provider:{id:'payment_by_provider',title:'Payment success by store',question:'Are purchases failing at payment, and in which store?',sources:['game_telemetry','payments'],
  sql:c=>`SELECT o.event_id, o.channel AS provider, COUNT(DISTINCT o.order_id) AS orders,
  COUNT(DISTINCT CASE WHEN o.status = 'completed' THEN o.order_id END) AS completed_orders,
  COUNT(a.attempt_id) AS attempts, SUM(CASE WHEN a.response_code = 'OK' THEN 1 ELSE 0 END) AS ok_attempts
FROM game_telemetry.store_orders o JOIN payments.payment_attempts a ON a.order_id = o.order_id
WHERE o.event_id IN ${events(c)} GROUP BY o.event_id, o.channel ORDER BY o.channel, o.event_id`,
  analyze:(rows,c)=>{
   const stores=byEvent(rows,c,'provider').map(({key,before,after})=>{
    if(!before||!after)throw Error(`Store ${key} is missing an event`);
    const b=rate(n(before.completed_orders,'orders'),n(before.orders,'orders')),a=rate(n(after.completed_orders,'orders'),n(after.orders,'orders'));
    return {provider:key,before:b,after:a,points:points(b,a),drop:dropped(b,a),ordersAfter:n(after.orders,'orders')};
   });
   const consistent=rows.every(r=>n(r.completed_orders,'orders')===n(r.ok_attempts,'attempts'));
   const bad=stores.filter(s=>s.drop).sort((x,y)=>(x.points??0)-(y.points??0));
   return {summary:bad.length?`Payment success fell in ${bad.map(s=>`${s.provider} (${pct(s.before)} → ${pct(s.after)})`).join(', ')}; ${stores.filter(s=>!s.drop).map(s=>`${s.provider} ${pct(s.after)}`).join(', ')} held.`
     :`Payment success held in every store (${stores.map(s=>`${s.provider} ${pct(s.after)}`).join(', ')}).`,
    metrics:{stores,failing:bad.map(s=>s.provider)},checks:[{label:'Completed orders in the game equal OK attempts in the payment log',ok:consistent}],
    next:bad.map(s=>({probe:'payment_by_version',params:{provider:s.provider},reason:`${s.provider} success fell ${-(s.points??0)} points: check which app versions fail.`}))};
  }},

 payment_by_version:{id:'payment_by_version',title:'Payment success by app version',question:'Is the failure tied to one app build?',sources:['game_telemetry'],
  sql:(c,p)=>`SELECT o.event_id, e.app_version, COUNT(*) AS orders, SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed_orders
FROM game_telemetry.store_orders o JOIN game_telemetry.event_participation e ON e.event_id = o.event_id AND e.player_id = o.player_id
WHERE o.channel = ${lit(p.provider)} AND o.event_id IN ${events(c)} GROUP BY o.event_id, e.app_version ORDER BY o.event_id, e.app_version`,
  analyze:(rows,c,p,prior)=>{
   const baseline=prior.payment_by_provider?.stores.find((s:any)=>s.provider===p.provider)?.before??null;
   const builds=rows.filter(r=>r.event_id===c.after).map(r=>({version:String(r.app_version),orders:n(r.orders,'orders'),rate:rate(n(r.completed_orders,'orders'),n(r.orders,'orders'))}));
   const bad=builds.filter(b=>dropped(baseline,b.rate)).sort((x,y)=>(x.rate??1)-(y.rate??1));
   const worst=bad[0];
   const platform=p.provider==='google_play'?'android':p.provider==='app_store'?'ios':'';
   return {summary:worst?`On ${p.provider}, build ${worst.version} completes ${pct(worst.rate)} of orders against ${pct(baseline)} before the event; ${builds.filter(b=>b!==worst).map(b=>`${b.version} ${pct(b.rate)}`).join(', ')}.`
     :`No single build on ${p.provider} stands out.`,
    metrics:{provider:p.provider,baseline,builds,suspect:worst?.version??null},checks:[],
    next:worst?[
     {probe:'error_codes',params:{provider:p.provider,version:worst.version},reason:`Build ${worst.version} fails most: read the payment gateway's error codes for it.`},
     ...(platform?[{probe:'release_notes',params:{platform,version:worst.version},reason:`Check when build ${worst.version} shipped and what changed.`}]:[])]:[]};
  }},

 error_codes:{id:'error_codes',title:'Payment error codes',question:'What does the payment gateway say went wrong?',sources:['payments','game_telemetry'],
  sql:(c,p)=>`SELECT CASE WHEN e.app_version = ${lit(p.version)} THEN 'suspect build' ELSE 'other builds' END AS build, a.response_code, COUNT(*) AS attempts
FROM payments.payment_attempts a JOIN game_telemetry.store_orders o ON o.order_id = a.order_id
JOIN game_telemetry.event_participation e ON e.event_id = o.event_id AND e.player_id = o.player_id
WHERE o.event_id = ${lit(c.after)} AND a.provider = ${lit(p.provider)}
GROUP BY CASE WHEN e.app_version = ${lit(p.version)} THEN 'suspect build' ELSE 'other builds' END, a.response_code ORDER BY build, attempts DESC`,
  analyze:(rows,_c,p)=>{
   const group=(b:string)=>{const g=rows.filter(r=>r.build===b).map(r=>({code:String(r.response_code),attempts:n(r.attempts,'attempts')}));const fails=g.filter(x=>x.code!=='OK'),total=fails.reduce((s,x)=>s+x.attempts,0);return {codes:g,failures:total,top:fails.sort((x,y)=>y.attempts-x.attempts)[0]??null};};
   const s=group('suspect build'),o=group('other builds');
   const share=(g:any,code:string)=>g.failures?(g.codes.find((x:any)=>x.code===code)?.attempts??0)/g.failures:0;
   const code=s.top?.code??null,concentrated=code!==null&&share(s,code)>=0.3&&share(s,code)>=share(o,code)+0.2;
   return {summary:code?`On build ${p.version}, the top failure is ${code} (${pct(share(s,code))} of its failed attempts) against ${pct(share(o,code))} on other builds.`:'No failed attempts on the suspect build.',
    metrics:{suspect:s,other:o,topCode:code,concentrated},checks:[],next:[]};
  }},

 release_notes:{id:'release_notes',title:'App releases',question:'Did a release ship between the two events?',sources:['liveops'],
  sql:(c,p)=>`SELECT version, platform, released_at, notes FROM liveops.releases
WHERE platform = ${lit(p.platform)} AND released_at > ${lit(c.window.from)} AND released_at <= ${lit(c.window.to)} ORDER BY released_at`,
  analyze:(rows,c,p)=>{
   const hit=rows.find(r=>r.version===p.version);
   const days=hit?Math.round((Date.parse(c.window.to)-Date.parse(String(hit.released_at)))/864e5*10)/10:null;
   return {summary:hit?`Build ${p.version} shipped ${String(hit.released_at).slice(0,10)}, ${days} days before the event ended: “${hit.notes}”.`:`No ${p.platform} release of ${p.version} between the events.`,
    metrics:{release:hit??null,daysBefore:days},checks:[],next:[]};
  }},

 offer_changes:{id:'offer_changes',title:'Offer changes',question:'Did the price or contents of an offer change?',sources:['liveops'],
  sql:c=>`SELECT event_id, sku, name, price_usd, contents FROM liveops.offers WHERE event_id IN ${events(c)} ORDER BY sku, event_id`,
  analyze:(rows,c,_p,prior)=>{
   const changes=byEvent(rows,c,'sku').filter(x=>x.before&&x.after).map(({key,before,after})=>({sku:key,name:String(after.name),
    priceBefore:n(before.price_usd,'price'),priceAfter:n(after.price_usd,'price'),contentsBefore:String(before.contents),contentsAfter:String(after.contents)}))
    .filter(x=>x.priceBefore!==x.priceAfter||x.contentsBefore!==x.contentsAfter);
   const losers:string[]=prior.revenue_by_product?.losers??[];
   const relevant=changes.filter(x=>losers.includes(x.sku));
   const describe=(x:any)=>`${x.name}: ${x.priceBefore!==x.priceAfter?`price $${x.priceBefore} → $${x.priceAfter}`:''}${x.priceBefore!==x.priceAfter&&x.contentsBefore!==x.contentsAfter?'; ':''}${x.contentsBefore!==x.contentsAfter?`contents “${x.contentsBefore}” → “${x.contentsAfter}”`:''}`;
   return {summary:changes.length?`Changed between the events: ${changes.map(describe).join('. ')}.`:'No offer changed price or contents between the events.',
    metrics:{changes,relevant:relevant.map(x=>x.sku)},checks:[],
    next:relevant.map(x=>({probe:'product_conversion',params:{sku:x.sku},reason:`${x.name} changed and lost revenue: check whether fewer players bought it in every segment.`}))};
  }},

 segment_mix:{id:'segment_mix',title:'Player mix',question:'Did the event bring in players who spend less?',sources:['game_telemetry'],
  sql:c=>`SELECT p.event_id, p.segment, COUNT(*) AS participants, COUNT(o.player_id) AS payers, COALESCE(SUM(o.revenue), 0) AS revenue
FROM game_telemetry.event_participation p
LEFT JOIN (SELECT event_id, player_id, SUM(price_usd) AS revenue FROM game_telemetry.store_orders
  WHERE status = 'completed' AND event_id IN ${events(c)} GROUP BY event_id, player_id) o ON o.event_id = p.event_id AND o.player_id = p.player_id
WHERE p.event_id IN ${events(c)} GROUP BY p.event_id, p.segment ORDER BY p.segment, p.event_id`,
  analyze:(rows,c,_p,prior)=>{
   const segs=byEvent(rows,c,'segment').map(({key,before,after})=>{if(!before||!after)throw Error(`Segment ${key} is missing an event`);
    return {segment:key,partsBefore:n(before.participants,'participants'),partsAfter:n(after.participants,'participants'),revBefore:n(before.revenue,'revenue'),revAfter:n(after.revenue,'revenue')};});
   const tb=segs.reduce((s,x)=>s+x.partsBefore,0),ta=segs.reduce((s,x)=>s+x.partsAfter,0);
   const out=segs.map(x=>({...x,shareBefore:x.partsBefore/tb,shareAfter:x.partsAfter/ta,rppBefore:x.revBefore/x.partsBefore,rppAfter:x.revAfter/x.partsAfter}));
   // Revenue per participant if every segment kept its earlier spending but the mix changed.
   const rppBefore=out.reduce((s,x)=>s+x.revBefore,0)/tb,mixOnly=out.reduce((s,x)=>s+x.shareAfter*x.rppBefore,0);
   const mixEffect=(mixOnly-rppBefore)/rppBefore;
   const ov=prior.overview,checks=ov?[{label:'Segment participants add up to the overview (both events)',ok:tb===ov.before.participants&&ta===ov.after.participants}]:[];
   const grew=[...out].sort((x,y)=>(y.shareAfter-y.shareBefore)-(x.shareAfter-x.shareBefore))[0];
   return {summary:`${grew.segment} players went from ${pct(grew.shareBefore)} to ${pct(grew.shareAfter)} of participants. The mix shift alone moves revenue per participant by ${Math.round(mixEffect*1000)/10}%.`,
    metrics:{segments:out,mixEffect,contributes:mixEffect<-0.05},checks,next:[]};
  }},

 product_conversion:{id:'product_conversion',title:'Buyers by segment',question:'Did fewer players buy the changed offer, in every segment?',sources:['game_telemetry'],
  sql:(c,p)=>`SELECT p.event_id, p.segment, COUNT(*) AS participants, COUNT(DISTINCT o.player_id) AS buyers
FROM game_telemetry.event_participation p
LEFT JOIN game_telemetry.store_orders o ON o.event_id = p.event_id AND o.player_id = p.player_id AND o.status = 'completed' AND o.sku = ${lit(p.sku)}
WHERE p.event_id IN ${events(c)} GROUP BY p.event_id, p.segment ORDER BY p.segment, p.event_id`,
  analyze:(rows,c,p)=>{
   const segs=byEvent(rows,c,'segment').map(({key,before,after})=>{if(!before||!after)throw Error(`Segment ${key} is missing an event`);
    const b=rate(n(before.buyers,'buyers'),n(before.participants,'participants')),a=rate(n(after.buyers,'buyers'),n(after.participants,'participants'));
    return {segment:key,before:b,after:a,relative:b?(a!-b)/b:null};});
   const everywhere=segs.every(s=>s.relative!==null&&s.relative<-0.25);
   return {summary:`Share of participants buying ${p.sku}: ${segs.map(s=>`${s.segment} ${pct(s.before)} → ${pct(s.after)}`).join(', ')}.${everywhere?' It fell in every segment, so the player mix does not explain it.':''}`,
    metrics:{sku:p.sku,segments:segs,everywhere},checks:[],next:[]};
  }},

 revenue_by_country:{id:'revenue_by_country',title:'Revenue by country',question:'Is the gap concentrated in some countries?',sources:['game_telemetry'],
  sql:c=>`SELECT o.event_id, pl.country, SUM(o.price_usd) AS revenue
FROM game_telemetry.store_orders o JOIN game_telemetry.players pl ON pl.player_id = o.player_id
WHERE o.status = 'completed' AND o.event_id IN ${events(c)} GROUP BY o.event_id, pl.country ORDER BY pl.country, o.event_id`,
  analyze:(rows,c)=>{
   const items=byEvent(rows,c,'country').map(({key,before,after})=>({country:key,before:before?n(before.revenue,'revenue'):0,after:after?n(after.revenue,'revenue'):0})).map(x=>({...x,change:x.before?(x.after-x.before)/x.before:null}));
   const fell=items.filter(x=>x.change!==null&&x.change<0).length;
   return {summary:`Revenue fell in ${fell} of ${items.length} countries; largest markets: ${[...items].sort((x,y)=>y.before-x.before).slice(0,4).map(x=>`${x.country} ${x.change===null?'n/a':`${x.change>0?'+':''}${Math.round(x.change*100)}%`}`).join(', ')}.`,
    metrics:{items,broad:fell>=items.length*0.7},checks:[],next:[]};
  }}
};
// Probes a reviewer may ask for that the agent does not schedule on its own.
export const ON_REQUEST=['revenue_by_country','segment_mix','offer_changes','payment_by_provider','revenue_by_product'];
