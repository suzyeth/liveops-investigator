import {loadConfig} from './providers.ts';
import {runInvestigation} from './pipeline.ts';
// Terminal entry point: prints each step as it happens; the web app (app.ts) runs the same pipeline.
loadConfig();
try{
 const report=await runInvestigation(e=>{if(e.log&&e.status!=='running')console.log(e.log);});
 for(const r of report.results)console.log(`\n${r.title}\nFinding: ${r.finding}`);
 console.log(`\nSUCCESS: reports/${report.run}.json; open the web app (npm run app) to inspect the evidence`);
}catch(e){console.error('FAILED — no report was written:',e instanceof Error?e.message:String(e));process.exitCode=1;}
