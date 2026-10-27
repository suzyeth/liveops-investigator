import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {loadConfig} from './providers.ts';
import {runInvestigation} from './pipeline.ts';
import {loadReport,reviewState,submitReview,resolveReview} from './review-actions.ts';
// Local web app: serves web/, runs the real investigation, streams its progress, and handles reviews.
loadConfig();
const PORT=Number(process.env.APP_PORT||4317),HOST='127.0.0.1',BODY_LIMIT=8192;
const WEB=path.resolve('web');
const STATIC:Record<string,[string,string]>={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/app.css':['app.css','text/css; charset=utf-8'],'/charts.js':['charts.js','text/javascript; charset=utf-8'],'/render.js':['render.js','text/javascript; charset=utf-8']};
type Run={events:any[],clients:Set<http.ServerResponse>,done:boolean};
let current:Run|null=null;

function send(res:http.ServerResponse,status:number,body:unknown){
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));
}
// Only this machine's own page may call the API, which blocks other sites and DNS rebinding.
function trusted(req:http.IncomingMessage){
 const host=req.headers.host||'';
 if(![`127.0.0.1:${PORT}`,`localhost:${PORT}`].includes(host))return false;
 return req.method==='GET'||req.headers.origin===`http://${host}`;
}
function body(req:http.IncomingMessage):Promise<any>{
 return new Promise((resolve,reject)=>{
  let text='';
  req.on('data',chunk=>{text+=chunk;if(text.length>BODY_LIMIT){reject(Error('Request body too large'));req.destroy();}});
  req.on('end',()=>{try{resolve(text?JSON.parse(text):{});}catch{reject(Error('Request body is not JSON'));}});
  req.on('error',reject);
 });
}
function broadcast(run:Run,event:any){
 run.events.push(event);
 for(const client of run.clients)client.write(`data: ${JSON.stringify(event)}\n\n`);
}
function startRun(){
 if(current&&!current.done)return false;
 const run:Run={events:[],clients:new Set(),done:false};current=run;
 runInvestigation(e=>broadcast(run,e))
  .then(report=>broadcast(run,{type:'complete',run:report.run}))
  .catch(e=>{console.error('Investigation failed:',e);broadcast(run,{type:'failed',message:e instanceof Error?e.message:String(e)});})
  .finally(()=>{run.done=true;for(const client of run.clients)client.end();run.clients.clear();});
 return true;
}
// passive=1 (page load) only attaches to a run still in progress, so a reload does not replay an old one.
function events(req:http.IncomingMessage,res:http.ServerResponse,passive:boolean){
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store',Connection:'keep-alive'});
 if(!current||(passive&&current.done)){res.end(`data: ${JSON.stringify({type:'idle'})}\n\n`);return;}
 for(const e of current.events)res.write(`data: ${JSON.stringify(e)}\n\n`);
 if(current.done){res.end();return;}
 const run=current;run.clients.add(res);req.on('close',()=>run.clients.delete(res));
}
function latest(){
 // latest.json can be mid-write while a run finishes; treat that like "not available yet".
 try{return loadReport(JSON.parse(fs.readFileSync('reports/latest.json','utf8')).run);}catch{return null;}
}

async function route(req:http.IncomingMessage,res:http.ServerResponse){
 const url=new URL(req.url||'/',`http://${req.headers.host}`);
 const key=`${req.method} ${url.pathname}`;
 if(req.method==='GET'&&STATIC[url.pathname]){
  const [name,type]=STATIC[url.pathname];
  // No framing: a page that framed the app could trick a click into a run or a review.
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"frame-ancestors 'none'"});res.end(fs.readFileSync(path.join(WEB,name)));return;
 }
 if(key==='GET /api/events')return events(req,res,url.searchParams.get('passive')==='1');
 if(key==='GET /api/latest'){const report=latest();return report?send(res,200,{report,...reviewState(report.run)}):send(res,404,{error:'No investigation has finished yet'});}
 if(key==='GET /api/report'){const report=loadReport(url.searchParams.get('run')||'');return send(res,200,{report,...reviewState(report.run)});}
 if(key==='POST /api/run')return startRun()?send(res,202,{started:true}):send(res,409,{error:'An investigation is already running'});
 if(key==='POST /api/reviews'){const input=await body(req);return send(res,201,await submitReview(input.run,input));}
 if(key==='POST /api/reviews/resolve'){const input=await body(req);return send(res,200,resolveReview(input.run,input.id));}
 send(res,404,{error:'Not found'});
}

const server=http.createServer((req,res)=>{
 if(!trusted(req))return send(res,403,{error:'Forbidden'});
 route(req,res).catch(e=>{console.error(`${req.method} ${req.url} failed:`,e);if(!res.headersSent)send(res,400,{error:e instanceof Error?e.message:String(e)});});
});
server.listen(PORT,HOST,()=>{
 const url=`http://${HOST}:${PORT}/`;
 console.log(`LiveOps Investigator is running at ${url} (Ctrl+C to stop)`);
 if(process.argv.includes('--open')&&process.platform==='win32')spawn('cmd',['/c','start','',url],{detached:true,stdio:'ignore'}).unref();
});
