"use client";

import { useEffect, useRef } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  Mic,
  Play,
  RotateCcw,
  Square,
  Volume2,
} from "lucide-react";
import type { Review, Session } from "../lib/interview";
import { feedbackReason } from "../lib/interview";

export const practiceGoals = [
  {
    category: "Recruiter",
    title: "Introduce myself",
    description: "A common opening question",
  },
  {
    category: "Behavioral",
    title: "Tell a work story",
    description: "A project, challenge, or achievement",
  },
  {
    category: "Technical",
    title: "Explain a solution",
    description: "Your approach to a technical problem",
  },
  {
    category: "Negotiation",
    title: "Discuss an offer",
    description: "A clear, respectful conversation",
  },
];

type Props = {
  started: boolean;
  canSave: boolean;
  canResume: boolean;
  onResume: () => void;
  goal: string;
  onGoal: (goal: string) => void;
  onStart: () => void;
  question: string;
  category: string;
  answer: string;
  onAnswer: (answer: string) => void;
  review: Review | null;
  saved: boolean;
  busy: boolean;
  listening: boolean;
  interim: string;
  language: string;
  onLanguage: (language: string) => void;
  onListen: () => void;
  onSpeak: () => void;
  onReview: () => void;
  onRetry: () => void;
  onNext: () => void;
  onChooseGoal: () => void;
  onAdvanced: () => void;
  onExport: () => void;
  focus: string;
  detailedReview: React.ReactNode;
  guidance: string[];
};

