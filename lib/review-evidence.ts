import { keywordRules, type Review } from "./interview";

type CheckEvidence =
  | { kind: "match"; before: string; matched: string; after: string }
  | { kind: "unmatched" }
  | { kind: "length"; words: number }
  | { kind: "unavailable" };

/** Describe the same rule without treating a phrase as proof of answer quality. */
export function reviewCheckEvidence(
  answer: string,
  category: string,
  check: Review["checks"][number],
): CheckEvidence {
  if (check.label === "Keeps a useful length") {
    const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
    return check.pass === (words >= 60 && words <= 300)
      ? { kind: "length", words }
      : { kind: "unavailable" };
  }
  const rule = keywordRules(category).find(
    (rule) => rule.label === check.label,
  );
  if (!rule) return { kind: "unavailable" };
  const match = rule.pattern.exec(answer);
  if (!!match !== check.pass) return { kind: "unavailable" };
  if (!match) return { kind: "unmatched" };
  // Collapse display whitespace and cut by code point so a bounded excerpt
  // never splits a surrogate pair. The stored answer and the matched rule stay intact.
  const before = Array.from(answer.slice(0, match.index).replace(/\s+/g, " "));
  const after = Array.from(
    answer.slice(match.index + match[0].length).replace(/\s+/g, " "),
  );
  return {
    kind: "match",
    before: (before.length > 45 ? "…" : "") + before.slice(-45).join(""),
    matched: match[0].replace(/\s+/g, " "),
    after: after.slice(0, 75).join("") + (after.length > 75 ? "…" : ""),
  };
}
