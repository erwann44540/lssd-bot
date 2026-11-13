export const logRooms = {
  fiches: 'logs-fiches',
  promotions: 'logs-promotions',
  brigades: 'logs-brigades',
  sanctions: 'logs-sanctions',
};

export async function logAgentCommand(env, interaction, api, success) {
  const action = interaction.data.options?.[0];
  if (!action) return;
  const room = {promotion:'promotions',brigade:'brigades',sanction:'sanctions'}[action.name.split('_')[0]] ?? 'fiches';
  const channel = env['AGENT_LOG_' + room.toUpperCase()];
  if (!channel) return;
  const user = interaction.member.user.id;
  const matricule = action.options?.find(option=>option.name==='matricule')?.value;
  await api(env,`/channels/${channel}/messages`,'POST',{
    embeds:[{
      title:success ? 'Commande exécutée' : 'Commande refusée ou échouée',
      color:success ? 0x2ecc71 : 0xe74c3c,
      fields:[
        {name:'Auteur',value:`<@${user}>`,inline:true},
        {name:'Commande',value:`/fiche ${action.name}`,inline:true},
        {name:'Matricule',value:String(matricule ?? 'Non renseigné'),inline:true},
        {name:'Salon',value:`<#${interaction.channel_id}>`},
      ],
      timestamp:new Date().toISOString(),
    }],
    allowed_mentions:{parse:[]},
    // Discord deduplicates nonces per author, including across channels.
    nonce:`log-${interaction.id}`,enforce_nonce:true,
  });
}
