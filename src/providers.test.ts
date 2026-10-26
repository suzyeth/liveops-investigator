import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {normalizeNightshift,nightshiftModels} from './providers.ts';
test('normalizes pasted endpoint paths without duplicate v1',()=>{
  for(const p of ['','/v1','/v1/models','/v1/chat/completions','/healthz']) assert.equal(normalizeNightshift(`127.0.0.1:8088${p}`),'http://127.0.0.1:8088/v1');
});
test('unauthorized is distinct from an online Meterless runtime',async()=>{
  const server=http.createServer((req,res)=>{
    if(req.headers.authorization!=='Bearer test-token'){res.writeHead(401);res.end();return;}
    assert.equal(req.headers['meterless-app'],'liveops-investigator');
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:[{id:'meterless/future-mode'}]}));
  });
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  try {await assert.rejects(nightshiftModels(base,'wrong'),/unauthorized/);assert.deepEqual(await nightshiftModels(base,'test-token'),['meterless/future-mode']);}finally{server.close();}
});
