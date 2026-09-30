import { useId } from "react";
import type { Session } from "../lib/interview";
import { answerWordCount, earlierSavedAnswer } from "../lib/answer-comparison";

export function AnswerComparison({
  selected,
  sessions,
}: {
  selected: Session;
  sessions: Session[];
}) {
  const id = useId();
  const earlier = earlierSavedAnswer(selected, sessions);
  if (!earlier) return null;

  return (
    <details className="quick-details answer-comparison">
      <summary>Compare with an earlier answer</summary>
      <p className="micro-copy">
        The most recent earlier save for this question and interview type.
        Editing a saved answer updates its save time; this is not a complete
        version history.
      </p>
      {earlier.answer === selected.answer ? (
        <p>The answer text is unchanged between these two saves.</p>
      ) : (
        <p>
          Which answer explains your thinking more clearly? Look for specific
          details you want to keep in your next practice.
        </p>
      )}
      <div className="answer-comparison-grid">
        {[
          {
            session: earlier,
            title: "Earlier saved answer",
            suffix: "earlier",
          },
          {
            session: selected,
            title: "Selected saved answer",
            suffix: "selected",
          },
        ].map(({ session, title, suffix }) => (
          <section key={suffix} className="answer-comparison-item">
            <h3 id={`${id}-${suffix}`}>{title}</h3>
            <p className="micro-copy">
              Saved{" "}
              <time dateTime={session.createdAt}>
                {new Date(session.createdAt).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "medium",
                })}
              </time>
              <br />
              {answerWordCount(session.answer)} words
            </p>
            <div
              className="comparison-answer-text"
              role="region"
              aria-labelledby={`${id}-${suffix}`}
              tabIndex={0}
            >
              {session.answer}
            </div>
          </section>
        ))}
      </div>
      <p className="micro-copy">
        Word counts use whitespace. A longer answer or more keyword matches does
        not necessarily mean a better answer. Comparing does not change or save
        either answer.
      </p>
    </details>
  );
}
