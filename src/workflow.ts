import {loadConfig} from './providers.ts';
import {runInvestigation} from './pipeline.ts';
// Terminal entry point: prints each step as it happens; the web app (app.ts) runs the same pipeline.
loadConfig();
try{
 await runInvestigation(e=>{if(e.log&&e.status!=='running')console.log(e.log);});
 console.log('\nSUCCESS: reports/demo.html; both real-service cases complete');
}catch(e){console.error('FAILED — previous successful report has not been updated:',e instanceof Error?e.message:String(e));process.exitCode=1;}
