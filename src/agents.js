export const agentGuild = '1564674197286953033';
const direction = '1566200842451947640';
const encadrement = '1566200848415989780';

const field = (name, description, required = true, max_length = 100) =>
  ({type:3,name,description,required,max_length});
const badge = field('matricule','Matricule de l’agent',true,30);
const identity = required => [
  field('prenom','Prénom',required,60), field('nom','Nom',required,60),
  field('grade','Grade actuel',required),
  {...field('poste','Poste d’affiliation',required),choices:['Dillimore','Ganton'].map(value=>({name:value,value}))},
  field('divisions','Divisions séparées par des virgules',false,500),
];
const date = field('date','Date au format jj/mm/aaaa',true,10);
const entry = field('reference','Date de l’entrée (jj/mm/aaaa) ou référence',true,25);
const sub = (name, description, ...options) => ({type:1,name,description,options});

export const agentCommand = {
  name:'fiche', description:'Gérer les fiches des agents',
  options:[
    sub('creer','Créer une fiche',badge,...identity(true)),
    sub('editer','Modifier une fiche',badge,...identity(false),field('nouveau_matricule','Nouveau matricule',false,30)),
    sub('supprimer','Supprimer une fiche',badge,{type:5,name:'confirmer',description:'Confirmer la suppression',required:true}),
    sub('promotion_ajouter','Ajouter une promotion ou rétrogradation',badge,date,field('grade','Grade obtenu'),{
      ...field('type','Type de changement'),choices:[{name:'Promotion',value:'promotion'},{name:'Rétrogradation',value:'retrogradation'}],
    }),
    sub('promotion_supprimer','Retirer une promotion ou rétrogradation',badge,entry),
    sub('brigade_ajouter','Ajouter une brigade ou division',badge,field('brigade','Nom de la brigade')),
    sub('brigade_supprimer','Retirer une brigade ou division',badge,field('brigade','Nom de la brigade')),
    sub('sanction_ajouter','Ajouter une sanction',badge,date,field('raison','Motif de la sanction',true,300)),
    sub('sanction_supprimer','Retirer une sanction',badge,entry),
  ],
};

const clean = value => String(value ?? '').trim();
const key = value => clean(value).normalize('NFC').toLocaleLowerCase('fr');
const display = value => clean(value).replace(/[\r\n]+/g,' ').replace(/[\\*_~`|<>[\]]/g,'\\$&');

function validDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match || Number(match[3]) < 1900) throw new Error('Indiquez une date valide au format jj/mm/aaaa.');
  const [,day,month,year] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0,10)!==`${year}-${month}-${day}`) {
    throw new Error('Indiquez une date valide au format jj/mm/aaaa.');
  }
  return value;
}

const reference = id => BigInt(id).toString(36).toUpperCase();

function history(entries, format) {
  const sorted = [...entries].sort((a,b)=>b.date.split('/').reverse().join('').localeCompare(a.date.split('/').reverse().join('')));
  return sorted.map(format).join('\n') || 'Aucune';
}

const sheriffLogo = 'https://cdn.discordapp.com/avatars/1566193416906481914/b455f26f2d122b5efddf180caecec233.png?size=256';

export function card(agent) {
  const identity = [
    {name:'Matricule',value:display(agent.matricule),inline:true},
    {name:'Grade',value:display(agent.grade),inline:true},
    {name:'Poste',value:display(agent.poste),inline:true},
    {name:'Divisions et brigades',value:agent.divisions.map(value=>'• '+display(value)).join('\n') || 'Aucune'},
  ];
  const promotions = history(agent.promotions,item=>`• ${item.type==='promotion'?'Promu':'Rétrogradé'} ${display(item.grade)} le ${item.date}`);
  const sanctions = history(agent.sanctions,item=>`• ${item.date} — ${display(item.raison)} — PAR ${display(item.auteur)}`);
  const title = `Fiche agent · ${display(agent.prenom)} ${display(agent.nom)}`;
  const size = title.length + promotions.length + sanctions.length + identity.reduce((n,f)=>n+f.name.length+f.value.length,0);
  if (title.length > 256 || promotions.length > 4096 || sanctions.length > 4096 || size > 5900 || identity.some(f=>f.value.length>1024)) {
    throw new Error('La fiche dépasse la taille maximale d’un message Discord.');
  }
  return {allowed_mentions:{parse:[]},embeds:[
    {title,author:{name:'Los Santos County Sheriff’s Department',icon_url:sheriffLogo},thumbnail:{url:sheriffLogo},color:0xd4af37,fields:identity},
    {title:'📈 Promotions et rétrogradations',description:promotions,color:0x2ecc71},
    {title:'⚖️ Sanctions',description:sanctions,color:0xe74c3c},
  ]};
}

function update(agent, action, values, i) {
  if (action === 'creer' || action === 'editer') {
    for (const name of ['prenom','nom','grade','poste']) {
      if (values[name] === undefined && action==='editer') continue;
      const value = clean(values[name]);
      if (!value || (name==='poste' && !['Dillimore','Ganton'].includes(value))) throw new Error(`Vérifiez le champ « ${name} ».`);
      agent[name] = value;
    }
    if (values.nouveau_matricule !== undefined) {
      if (!clean(values.nouveau_matricule)) throw new Error('Matricule obligatoire.');
      agent.matricule = clean(values.nouveau_matricule);
    }
    if (values.divisions !== undefined) {
      agent.divisions = [...new Map(values.divisions.split(',').map(clean).filter(Boolean).map(value=>[key(value),value])).values()];
    }
  } else if (action.startsWith('brigade_')) {
    const brigade = clean(values.brigade);
    if (!brigade) throw new Error('Indiquez une brigade.');
    const index = agent.divisions.findIndex(value=>key(value)===key(brigade));
    if (action==='brigade_ajouter' && index<0) agent.divisions.push(brigade);
    if (action==='brigade_supprimer') {
      if (index<0) throw new Error('Brigade introuvable sur cette fiche.');
      agent.divisions.splice(index,1);
    }
  } else {
    const list = action.startsWith('promotion_') ? agent.promotions : agent.sanctions;
    if (action.endsWith('_supprimer')) {
      const input = clean(values.reference).toUpperCase();
      const matches = list.filter(item=>item.date===input || item.id===input || reference(item.id)===input);
      if (matches.length>1) {
        const choices = matches.map(item=>`\`${reference(item.id)}\` — ${display(item.grade ?? item.raison).slice(0,65)}`);
        throw new Error(`Plusieurs entrées correspondent. Relancez avec une référence.\n${choices.join('\n')}`.slice(0,2000));
      }
      const index = list.indexOf(matches[0]);
      if (index<0) throw new Error('Référence introuvable sur cette fiche.');
      list.splice(index,1);
    } else if (!list.some(item=>item.id===i.id)) {
      const item = {id:i.id,date:validDate(values.date)};
      if (action==='promotion_ajouter') {
        if (!clean(values.grade) || !['promotion','retrogradation'].includes(values.type)) throw new Error('Indiquez le grade et le type de changement.');
        Object.assign(item,{grade:clean(values.grade),type:values.type});
      } else {
        if (!clean(values.raison)) throw new Error('Indiquez le motif de la sanction.');
        Object.assign(item,{raison:clean(values.raison),auteur:i.member.nick ?? i.member.user.global_name ?? i.member.user.username});
      }
      list.push(item);
    }
  }
}

