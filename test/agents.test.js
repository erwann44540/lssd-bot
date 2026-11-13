import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleAgent} from '../src/agents.js';

test('Fiche, historique, auteur de sanction et permissions',async()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0008_agents.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0009_agent_channels.sql',import.meta.url),'utf8'));
  const env={DB:{prepare(sql){
    const statement=db.prepare(sql);
    return {bind(...args){return {
      first:async()=>statement.get(...args),
      run:async()=>({meta:{changes:statement.run(...args).changes}}),
    };}};
  }}};
  let published;
  const api=async(_env,path,method,payload)=>{
    if (path==='/channels/1570926748361818233') return {type:4,guild_id:'1564674197286953033'};
    if (path==='/users/@me') return {id:'bot'};
    if (path.endsWith('/channels') && !method) return [];
    if (path.endsWith('/channels') && method==='POST') {
      assert.equal(payload.parent_id,'1570926748361818233');
      assert.equal(payload.name,'alex-martin');
      assert.equal(payload.permission_overwrites[0].deny,'1024');
      return {id:'registre'};
    }
    if (path==='/channels/registre' && !method) return {name:'alex-martin'};
    published=method==='DELETE'?null:payload;
    return {id:'fiche'};
  };
  const direction='1566200842451947640';
  const encadrement='1566200848415989780';
  let id=0;
  function run(name,values,role=direction) {
    return handleAgent(env,{id:String(++id),member:{roles:[role],nick:'Camille Dupont',user:{username:'camille'}},
      data:{options:[{name,options:Object.entries({matricule:'A01',...values}).map(([name,value])=>({name,value}))}]}},api);
  }
  try {
    await run('creer',{prenom:'Alex',nom:'Martin',grade:'Deputy I',poste:'Dillimore',divisions:'Patrouille'});
    await assert.rejects(run('editer',{grade:'Sheriff'},encadrement),/rôle/);
    await run('brigade_ajouter',{brigade:'Intervention'},encadrement);
    await assert.rejects(run('promotion_ajouter',{date:'31/02/2026',grade:'Deputy II',type:'promotion'}),/date valide/);
    await run('promotion_ajouter',{date:'13/11/2026',grade:'Deputy II',type:'promotion'});
    await run('sanction_ajouter',{date:'13/11/2026',raison:'Rapport incomplet'},encadrement);
    assert.match(published.embeds[1].description,/Promu Deputy II le 13\/11\/2026/);
    const ref=JSON.parse(db.prepare('SELECT data FROM agent_records').get().data).sanctions[0].id;
    assert.equal(published.embeds[2].description,`**13/11/2026**  Rapport incomplet\n*Par Camille Dupont*  \`${BigInt(ref).toString(36).toUpperCase()}\``);
    await assert.rejects(run('sanction_supprimer',{reference:ref},encadrement),/rôle/);
    await run('sanction_supprimer',{reference:ref});
    assert.equal(published.embeds[2].description,'Aucune');
    await run('supprimer',{confirmer:true});
    assert.equal(published,null);
  } finally {db.close();}
});
