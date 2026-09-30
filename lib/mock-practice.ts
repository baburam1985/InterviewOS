import type { Session } from "./interview";

type MockRound = {
  question: string;
  category: string;
  visited: boolean;
  answered: boolean;
  skipped: boolean;
  sessionId?: string;
  unsavedChanges: boolean;
};

export type MockRun = {
  rounds: MockRound[];
  index: number;
  ended: boolean;
  completed: boolean;
  activeAnswer: boolean;
};

export function beginMockRun(
  questions: { text: string; category: string }[],
): MockRun {
  return {
    rounds: questions.map((q, index) => ({
      question: q.text,
      category: q.category,
      visited: index === 0,
      answered: false,
      skipped: false,
      unsavedChanges: false,
    })),
    index: 0,
    ended: false,
    completed: false,
    activeAnswer: true,
  };
}

export function captureMockAnswer(
  run: MockRun,
  answer: string,
  savedId: string,
): MockRun {
  if (!run.activeAnswer) return run;
  return {
    ...run,
    rounds: run.rounds.map((item, index) =>
      index === run.index
        ? {
            ...item,
            visited: true,
            answered: !!answer.trim(),
            unsavedChanges: !!item.sessionId && item.sessionId !== savedId,
          }
        : item,
    ),
  };
}

export function advanceMockRun(run: MockRun): MockRun {
  return {
    ...run,
    index: run.index + 1,
    rounds: run.rounds.map((item, index) =>
      index === run.index
        ? { ...item, skipped: !item.answered && !item.sessionId }
        : index === run.index + 1
          ? { ...item, visited: true }
          : item,
    ),
  };
}

export function endMockRun(
  run: MockRun,
  completed: boolean,
  keepCurrent = true,
): MockRun {
  return {
    ...run,
    ended: true,
    completed: run.ended ? run.completed : completed,
    activeAnswer: keepCurrent,
    rounds: run.rounds.map((item, index) =>
      completed && index === run.index
        ? { ...item, skipped: !item.answered && !item.sessionId }
        : item,
    ),
  };
}

export function recordMockSave(run: MockRun, session: Session): MockRun {
  const current = run.rounds[run.index];
  if (
    !run.activeAnswer ||
    current?.question !== session.question ||
    current.category !== session.category
  )
    return run;
  return {
    ...run,
    rounds: run.rounds.map((item, index) =>
      index === run.index
        ? {
            ...item,
            answered: true,
            skipped: false,
            sessionId: session.id,
            unsavedChanges: false,
          }
        : item,
    ),
  };
}

export function describeMockRun(run: MockRun, sessions: Session[]) {
  const rounds = run.rounds.map((item, index) => {
    const session = sessions.find(
      (s) =>
        s.id === item.sessionId &&
        s.question === item.question &&
        s.category === item.category,
    );
    const status = session
      ? "Saved"
      : item.sessionId
        ? "Saved answer unavailable"
        : !item.visited
          ? "Not reached"
          : item.answered
            ? "Not saved"
            : item.skipped
              ? "Skipped"
              : "Not answered";
    return { ...item, index, session, status };
  });
  const saved = rounds.flatMap((item) => (item.session ? [item.session] : []));
  const priority =
    saved.find((session) =>
      session.review.checks.some((check) => !check.pass),
    ) ?? saved[0];
  return { rounds, savedCount: saved.length, priority };
}
