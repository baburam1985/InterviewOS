import type { Session } from "./interview";

/** Compare only separate records with the same prompt and an earlier save time. */
export function earlierSavedAnswer(selected: Session, sessions: Session[]) {
  const selectedTime = Date.parse(selected.createdAt);
  let earlier: Session | null = null;
  let earlierTime = -Infinity;
  for (const session of sessions) {
    const savedTime = Date.parse(session.createdAt);
    if (
      session.id === selected.id ||
      session.category !== selected.category ||
      session.question.trim() !== selected.question.trim() ||
      !Number.isFinite(savedTime) ||
      !(savedTime < selectedTime)
    )
      continue;
    if (
      savedTime > earlierTime ||
      (savedTime === earlierTime && earlier && session.id < earlier.id)
    ) {
      earlier = session;
      earlierTime = savedTime;
    }
  }
  return earlier;
}

export function answerWordCount(answer: string) {
  return answer.trim() ? answer.trim().split(/\s+/u).length : 0;
}
