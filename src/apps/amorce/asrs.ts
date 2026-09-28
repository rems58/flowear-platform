import type { AssessmentDefinition } from '../types'

/**
 * ASRS v1.1, partie A : les six questions de dépistage du TDAH de l'adulte de l'OMS (Kessler
 * et al., 2005), libres de droits. Zone de dépistage : « parfois » ou plus pour les trois
 * premières, « souvent » ou plus pour les trois dernières ; quatre réponses dans la zone ou
 * plus = profil compatible, à faire évaluer. Le pourcentage est le score sur 24 : un repère
 * lisible, pas une probabilité de diagnostic, et la carte le dit.
 */
const FREQ = (zoneFrom: number) =>
  [
    { value: 'never', score: 0, label: { en: 'Never', fr: 'Jamais', es: 'Nunca', de: 'Nie', it: 'Mai' } },
    { value: 'rarely', score: 1, label: { en: 'Rarely', fr: 'Rarement', es: 'Rara vez', de: 'Selten', it: 'Raramente' } },
    { value: 'sometimes', score: 2, label: { en: 'Sometimes', fr: 'Parfois', es: 'A veces', de: 'Manchmal', it: 'A volte' } },
    { value: 'often', score: 3, label: { en: 'Often', fr: 'Souvent', es: 'A menudo', de: 'Oft', it: 'Spesso' } },
    { value: 'very_often', score: 4, label: { en: 'Very often', fr: 'Très souvent', es: 'Muy a menudo', de: 'Sehr oft', it: 'Molto spesso' } },
  ].map((o) => ({ ...o, zone: o.score >= zoneFrom }))

