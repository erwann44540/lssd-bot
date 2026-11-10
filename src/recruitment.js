const name = ['name', 'PrÃ©nom Nom', 100];
const age = ['age', 'Ã‚ge'];
const education = ['diplomes', 'DiplÃ´mes', 450];
const experience = ['experience', 'ExpÃ©riences', 600];
const motivation = ['motivation', 'Motivations', 700];
const why = ['why', 'Pourquoi vous et pas quelquâ€™un dâ€™autre ?', 600];
const background = ['background', 'Background', 700];
const fdl = ['fdl', 'Quelles sont vos expÃ©riences dans les FDL ?', 600];

export const forms = {
  candidature: { label: 'Candidature', groups: [
    ['Informations personnelles et expÃ©riences', [name, age, education, experience]],
    ['Motivation', [motivation, why]],
    ['Partie OOC', [background, fdl]],
  ] },
  reintegration: { label: 'RÃ©intÃ©gration', groups: [
    ['Informations personnelles et expÃ©riences', [name, age, education, experience, ['ancien_grade', 'Quel Ã©tait votre ancien grade ?', 100]]],
    ['Motivation', [motivation, ['why', 'Pourquoi vous reprendre plutÃ´t que recruter un nouveau candidat ?', 600]]],
    ['Partie OOC', [background, fdl]],
  ] },
  sergeant: { label: 'Candidature Sergeant', groups: [
    ['Informations personnelles et expÃ©riences', [name, age, education, experience]],
    ['Motivation', [motivation, why]],
    ['Partie OOC', [background, fdl, ['developpement', 'Comment souhaitez-vous aider au dÃ©veloppement de la faction ?', 700]]],
    ['En cas de refus au poste de Sergeant', [['repli', 'Souhaitez-vous que le dossier soit Ã©tudiÃ© comme candidature classique ?', 3]]],
  ] },
};

export const recruitmentCommand = {
  name: 'lssd',
  description: 'Recrutement LSSD',
  options: [
    { type: 1, name: 'candidature_ce', description: 'Ouvrir ou fermer les candidatures Sergeant',
      options: [{ type: 5, name: 'activer', description: 'Oui pour ouvrir les candidatures Sergeant', required: true }] },
    { type: 1, name: 'rendezvous', description: 'Envoyer une acceptation depuis le fil privÃ© du dossier',
      options: [{ type: 3, name: 'date_heure', description: 'Date et heure Ã  communiquer au candidat', required: true, min_length: 5, max_length: 100 }] },
  ],
};

export function formAnswers(kind, options, step) {
  const values = new Map((options ?? []).map(({ name, value }) => [name, value]));
  const sections = forms[kind].groups;
  const groups = (step === undefined ? sections : [sections[step]]).map(([title, fields]) => ({
    title,
    fields: fields.map(([name, label, limit]) => {
      const raw = values.get(name);
      const value = typeof raw === 'string' ? raw.trim() : raw;
      if (name === 'age' ? !Number.isInteger(value) || value < 1 || value > 120
        : typeof value !== 'string' || value.length < 2 || value.length > limit
          || (name === 'repli' && !['oui', 'non'].includes(value))) {
        throw new Error(`VÃ©rifiez le champ Â« ${label} Â».`);
      }
      return { name: label, value: name === 'repli' ? (value === 'oui' ? 'Oui' : 'Non') : String(value) };
    }),
  }));
  return { name: values.get('name')?.trim(), groups };
}

const button = (kind, label, style = 1) => ({type:2,custom_id:kind,label,style});
export function recruitmentPanel(enabled) {
  const components = [button('apply:candidature', 'Candidature'), button('apply:reintegration', 'RÃ©intÃ©gration')];
  if (enabled) components.push(button('apply:sergeant', 'Corps dâ€™Encadrement Â· Sergeant'));
  return {
    embeds: [{ title: 'Recrutement LSSD', color: 0xc6a34a,
      description: 'Choisissez votre parcours. Vos rÃ©ponses seront dÃ©posÃ©es dans un dossier privÃ©.' }],
    components: [{ type: 1, components }],
    allowed_mentions: { parse: [] },
  };
}

export const noticeControls = {
  content: 'DÃ©libÃ©rations â€¢ Instructeurs',
  components: [{type:1,components:[
    button('notice:receipt', 'AccusÃ© de rÃ©ception', 2),
    button('notice:accept', 'AcceptÃ©', 3),
    button('notice:refuse', 'RefusÃ©', 4),
  ]}],
};

export function noticeText(kind, candidateId, instructorId, appointment) {
  const bodies = {
    receipt: 'Nous vous remercions pour votre candidature et accusons rÃ©ception de votre dossier. Vous recevrez une rÃ©ponse Ã  la clÃ´ture des recrutements.',
    accept: `AprÃ¨s examen de votre candidature, nous vous informons quâ€™elle a Ã©tÃ© retenue pour la suite du recrutement.\n\nVous Ãªtes conviÃ© le ${appointment} au poste de Dillimore pour votre session de recrutement.\n\nTout retard doit Ãªtre signalÃ©. Une absence sera considÃ©rÃ©e comme un abandon et mettra fin Ã  votre recrutement.`,
    refuse: 'AprÃ¨s examen de votre candidature, nous vous informons quâ€™elle nâ€™a pas Ã©tÃ© retenue. Vous pourrez toutefois postuler lors dâ€™une prochaine session.',
  };
  return `Bonjour <@${candidateId}>,\n\n${bodies[kind]}\n\nCordialement,\n<@${instructorId}>`;
}

export function recruitmentModal(kind, draftId, step) {
  const [title, fields] = forms[kind].groups[step];
  return Response.json({type:9,data:{
    custom_id: `form:${kind}:${draftId}:${step}`,
    title,
    components: fields.map(([custom_id,label,limit]) => ({
      type:18,
      label: label.length > 45 ? (custom_id === 'fdl' ? 'Expériences dans les FDL' : custom_id === 'why' ? 'Pourquoi vous reprendre ?' : custom_id === 'repli' ? 'Réexamen en candidature classique' : 'Développement de la faction') : label,
      ...(label.length > 45 ? {description:label} : {}),
      component: custom_id === 'repli'
        ? {type:3,custom_id,placeholder:'En cas de refus comme Sergeant',options:[
          {label:'Oui',value:'oui'}, {label:'Non',value:'non'},
        ],required:true}
        : {type:4,custom_id,style:limit > 100 ? 2 : 1,required:true,
          min_length:custom_id === 'age' ? 1 : 2,max_length:limit ?? 3},
    })),
  }});
}
