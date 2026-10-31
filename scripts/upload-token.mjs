import { spawnSync } from 'node:child_process';
if(!process.env.DISCORD_TOKEN?.trim()) throw new Error('DISCORD_TOKEN est vide dans .dev.vars.');
const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','put','DISCORD_TOKEN'],{input:process.env.DISCORD_TOKEN.trim(),encoding:'utf8'});
if(result.status!==0){console.error('Envoi du secret refusé. Vérifiez la connexion Cloudflare.');process.exit(1);}
console.log('Token Discord enregistré dans les secrets Cloudflare.');
