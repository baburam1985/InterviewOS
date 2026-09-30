import type { Review } from "../lib/interview";
import { feedbackHelp } from "../lib/feedback-help";

export function FeedbackHelp({
  review,
  category,
}: {
  review: Review;
  category: string;
}) {
  const help = feedbackHelp(review, category);
  return (
    <details className="quick-details feedback-help">
      <summary>Help me with this step</summary>
      <h3>{help.title}</h3>
      <p className="feedback-help-prompt">{help.prompt}</p>
      <p className="micro-copy">
        {help.title === "Sentence starter"
          ? category === "Technical" || category === "System design"
            ? "Fill the brackets with an example or assumptions you can explain. Label hypothetical scenarios clearly."
            : "Fill the brackets with your own real details, or adapt the structure to fit your answer."
          : "Use your own details and keep only claims you can support."}{" "}
        Check that your revised answer is accurate and answers the question.
      </p>
    </details>
  );
}
