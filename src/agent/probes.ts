import {parseMetric} from './parse.ts';
import {rate,dropped,zTwoProportions,DROP_POINTS,MIN_ORDERS,MIN_BUYERS,Z_MIN} from './stats.ts';
// The checks the agent may run. Each probe is a fixed, reviewed SQL template over the Zetaris
// datasources plus a pure analysis of the returned rows. Parameters come only from the case
// definition or from an earlier probe's validated result, never from model text.
export {DROP_POINTS};
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
export const usd=(x:number)=>`${x<0?'-':''}$${Math.round(Math.abs(x)).toLocaleString('en-US')}`;
const signed=(x:number)=>`${x>=0?'+':'-'}$${Math.round(Math.abs(x)).toLocaleString('en-US')}`;
const cents=(x:number)=>`$${x.toFixed(2)}`;
const change=(b:number,a:number)=>b?`${a>=b?'+':''}${Math.round((a-b)/b*100)}%`:'n/a';
const CANCELS=`('USER_CANCELED', 'SKErrorPaymentCancelled', 'checkout_abandoned')`;
const PLATFORM:Record<string,string>={google_play:'android',app_store:'ios'};
function byEvent(rows:any[],c:Ctx,key:string){
 const keys=[...new Set(rows.map(r=>String(r[key])))];
 return keys.map(k=>({key:k,before:rows.find(r=>String(r[key])===k&&r.event_id===c.before),after:rows.find(r=>String(r[key])===k&&r.event_id===c.after)}));
}
// Zetaris returns timestamps as 'YYYY-MM-DD HH:MM:SS.f' in UTC; parse them as UTC and refuse anything else.
function utc(v:unknown){
 const s=String(v).trim(),t=Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s)?s.replace(' ','T'):s.replace(' ','T').replace(/\.\d+$/,'')+'Z');
 if(!Number.isFinite(t))throw Error(`Invalid timestamp ${s}`);
 return t;
}