export const ASRS: AssessmentDefinition = {
  id: 'asrs',
  source: 'ASRS v1.1, partie A (OMS), six questions de repérage',
  name: { en: 'ADHD screening (ASRS, WHO)', fr: 'Dépistage TDAH (ASRS, OMS)', es: 'Cribado TDAH (ASRS, OMS)', de: 'ADHS-Screening (ASRS, WHO)', it: 'Screening ADHD (ASRS, OMS)' },
  intro: {
    en: 'Six questions from the World Health Organization screening scale. Think about the last six months, answer with your gut. This is a screening, not a diagnosis.',
    fr: 'Six questions de l’échelle de dépistage de l’Organisation mondiale de la santé. Pense aux six derniers mois, réponds à l’instinct. C’est un dépistage, pas un diagnostic.',
    es: 'Seis preguntas de la escala de cribado de la Organización Mundial de la Salud. Piensa en los últimos seis meses, responde por instinto. Es un cribado, no un diagnóstico.',
    de: 'Sechs Fragen aus der Screening-Skala der Weltgesundheitsorganisation. Denk an die letzten sechs Monate, antworte aus dem Bauch. Das ist ein Screening, keine Diagnose.',
    it: 'Sei domande della scala di screening dell’Organizzazione Mondiale della Sanità. Pensa agli ultimi sei mesi, rispondi d’istinto. È uno screening, non una diagnosi.',
  },
  questions: [
    {
      key: 'q1',
      label: {
        en: 'How often do you have trouble wrapping up the final details of a project, once the challenging parts have been done?',
        fr: 'À quelle fréquence as-tu du mal à terminer les derniers détails d’un projet, une fois les parties difficiles faites ?',
        es: '¿Con qué frecuencia te cuesta terminar los últimos detalles de un proyecto, una vez hechas las partes difíciles?',
        de: 'Wie oft fällt es dir schwer, die letzten Details eines Projekts abzuschließen, wenn die schwierigen Teile erledigt sind?',
        it: 'Quanto spesso fai fatica a finire gli ultimi dettagli di un progetto, una volta fatte le parti difficili?',
      },
      options: FREQ(2),
    },
    {
      key: 'q2',
      label: {
        en: 'How often do you have difficulty getting things in order when you have to do a task that requires organization?',
        fr: 'À quelle fréquence as-tu du mal à mettre les choses en ordre quand une tâche demande de l’organisation ?',
        es: '¿Con qué frecuencia te cuesta poner las cosas en orden cuando una tarea requiere organización?',
        de: 'Wie oft fällt es dir schwer, Ordnung in eine Aufgabe zu bringen, die Organisation erfordert?',
        it: 'Quanto spesso fai fatica a mettere le cose in ordine quando un compito richiede organizzazione?',
      },
      options: FREQ(2),
    },
    {
      key: 'q3',
      label: {
        en: 'How often do you have problems remembering appointments or obligations?',
        fr: 'À quelle fréquence oublies-tu des rendez-vous ou des obligations ?',
        es: '¿Con qué frecuencia olvidas citas u obligaciones?',
        de: 'Wie oft vergisst du Termine oder Verpflichtungen?',
        it: 'Quanto spesso dimentichi appuntamenti o impegni?',
      },
      options: FREQ(2),
    },
    {
      key: 'q4',
      label: {
        en: 'When you have a task that requires a lot of thought, how often do you avoid or delay getting started?',
        fr: 'Quand une tâche demande beaucoup de réflexion, à quelle fréquence évites-tu ou repousses-tu le moment de commencer ?',
        es: 'Cuando una tarea requiere mucha reflexión, ¿con qué frecuencia evitas o retrasas empezar?',
        de: 'Wenn eine Aufgabe viel Nachdenken erfordert, wie oft vermeidest oder verschiebst du den Anfang?',
        it: 'Quando un compito richiede molta riflessione, quanto spesso eviti o rimandi di iniziare?',
      },
      options: FREQ(3),
    },
    {
      key: 'q5',
      label: {
        en: 'How often do you fidget or squirm with your hands or feet when you have to sit down for a long time?',
        fr: 'À quelle fréquence remues-tu les mains ou les pieds quand tu dois rester assis longtemps ?',
        es: '¿Con qué frecuencia mueves las manos o los pies cuando tienes que estar sentado mucho tiempo?',
        de: 'Wie oft zappelst du mit Händen oder Füßen, wenn du lange sitzen musst?',
        it: 'Quanto spesso muovi mani o piedi quando devi stare seduto a lungo?',
      },
      options: FREQ(3),
    },
    {
      key: 'q6',
      label: {
        en: 'How often do you feel overly active and compelled to do things, like you were driven by a motor?',
        fr: 'À quelle fréquence te sens-tu trop actif, poussé à faire des choses, comme mû par un moteur ?',
        es: '¿Con qué frecuencia te sientes demasiado activo, empujado a hacer cosas, como movido por un motor?',
        de: 'Wie oft fühlst du dich übermäßig aktiv und getrieben, wie von einem Motor angetrieben?',
        it: 'Quanto spesso ti senti troppo attivo, spinto a fare cose, come mosso da un motore?',
      },
      options: FREQ(3),
    },
  ],
  levels: [
    { min: 0, id: 'low', label: { en: 'low', fr: 'faible', es: 'bajo', de: 'niedrig', it: 'basso' } },
    { min: 2, id: 'moderate', label: { en: 'moderate', fr: 'modéré', es: 'moderado', de: 'mittel', it: 'moderato' } },
    { min: 4, id: 'high', label: { en: 'high', fr: 'élevé', es: 'alto', de: 'hoch', it: 'alto' } },
  ],
  result: {
    en: 'Your answers match an adult ADHD profile at {percent} %, {level} level: {zone} of {total} answers fall in the screening range of the WHO scale. Four or more usually means it is worth talking to a doctor.',
    fr: 'Tes réponses correspondent à un profil TDAH de l’adulte à {percent} %, niveau {level} : {zone} réponses sur {total} sont dans la zone de dépistage de l’échelle de l’OMS. À partir de quatre, ça vaut le coup d’en parler à un médecin.',
    es: 'Tus respuestas coinciden con un perfil de TDAH adulto al {percent} %, nivel {level}: {zone} de {total} respuestas están en la zona de cribado de la escala de la OMS. A partir de cuatro, vale la pena hablarlo con un médico.',
    de: 'Deine Antworten passen zu {percent} % zu einem ADHS-Profil bei Erwachsenen, Stufe {level}: {zone} von {total} Antworten liegen im Screening-Bereich der WHO-Skala. Ab vier lohnt sich ein Gespräch mit einem Arzt.',
    it: 'Le tue risposte corrispondono a un profilo ADHD dell’adulto al {percent} %, livello {level}: {zone} risposte su {total} sono nella zona di screening della scala dell’OMS. Da quattro in su, vale la pena parlarne con un medico.',
  },
  disclaimer: {
    en: 'This is a screening, not a diagnosis. Only a doctor or a psychiatrist can diagnose ADHD. Amorce helps you get started either way.',
    fr: 'C’est un dépistage, pas un diagnostic. Seul un médecin ou un psychiatre peut poser un diagnostic de TDAH. Amorce t’aide à démarrer dans tous les cas.',
    es: 'Es un cribado, no un diagnóstico. Solo un médico o un psiquiatra puede diagnosticar un TDAH. Amorce te ayuda a empezar en cualquier caso.',
    de: 'Das ist ein Screening, keine Diagnose. Nur ein Arzt oder Psychiater kann ADHS diagnostizieren. Amorce hilft dir so oder so beim Anfangen.',
    it: 'È uno screening, non una diagnosi. Solo un medico o uno psichiatra può diagnosticare l’ADHD. Amorce ti aiuta a iniziare in ogni caso.',
  },
  profileKey: 'asrs',
  cooldownDays: 90,
}
