import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker,{verify,modal,answers,P,dossierName,nextTicketNumber} from '../src/worker.js';
const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
const publicKey=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('hex');
async function signed(payload) {
 const body=JSON.stringify(payload), time=String(Math.floor(Date.now()/1000));
 const sig=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(time+body))).toString('hex');
 return new Request('https://bot.test/interactions',{method:'POST',body,headers:{'x-signature-timestamp':time,'x-signature-ed25519':sig}});
}
function database() {
 const db=new DatabaseSync(':memory:'); for(const migration of ['0001_init.sql','0002_ticket_numbers.sql']) db.exec(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
 return {prepare(sql){return {bind(...args){const st=db.prepare(sql);return {first:async()=>st.get(...args)??null,run:async()=>({meta:{changes:st.run(...args).changes}})};}}},db};
}
test('Signatures : authentique, corps altéré et signature manquante',async()=>{
 const r=await signed({type:1}); assert.equal(await verify(r,await r.clone().text(),publicKey),true);
 assert.equal(await verify(r,'{}',publicKey),false);
 assert.equal(await verify(new Request('https://x'),'{}',publicKey),false);
 const response=await worker.fetch(await signed({type:1}),{DISCORD_PUBLIC_KEY:publicKey},{});assert.deepEqual(await response.json(),{type:1});
});
test('Formulaire : quatre champs obligatoires, espaces seuls refusés',()=>{
 assert.equal(modal().data.components.length,4);
 assert.throws(()=>answers({components:[{components:[{custom_id:'name',value:'  '}]}]}));
});
test('Cycle complet, confidentialité et contrôles des droits',async()=>{
 const DB=database(); DB.db.prepare('INSERT INTO config VALUES (?,?,?)').run('guild','role','category');
 const calls=[]; let seq=0; let failArchive=false;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):undefined;
  calls.push({url,method:options.method,body});
  if(url.endsWith('/guilds/guild/channels') && options.method==='GET') return Response.json([{id:'archives',name:'LSSD Archives',type:4}]);
  if(url.endsWith('/users/@me')) return Response.json({id:'bot'});
  if(url.endsWith('/channels/ticket1') && options.method==='PATCH' && failArchive) return Response.json({},{status:403});
  if(url.endsWith('/channels/category')) return Response.json({id:'category',type:4,guild_id:'guild',permission_overwrites:[{id:'guild',type:0,deny:'1024'},{id:'role',type:0,allow:(P.view|P.manageThreads).toString()}]});
  if(url.endsWith('/guilds/guild/channels')) return Response.json({id:`ticket${++seq}`});
  if(url.endsWith('/threads')) return Response.json({id:'private-thread'});
  return Response.json({id:'message'});
 };
 const env={DB,GUILD_ID:'guild',DISCORD_PUBLIC_KEY:publicKey,DISCORD_TOKEN:'test'};
 const member={user:{id:'candidate'},roles:[],permissions:'0'};
 async function interact(data){const pending=[];const res=await worker.fetch(await signed({application_id:'app',token:'interaction',guild_id:'guild',member,...data}),env,{waitUntil:p=>pending.push(p)});await Promise.all(pending);return res;}
 const fields=['name','motivation','experience','why'].map(custom_id=>({type:1,components:[{custom_id,value:'Réponse de test'}]}));
 try {
  await interact({id:'1',type:5,data:{custom_id:'application',components:fields}});
  const ticket=calls.find(c=>c.url.endsWith('/guilds/guild/channels')).body;
  assert.equal(ticket.name,'dossier-reponse-de-test-0001');
  assert.equal(ticket.permission_overwrites.find(o=>o.id==='guild').deny,'1024');
  const candidate=ticket.permission_overwrites.find(o=>o.id==='candidate');
  assert.equal(BigInt(candidate.deny)&P.manageThreads,P.manageThreads);
  assert.equal(BigInt(candidate.allow)&P.view,P.view);
  const thread=calls.find(c=>c.url.endsWith('/threads')).body;
  assert.equal(thread.type,12);assert.equal(thread.invitable,false);
  await interact({id:'2',type:5,data:{custom_id:'application',components:fields}});
  assert.equal(calls.filter(c=>c.url.endsWith('/guilds/guild/channels')&&c.method==='POST').length,1);
  await interact({id:'3',type:3,channel_id:'ticket1',data:{custom_id:'close'}});
  assert.equal(DB.db.prepare('SELECT status FROM tickets').get().status,'open');
  failArchive=true;
  await interact({id:'failed-close',type:3,channel_id:'ticket1',member:{user:{id:'teacher'},roles:['role'],permissions:'0'},data:{custom_id:'close'}});
  assert.equal(DB.db.prepare('SELECT status FROM tickets').get().status,'open');
  failArchive=false;
  await interact({id:'4',type:3,channel_id:'ticket1',member:{user:{id:'teacher'},roles:['role'],permissions:'0'},data:{custom_id:'close'}});
  assert.equal(DB.db.prepare('SELECT status FROM tickets').get().status,'closed');
  const moved=calls.filter(c=>c.url.endsWith('/channels/ticket1')&&c.method==='PATCH').at(-1).body;
  assert.equal(moved.parent_id,'archives');
  assert.equal(moved.permission_overwrites.find(o=>o.id==='candidate').deny,'1024');
  assert.equal(moved.permission_overwrites.find(o=>o.id==='candidate').allow,'0');
  assert.equal(moved.permission_overwrites.find(o=>o.id==='guild').deny,'1024');
  assert.ok(BigInt(moved.permission_overwrites.find(o=>o.id==='role').allow)&P.view);
  await interact({id:'5',type:5,data:{custom_id:'application',components:fields}});
  assert.equal(calls.filter(c=>c.url.endsWith('/guilds/guild/channels')&&c.method==='POST').length,2);
  assert.equal(calls.filter(c=>c.url.endsWith('/guilds/guild/channels')&&c.method==='POST')[1].body.name,'dossier-reponse-de-test-0002');
  const res=await interact({id:'6',type:3,guild_id:'other',data:{custom_id:'apply'}});assert.equal((await res.json()).type,4);
 } finally {globalThis.fetch=originalFetch;DB.db.close();}
});

test('Numérotation persistante, atomique et indépendante par serveur',async()=>{
 const DB=database();
 try {
  const numbers=await Promise.all(Array.from({length:20},()=>nextTicketNumber(DB,'guild')));
  assert.deepEqual(numbers,Array.from({length:20},(_,i)=>i+1));
  assert.equal(await nextTicketNumber(DB,'other'),1);
  assert.equal(await nextTicketNumber(DB,'guild'),21);
  assert.equal(dossierName('  Émile  Dupont  ',1),'dossier-emile-dupont-0001');
  assert.equal(dossierName('Jean Dupont',10000),'dossier-jean-dupont-10000');
 } finally {DB.db.close();}
});

test('Les interactions acceptent seulement les deux serveurs configurés',async()=>{
 const env={GUILD_IDS:'guild,second',DISCORD_PUBLIC_KEY:publicKey};
 for(const [guild_id,type] of [['guild',9],['second',9],['unknown',4]]) {
  const r=await worker.fetch(await signed({type:3,guild_id,member:{user:{id:'candidate'}},data:{custom_id:'apply'}}),env,{});
  assert.equal((await r.json()).type,type);
 }
});
