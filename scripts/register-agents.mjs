import { agentGuild, agentCommand } from '../src/agents.js';
const url = 'https://discord.com/api/v10/applications/'+process.env.DISCORD_APPLICATION_ID+'/guilds/'+agentGuild+'/commands';
const response = await fetch(url,{method:'POST',headers:{
  Authorization:'Bot '+process.env.DISCORD_TOKEN,'Content-Type':'application/json',
},body:JSON.stringify(agentCommand)});
if(!response.ok) throw new Error('Discord '+response.status+' '+await response.text());
const command = await response.json();
console.log('/'+command.name+' · '+command.options.length+' sous-commandes');
