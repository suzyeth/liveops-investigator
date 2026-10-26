// Local-only runtime administration. No credentials are printed or transmitted externally.
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const {controlSocketPath}=await import(pathToFileURL(path.join(process.env.LOCALAPPDATA,'Nightshift/cli/lib/transport.mjs')).href);
const route=process.argv[2]||'/admin/status';
const method=process.argv[3]||'GET';
const payload=process.argv[4]||'';
await new Promise((resolve,reject)=>{
 const req=http.request({socketPath:controlSocketPath(),path:route,method,headers:{host:'meterlessd','Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{
  let text=''; res.on('data',c=>text+=c);res.on('end',()=>{ console.log(res.statusCode);const data=JSON.parse(text);if(route==='/admin/status')console.log(JSON.stringify({version:data.version,lanes:data.lanes,fleet:data.fleet},null,2));else console.log(JSON.stringify(data,null,2));resolve();});
 });req.setTimeout(15000,()=>req.destroy(new Error('timeout')));req.on('error',reject);req.end(payload);
});
