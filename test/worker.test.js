import test from 'node:test';
import { forms, recruitmentModal, recruitmentPanel, noticeControls } from '../src/recruitment.js';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker,{verify,answers,P,dossierName,nextTicketNumber} from '../src/worker.js';
const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
const publicKey=Buffer.from(await crypto.subtle.exportKey('raw',pair.publicKey)).toString('hex');
async function signed(payload) {
 const body=JSON.stringify(payload), time=String(Math.floor(Date.now()/1000));
 const sig=Buffer.from(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(time+body))).toString('hex');
 return new Request('https://bot.test/interactions',{method:'POST',body,headers:{'x-signature-timestamp':time,'x-signature-ed25519':sig}});
}
function database() {
 const db=new DatabaseSync(':memory:'); for(const migration of ['0001_init.sql','0002_ticket_numbers.sql','0003_staff_roles.sql','0004_recruitment.sql','0005_recruitment_drafts.sql','0006_recruitment_status.sql']) db.exec(readFileSync(new URL('../migrations/'+migration,import.meta.url),'utf8'));
 return {prepare(sql){return {bind(...args){const st=db.prepare(sql);return {first:async()=>st.get(...args)??null,run:async()=>({meta:{changes:st.run(...args).changes}})};}}},db};
}
test('Signatures : authentique, corps altéré et signature manquante',async()=>{
 const r=await signed({type:1}); assert.equal(await verify(r,await r.clone().text(),publicKey),true);
 assert.equal(await verify(r,'{}',publicKey),false);
 assert.equal(await verify(new Request('https://x'),'{}',publicKey),false);
 const response=await worker.fetch(await signed({type:1}),{DISCORD_PUBLIC_KEY:publicKey},{});assert.deepEqual(await response.json(),{type:1});
});
test('Ancien formulaire : espaces seuls refusés',()=>{
 assert.throws(()=>answers({components:[{components:[{custom_id:'name',value:'  '}]}]}));
});
test('Cycle complet, confidentialité et contrôles des droits',async()=>{
 const DB=database(); DB.db.prepare('INSERT INTO config(guild_id,role_id,category_id) VALUES (?,?,?)').run('guild','role','category');
 DB.db.prepare('UPDATE config SET staff_role_ids=? WHERE guild_id=?').run(JSON.stringify(['supervisor']),'guild');
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
  let response = await interact({id:'draft',type:3,data:{custom_id:'apply:candidature'}});
  for (const [step,[,fields]] of forms.candidature.groups.entries()) {
    const modal = await response.json();
    assert.equal(modal.type,9);
    response = await interact({id:'form-'+step,type:5,data:{
      custom_id:modal.data.custom_id,
      components:fields.map(([custom_id])=>({component:{custom_id,value:custom_id==='age'?'25':'Réponse de test'}})),
    }});
    if (step < 2) {
      const next = await response.json();
      response = await interact({id:'next-'+step,type:3,data:{custom_id:next.data.components[0].components[0].custom_id}});
    }
  }
  assert.equal((await response.json()).type,5);
  const staff = {user:{id:'teacher'},roles:['supervisor'],permissions:'0'};
  await interact({id:'notice-public',type:3,channel_id:'ticket1',member:staff,data:{custom_id:'notice:receipt'}});
  assert.equal(DB.db.prepare('SELECT count(*) AS count FROM ticket_notices').get().count,0);
  await interact({id:'notice-private',type:3,channel_id:'private-thread',member:staff,data:{custom_id:'notice:receipt'}});
  await interact({id:'notice-duplicate',type:3,channel_id:'private-thread',member:staff,data:{custom_id:'notice:receipt'}});
  const replies = () => calls.filter(call=>call.url.endsWith('/channels/ticket1/messages') && call.body.content.startsWith('Bonjour'));
  assert.equal(replies().length,1);
  await interact({id:'accept',type:2,channel_id:'private-thread',member:staff,data:{
    name:'lssd',options:[{name:'rendezvous',options:[{name:'date_heure',value:'15 novembre à 21 h'}]}],
  }});
  await interact({id:'refuse-after-accept',type:3,channel_id:'private-thread',member:staff,data:{custom_id:'notice:refuse'}});
  assert.equal(replies().length,2);
  assert.match(replies()[1].body.content,/15 novembre à 21 h au poste de Dillimore/);
  const closed = await interact({id:'ce-closed',type:3,data:{custom_id:'apply:sergeant'}});
  assert.match((await closed.json()).data.content,/parcours est fermé/);
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
  await interact({id:'4',type:3,channel_id:'ticket1',member:{user:{id:'teacher'},roles:['supervisor'],permissions:'0'},data:{custom_id:'close'}});
  assert.equal(DB.db.prepare('SELECT status FROM tickets').get().status,'closed');
  const moved=calls.filter(c=>c.url.endsWith('/channels/ticket1')&&c.method==='PATCH').at(-1).body;
  assert.equal(moved.parent_id,'archives');
  assert.equal(moved.permission_overwrites.find(o=>o.id==='candidate').deny,'1024');
  assert.equal(moved.permission_overwrites.find(o=>o.id==='candidate').allow,'0');
  assert.equal(moved.permission_overwrites.find(o=>o.id==='guild').deny,'1024');
  assert.ok(BigInt(moved.permission_overwrites.find(o=>o.id==='role').allow)&P.view);
  assert.ok(BigInt(moved.permission_overwrites.find(o=>o.id==='supervisor').allow)&P.view);
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
  const pending = [];
  const mockEnv = {...env, DB:{prepare:()=>({bind:()=>({first:async()=>({})})})}};
  const savedFetch = globalThis.fetch;
  try {
   globalThis.fetch = async () => Response.json({});
   const r=await worker.fetch(await signed({type:3,guild_id,member:{user:{id:'candidate'}},data:{custom_id:'apply'}}),mockEnv,{waitUntil(p){pending.push(p);}});
   await Promise.all(pending);
   assert.equal((await r.json()).type,type);
  } finally { globalThis.fetch = savedFetch; }
 }
});