export const PROBES:Record<string,Probe>={
 overview:{id:'overview',title:'Event overview',question:'Did revenue keep up with the number of players?',sources:['game_telemetry'],
  sql:c=>`SELECT p.event_id, p.participants, COALESCE(o.payers, 0) AS payers, COALESCE(o.revenue, 0) AS revenue
FROM (SELECT event_id, COUNT(*) AS participants FROM game_telemetry.event_participation WHERE event_id IN ${events(c)} GROUP BY event_id) p
LEFT JOIN (SELECT event_id, COUNT(DISTINCT player_id) AS payers, SUM(price_usd) AS revenue FROM game_telemetry.store_orders
  WHERE status = 'completed' AND event_id IN ${events(c)} GROUP BY event_id) o ON o.event_id = p.event_id
ORDER BY p.event_id`,
  analyze:(rows,c)=>{
   const get=(id:string)=>{const r=rows.find(x=>x.event_id===id);if(!r)throw Error(`Overview has no row for ${id}`);
    const v={participants:n(r.participants,'overview'),payers:n(r.payers,'overview'),revenue:n(r.revenue,'overview')};
    if(!v.participants||!v.payers)throw Error(`Overview for ${id} has no participants or payers`);
    return {...v,conversion:v.payers/v.participants,arppu:v.revenue/v.payers,arpu:v.revenue/v.participants};};
   const b=get(c.before),a=get(c.after);
   // Revenue the larger (or smaller) turnout predicts at the earlier revenue per participant.
   const expected=a.participants*b.arpu,shortfall=expected-a.revenue;
   // Exact split of the revenue change: players x payer conversion x spend per payer.
   const split={players:(a.participants-b.participants)*b.arpu,conversion:a.participants*(a.conversion-b.conversion)*b.arppu,spend:a.participants*a.conversion*(a.arppu-b.arppu)};
   const investigate=shortfall>0.05*expected;
   return {summary:`Participants ${b.participants.toLocaleString('en-US')} → ${a.participants.toLocaleString('en-US')} (${change(b.participants,a.participants)}); revenue ${usd(b.revenue)} → ${usd(a.revenue)} (${change(b.revenue,a.revenue)}). At the earlier ${cents(b.arpu)} per participant, ${usd(expected)} was expected: ${shortfall>0?`a shortfall of ${usd(shortfall)}`:'no shortfall'}. Change split: more players ${signed(split.players)}, payer conversion ${pct(b.conversion)} → ${pct(a.conversion)} ${signed(split.conversion)}, spend per payer ${cents(b.arppu)} → ${cents(a.arppu)} ${signed(split.spend)}.`,
    metrics:{before:b,after:a,expected,shortfall,split,investigate,revenueFell:a.revenue<b.revenue},checks:[{label:'Payers never exceed participants',ok:b.payers<=b.participants&&a.payers<=a.participants},
     {label:'The three parts of the split add up to the revenue change',ok:Math.abs(split.players+split.conversion+split.spend-(a.revenue-b.revenue))<0.01}],
    next:investigate?[
     {probe:'revenue_by_product',params:{},reason:'Revenue fell short: find which products fell short most.'},
     {probe:'payment_by_provider',params:{},reason:'Revenue fell short: check whether purchases are failing.'},
     {probe:'segment_mix',params:{},reason:'More players joined: check whether the mix shifted toward players who spend less.'}]:[]};
  }},

 revenue_by_product:{id:'revenue_by_product',title:'Revenue by product',question:'Which products fell short of the turnout?',sources:['game_telemetry','liveops'],
  sql:c=>`SELECT o.event_id, o.sku, f.name, f.kind, f.price_usd, COUNT(*) AS orders, SUM(o.price_usd) AS revenue
FROM game_telemetry.store_orders o JOIN liveops.offers f ON f.event_id = o.event_id AND f.sku = o.sku
WHERE o.status = 'completed' AND o.event_id IN ${events(c)}
GROUP BY o.event_id, o.sku, f.name, f.kind, f.price_usd ORDER BY o.sku, o.event_id`,
  analyze:(rows,c,_p,prior)=>{
   const ov=prior.overview,growth=ov?ov.after.participants/ov.before.participants:1;
   const items=byEvent(rows,c,'sku').map(({key,before,after})=>({sku:key,name:String((after??before).name),before:before?n(before.revenue,'product revenue'):0,after:after?n(after.revenue,'product revenue'):0}))
    .map(x=>({...x,expected:x.before*growth,gap:x.after-x.before*growth}));
   items.sort((x,y)=>x.gap-y.gap);
   const total=(k:'before'|'after')=>Math.round(items.reduce((s,x)=>s+x[k],0)*100)/100;
   const checks=ov?[{label:'Product revenue adds up to the overview (both events)',ok:Math.abs(total('before')-ov.before.revenue)<0.01&&Math.abs(total('after')-ov.after.revenue)<0.01}]:[];
   // A product falls short when it missed its turnout-scaled expectation by over 15% and US$300.
   const short=items.filter(x=>x.expected>0&&-x.gap>Math.max(300,0.15*x.expected));
   return {summary:short.length?`Furthest below expectation (earlier revenue scaled by turnout): ${short.slice(0,3).map(x=>`${x.name} ${usd(x.after)} against ${usd(x.expected)} expected`).join('; ')}.`:'No product fell more than 15% short of its turnout-scaled revenue.',
    metrics:{items,losers:short.map(x=>x.sku),growth},checks,
    next:short.length?[{probe:'offer_changes',params:{},reason:`${short.length} product(s) fell short: check whether their offer changed.`}]:[]};
  }},

 payment_by_provider:{id:'payment_by_provider',title:'Order completion by store',question:'Are purchases failing, and in which store?',sources:['game_telemetry','payments'],
  sql:c=>`SELECT o.event_id, o.channel AS provider, COUNT(DISTINCT o.order_id) AS orders,
  COUNT(DISTINCT CASE WHEN o.status = 'completed' THEN o.order_id END) AS completed_orders,
  COUNT(DISTINCT CASE WHEN o.status = 'canceled' THEN o.order_id END) AS canceled_orders,
  COUNT(a.attempt_id) AS attempts, SUM(CASE WHEN a.response_code = 'OK' THEN 1 ELSE 0 END) AS ok_attempts
FROM game_telemetry.store_orders o JOIN payments.payment_attempts a ON a.order_id = o.order_id
WHERE o.event_id IN ${events(c)} GROUP BY o.event_id, o.channel ORDER BY o.channel, o.event_id`,
  analyze:(rows,c)=>{
   const stores=byEvent(rows,c,'provider').map(({key,before,after})=>{
    if(!before||!after)throw Error(`Store ${key} is missing an event`);
    const B={ok:n(before.completed_orders,'orders'),n:n(before.orders,'orders')},A={ok:n(after.completed_orders,'orders'),n:n(after.orders,'orders')};
    return {provider:key,before:rate(B.ok,B.n),after:rate(A.ok,A.n),z:Math.round(zTwoProportions(B.ok,B.n,A.ok,A.n)*10)/10,drop:dropped(B,A),ordersAfter:A.n,
     canceledAfter:rate(n(after.canceled_orders,'orders'),A.n)};
   });
   const consistent=rows.every(r=>n(r.completed_orders,'orders')===n(r.ok_attempts,'attempts'));
   const bad=stores.filter(s=>s.drop).sort((x,y)=>x.z-y.z);
   return {summary:bad.length?`Order completion fell in ${bad.map(s=>`${s.provider} (${pct(s.before)} → ${pct(s.after)}, z = ${s.z})`).join(', ')}; ${stores.filter(s=>!s.drop).map(s=>`${s.provider} ${pct(s.before)} → ${pct(s.after)}`).join(', ')}.`
     :`Order completion held in every store (${stores.map(s=>`${s.provider} ${pct(s.before)} → ${pct(s.after)}`).join(', ')}).`,
    metrics:{stores,failing:bad.map(s=>s.provider)},checks:[{label:'Completed orders in the game equal OK attempts in the purchase log',ok:consistent}],
    next:bad.flatMap(s=>[
     {probe:'payment_loss',params:{provider:s.provider},reason:`${s.provider} completion fell: size the revenue lost to failed orders.`},
     {probe:'payment_by_version',params:{provider:s.provider},reason:`${s.provider} completion fell: check which app builds fail.`}])};
  }},

 payment_loss:{id:'payment_loss',title:'Revenue lost to failed orders',question:'How much revenue did the failing store lose?',sources:['game_telemetry','payments','liveops'],
  sql:(c,p)=>`SELECT o.event_id, COUNT(*) AS orders, SUM(f.price_usd) AS order_value,
  SUM(CASE WHEN x.ok_attempts > 0 THEN f.price_usd ELSE 0 END) AS paid_value,
  SUM(CASE WHEN o.status = 'completed' THEN o.price_usd ELSE 0 END) AS completed_value
FROM game_telemetry.store_orders o
JOIN liveops.offers f ON f.event_id = o.event_id AND f.sku = o.sku
JOIN (SELECT order_id, SUM(CASE WHEN response_code = 'OK' THEN 1 ELSE 0 END) AS ok_attempts,
        SUM(CASE WHEN response_code IN ${CANCELS} THEN 1 ELSE 0 END) AS cancels
      FROM payments.payment_attempts GROUP BY order_id) x ON x.order_id = o.order_id
WHERE o.channel = ${lit(p.provider)} AND o.event_id IN ${events(c)}
GROUP BY o.event_id ORDER BY o.event_id`,
  analyze:(rows,c,p)=>{
   const get=(id:string)=>{const r=rows.find(x=>x.event_id===id);if(!r)throw Error(`No ${p.provider} orders for ${id}`);
    return {value:n(r.order_value,'value'),paid:n(r.paid_value,'value'),completed:n(r.completed_value,'value')};};
   const b=get(c.before),a=get(c.after),shareB=b.paid/b.value,shareA=a.paid/a.value;
   // Value of orders that would have been paid at the earlier paid share, at list price.
   const lost=Math.max(0,a.value*(shareB-shareA));
   return {summary:`${p.provider} orders worth ${usd(a.value)} at list price were placed; ${pct(shareA)} of that value was paid against ${pct(shareB)} before. At the earlier rate about ${usd(lost)} more would have been paid.`,
    metrics:{provider:p.provider,before:b,after:a,lost},checks:[{label:'Paid value in the purchase log equals completed revenue in the game (both events)',ok:Math.abs(b.paid-b.completed)<0.01&&Math.abs(a.paid-a.completed)<0.01}],next:[]};
  }},

 payment_by_version:{id:'payment_by_version',title:'Order completion by app build',question:'Is the failure tied to one app build?',sources:['game_telemetry'],
  sql:(c,p)=>`SELECT o.event_id, e.app_version, COUNT(*) AS orders, SUM(CASE WHEN o.status = 'completed' THEN 1 ELSE 0 END) AS completed_orders
FROM game_telemetry.store_orders o JOIN game_telemetry.event_participation e ON e.event_id = o.event_id AND e.player_id = o.player_id
WHERE o.channel = ${lit(p.provider)} AND o.event_id IN ${events(c)} GROUP BY o.event_id, e.app_version ORDER BY o.event_id, e.app_version`,
  analyze:(rows,c,p)=>{
   const before=rows.filter(r=>r.event_id===c.before).reduce((s,r)=>({ok:s.ok+n(r.completed_orders,'orders'),n:s.n+n(r.orders,'orders')}),{ok:0,n:0});
   const baseline=rate(before.ok,before.n);
   const builds=rows.filter(r=>r.event_id===c.after).map(r=>({version:String(r.app_version),orders:n(r.orders,'orders'),ok:n(r.completed_orders,'orders')}))
    .map(b=>({...b,rate:rate(b.ok,b.orders),drop:dropped(before,{ok:b.ok,n:b.orders})}));
   const worst=builds.filter(b=>b.drop).sort((x,y)=>(x.rate??1)-(y.rate??1))[0];
   const platform=PLATFORM[p.provider];
   return {summary:worst?`On ${p.provider}, build ${worst.version} completes ${pct(worst.rate)} of ${worst.orders.toLocaleString('en-US')} orders against ${pct(baseline)} for the store before the event; ${builds.filter(b=>b!==worst).map(b=>`${b.version} ${pct(b.rate)}`).join(', ')}.`
     :`No single build on ${p.provider} falls below the earlier rate beyond noise.`,
    metrics:{provider:p.provider,baseline,builds,suspect:worst?.version??null},checks:[],
    next:worst?[
     {probe:'error_codes',params:{provider:p.provider,version:worst.version},reason:`Build ${worst.version} fails most: read the store billing results for it.`},
     ...(platform?[{probe:'release_notes',params:{platform,version:worst.version},reason:`Check when build ${worst.version} shipped and what changed.`}]:[])]:[]};
  }},

 error_codes:{id:'error_codes',title:'Purchase error codes',question:'What did store billing report for the failed purchases?',sources:['payments','game_telemetry'],
  sql:(c,p)=>`SELECT CASE WHEN e.app_version = ${lit(p.version)} THEN 'suspect build' ELSE 'other builds' END AS build, a.response_code, COUNT(*) AS attempts
FROM payments.payment_attempts a JOIN game_telemetry.store_orders o ON o.order_id = a.order_id
JOIN game_telemetry.event_participation e ON e.event_id = o.event_id AND e.player_id = o.player_id
WHERE o.event_id = ${lit(c.after)} AND a.provider = ${lit(p.provider)}
GROUP BY CASE WHEN e.app_version = ${lit(p.version)} THEN 'suspect build' ELSE 'other builds' END, a.response_code ORDER BY build, attempts DESC`,
  analyze:(rows,_c,p)=>{
   const group=(b:string)=>{const g=rows.filter(r=>r.build===b).map(r=>({code:String(r.response_code),attempts:n(r.attempts,'attempts')}));const fails=g.filter(x=>x.code!=='OK'),total=fails.reduce((s,x)=>s+x.attempts,0);return {codes:g,failures:total,top:[...fails].sort((x,y)=>y.attempts-x.attempts)[0]??null};};
   const s=group('suspect build'),o=group('other builds');
   const share=(g:any,code:string)=>g.failures?(g.codes.find((x:any)=>x.code===code)?.attempts??0)/g.failures:0;
   const code=s.top?.code??null,concentrated=code!==null&&s.failures>=50&&share(s,code)>=0.3&&share(s,code)>=share(o,code)+0.2;
   return {summary:code?`On build ${p.version}, the most common failure is ${code} (${pct(share(s,code))} of its ${s.failures.toLocaleString('en-US')} failed attempts) against ${pct(share(o,code))} on other builds of the same store.`:'No failed attempts on the suspect build.',
    metrics:{provider:p.provider,version:p.version,suspect:s,other:o,topCode:code,concentrated},checks:[],next:[]};
  }},

 release_notes:{id:'release_notes',title:'App releases',question:'Did a release ship between the two events?',sources:['liveops'],
  sql:(c,p)=>`SELECT version, platform, released_at, notes FROM liveops.releases
WHERE platform = ${lit(p.platform)} AND released_at > ${lit(c.window.from)} AND released_at <= ${lit(c.window.to)} ORDER BY released_at`,
  analyze:(rows,c,p)=>{
   const hit=rows.find(r=>r.version===p.version&&r.platform===p.platform);
   const hours=hit?Math.round((Date.parse(c.window.to)-utc(hit.released_at))/36e5):null;
   return {summary:hit?`Build ${p.version} shipped for ${p.platform} on ${String(hit.released_at).slice(0,10)}, ${hours} hours before the event ended: “${hit.notes}”.`:`No ${p.platform} release of ${p.version} between the events.`,
    metrics:{platform:p.platform,version:p.version,release:hit??null,hoursBefore:hours},checks:[],next:[]};
  }},

 offer_changes:{id:'offer_changes',title:'Offer changes',question:'Did the price or contents of an offer change?',sources:['liveops'],
  sql:c=>`SELECT event_id, sku, name, price_usd, contents FROM liveops.offers WHERE event_id IN ${events(c)} ORDER BY sku, event_id`,
  analyze:(rows,c,_p,prior)=>{
   const changes=byEvent(rows,c,'sku').filter(x=>x.before&&x.after).map(({key,before,after})=>({sku:key,name:String(after.name),
    priceBefore:n(before.price_usd,'price'),priceAfter:n(after.price_usd,'price'),contentsBefore:String(before.contents),contentsAfter:String(after.contents)}))
    .filter(x=>x.priceBefore!==x.priceAfter||x.contentsBefore!==x.contentsAfter);
   const losers:string[]=prior.revenue_by_product?.losers??[];
   const relevant=changes.filter(x=>losers.includes(x.sku)),bystanders=changes.filter(x=>!losers.includes(x.sku));
   const describe=(x:any)=>`${x.name}: ${[x.priceBefore!==x.priceAfter&&`price $${x.priceBefore} → $${x.priceAfter}`,x.contentsBefore!==x.contentsAfter&&`contents “${x.contentsBefore}” → “${x.contentsAfter}”`].filter(Boolean).join('; ')}`;
   return {summary:!changes.length?'No offer changed price or contents between the events.'
     :`Changed between the events: ${changes.map(describe).join('. ')}.${bystanders.length?` ${bystanders.map(x=>x.name).join(', ')} changed but did not fall short, so ${bystanders.length>1?'they are':'it is'} not a lead.`:''}`,
    metrics:{changes,relevant:relevant.map(x=>x.sku)},checks:[],
    next:relevant.map(x=>({probe:'product_conversion',params:{sku:x.sku},reason:`${x.name} changed and fell short: check whether fewer players bought it in every segment.`}))};
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
   const rppBefore=out.reduce((s,x)=>s+x.revBefore,0)/tb;
   // If each segment had kept its earlier revenue per participant, only the mix would have changed revenue:
   const mixOnly=out.reduce((s,x)=>s+x.shareAfter*x.rppBefore,0);
   const mixEffect=(mixOnly-rppBefore)/rppBefore,mixDollars=ta*(mixOnly-rppBefore);
   // ...and the rest of the change is players in every segment spending differently.
   const withinDollars=out.reduce((s,x)=>s+x.partsAfter*(x.rppAfter-x.rppBefore),0);
   const ov=prior.overview,shortfall=ov?.shortfall??0;
   const checks=ov?[{label:'Segment participants add up to the overview (both events)',ok:tb===ov.before.participants&&ta===ov.after.participants}]:[];
   const grew=[...out].sort((x,y)=>(y.shareAfter-y.shareBefore)-(x.shareAfter-x.shareBefore))[0];
   const contributes=mixDollars<0&&shortfall>0&&-mixDollars>=0.1*shortfall;
   return {summary:`${grew.segment} players went from ${pct(grew.shareBefore)} to ${pct(grew.shareAfter)} of participants. The mix shift alone moves revenue by ${signed(mixDollars)} (${Math.round(mixEffect*1000)/10}% per participant); players in every segment spending differently moves it by ${signed(withinDollars)}.`,
    metrics:{segments:out,mixEffect,mixDollars,withinDollars,contributes},checks,next:[]};
  }},

 product_conversion:{id:'product_conversion',title:'Buyers by segment',question:'Did fewer players buy the changed offer, in every segment?',sources:['game_telemetry'],
  sql:(c,p)=>`SELECT p.event_id, p.segment, COUNT(DISTINCT p.player_id) AS participants, COUNT(DISTINCT o.player_id) AS buyers
FROM game_telemetry.event_participation p
LEFT JOIN game_telemetry.store_orders o ON o.event_id = p.event_id AND o.player_id = p.player_id AND o.status = 'completed' AND o.sku = ${lit(p.sku)}
WHERE p.event_id IN ${events(c)} GROUP BY p.event_id, p.segment ORDER BY p.segment, p.event_id`,
  analyze:(rows,c,p)=>{
   const segs=byEvent(rows,c,'segment').map(({key,before,after})=>{if(!before||!after)throw Error(`Segment ${key} is missing an event`);
    const bb=n(before.buyers,'buyers'),bp=n(before.participants,'participants'),ab=n(after.buyers,'buyers'),ap=n(after.participants,'participants');
    const b=rate(bb,bp),a=rate(ab,ap);
    return {segment:key,buyersBefore:bb,before:b,after:a,relative:b?(a!-b)/b:null,fell:bb>=MIN_BUYERS&&b!==null&&a!==null&&(a-b)/b<-0.25&&zTwoProportions(bb,bp,ab,ap)<=-Z_MIN};});
   const tested=segs.filter(s=>s.buyersBefore>=MIN_BUYERS),everywhere=tested.length>0&&tested.every(s=>s.fell);
   return {summary:`Share of participants buying ${p.sku}: ${segs.map(s=>`${s.segment} ${pct(s.before)} → ${pct(s.after)}`).join(', ')}.${everywhere?` It fell in every segment with at least ${MIN_BUYERS} earlier buyers, so the player mix does not explain it.`:''}`,
    metrics:{sku:p.sku,segments:segs,everywhere},checks:[],next:[]};
  }},

 revenue_by_country:{id:'revenue_by_country',title:'Revenue by country',question:'Is the shortfall concentrated in some countries?',sources:['game_telemetry'],
  sql:c=>`SELECT o.event_id, pl.country, SUM(o.price_usd) AS revenue
FROM game_telemetry.store_orders o JOIN game_telemetry.players pl ON pl.player_id = o.player_id
WHERE o.status = 'completed' AND o.event_id IN ${events(c)} GROUP BY o.event_id, pl.country ORDER BY pl.country, o.event_id`,
  analyze:(rows,c,_p,prior)=>{
   const gap=(prior.overview?.after.revenue??0)-(prior.overview?.before.revenue??0);
   const items=byEvent(rows,c,'country').map(({key,before,after})=>({country:key,before:before?n(before.revenue,'revenue'):0,after:after?n(after.revenue,'revenue'):0}))
    .map(x=>({...x,delta:x.after-x.before}));
   const fell=items.filter(x=>x.delta<0),worst=[...items].sort((x,y)=>x.delta-y.delta).slice(0,3);
   return {summary:`Revenue fell in ${fell.length} of ${items.length} countries. Largest changes: ${worst.map(x=>`${x.country} ${signed(x.delta)}${gap<0?` (${Math.round(x.delta/gap*100)}% of the change)`:''}`).join(', ')}. Country revenue moves a lot by chance between events, so a single country is weak evidence on its own.`,
    metrics:{items,fell:fell.length},checks:[],next:[]};
  }}
};
// Checks a reviewer may ask for that the agent does not schedule on its own.
export const ON_REQUEST=['revenue_by_country','segment_mix','offer_changes','payment_by_provider','revenue_by_product'];
export {MIN_ORDERS};
