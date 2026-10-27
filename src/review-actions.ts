import fs from 'node:fs';
import {HMEM} from '../vendor/hmem/src/index.ts';
import {PROBES} from './agent/probes.ts';
import {CASES,context} from './agent/investigate.ts';
import {query} from './pipeline.ts';
import {validateReview,assess,comparisons,sameRows,dependsOn} from './review.ts';
// Carries out a reviewer challenge against the real services and keeps the dialogue per run
// in reports/<run>.reviews.json. Nothing here changes the recorded investigation itself.
const RUN_ID=/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const file=(run:string)=>`reports/${run}.reviews.json`;

export function loadReport(run:string){
 if(typeof run!=='string'||!RUN_ID.test(run))throw Error('Invalid run id');
 if(!fs.existsSync(`reports/${run}.json`))throw Error('Unknown run');
 const report=JSON.parse(fs.readFileSync(`reports/${run}.json`,'utf8'));
 if(report.version!==2)throw Error('This run predates the current investigation; run it again');
 return report;
}
export function loadReviews(run:string):any[]{
 loadReport(run);
 return fs.existsSync(file(run))?JSON.parse(fs.readFileSync(file(run),'utf8')):[];
}
export function reviewState(run:string){
 const report=loadReport(run),reviews=loadReviews(run);
 return {reviews,status:Object.fromEntries(report.results.map((r:any)=>[r.id,assess(r,reviews)])),
  comparisons:Object.fromEntries(report.results.map((r:any)=>[r.id,comparisons(r)]))};
}
function save(run:string,reviews:any[]){fs.writeFileSync(file(run),JSON.stringify(reviews,null,2));return reviewState(run);}

async function requery(step:any){
 const fresh=await query(step.sql),same=sameRows(step.rows,fresh.rows);
 return {action:'requery',step:step.key,same,ms:fresh.ms,sql:step.sql,rows:fresh.rows,
  text:same?`Re-ran “${step.title}” on Zetaris: it returned the same ${fresh.rows.length} rows as recorded, so the report shows what the sources hold. If a source itself is wrong, it has to be corrected there; everything that rests on this step stays marked as disputed until the review is resolved.`
   :`Re-ran “${step.title}” on Zetaris and got different rows from the recorded ones. The sources changed after the run; run the investigation again before relying on it.`};
}
async function compare(result:any,key:string){
 const c=comparisons(result).find(x=>x.key===key)!,probe=PROBES[c.probe];
 const cs=CASES.find(x=>x.id===result.id);
 if(!cs)throw Error('Unknown case');
 const metrics=Object.fromEntries(result.steps.map((s:any)=>[s.probe,s.result.metrics]));
 const sql=probe.sql(context(cs),c.params),{rows,ms}=await query(sql);
 const out=probe.analyze(rows,context(cs),c.params,metrics);
 const failed=out.checks.filter(x=>!x.ok);
 if(failed.length)throw Error(`${probe.title}: ${failed.map(x=>x.label).join('; ')} failed`);
 return {action:'compare',key,probe:c.probe,title:probe.title,sources:probe.sources,sql,rows,ms,result:out,text:out.summary};
}
// A rejected finding lowers the confidence of the lesson H-MEM stored for this case and is logged in its ledger.
function distrust(run:string,result:any){
 const id=result.memory?.stored?.id;
 if(!id)return {action:'note',text:'Recorded. This case stored no lesson in H-MEM, so there is no memory to mark as wrong.'};
 const memory=new HMEM({persistDir:`.state/replays/${run}`,actor:'reviewer'});
 const record=memory.store.get(id);
 if(!record)throw Error('The lesson for this case is missing from H-MEM');
 const before=record.confidence;
 memory.feedback(id,'wrong');
 const after=new HMEM({persistDir:`.state/replays/${run}`}).store.get(id)!;
 return {action:'memory',memoryId:id,before,after:after.confidence,tags:after.tags,
  text:`Marked the lesson H-MEM stored for this case (${id}) as wrong: confidence ${before.toFixed(2)} → ${after.confidence.toFixed(2)}, tagged "review", and logged in the H-MEM ledger. This changes the stored record for this run only. To check the finding another way, ask for one of the comparisons this case has not run.`};
}

export async function submitReview(run:string,input:any){
 const report=loadReport(run),review=validateReview(input,report);
 const result=report.results.find((r:any)=>r.id===review.caseId);
 const responses:any[]=[];
 if(review.kind==='data'){
  const keys=review.ref?[review.ref.step]:dependsOn(result,review.target);
  for(const k of keys)responses.push(await requery(result.steps.find((s:any)=>s.key===k)));
 }
 if(review.compare)responses.push(await compare(result,review.compare));
 // Only a challenge to the finding, or to the lead and the steps behind it, touches the stored lesson.
 const aboutLead=review.target==='finding'||review.target===result.lead||(result.lead&&dependsOn(result,result.lead).includes(review.target));
 if(review.kind==='distrust')responses.push(aboutLead?distrust(run,result):{action:'note',text:'Recorded and marked as disputed. This part is not what the stored lesson rests on, so H-MEM was left unchanged.'});
 if(!responses.length)responses.push({action:'note',text:`Recorded. Comparisons this case has not run yet: ${comparisons(result).map(x=>x.title).join(', ')||'none'}.`});
 const reviews=loadReviews(run);
 const id=`R${reviews.length+1}`;
 return {id,...save(run,[...reviews,{id,...review,at:new Date().toISOString(),resolved:false,responses}])};
}
export function resolveReview(run:string,id:unknown){
 const reviews=loadReviews(run);
 if(!reviews.some(r=>r.id===id))throw Error('Unknown review');
 return save(run,reviews.map(r=>r.id===id?{...r,resolved:true,resolvedAt:new Date().toISOString()}:r));
}
