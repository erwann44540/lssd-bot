import { recruitmentCommand } from '../src/recruitment.js';
const { DISCORD_TOKEN, DISCORD_APPLICATION_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !/^\d+$/.test(DISCORD_APPLICATION_ID??'') || !/^\d+$/.test(GUILD_ID??'')) throw new Error('Renseignez DISCORD_TOKEN, DISCORD_APPLICATION_ID et GUILD_ID dans .dev.vars.');
const command={name:'lssd-config',description:'Configurer le recrutement LSSD et publier son panneau',default_member_permissions:'8',options:[{type:8,name:'instructeur',description:'Rôle ayant accès aux candidatures et aux fils privés',required:true},{type:7,name:'salon',description:'Salon public où publier le panneau',required:true,channel_types:[0]}]};
for (const definition of [command, recruitmentCommand]) {
  const response = await fetch(`https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/guilds/${GUILD_ID}/commands`, {
    method: 'POST',
    headers: { Authorization: `Bot ${DISCORD_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(definition),
  });
  if (!response.ok) throw new Error(`Enregistrement de /${definition.name} refusé : HTTP ${response.status} ${await response.text()}`);
  const registered = await response.json();
  console.log(`/${registered.name} : ${registered.id}`);
}
const permissions=16n|1024n|2048n|16384n|65536n|268435456n|17179869184n|68719476736n|274877906944n;
console.log(`Invitation : https://discord.com/oauth2/authorize?client_id=${DISCORD_APPLICATION_ID}&scope=bot%20applications.commands&permissions=${permissions}&guild_id=${GUILD_ID}&disable_guild_select=true`);