export function QuickPractice(props: Props) {
  const answerInput = useRef<HTMLTextAreaElement>(null);
  const feedbackHeading = useRef<HTMLHeadingElement>(null);
  const hasReview = !!props.review;
  useEffect(() => {
    if (hasReview) feedbackHeading.current?.focus({ preventScroll: true });
    else if (props.started) answerInput.current?.focus({ preventScroll: true });
  }, [props.started, hasReview]);
  if (!props.started)
    return (
      <section className="quick-welcome" aria-label="Start a practice">
        <div className="quick-intro">
          <span className="eyebrow">ONE QUESTION. ONE USEFUL NEXT STEP.</span>
          <h1>Your next great answer.</h1>
          <p>A little practice can make it easier to say what you mean.</p>
        </div>
        <div className="card quick-start-card">
          <h2>What would you like to practice?</h2>
          <p className="muted">Pick a goal, or keep the selected one.</p>
          <div
            className="quick-goals"
            role="radiogroup"
            aria-label="Practice goal"
          >
            {practiceGoals.map((goal) => (
              <label
                key={goal.category}
                className={props.goal === goal.category ? "chosen" : ""}
              >
                <input
                  type="radio"
                  name="practice-goal"
                  value={goal.category}
                  checked={props.goal === goal.category}
                  onChange={() => props.onGoal(goal.category)}
                />
                <span>
                  <strong>{goal.title}</strong>
                  <small>{goal.description}</small>
                </span>
              </label>
            ))}
          </div>
          <button className="primary quick-primary" onClick={props.onStart}>
            Start practicing <ArrowRight size={18} />
          </button>
          {props.canResume && (
            <button className="text-button full" onClick={props.onResume}>
              Resume current answer
            </button>
          )}
          <p className="quick-reassurance">
            About 3 minutes · Type your answer · Built-in feedback
          </p>
        </div>
        <p className="quick-optional">
          Want mock interviews, your story library, or more controls?{" "}
          <button className="text-button" onClick={props.onAdvanced}>
            Explore Advanced workspace
          </button>
        </p>
      </section>
    );

  if (props.review)
    return (
      <section className="quick-session" aria-label="Your feedback">
        <div className="quick-intro">
          <span className="eyebrow">A SMALL STEP FORWARD</span>
          <h1 ref={feedbackHeading} tabIndex={-1}>
            Your next practice step.
          </h1>
        </div>
        <div className="card quick-feedback">
          <p className="quick-saved" aria-live="polite">
            {props.busy ? (
              "Saving your answer…"
            ) : props.saved ? (
              <>
                <Check size={16} /> Saved to your history
              </>
            ) : (
              "Not saved yet. You can export this answer below."
            )}
          </p>
          <h2>One thing to try</h2>
          <p className="quick-next-step">{props.review.next}</p>
          <p className="muted quick-feedback-reason">
            {feedbackReason(props.review)}
          </p>
          {!props.saved && props.canSave && (
            <button className="primary quick-primary" onClick={props.onReview}>
              Retry saving answer <Check size={17} />
            </button>
          )}
          <button
            className={
              !props.saved && props.canSave
                ? "text-button quick-next-question"
                : "primary quick-primary"
            }
            onClick={props.onRetry}
          >
            Try again <RotateCcw size={17} />
          </button>
          <button
            className="text-button quick-next-question"
            onClick={props.onNext}
          >
            Practice another question <ChevronRight size={16} />
          </button>
          <details className="quick-details">
            <summary>Your question and answer</summary>
            <h3>{props.question}</h3>
            <p className="saved-answer">{props.answer}</p>
            <button onClick={props.onExport}>
              <Download size={15} />
              Export answer
            </button>
          </details>
          <details className="quick-details">
            <summary>See detailed feedback</summary>
            {props.detailedReview}
          </details>
          <p className="micro-copy">
            Built-in feedback checks English answer structure. It doesn’t judge
            correctness or predict hiring outcomes.
          </p>
        </div>
        <button className="text-button" onClick={props.onChooseGoal}>
          Choose a different practice goal
        </button>
      </section>
    );

  return (
    <section className="quick-session" aria-label="Practice one answer">
      <div className="quick-stage">
        <span>ONE QUESTION AT A TIME</span>
        <button className="text-button" onClick={props.onChooseGoal}>
          Change goal
        </button>
      </div>
      <div className="card quick-answer-card">
        <h1 className="quick-question">{props.question}</h1>
        {props.focus ? (
          <div className="quick-focus">
            <strong>Focus for this attempt</strong>
            <p>{props.focus}</p>
            <small>Make one change, then get feedback again.</small>
          </div>
        ) : (
          <p className="muted">
            A few sentences are enough to get started. Use your own experience.
          </p>
        )}
        <label htmlFor="quick-answer">Your answer</label>
        <textarea
          ref={answerInput}
          id="quick-answer"
          value={props.answer}
          maxLength={30000}
          disabled={props.listening}
          onChange={(e) => props.onAnswer(e.target.value)}
          placeholder={
            props.category === "Technical" || props.category === "System design"
              ? "Talk through your approach and how you would test it…"
              : "What would you say? Start anywhere…"
          }
        />
        {props.listening && (
          <div className="quick-recording">
            <span className="interim" aria-live="polite">
              {props.interim || "Listening…"}
            </span>
            <button className="recording" onClick={props.onListen}>
              <Square size={16} />
              Stop microphone
            </button>
          </div>
        )}
        <div className="quick-answer-actions">
          <button
            className="primary quick-primary"
            disabled={!props.answer.trim() || props.busy || props.listening}
            onClick={props.onReview}
          >
            {props.busy ? "Saving…" : "Get feedback"}
            <ArrowRight size={17} />
          </button>
          <span className="micro-copy">
            You can edit your answer before continuing.
          </span>
        </div>
        <details className="quick-details">
          <summary>More options</summary>
          <div className="actions">
            {!props.listening && (
              <button onClick={props.onListen}>
                <Mic size={16} />
                Speak your answer
              </button>
            )}
            <button disabled={props.listening} onClick={props.onSpeak}>
              <Volume2 size={16} />
              Read question aloud
            </button>
          </div>
          <label htmlFor="quick-language">Speech language</label>
          <select
            id="quick-language"
            value={props.language}
            disabled={props.listening}
            onChange={(e) => props.onLanguage(e.target.value)}
          >
            <option value="en-US">English</option>
            <option value="es-ES">Español</option>
            <option value="fr-FR">Français</option>
            <option value="de-DE">Deutsch</option>
            <option value="hi-IN">हिन्दी</option>
            <option value="ja-JP">日本語</option>
          </select>
          <p className="micro-copy">
            Your browser may send audio to its speech service. Microphone access
            starts only when you choose it. This app saves transcripts when you
            get feedback while signed in.
          </p>
          <details className="quick-details">
            <summary>Help me structure my answer</summary>
            <ol>
              {props.guidance.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </details>
          {props.answer && (
            <button onClick={props.onExport}>
              <Download size={15} />
              Export answer
            </button>
          )}
          <button className="text-button" onClick={props.onAdvanced}>
            Open Advanced workspace for role context, custom questions, timers,
            and optional AI
          </button>
        </details>
      </div>
    </section>
  );
}

export function QuickHistory({
  canSave,
  signedIn,
  sessions,
  selected,
  onSelect,
  onBack,
  onRetry,
  onExport,
  onDelete,
  onPractice,
  detailedReview,
  recap,
}: {
  canSave: boolean;
  signedIn: boolean;
  sessions: Session[];
  selected: Session | null;
  onSelect: (session: Session) => void;
  onBack: () => void;
  onRetry: (session: Session) => void;
  onExport: (session: Session) => void;
  onDelete: (session: Session) => void;
  onPractice: () => void;
  detailedReview: React.ReactNode;
  recap?: React.ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const detail = useRef<HTMLDivElement>(null);
  const answerButtons = useRef(new Map<string, HTMLButtonElement>());
  const lastSelectedId = useRef<string | null>(null);
  const selectedId = selected?.id;
  useEffect(() => {
    if (selectedId) {
      lastSelectedId.current = selectedId;
      detail.current?.focus({ preventScroll: true });
      detail.current?.scrollIntoView({ block: "start" });
    } else {
      const previous = lastSelectedId.current
        ? answerButtons.current.get(lastSelectedId.current)
        : null;
      (previous ?? heading.current)?.focus();
    }
  }, [selectedId]);

  const savedTime = (session: Session) => (
    <time dateTime={session.createdAt}>
      {new Date(session.createdAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "medium",
      })}
    </time>
  );

  return (
    <section className="quick-session">
      <div className="quick-intro">
        <span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span>
        <h1 ref={heading} tabIndex={-1}>
          Your saved answers.
        </h1>
        <p>
          {selected
            ? "Read your answer, then choose one thing to practice."
            : "Choose an answer to revisit or practice again."}
        </p>
      </div>
      {!selected && recap}
      {selected ? (
        <div
          className="card quick-answer-detail"
          id="saved-answer-detail"
          ref={detail}
          tabIndex={-1}
          role="region"
          aria-labelledby="saved-answer-question"
        >
          <button className="text-button history-back" onClick={onBack}>
            <ChevronRight
              size={16}
              aria-hidden="true"
              className="back-chevron"
            />{" "}
            Back to saved answers
          </button>
          <p className="quick-saved">
            <Check size={16} /> Saved {savedTime(selected)}
          </p>
          <h2 id="saved-answer-question">{selected.question}</h2>
          <h3>One thing to try</h3>
          <p className="quick-next-step">{selected.review.next}</p>
          <p className="muted quick-feedback-reason">
            {feedbackReason(selected.review)}
          </p>
          <button
            className="primary quick-primary"
            onClick={() => onRetry(selected)}
          >
            Practice this question again <RotateCcw size={17} />
          </button>
          <details className="quick-details" open>
            <summary>Your saved answer</summary>
            <p className="saved-answer">{selected.answer}</p>
          </details>
          <details className="quick-details">
            <summary>See detailed feedback</summary>
            {detailedReview}
          </details>
          <div className="actions">
            <button onClick={() => onExport(selected)}>
              <Download size={15} /> Export review
            </button>
            <button onClick={() => onDelete(selected)}>Delete answer</button>
          </div>
        </div>
      ) : !sessions.length ? (
        <div className="card quick-empty">
          <Play size={28} />
          <h2>
            {canSave
              ? "Your first answer starts here."
              : "Your history isn’t loaded yet."}
          </h2>
          <p>
            {canSave
              ? "Get feedback on a practice answer to save it to your history."
              : signedIn
                ? "Retry loading your workspace above to see saved answers. You can keep practicing in the meantime."
                : "You can practice and get feedback now. Sign in to keep saved history."}
          </p>
          <button className="primary" onClick={onPractice}>
            Start practicing <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <div className="quick-history-list" aria-label="Saved answers">
          {sessions.map((session) => (
            <button
              key={session.id}
              ref={(button) => {
                if (button) answerButtons.current.set(session.id, button);
                else answerButtons.current.delete(session.id);
              }}
              onClick={() => onSelect(session)}
            >
              <span>
                <strong>{session.question}</strong>
                <small>
                  Saved {savedTime(session)} · {session.category}
                </small>
              </span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
