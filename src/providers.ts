import fs from 'node:fs';
import path from 'node:path';
export function loadConfig() {
  for (const file of ['.env','.env.local']) if(fs.existsSync(file)) {
    for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) {
      const m=line.match(/^([A-Z_]+)=(.*)$/); if(m && !process.env[m[1]]) process.env[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');
    }
  }
}
export function normalizeNightshift(value:string) {
  const url=new URL(value.includes('://')?value:`http://${value}`);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password) throw new Error('Invalid provider URL');
  return `${url.origin}/v1`;
}
export function nightshiftToken() {
  if(process.env.NIGHTSHIFT_TOKEN) return process.env.NIGHTSHIFT_TOKEN;
  const file=path.join(process.env.LOCALAPPDATA||'', 'ai.meterless.runtime','proxy-token');
  return fs.existsSync(file)?fs.readFileSync(file,'utf8').trim():'';
}
export async function jsonRequest(url:string,init:RequestInit={},timeout=8000) {
  const response=await fetch(url,{...init,signal:AbortSignal.timeout(timeout)});
  if(!response.ok) throw new Error(response.status===401||response.status===403?'unauthorized':`HTTP ${response.status}`);
  return response.json();
}
export async function nightshiftModels(base:string,token:string) {
  const result=await jsonRequest(`${normalizeNightshift(base)}/models`,{headers:{Authorization:`Bearer ${token}`,'meterless-app':'liveops-investigator'}});
  const models=result.data?.map((m:any)=>m.id).filter((id:any)=>typeof id==='string'&&id.startsWith('meterless/'))||[];
  if(!models.length) throw new Error('No Meterless routing modes returned');
  return models;
}
export async function nightshiftChat(prompt:string) {
  const result=await jsonRequest(`${normalizeNightshift(process.env.NIGHTSHIFT_BASE_URL||'http://127.0.0.1:8088')}/chat/completions`,{
    method:'POST',headers:{Authorization:`Bearer ${nightshiftToken()}`,'Content-Type':'application/json','meterless-app':'liveops-investigator','meterless-scope':'user'},
    body:JSON.stringify({model:process.env.NIGHTSHIFT_MODEL||'meterless/auto',messages:[{role:'user',content:prompt}],stream:false})
  },180000);
  const content=result.choices?.[0]?.message?.content;
  if(typeof content!=='string'||!content.trim()) throw new Error('No model text returned');
  return {model:result.model,content};
}
export async function zetarisQuery(sql:string,pageLimit=1000) {
  const {ZETARIS_BASE_URL:base,ZETARIS_USERNAME:username,ZETARIS_PASSWORD:password}=process.env;
  let org=process.env.ZETARIS_ORG_ID, key=process.env.ZETARIS_API_KEY;
  if(!base) throw new Error('missing_config: ZETARIS_BASE_URL');
  const u=new URL(base); if(u.pathname!=='/'||u.username||u.password) throw new Error('Zetaris base must be an origin');
  if(username&&password) {
    const login=await jsonRequest(`${u.origin}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})},30000);
    key=login.idToken||login.token||login.accessToken;
    org=String(login.orgId??org??'');
  }
  if(!key||!org) throw new Error('missing_config_or_login: Zetaris token and organization required');
  return jsonRequest(`${u.origin}/api/proxy/query/sql/start`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'X-Org-ID':org,'X-Request-ID':crypto.randomUUID(),'Content-Type':'application/json'},body:JSON.stringify({select:sql,pageLimit})},30000);
}
// Zetaris SQL editor route: accepts platform commands (CREATE DATASOURCE, REGISTER ...) as well as
// SELECT. Returns {headers, data} with rows as arrays; rows() turns that into objects.
export async function zetarisCommand(sql:string,limit=1000) {
  const {ZETARIS_BASE_URL:base,ZETARIS_USERNAME:username,ZETARIS_PASSWORD:password}=process.env;
  if(!base||!username||!password) throw new Error('missing_config: ZETARIS_BASE_URL, ZETARIS_USERNAME and ZETARIS_PASSWORD');
  const u=new URL(base);
  const login=await jsonRequest(`${u.origin}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})},30000);
  const key=login.idToken||login.token||login.accessToken,org=String(login.orgId??process.env.ZETARIS_ORG_ID??'');
  const response=await fetch(`${u.origin}/api/proxy/sql-editor/sqls/run-query`,{method:'POST',signal:AbortSignal.timeout(120000),
    headers:{Authorization:`Bearer ${key}`,'X-Org-ID':org,'X-Request-ID':crypto.randomUUID(),'Content-Type':'application/json'},body:JSON.stringify({sql,limit})});
  const text=await response.text();
  if(!response.ok) throw new Error(`Zetaris HTTP ${response.status}: ${text.slice(0,300)}`);
  const result=JSON.parse(text);
  return {headers:result.headers as string[],rows:(result.data as any[][]).map(r=>Object.fromEntries((result.headers as string[]).map((h,i)=>[h,r[i]]))),total:Number(result.total),ms:Number(result.timeUsed)};
}
