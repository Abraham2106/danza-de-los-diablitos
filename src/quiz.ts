/**
 * "El reto": the class activity, split in three sections of four photographs.
 * Seeing a section's four photographs unlocks its two questions; difficulty and points rise
 * with the section. Everything here is pure so a future online ranking can reuse it.
 */
export type Level = 1 | 2 | 3;

export interface Section {
  name: string;
  level: Level;
  levelName: string;
  /** Points multiplier: later sections are harder and worth more. */
  multiplier: number;
  photos: string[];
}

export const SECTIONS: Section[] = [
  {name: 'Los rostros', level: 1, levelName: 'Fácil', multiplier: 1, photos: ['art-001', 'art-002', 'art-003', 'art-004']},
  {name: 'El recorrido', level: 2, levelName: 'Intermedio', multiplier: 1.5, photos: ['art-005', 'art-006', 'art-007', 'art-008']},
  {name: 'El toro y el fuego', level: 3, levelName: 'Difícil', multiplier: 2, photos: ['art-009', 'art-010', 'art-011', 'art-012']},
];

export interface Question {
  section: number;
  prompt: string;
  /** Exhibition image that frames the question. */
  image: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  /** Short explanation shown after answering. */
  why: string;
}

/** Reading time before the options appear (skippable); the answer clock starts only after it. */
export const READ_TIME = 5_000;
export const QUESTION_TIME = 20_000;
export const MAX_POINTS = 1000;

export const QUESTIONS: Question[] = [
  {section: 0, prompt: 'En el baile, ¿a quiénes representa el toro?', image: 'artworks/art-001.jpg',
    options: ['Al pueblo Boruca', 'A los conquistadores', 'A los músicos', 'A los artesanos'], answer: 1,
    why: 'El toro encarna a los conquistadores; los diablitos, al pueblo Boruca.'},
  {section: 0, prompt: '¿Qué animales aparecen en las máscaras?', image: 'artworks/art-003.jpg',
    options: ['Leones y tigres', 'Caballos y vacas', 'Jaguares, culebras y aves', 'Peces y ballenas'], answer: 2,
    why: 'Hay culebras, jaguares, aves y calaveras, y cada año los artesanos buscan diseños más originales.'},
  {section: 1, prompt: 'Además de máscaras y plumas, ¿qué visten los participantes?', image: 'artworks/art-005.jpg',
    options: ['Seda y terciopelo', 'Gangoche y hojas de plátano', 'Cuero y lana', 'Redes de pesca'], answer: 1,
    why: 'Visten gangoche, una tela de saco, y hojas de plátano, además de la pintura corporal.'},
  {section: 1, prompt: '¿Cuál de estos NO acompaña la música del baile?', image: 'artworks/art-008.jpg',
    options: ['La flauta', 'El tambor', 'El caracol', 'La guitarra'], answer: 3,
    why: 'Suenan flautas, tambores, cuernos y caracoles. La guitarra no forma parte del baile.'},
  {section: 2, prompt: 'El toro, al que también llaman Xaman, ¿de qué está hecho y cuánto pesa?', image: 'artworks/art-010.jpg',
    options: ['Madera y gangoche; unos 40 kilos', 'Cuero y paja; unos 10 kilos', 'Madera y seda; unos 100 kilos', 'Barro y paja; unos 40 kilos'], answer: 0,
    why: 'Es una estructura de madera cubierta con gangoche. Pesa unos 40 kilos, por eso varios participantes se turnan.'},
  {section: 2, prompt: 'Después de La Tumbazón, ¿qué hacen los diablitos?', image: 'artworks/art-011.jpg',
    options: ['Se retiran sin terminar la ceremonia', 'Comparten chicha y se van a casa', 'Queman al toro de inmediato', 'Se levantan, buscan al toro y lo llevan hacia el cierre'], answer: 3,
    why: 'Caen, pero se levantan, buscan al toro y lo llevan al cierre. La quema llega después, como final de la fiesta.'},
];

export const SECTION_SIZE = 4;

export const questionsOf = (section: number): number[] =>
  QUESTIONS.flatMap((q, i) => (q.section === section ? [i] : []));

export const sectionOfPhoto = (id: string): number => SECTIONS.findIndex(s => s.photos.includes(id));

export const seenInSection = (section: number, seen: ReadonlySet<string>): number =>
  SECTIONS[section].photos.filter(id => seen.has(id)).length;

/** A section unlocks its questions once every one of its photographs has been opened. */
export const isUnlocked = (section: number, seen: ReadonlySet<string>): boolean =>
  seenInSection(section, seen) === SECTIONS[section].photos.length;

export interface Answer {
  question: number;
  correct: boolean;
  /** Milliseconds from the options appearing to the answer. */
  ms: number;
  /** 0–1: how much of the answer time was left. */
  speed: number;
  points: number;
}
export type Answers = Record<number, Answer>;

/** Fraction of the answer time left (1 = instant, 0 = ran out). */
export function speedOf(elapsedMs: number, totalMs = QUESTION_TIME): number {
  return Math.min(1, Math.max(0, 1 - elapsedMs / totalMs));
}

/** Correct answers earn between 50 % and 100 % of the section's points depending on speed; wrong ones, nothing. */
export function scoreAnswer(correct: boolean, elapsedMs: number, multiplier = 1, totalMs = QUESTION_TIME): number {
  if (!correct) return 0;
  return Math.round(MAX_POINTS * multiplier * (0.5 + 0.5 * speedOf(elapsedMs, totalMs)));
}

export function makeAnswer(question: number, choice: number, elapsedMs: number): Answer {
  const q = QUESTIONS[question];
  const correct = choice === q.answer;
  const ms = choice < 0 ? QUESTION_TIME : Math.min(QUESTION_TIME, Math.max(0, elapsedMs));
  return {question, correct, ms, speed: choice < 0 ? 0 : speedOf(ms),
    points: scoreAnswer(correct, ms, SECTIONS[q.section].multiplier)};
}

export const pendingQuestions = (section: number, answers: Answers): number[] =>
  questionsOf(section).filter(i => !answers[i]);

export interface Summary {
  points: number;
  answered: number;
  correct: number;
  /** Average speed of the answers, 0–1. */
  avgSpeed: number;
  /** What an online ranking needs: how many questions of each difficulty were answered. */
  byLevel: Record<Level, {answered: number; correct: number; points: number}>;
}

export function summarize(answers: Answers): Summary {
  const byLevel: Summary['byLevel'] = {1: {answered: 0, correct: 0, points: 0}, 2: {answered: 0, correct: 0, points: 0}, 3: {answered: 0, correct: 0, points: 0}};
  let points = 0, answered = 0, correct = 0, speed = 0;
  for (const answer of Object.values(answers)) {
    const level = SECTIONS[QUESTIONS[answer.question].section].level;
    answered++; points += answer.points; speed += answer.speed;
    byLevel[level].answered++; byLevel[level].points += answer.points;
    if (answer.correct) { correct++; byLevel[level].correct++; }
  }
  return {points, answered, correct, avgSpeed: answered ? speed / answered : 0, byLevel};
}

export function verdict(correct: number, total: number): string {
  const ratio = total ? correct / total : 0;
  if (ratio === 1) return 'Diablito mayor';
  if (ratio >= .65) return 'Guardián de la máscara';
  if (ratio >= .4) return 'Aprendiz del baile';
  return 'Visitante del pueblo';
}
