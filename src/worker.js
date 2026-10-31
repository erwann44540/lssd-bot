const API = 'https://discord.com/api/v10';
export const P = { view: 1024n, send: 2048n, history: 65536n, embed: 16384n, manageChannels: 16n, manageThreads: 17179869184n, privateThreads: 68719476736n, threadSend: 274877906944n };
const allow = (...p) => p.reduce((a,b)=>a|b,0n).toString();
const row = (...components) => ({type:1,components});
const button = (custom_id,label,style=1) => ({type:2,custom_id,label,style});
const reply = content => Response.json({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
export function modal() {
  const fields = [['name','Prénom Nom',1,100],['motivation','Motivations',2,1500],['experience','Expériences',2,1500],['why','Pourquoi vous et pas quelqu’un d’autre ?',2,1500]];
  return {type:9,data:{custom_id:'application',title:'Recrutement LSSD',components:fields.map(([custom_id,label,style,max_length])=>row({type:4,custom_id,label,style,max_length,min_length:2,required:true}))}};
}
export function answers(data) {
  const result = Object.fromEntries((data.components??[]).flatMap(r=>r.components??[]).map(c=>[c.custom_id,c.value?.trim()]));
  for (const [key,max] of [['name',100],['motivation',1500],['experience',1500],['why',1500]]) if (!result[key] || result[key].length<2 || result[key].length>max) throw new Error('Formulaire incomplet ou trop long.');
  return result;
}
export function dossierName(name, number) {
  const slug=name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,65).replace(/-+$/g,'') || 'candidat';
  return `dossier-${slug}-${String(number).padStart(4,'0')}`;
}
export async function nextTicketNumber(db, guildId) {
  const counter=await db.prepare('INSERT INTO ticket_counters(guild_id,last_number) VALUES (?,1) ON CONFLICT(guild_id) DO UPDATE SET last_number=last_number+1 RETURNING last_number').bind(guildId).first();
  return counter.last_number;
}
export async function verify(request, body, key) {
  try {
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');
    if (!/^[a-f0-9]{128}$/i.test(signature??'') || !/^[a-f0-9]{64}$/i.test(key??'') || !/^\d+$/.test(timestamp??'') || Math.abs(Date.now()/1000-Number(timestamp))>300) return false;
    const bytes = s => Uint8Array.from(s.match(/../g),h=>parseInt(h,16));
    const publicKey = await crypto.subtle.importKey('raw',bytes(key),{name:'Ed25519'},false,['verify']);
    return await crypto.subtle.verify('Ed25519',publicKey,bytes(signature),new TextEncoder().encode(timestamp+body));
  } catch { return false; }
}
async function api(env,path,method='GET',body) {
  for (let attempt=0;attempt<3;attempt++) {
    const response = await fetch(API+path,{method,headers:{Authorization:`Bot ${env.DISCORD_TOKEN}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    if (response.status===429 && attempt<2) {
      const error=await response.json();
      if(error.retry_after>4) throw new Error('Discord est temporairement occupé. Réessayez.');
      await new Promise(r=>setTimeout(r,Math.max(100,error.retry_after*1000))); continue;
    }
    if (!response.ok) throw new Error(`Discord refuse cette opération (HTTP ${response.status}). Vérifiez les permissions du bot.`);
    return response.status===204?null:response.json();
  }
}
const instructor = (i,c) => i.member?.roles?.includes(c.role_id);
const admin = i => (BigInt(i.member?.permissions??0)&8n)!==0n;
async function finish(env,i,content) {
  await api(env,`/webhooks/${i.application_id}/${i.token}/messages/@original`,'PATCH',{content,allowed_mentions:{parse:[]}});
}
async function config(env,i) { return env.DB.prepare('SELECT * FROM config WHERE guild_id=?').bind(i.guild_id).first(); }
async function staffThread(env,channel) {
  return api(env,`/channels/${channel}/threads`,'POST',{name:'Délibérations • Instructeurs',type:12,invitable:false,auto_archive_duration:1440});
}
export async function ensureArchives(env,guildId,roleId) {
  const channels=await api(env,`/guilds/${guildId}/channels`);
  let category=channels.find(c=>c.type===4 && c.name==='LSSD Archives');
  const me=await api(env,'/users/@me');
  const overwrites=[{id:guildId,type:0,deny:P.view.toString()},{id:roleId,type:0,allow:allow(P.view,P.send,P.history,P.manageThreads,P.privateThreads,P.threadSend)},{id:me.id,type:1,allow:allow(P.view,P.send,P.history,P.embed,P.manageChannels,P.manageThreads,P.privateThreads,P.threadSend)}];
  if(category) await api(env,`/channels/${category.id}`,'PATCH',{permission_overwrites:overwrites});
  else category=await api(env,`/guilds/${guildId}/channels`,'POST',{name:'LSSD Archives',type:4,permission_overwrites:overwrites});
  return {id:category.id,permission_overwrites:overwrites};
}
export async function archiveDossier(env,guildId,roleId,ticket) {
  const archive=await ensureArchives(env,guildId,roleId);
  // Move and revoke candidate access together; never inherit public permissions.
  await api(env,`/channels/${ticket.channel_id}`,'PATCH',{parent_id:archive.id,permission_overwrites:[...archive.permission_overwrites.filter(o=>o.id!==ticket.user_id),{id:ticket.user_id,type:1,allow:'0',deny:P.view.toString()}]});
}
async function setup(env,i) {
  if (!admin(i)) throw new Error('Configuration réservée aux administrateurs.');
  const options=Object.fromEntries(i.data.options.map(o=>[o.name,o.value]));
  const roles=await api(env,`/guilds/${i.guild_id}/roles`);
  const role=roles.find(r=>r.id===options.instructeur);
  if(!role || role.id===i.guild_id || role.managed) throw new Error('Choisissez un rôle Instructeur dédié, non géré par une application.');
  const panel=await api(env,`/channels/${options.salon}`);
  if(panel.guild_id!==i.guild_id || panel.type!==0) throw new Error('Choisissez un salon textuel de ce serveur.');
  const me=await api(env,'/users/@me');
  const overwrites=[{id:i.guild_id,type:0,deny:P.view.toString()},{id:role.id,type:0,allow:allow(P.view,P.send,P.history,P.manageThreads,P.privateThreads,P.threadSend)},{id:me.id,type:1,allow:allow(P.view,P.send,P.history,P.embed,P.manageChannels,P.manageThreads,P.privateThreads,P.threadSend)}];
  let c=await config(env,i);
  let category;
  if(c) {
    category=await api(env,`/channels/${c.category_id}`);
    await api(env,`/channels/${category.id}`,'PATCH',{permission_overwrites:overwrites});
  } else category=await api(env,`/guilds/${i.guild_id}/channels`,'POST',{name:'LSSD • Recrutements',type:4,permission_overwrites:overwrites});
  await env.DB.prepare('INSERT INTO config VALUES (?,?,?) ON CONFLICT(guild_id) DO UPDATE SET role_id=excluded.role_id,category_id=excluded.category_id').bind(i.guild_id,role.id,category.id).run();
  await api(env,`/channels/${panel.id}/messages`,'POST',{embeds:[{title:'Rejoindre le LSSD',description:'Ouvrez votre candidature et remplissez le formulaire. Un dossier privé sera créé avec les Instructeurs.',color:0xc6a34a}],components:[row(button('apply','Déposer ma candidature'))],allowed_mentions:{parse:[]}});
  return 'Panneau publié et catégorie privée configurée. Les changements de rôle s’appliquent aux nouveaux dossiers ; vérifiez les anciens dossiers avant de retirer un rôle.';
}
async function apply(env,i,c) {
  const a=answers(i.data);
  const user=i.member.user.id;
  const reservation=await env.DB.prepare("INSERT OR IGNORE INTO tickets(id,guild_id,user_id) VALUES (?,?,?)").bind(i.id,i.guild_id,user).run();
  if(!reservation.meta.changes) {
    const old=await env.DB.prepare("SELECT channel_id FROM tickets WHERE guild_id=? AND user_id=? AND status IN ('creating','open')").bind(i.guild_id,user).first();
    return old?.channel_id?`Vous avez déjà un dossier : <#${old.channel_id}>.`:'Votre dossier est en cours de création. Contactez un administrateur si ce message persiste.';
  }
  let channel;
  try {
    const number=await nextTicketNumber(env.DB,i.guild_id);
    await env.DB.prepare('UPDATE tickets SET ticket_number=? WHERE id=?').bind(number,i.id).run();
    const parent=await api(env,`/channels/${c.category_id}`);
    if(parent.guild_id!==i.guild_id || parent.type!==4) throw new Error('Catégorie invalide. Relancez /lssd-config.');
    channel=await api(env,`/guilds/${i.guild_id}/channels`,'POST',{name:dossierName(a.name,number),type:0,parent_id:parent.id,topic:`Candidature LSSD • ${user}`,permission_overwrites:[...parent.permission_overwrites.filter(o=>o.id!==user),{id:user,type:1,allow:allow(P.view,P.send,P.history,P.threadSend),deny:allow(P.privateThreads,P.manageThreads)}]});
    await env.DB.prepare("UPDATE tickets SET channel_id=?,status='open' WHERE id=?").bind(channel.id,i.id).run();
    const labels={name:'Prénom Nom',motivation:'Motivations',experience:'Expériences',why:'Pourquoi vous et pas quelqu’un d’autre ?'};
    await api(env,`/channels/${channel.id}/messages`,'POST',{content:`Candidature de <@${user}> • <@&${c.role_id}>`,embeds:[{title:'Dossier de recrutement LSSD',color:0xc6a34a,description:'Les Instructeurs étudieront votre candidature.'},...Object.entries(a).filter(([k])=>labels[k]).map(([k,value])=>({title:labels[k],description:value,color:0x243b53}))],components:[row(button('staff','Créer / ouvrir le fil Instructeurs',2),button('close','Clôturer le dossier',4))],allowed_mentions:{parse:[],users:[user],roles:[c.role_id]}});
    try {
      const thread=await staffThread(env,channel.id);
      await env.DB.prepare('UPDATE tickets SET thread_id=? WHERE id=?').bind(thread.id,i.id).run();
      await api(env,`/channels/${thread.id}/messages`,'POST',{content:'Délibérations réservées aux Instructeurs. Le candidat ne participe pas à ce fil.',allowed_mentions:{parse:[]}});
    } catch { return `Dossier créé : <#${channel.id}>. Les Instructeurs peuvent créer le fil privé avec le bouton du dossier si sa création automatique a échoué.`; }
    return `Votre candidature a été transmise : <#${channel.id}>.`;
  } catch(error) {
    if(!channel) await env.DB.prepare("UPDATE tickets SET status='failed' WHERE id=?").bind(i.id).run();
    if(channel) return `Le dossier <#${channel.id}> a été créé, mais sa préparation a échoué. Prévenez un Instructeur. ${error.message}`;
    throw error;
  }
}
async function process(env,i) {
  if(i.type===2 && i.data.name==='lssd-config') return setup(env,i);
  const c=await config(env,i);
  if(!c) throw new Error('Un administrateur doit lancer /lssd-config avant les candidatures.');
  if(i.type===5 && i.data.custom_id==='application') return apply(env,i,c);
  if(i.type===3 && ['close','staff'].includes(i.data.custom_id)) {
    if(!instructor(i,c)) throw new Error('Action réservée au rôle Instructeur.');
    const ticket=await env.DB.prepare('SELECT * FROM tickets WHERE channel_id=? AND guild_id=?').bind(i.channel_id,i.guild_id).first();
    if(!ticket || ticket.status!=='open') throw new Error('Aucun dossier ouvert dans ce salon.');
    if(i.data.custom_id==='staff') {
      if(ticket.thread_id==='creating') return 'Création du fil déjà en cours.';
      if(ticket.thread_id) return `Fil Instructeurs : <#${ticket.thread_id}>.`;
      // Atomically reserve thread creation, including across Worker instances.
      const claim=await env.DB.prepare("UPDATE tickets SET thread_id='creating' WHERE id=? AND thread_id IS NULL").bind(ticket.id).run();
      if(!claim.meta.changes) return 'Création du fil déjà en cours.';
      try {
        const t=await staffThread(env,i.channel_id);
        await env.DB.prepare('UPDATE tickets SET thread_id=? WHERE id=?').bind(t.id,ticket.id).run();
        return `Fil privé créé : <#${t.id}>.`;
      } catch(e) { await env.DB.prepare('UPDATE tickets SET thread_id=NULL WHERE id=?').bind(ticket.id).run(); throw e; }
    }
    await archiveDossier(env,i.guild_id,c.role_id,ticket);
    await env.DB.prepare("UPDATE tickets SET status='closed' WHERE id=?").bind(ticket.id).run();
    await api(env,`/channels/${ticket.channel_id}/messages`,'POST',{content:`Dossier clôturé par <@${i.member.user.id}>. Le dossier a été déplacé dans LSSD Archives et l’accès du candidat a été retiré.`,allowed_mentions:{parse:[]}});
    return 'Dossier clôturé et déplacé dans LSSD Archives pour les Instructeurs. Le candidat peut déposer une nouvelle candidature.';
  }
  throw new Error('Interaction inconnue.');
}
export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if(request.method==='GET' && url.pathname==='/') return new Response('LSSD recrutement — service actif');
    if(request.method!=='POST' || url.pathname!=='/interactions') return new Response('Not found',{status:404});
    const body=await request.text();
    if(!await verify(request,body,env.DISCORD_PUBLIC_KEY)) return new Response('Invalid signature',{status:401});
    let i; try { i=JSON.parse(body); } catch { return new Response('Invalid JSON',{status:400}); }
    if(i.type===1) return Response.json({type:1});
    if(i.guild_id!==env.GUILD_ID || !i.member) return reply('Ce bot est réservé au serveur LSSD configuré.');
    if(i.type===3 && i.data.custom_id==='apply') return Response.json(modal());
    ctx.waitUntil((async()=>{
      try { await finish(env,i,await process(env,i)); }
      catch(e) { try { await finish(env,i,e.message); } catch { console.error('Échec de réponse Discord',i.id); } }
    })());
    return Response.json({type:5,data:{flags:64}});
  }
};

