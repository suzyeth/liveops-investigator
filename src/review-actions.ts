import fs from 'node:fs';
import {HMEM} from '../vendor/hmem/src/index.ts';
import {cases} from './cases.ts';
import {runQuery} from './pipeline.ts';
import {validateReview,assess,platformBreakdown,cohortBreakdown,sameRows,DEPENDS} from './review.ts';
// Carries out a reviewer challenge against the real services and keeps the dialogue per run
// in reports/<run>.reviews.json. Nothing here changes the recorded investigation itself.
const RUN_ID=/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const file=(run:string)=>`reports/${run}.reviews.json`;

export function loadReport(run:string){
 if(typeof run!=='string'||!RUN_ID.test(run))throw Error('Invalid run id');
 if(!fs.existsSync(`reports/${run}.json`))throw Error('Unknown run');
 const report=JSON.parse(fs.readFileSync(`reports/${run}.json`,'utf8'));
 if(!report.results?.every((r:any)=>r.evidence))throw Error('This run predates the web app; run the investigation again');
 return report;
}
export function loadReviews(run:string):any[]{
 loadReport(run);
 return fs.existsSync(file(run))?JSON.parse(fs.readFileSync(file(run),'utf8')):[];
}
export function reviewState(run:string){
 const report=loadReport(run),reviews=loadReviews(run);
 return {reviews,status:Object.fromEntries(report.results.map((r:any)=>[r.id,assess(r.id,reviews)]))};
}
function save(run:string,reviews:any[]){fs.writeFileSync(file(run),JSON.stringify(reviews,null,2));return reviewState(run);}

async function requery(c:any,result:any,query:string){
 const recorded=result.trace.find((t:any)=>t.kind===query),fresh=await runQuery(c,query);
 const same=sameRows(recorded.rows,fresh.rows);
 return {action:'requery',query,same,ms:fresh.ms,sql:fresh.sql,rows:fresh.rows,
  text:same?`Re-ran the ${query} query on Zetaris: it returned the same ${fresh.rows.length} rows as recorded, so the report matches the source. If the source itself is wrong, everything that rests on it stays disputed until the data is fixed.`
   :`Re-ran the ${query} query on Zetaris and got different rows from the recorded ones. The recorded result no longer matches the source; run the investigation again.`};
}
async function compare(c:any,result:any,kind:string){
 const t=await runQuery(c,kind==='platform'?'platform':'cohorts');
 const breakdown=kind==='platform'?platformBreakdown(result.trace.find((x:any)=>x.kind==='checkout').rows,t.rows):cohortBreakdown(t.rows);
 return {action:'compare',query:t.kind,ms:t.ms,sql:t.sql,rows:t.rows,breakdown,text:breakdown.summary};
}
// A rejected finding lowers the confidence of the evidence H-MEM stored for it and is logged in its ledger.
function distrust(run:string,result:any){
 const memory=new HMEM({persistDir:`.state/replays/${run}`,actor:'reviewer'});
 const record=memory.store.get(result.storedId);
 if(!record)throw Error('Stored evidence for this case is missing from H-MEM');
 const before=record.confidence;
 memory.feedback(result.storedId,'wrong');
 const after=new HMEM({persistDir:`.state/replays/${run}`}).store.get(result.storedId)!;
 return {action:'memory',memoryId:result.storedId,before,after:after.confidence,tags:after.tags,
  text:`Marked the evidence H-MEM stored for this case (${result.storedId}) as wrong: confidence ${before.toFixed(2)} → ${after.confidence.toFixed(2)}, tagged "review", and logged in the H-MEM ledger. A later investigation that recalls it will see the lower confidence. To check the finding a second way, ask for a comparison by platform or by player cohort.`};
}

export async function submitReview(run:string,input:any){
 const report=loadReport(run),review=validateReview(input,report);
 const result=report.results.find((r:any)=>r.id===review.caseId),c=cases.find(x=>x.id===review.caseId);
 if(!c)throw Error('Unknown case');
 const responses:any[]=[];
 if(review.kind==='data')for(const q of review.ref?[review.ref.query]:DEPENDS[review.target])responses.push(await requery(c,result,q));
 if(review.compare)responses.push(await compare(c,result,review.compare));
 if(review.kind==='distrust')responses.push(distrust(run,result));
 if(!responses.length)responses.push({action:'note',text:'Recorded. This prototype can also split payment by platform or split conversion by player cohort; other data is not available here yet.'});
 const reviews=loadReviews(run);
 const id=`R${reviews.length+1}`;
 return {id,...save(run,[...reviews,{id,...review,at:new Date().toISOString(),resolved:false,responses}])};
}
export function resolveReview(run:string,id:unknown){
 const reviews=loadReviews(run);
 if(!reviews.some(r=>r.id===id))throw Error('Unknown review');
 return save(run,reviews.map(r=>r.id===id?{...r,resolved:true,resolvedAt:new Date().toISOString()}:r));
}
