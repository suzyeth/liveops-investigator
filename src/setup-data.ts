import {spawn} from 'node:child_process';
import {loadConfig,zetarisCommand} from './providers.ts';
import {generate} from './data/generate.ts';
// Loads the generated data into three Postgres databases (one per source system) inside the
// liveops-gamedata container, then registers each one in Zetaris as its own datasource.
// Safe to re-run: tables are recreated and datasources are dropped and registered again.
loadConfig();
const CONTAINER='liveops-gamedata',USER='liveops',HOST='liveops-gamedata';
const READER='zetaris_reader';
type Table={name:string,ddl:string,rows:any[]};
const data=generate();
export const SOURCES:{datasource:string,database:string,description:string,tables:Table[]}[]=[
 {datasource:'game_telemetry',database:'game',description:'Game server - players, event participation, store orders',tables:[
  {name:'players',ddl:'player_id text primary key, platform text not null, country text not null, first_seen date not null, last_active_2025 date not null',rows:data.game.players},
  {name:'event_participation',ddl:'event_id text not null, player_id text not null, platform text not null, app_version text not null, segment text not null, sessions int not null, minutes_played int not null, primary key (event_id, player_id)',rows:data.game.event_participation},
  {name:'store_orders',ddl:'order_id text primary key, event_id text not null, player_id text not null, sku text not null, channel text not null, price_usd numeric(8,2) not null, status text not null, created_at timestamptz not null',rows:data.game.store_orders}]},
 {datasource:'payments',database:'billing',description:'Purchase attempt log - store billing results from the game client, Web Store provider responses',tables:[
  {name:'payment_attempts',ddl:'attempt_id text primary key, order_id text not null, provider text not null, response_code text not null, latency_ms int not null, attempted_at timestamptz not null',rows:data.billing.payment_attempts}]},
 {datasource:'liveops',database:'liveops',description:'Live-ops config - events, offers, app releases',tables:[
  {name:'events',ddl:'event_id text primary key, name text not null, starts_at timestamptz not null, ends_at timestamptz not null',rows:data.liveops.events},
  {name:'offers',ddl:'event_id text not null, sku text not null, name text not null, kind text not null, price_usd numeric(8,2) not null, channels text not null, contents text not null, primary key (event_id, sku)',rows:data.liveops.offers},
  {name:'releases',ddl:'version text not null, platform text not null, released_at timestamptz not null, notes text not null, primary key (version, platform)',rows:data.liveops.releases}]}
];

function psql(database:string,script:string):Promise<string>{
 return new Promise((resolve,reject)=>{
  const p=spawn('docker',['exec','-i',CONTAINER,'psql','-q','-v','ON_ERROR_STOP=1','-U',USER,'-d',database],{stdio:['pipe','pipe','pipe']});
  let out='',err='';
  p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);
  p.on('error',reject);
  p.stdin.on('error',()=>{}); // psql exits early on an SQL error; its stderr explains why
  p.on('close',code=>code===0?resolve(out):reject(Error(`psql ${database} failed: ${err.trim()}`)));
  p.stdin.end(script);
 });
}
const csv=(v:any)=>{const s=String(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
const quote=(s:string)=>`'${s.replace(/'/g,"''")}'`;

async function load(password:string){
 const existing=await psql('postgres','\\pset tuples_only on\nSELECT datname FROM pg_database;');
 for(const s of SOURCES){
  if(!existing.split('\n').map(x=>x.trim()).includes(s.database))await psql('postgres',`CREATE DATABASE ${s.database};`);
  const script=[
   `DO $$BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${READER}') THEN CREATE ROLE ${READER} LOGIN PASSWORD ${quote(password)}; ELSE ALTER ROLE ${READER} PASSWORD ${quote(password)}; END IF; END$$;`,
   ...s.tables.flatMap(t=>{
    const cols=Object.keys(t.rows[0]);
    return [`DROP TABLE IF EXISTS ${t.name};`,`CREATE TABLE ${t.name} (${t.ddl});`,`COPY ${t.name} (${cols.join(',')}) FROM STDIN WITH (FORMAT csv);`,...t.rows.map(r=>cols.map(c=>csv(r[c])).join(',')),'\\.'];
   }),
   `GRANT CONNECT ON DATABASE ${s.database} TO ${READER};`,`GRANT USAGE ON SCHEMA public TO ${READER};`,`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READER};`
  ].join('\n');
  await psql(s.database,script);
  console.log(`[Postgres] ${s.database}: ${s.tables.map(t=>`${t.name} ${t.rows.length}`).join(', ')}`);
 }
}

async function register(password:string){
 // Only replace a datasource this script created (same description); never drop someone else's.
 const known=(await zetarisCommand('SHOW DATASOURCES')).rows.map(r=>({name:String(r.name).toLowerCase(),description:String(r.description??'')}));
 for(const s of SOURCES){
  const existing=known.find(k=>k.name===s.datasource);
  if(existing&&existing.description!==s.description&&!process.argv.includes('--force'))
   throw Error(`Zetaris already has a datasource named ${s.datasource} that this script did not create; rerun with --force to replace it`);
  if(existing)await zetarisCommand(`DROP DATASOURCE ${s.datasource}`);
  await zetarisCommand(`CREATE DATASOURCE ${s.datasource} DESCRIBE BY ${quote(s.description)} OPTIONS (jdbcdriver 'org.postgresql.Driver', jdbcurl 'jdbc:postgresql://${HOST}:5432/${s.database}', username '${READER}', password ${quote(password)}, fetchsize '5000')`);
  await zetarisCommand(`REGISTER DATASOURCE TABLES FROM ${s.datasource}`);
  const tables=(await zetarisCommand(`SHOW DATASOURCE TABLES ${s.datasource}`)).rows;
  console.log(`[Zetaris] ${s.datasource}: ${tables.map(t=>Object.values(t)[0]).join(', ')}`);
 }
}

if(process.argv[1]?.endsWith('setup-data.ts')){
 const password=process.env.GAMEDATA_PG_PASSWORD;
 try{
  if(!password)throw Error('Set GAMEDATA_PG_PASSWORD in .env.local (see docker/gamedata.compose.yml)');
  // Postgres, Zetaris (Spark SQL) and Docker Compose each treat quotes, backslashes and $ differently.
  if(!/^[A-Za-z0-9_-]{12,}$/.test(password))throw Error('GAMEDATA_PG_PASSWORD must be at least 12 letters, digits, _ or -');
  await load(password);
  await register(password);
  console.log('Data sources ready.');
 }catch(e){console.error('Setup failed:',e instanceof Error?e.message:String(e));process.exitCode=1;}
}
