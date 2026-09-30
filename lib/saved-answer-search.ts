import type { Session } from "./interview";

function preview(answer: string, patterns: RegExp[]) {
  const text = answer.replace(/\s+/gu, " ").trim();
  const match = patterns.map((pattern) => pattern.exec(text)).find(Boolean);
  const anchor = match ? Array.from(text.slice(0, match.index)).length : 0;
  const characters = Array.from(text);
  const start = Math.max(0, anchor - 36);
  const end = Math.min(characters.length, start + 180);
  return (
    (start ? "…" : "") +
    characters.slice(start, end).join("") +
    (end < characters.length ? "…" : "")
  );
}

/** Match literal search terms across loaded questions, answers and categories. */
export function findSavedAnswers(sessions: Session[], query: string) {
  const terms = [...new Set(query.trim().split(/\s+/u).filter(Boolean))];
  // Prefer longer terms when more than one query term fits the excerpt.
  const patterns = terms
    .sort((a, b) => b.length - a.length)
    .map(
      (term) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu"),
    );
  return sessions.flatMap((session) => {
    const content = `${session.question}\n${session.answer}\n${session.category}`;
    if (!patterns.every((pattern) => pattern.test(content))) return [];
    const visibleContext = `${session.question}\n${session.category}`;
    // A term already visible in the row title/category needs less explanation
    // than one found only in the answer, possibly far beyond its opening line.
    const previewPatterns = [
      ...patterns.filter((pattern) => !pattern.test(visibleContext)),
      ...patterns.filter((pattern) => pattern.test(visibleContext)),
    ];
    return [{ session, preview: preview(session.answer, previewPatterns) }];
  });
}