test('Les trois parcours gardent leurs accents et leurs champs dans les trois parties', async()=>{
 const expected={
  candidature:[['name','age','diplomes','experience'],['motivation','why'],['background','fdl']],
  reintegration:[['name','age','diplomes','experience','ancien_grade'],['motivation','why'],['background','fdl']],
  sergeant:[['name','age','diplomes','experience'],['motivation','why'],['background','fdl','developpement','repli']],
 };
 for (const [kind,sections] of Object.entries(expected)) {
  assert.equal(forms[kind].groups.length,3);
  for (const [step,fields] of sections.entries()) {
   const {data}=await recruitmentModal(kind,'draft',step).json();
   assert.deepEqual(data.components.map(field=>field.component.custom_id),fields);
   assert.ok(data.title.length<=45);
   assert.doesNotMatch(JSON.stringify(data),/Ã|Â[«» ]|â[€‚]|�/);
   if(step===0) assert.deepEqual(data.components.slice(0,4).map(field=>field.label),['Prénom Nom','Âge','Diplômes','Expériences']);
  }
 }
 assert.deepEqual(recruitmentPanel({ce_enabled:1}).components[0].components.map(button=>button.label),['Candidature','Réintégration','OOC · Sergeant']);
 assert.equal(recruitmentPanel({ce_enabled:0}).components[0].components.length,2);
 const closed = recruitmentPanel({bcsd_enabled:0,reintegration_enabled:0,ce_enabled:0});
 assert.deepEqual(closed.components,[]);
 assert.ok(closed.embeds.every(embed=>embed.color===0xe74c3c));
 const sergeant = recruitmentPanel({bcsd_enabled:0,reintegration_enabled:0,ce_enabled:1});
 assert.deepEqual(sergeant.components[0].components.map(button=>button.custom_id),['apply:sergeant']);
 assert.equal(noticeControls.components[0].components[0].label,'Accusé de réception');
});
