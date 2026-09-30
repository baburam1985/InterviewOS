import type { Session } from "./interview";

function sameAnswer(left: Session, right: Session) {
  return (
    left.id === right.id &&
    left.question.trim() === right.question.trim() &&
    left.category === right.category &&
    left.answer === right.answer &&
    left.seconds === right.seconds &&
    (left.ai ?? "") === (right.ai ?? "")
  );
}

/** A fresh different version must not become the target of this tab's next save. */
export function answerChangedOnRefresh(
  sessions: Session[],
  attemptId: string,
  confirmed: Session | null,
  attempted: Session[],
) {
  if (!attemptId) return false;
  const known = [confirmed, ...attempted].filter(
    (value): value is Session => !!value && value.id === attemptId,
  );
  const refreshed = sessions.find((session) => session.id === attemptId);
  // A missing record does not prove a competing version exists. Keep ordinary
  // same-ID retry behavior, including uncertain writes, until one is observed.
  if (!refreshed || !known.length) return false;
  // A previous write may have committed even when its response was lost.
  // Matching that attempted payload must not turn its retry into a duplicate.
  return !known.some((value) => sameAnswer(value, refreshed));
}

/** Retain distinct unconfirmed payloads for this attempt until a save succeeds. */
export function rememberAnswerAttempt(attempts: Session[], next: Session) {
  return attempts.some((attempt) => sameAnswer(attempt, next))
    ? attempts
    : [...attempts, next];
}
