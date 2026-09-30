import { reviewCheckEvidence } from "../lib/review-evidence";
import type { Review } from "../lib/interview";

export function CheckEvidence({
  answer,
  category,
  check,
}: {
  answer: string;
  category: string;
  check: Review["checks"][number];
}) {
  const evidence = reviewCheckEvidence(answer, category, check);
  if (evidence.kind === "match")
    return (
      <div className="check-evidence">
        <p>
          Matched text: <q>{evidence.matched}</q>
        </p>
        <p className="check-excerpt">
          {evidence.before}
          <mark>{evidence.matched}</mark>
          {evidence.after}
        </p>
      </div>
    );
  return (
    <p className="check-evidence">
      {evidence.kind === "length"
        ? `${evidence.words} words. This built-in rule uses a 60–300 word range; the right length depends on the question.`
        : evidence.kind === "unmatched"
          ? "No configured keyword or phrase matched. This rule may miss relevant details in your answer."
          : "An explanation for this saved check is unavailable with the current rules."}
    </p>
  );
}
