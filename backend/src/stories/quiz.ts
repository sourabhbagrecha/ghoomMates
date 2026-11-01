import type { QuizQuestion } from './types.ts';

export type Grade = 'gold' | 'silver' | 'bronze';

export type QuizResult = {
  score: number;
  total: number;
  /** Per question: whether it was right, and the right answer to show */
  results: { correct: boolean; answerIndex: number }[];
  grade: Grade;
};

/** The seal's finish: gold for a perfect round, silver for most, bronze for finishing */
export const gradeFor = (score: number, total: number): Grade => (score >= total ? 'gold' : score * 2 >= total ? 'silver' : 'bronze');

/** Scores the answers the player gave (one index per question; anything missing or out of range is wrong) */
export function scoreQuiz(quiz: QuizQuestion[], answers: unknown[]): QuizResult {
  const results = quiz.map((q, i) => ({ correct: answers[i] === q.answerIndex, answerIndex: q.answerIndex }));
  const score = results.filter(r => r.correct).length;
  return { score, total: quiz.length, results, grade: gradeFor(score, quiz.length) };
}

/**
 * Moves each right answer to a position that depends on the question, so Gemini's habit of putting it first doesn't
 * show. Deterministic, so a cached story always scores the same way.
 */
export function shuffleQuiz(quiz: QuizQuestion[], seed: string): QuizQuestion[] {
  return quiz.map((q, i) => {
    let hash = 7;
    for (const ch of `${seed}:${i}:${q.question}`) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const target = hash % q.options.length;
    const options = q.options.filter((_, at) => at !== q.answerIndex);
    options.splice(target, 0, q.options[q.answerIndex]);
    return { ...q, options, answerIndex: target };
  });
}