const agentCategory = '1570926748361818233';

function channelName(agent) {
  return `${agent.prenom}-${agent.nom}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,100).replace(/-$/,'') || 'fiche-agent';
}

async function provisionChannel(env, record, agent, api) {
  const lease = Date.now()+60000;
  const claimed = await env.DB.prepare(`UPDATE agent_records SET provisioning_until=?
    WHERE id=? AND channel_id IS NULL AND deleted=0 AND provisioning_until<=?`)
    .bind(lease,record.id,Date.now()).run();
  if (!claimed.meta.changes) throw new Error('Le salon est en cours de création. Réessayez dans un instant.');
  try {
    const category = await api(env,`/channels/${agentCategory}`);
    if (category.guild_id !== agentGuild || category.type !== 4) throw new Error('Catégorie Fiche Agents invalide.');
    const topic = `Fiche agent · ${record.id}`;
    const channels = await api(env,`/guilds/${agentGuild}/channels`);
    let channel = channels.find(c=>c.type===0 && c.parent_id===agentCategory && c.topic===topic);
    if (!channel) {
      const bot = await api(env,'/users/@me');
      channel = await api(env,`/guilds/${agentGuild}/channels`,'POST',{
        name:channelName(agent),type:0,parent_id:agentCategory,topic,
        permission_overwrites:[
          {id:agentGuild,type:0,deny:'1024'},
          {id:direction,type:0,allow:'66560'},
          {id:encadrement,type:0,allow:'66560'},
          {id:bot.id,type:1,allow:'84992'},
        ],
      });
    }
    await env.DB.prepare('UPDATE agent_records SET channel_id=?,message_id=NULL WHERE id=? AND provisioning_until=?')
      .bind(channel.id,record.id,lease).run();
  } finally {
    await env.DB.prepare('UPDATE agent_records SET provisioning_until=0 WHERE id=? AND provisioning_until=?')
      .bind(record.id,lease).run();
  }
}

async function publish(env, id, api) {
  for (let attempt=0; attempt<4; attempt++) {
    const record = await env.DB.prepare('SELECT * FROM agent_records WHERE id=?').bind(id).first();
    if (!record) return;
    if (record.deleted) {
      if (record.provisioning_until > Date.now()) throw new Error('Création du salon en cours. Réessayez la suppression.');
      const path = record.channel_id ? `/channels/${record.channel_id}`
        : record.message_id && env.AGENT_CHANNEL_ID ? `/channels/${env.AGENT_CHANNEL_ID}/messages/${record.message_id}` : null;
      if (path) {
        try { await api(env,path,'DELETE'); }
        catch (error) { if (error.status!==404) throw error; }
      }
      await env.DB.prepare('DELETE FROM agent_records WHERE id=? AND deleted=1').bind(id).run();
      return;
    }
    const agent = JSON.parse(record.data);
    if (!record.channel_id) {
      await provisionChannel(env,record,agent,api);
      continue;
    }
    const channelPath = `/channels/${record.channel_id}`;
    const channel = await api(env,channelPath);
    if (channel.name !== channelName(agent)) await api(env,channelPath,'PATCH',{name:channelName(agent)});
    const path = `${channelPath}/messages`;
    const payload = card(agent);
    let published = false;
    if (record.message_id) {
      try { await api(env,`${path}/${record.message_id}`,'PATCH',payload); published=true; }
      catch (error) { if (error.status!==404) throw error; }
    }
    if (!published) {
      const message = await api(env,path,'POST',{...payload,nonce:id,enforce_nonce:true});
      const saved = await env.DB.prepare('UPDATE agent_records SET message_id=? WHERE id=? AND deleted=0')
        .bind(message.id,id).run();
      if (!saved.meta.changes) {
        await api(env,`${path}/${message.id}`,'DELETE').catch(error=>{if(error.status!==404) throw error;});
        return;
      }
    }
    const latest = await env.DB.prepare('SELECT revision,deleted FROM agent_records WHERE id=?').bind(id).first();
    if (!latest || (!latest.deleted && latest.revision===record.revision)) return;
  }
  throw new Error('Plusieurs modifications simultanées. Réessayez avec /fiche editer.');
}

export async function handleAgent(env, i, api) {
  const action = i.data.options?.[0];
  if (!agentCommand.options.some(option=>option.name===action?.name)) throw new Error('Commande de fiche inconnue.');
  const roles = i.member.roles ?? [];
  const allowed = roles.includes(direction) || (roles.includes(encadrement) &&
    ['brigade_ajouter','brigade_supprimer','sanction_ajouter'].includes(action.name));
  if (!allowed) throw new Error('Votre rôle ne permet pas cette action.');
  const values = Object.fromEntries((action.options ?? []).map(option=>[option.name,option.value]));
  const matricule = clean(values.matricule);
  if (!matricule) throw new Error('Indiquez le matricule.');
  const db = env.DB;

  for (let attempt=0; attempt<4; attempt++) {
    const record = await db.prepare('SELECT * FROM agent_records WHERE matricule=?').bind(key(matricule)).first();
    if (action.name==='creer') {
      if (record) {
        if (record.deleted) throw new Error('La suppression de cette fiche est en cours.');
        if (record.channel_id && record.message_id) throw new Error('Ce matricule possède déjà une fiche.');
        await publish(env,record.id,api);
        return 'Fiche publiée.';
      }
      const agent = {matricule,divisions:[],promotions:[],sanctions:[]};
      update(agent,action.name,values,i);
      card(agent);
      const inserted = await db.prepare('INSERT OR IGNORE INTO agent_records(id,matricule,data) VALUES (?,?,?)')
        .bind(i.id,key(matricule),JSON.stringify(agent)).run();
      if (!inserted.meta.changes) continue;
      await publish(env,i.id,api);
      return 'Fiche créée.';
    }
    if (!record) throw new Error('Aucune fiche pour ce matricule.');
    if (action.name==='supprimer') {
      if (values.confirmer!==true) throw new Error('Choisissez confirmer:Oui.');
      await db.prepare('UPDATE agent_records SET deleted=1,revision=revision+1 WHERE id=?').bind(record.id).run();
      await publish(env,record.id,api);
      return 'Fiche supprimée.';
    }
    if (record.deleted) throw new Error('Cette fiche est en cours de suppression.');
    const agent = JSON.parse(record.data);
    update(agent,action.name,values,i);
    card(agent);
    const changed = await db.prepare(`UPDATE OR IGNORE agent_records SET matricule=?,data=?,revision=revision+1
      WHERE id=? AND revision=? AND deleted=0`).bind(key(agent.matricule),JSON.stringify(agent),record.id,record.revision).run();
    if (!changed.meta.changes) {
      const conflict = await db.prepare('SELECT id FROM agent_records WHERE matricule=?').bind(key(agent.matricule)).first();
      if (conflict && conflict.id!==record.id) throw new Error('Ce matricule est déjà utilisé.');
      continue;
    }
    await publish(env,record.id,api);
    return 'Fiche mise à jour.';
  }
  throw new Error('La fiche a changé pendant votre modification. Réessayez.');
}
