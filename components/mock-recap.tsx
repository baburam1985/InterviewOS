"use client";

import type { Session } from "../lib/interview";
import { feedbackReason } from "../lib/interview";
import { describeMockRun, type MockRun } from "../lib/mock-practice";

export function MockRecap({
  run,
  sessions,
  currentDraft,
  onReturn,
  onSelect,
  onRetry,
}: {
  run: MockRun;
  sessions: Session[];
  currentDraft: boolean;
  onReturn: () => void;
  onSelect: (session: Session) => void;
  onRetry: (session: Session) => void;
}) {
  const { rounds, savedCount, priority } = describeMockRun(run, sessions);
  const priorityNumber =
    rounds.findIndex((item) => item.session?.id === priority?.id) + 1;
  return (
    <section className="card mock-recap" aria-label="Mock interview recap">
      <span className="eyebrow">
        {run.completed ? "MOCK FINISHED" : "ENDED EARLY"}
      </span>
      <h2>Your mock recap</h2>
      <p>
        <strong>
          {savedCount} of {rounds.length} answers saved
        </strong>{" "}
        in your history.
      </p>
      {currentDraft ? (
        <div className="mock-next-step">
          <h3>Keep your current answer</h3>
          <p>
            Your latest answer has unsaved changes. Return to it to review and
            save.
          </p>
          <button className="primary" onClick={onReturn}>
            Continue current answer
          </button>
        </div>
      ) : priority ? (
        <div className="mock-next-step">
          <h3>One thing to practice next</h3>
          <p>{priority.review.next}</p>
          <p className="micro-copy">
            From saved answer {priorityNumber}.{" "}
            {feedbackReason(priority.review)}
          </p>
          <button className="primary" onClick={() => onRetry(priority)}>
            Practice this next
          </button>
        </div>
      ) : (
        <p>
          No saved answers from this mock to review yet. Return to practice when
          you’re ready.
        </p>
      )}
      <ol className="mock-round-list">
        {rounds.map((item) => (
          <li key={item.index}>
            <div>
              <strong>
                Question {item.index + 1}: {item.question}
              </strong>
              <span className="mock-round-status">{item.status}</span>
              {item.session && item.unsavedChanges && (
                <small>
                  A saved version is available. Later changes were not saved.
                </small>
              )}
            </div>
            {item.session && (
              <button
                onClick={() => onSelect(item.session!)}
                aria-label={`View saved answer ${item.index + 1}`}
              >
                View answer
              </button>
            )}
          </li>
        ))}
      </ol>
      {!currentDraft && (
        <button className="text-button" onClick={onReturn}>
          Return to practice
        </button>
      )}
      <p className="micro-copy">
        This recap stays for this visit until you start another mock or reload.
        Saved answers remain in your history. Suggestions check answer
        structure, not correctness or hiring readiness.
      </p>
    </section>
  );
}
