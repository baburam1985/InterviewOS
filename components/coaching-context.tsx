import type {
  CoachingContextChoices,
  coachingRequest,
} from "../lib/coaching-context";

type Request = ReturnType<typeof coachingRequest>;
export function CoachingContext({
  choices,
  request,
  storyCount,
  busy,
  onChange,
}: {
  choices: CoachingContextChoices;
  request: Request;
  storyCount: number;
  busy: boolean;
  onChange: (value: CoachingContextChoices) => void;
}) {
  return (
    <fieldset className="ai-context" disabled={busy}>
      <legend>Choose what to share</legend>
      <p className="micro-copy">
        Your question, answer and interview type go to OpenAI when you request
        coaching. Extra context is optional.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={choices.profile}
          onChange={(event) =>
            onChange({ ...choices, profile: event.target.checked })
          }
        />
        Include my role, company, resume and job description
      </label>
      <p className="micro-copy">
        Uses the current profile fields, including unsaved edits.
      </p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={choices.stories}
          disabled={busy || storyCount === 0}
          onChange={(event) =>
            onChange({ ...choices, stories: event.target.checked })
          }
        />
        Include up to five saved stories
      </label>
      <p className="micro-copy">
        {storyCount
          ? `Uses the first ${Math.min(5, storyCount)} currently listed in Story library. Review them below.`
          : "No saved stories to include."}
      </p>
      <details className="ai-context-preview">
        <summary>Review request contents</summary>
        <div
          className="ai-context-contents"
          role="region"
          aria-label="AI request contents"
          tabIndex={0}
        >
          <h4>Interview type</h4>
          <p>{request.category}</p>
          <h4>Question</h4>
          <p>{request.question}</p>
          <h4>Your answer</h4>
          <p>
            {request.answer || "No answer yet; coaching will use the question."}
          </p>
          {choices.profile ? (
            <>
              <h4>Role</h4>
              <p>{request.profile.role || "Not provided"}</p>
              <h4>Company</h4>
              <p>{request.profile.company || "Not provided"}</p>
              <h4>Resume or experience notes</h4>
              <p>{request.profile.resume || "Not provided"}</p>
              <h4>Job description</h4>
              <p>{request.profile.job || "Not provided"}</p>
            </>
          ) : (
            <p>Profile fields are not included.</p>
          )}
          {request.stories.length ? (
            request.stories.map((story, index) => (
              <section key={index} aria-label={`Included story ${index + 1}`}>
                <h4>
                  Story {index + 1}: {story.title}
                </h4>
                <p>
                  <strong>Situation:</strong>{" "}
                  {story.situation || "Not provided"}
                </p>
                <p>
                  <strong>Task:</strong> {story.task || "Not provided"}
                </p>
                <p>
                  <strong>Action:</strong> {story.action || "Not provided"}
                </p>
                <p>
                  <strong>Result:</strong> {story.result || "Not provided"}
                </p>
              </section>
            ))
          ) : (
            <p>Saved stories are not included.</p>
          )}
        </div>
      </details>
      <p className="micro-copy">
        These choices last for this visit. Turning AI off clears them. Built-in
        feedback does not send your context to an AI provider.
      </p>
    </fieldset>
  );
}
