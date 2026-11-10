const name = ['name', 'Prénom Nom', 100];
const age = ['age', 'Âge'];
const education = ['diplomes', 'Diplômes', 450];
const experience = ['experience', 'Expériences', 600];
const motivation = ['motivation', 'Motivations', 700];
const why = ['why', 'Pourquoi vous et pas quelqu’un d’autre ?', 600];
const background = ['background', 'Background', 700];
const fdl = ['fdl', 'Quelles sont vos expériences dans les FDL ?', 600];

export const forms = {
  candidature: { label: 'Candidature', groups: [
    ['Informations personnelles et expériences', [name, age, education, experience]],
    ['Motivation', [motivation, why]],
    ['Partie OOC', [background, fdl]],
  ] },
  reintegration: { label: 'Réintégration', groups: [
    ['Informations personnelles et expériences', [name, age, education, experience, ['ancien_grade', 'Quel était votre ancien grade ?', 100]]],
    ['Motivation', [motivation, ['why', 'Pourquoi vous reprendre plutôt que recruter un nouveau candidat ?', 600]]],
    ['Partie OOC', [background, fdl]],
  ] },
  sergeant: { label: 'Candidature Sergeant', groups: [
    ['Informations personnelles et expériences', [name, age, education, experience]],
    ['Motivation', [motivation, why]],
    ['Partie OOC', [background, fdl, ['developpement', 'Comment souhaitez-vous aider au développement de la faction ?', 700], ['repli', 'En cas de refus comme Sergeant, souhaitez-vous un examen en candidature classique ?', 3]]],
  ] },
};

export const recruitmentCommand = {
  name: 'lssd',
  description: 'Recrutement LSSD',
  options: [
    { type: 1, name: 'candidature_ce', description: 'Ouvrir ou fermer les candidatures Sergeant',
      options: [{ type: 5, name: 'activer', description: 'Oui pour ouvrir les candidatures Sergeant', required: true }] },
    { type: 1, name: 'rendezvous', description: 'Envoyer une acceptation depuis le fil privé du dossier',
      options: [{ type: 3, name: 'date_heure', description: 'Date et heure à communiquer au candidat', required: true, min_length: 5, max_length: 100 }] },
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
        throw new Error(`Vérifiez le champ « ${label} ».`);
      }
      return { name: label, value: name === 'repli' ? (value === 'oui' ? 'Oui' : 'Non') : String(value) };
    }),
  }));
  return { name: values.get('name')?.trim(), groups };
}

const button = (kind, label, style = 1) => ({type:2,custom_id:kind,label,style});
export function recruitmentPanel(enabled) {
  const components = [button('apply:candidature', 'Candidature'), button('apply:reintegration', 'Réintégration')];
  if (enabled) components.push(button('apply:sergeant', 'Corps d’Encadrement · Sergeant'));
  return {
    embeds: [{ title: 'Recrutement LSSD', color: 0xc6a34a,
      description: 'Choisissez votre parcours. Le formulaire se remplit en trois étapes. Après chaque étape, cliquez sur Envoyer. Le bouton Suivant apparaît jusqu’au dépôt final.' }],
    components: [{ type: 1, components }],
    allowed_mentions: { parse: [] },
  };
}

export const noticeControls = {
  content: 'Délibérations • Instructeurs',
  components: [{type:1,components:[
    button('notice:receipt', 'Accusé de réception', 2),
    button('notice:accept', 'Accepté', 3),
    button('notice:refuse', 'Refusé', 4),
  ]}],
};

export function noticeText(kind, candidateId, instructorId, appointment) {
  const bodies = {
    receipt: 'Nous vous remercions pour votre candidature et accusons réception de votre dossier. Vous recevrez une réponse à la clôture des recrutements.',
    accept: `Après examen de votre candidature, nous vous informons qu’elle a été retenue pour la suite du recrutement.\n\nVous êtes convié le ${appointment} au poste de Dillimore pour votre session de recrutement.\n\nTout retard doit être signalé. Une absence sera considérée comme un abandon et mettra fin à votre recrutement.`,
    refuse: 'Après examen de votre candidature, nous vous informons qu’elle n’a pas été retenue. Vous pourrez toutefois postuler lors d’une prochaine session.',
  };
  return `Bonjour <@${candidateId}>,\n\n${bodies[kind]}\n\nCordialement,\n<@${instructorId}>`;
}

const fieldExamples = {
  name: 'Prénom et nom de votre personnage',
  age: 'Âge de votre personnage en années',
  diplomes: 'Diplômes de votre personnage, ou « Aucun »',
  experience: 'Postes occupés et missions réalisées par votre personnage',
  ancien_grade: 'Votre dernier grade au LSSD',
  background: 'Votre parcours en jeu et le contexte de votre personnage',
  fdl: 'Factions, grades et missions en RP, ou « Aucune »',
};

export function recruitmentModal(kind, draftId, step) {
  const {groups} = forms[kind];
  const [, fields] = groups[step];
  const title = ['Identité et parcours RP','Motivation','Expérience hors personnage'][step];
  const guidance = step+1 === groups.length
    ? 'Cliquez sur Envoyer pour déposer votre dossier.'
    : 'Envoyer enregistre cette étape. Le bouton Suivant apparaît ensuite.';
  const guidanceIndex = fields.at(-1)[0] === 'repli' ? fields.length-2 : fields.length-1;

  return Response.json({type:9,data:{
    custom_id: `form:${kind}:${draftId}:${step}`,
    title: `${step+1}/${groups.length} · ${title}`,
    components: fields.map(([custom_id,label,limit], index) => {
      const shortLabels = {
        fdl: 'Expériences dans les FDL',
        why: 'Pourquoi vous reprendre ?',
        repli: 'Réexamen en candidature classique',
        developpement: 'Développement de la faction',
      };
      const shortLabel = label.length > 45 ? shortLabels[custom_id] : label;
      const description = index === guidanceIndex ? guidance : label.length > 45 ? label : undefined;
      const placeholder = fieldExamples[custom_id] ?? (label.length > 45 && index === guidanceIndex ? label : undefined);
      return {
        type:18, label:shortLabel, description,
        component: custom_id === 'repli'
          ? {type:3,custom_id,placeholder:'En cas de refus comme Sergeant',options:[
            {label:'Oui',value:'oui'}, {label:'Non',value:'non'},
          ],required:true}
          : {type:4,custom_id,placeholder,style:limit > 100 ? 2 : 1,required:true,
            min_length:custom_id === 'age' ? 1 : 2,max_length:limit ?? 3},
      };
    }),
  }});
}
