import type { Review } from "./interview";

type FeedbackHelp = {
  title: "Sentence starter" | "Editing prompt" | "Rehearsal prompt";
  prompt: string;
};

// These are optional structures, never generated claims about the user's work.
const starters: Record<string, string> = {
  "Sets the scene":
    "During [a real situation], we needed to [the goal or problem].",
  "Shows ownership":
    "I was responsible for [your part]. I [an action you took] because [your reason].",
  "Explains actions":
    "First, I [an action]. Then, I [the next action], because [your reasoning].",
  "Shows an outcome":
    "As a result, [what changed]. I learned [a lesson from that experience].",
  "Gives relevant context":
    "My background in [a relevant area] includes [experience that matters for this conversation].",
  "Explains motivation":
    "I am interested in [the work or team characteristic] because [your real reason].",
  "Connects to the opportunity":
    "One connection I see is between [something about this opportunity] and my experience with [a real example].",
  "Uses a specific example":
    "For example, in [a real situation], I [your action], which led to [an outcome you can support].",
  "Keeps a collaborative tone":
    "Thank you for [the opportunity or discussion]. I am excited about [what genuinely interests you].",
  "Explains priorities":
    "[A term or condition] matters to me because [your reason]. My request is based on [evidence you can support].",
  "Makes a clear request":
    "Would you consider [your specific request]? I would be glad to discuss [an option you could accept].",
  "Agrees on next steps":
    "Could we [a next action] by [a realistic time]? Please let me know [what you need to clarify].",
  "Clarifies requirements":
    "The input is [what the solution receives], and the expected output is [what it should produce]. I am assuming [a constraint to confirm].",
  "Explains approach":
    "My approach is to [the main steps]. I would choose it because [why it fits the requirements].",
  "Discusses trade-offs":
    "Compared with [an alternative], this approach improves [one property] but costs [a trade-off]. That matters here because [your reasoning].",
  "Covers edge cases":
    "I would test [an edge case or failure]. The expected behavior is [what should happen], which I would check by [a verification step].",
};

export function feedbackHelp(review: Review, category: string): FeedbackHelp {
  const first = review.checks.find((check) => !check.pass);
  if (!first) {
    const prompt =
      category === "Technical"
        ? "Choose a small example input. Say what output you expect, walk through each step, and check the result yourself."
        : category === "System design"
          ? "Choose one dependency that could fail. Explain what users would experience, how you would detect it, and how the service recovers."
          : category === "Negotiation"
            ? "Say your request once. Check that you explain what matters to you and leave the other person a clear question or next step."
            : category === "Recruiter"
              ? "Say your answer once without reading. Check whether a listener could summarize your relevant experience and what interests you."
              : "Say your answer once. Check that a listener could separate what you did from what the team did, and hear the result you can support.";
    return { title: "Rehearsal prompt", prompt };
  }
  if (first.label === "Keeps a useful length") {
    const prompt =
      review.words > 300
        ? "Keep the part that answers the question, your reasoning, and the key evidence. Remove repeated setup or detail that does not change the point."
        : category === "Technical" || category === "System design"
          ? "Add one requirement, explain why your approach fits it, and walk through a test or failure case. Keep each addition relevant to the question."
          : category === "Negotiation"
            ? "Add why one term matters to you and a respectful question about what could happen next."
            : category === "Recruiter"
              ? "Add a brief real example of your experience and explain why it matters in this conversation."
              : "Add the context for your decision, one action you took, and what happened afterward. Use details from the same real situation.";
    return { title: "Editing prompt", prompt };
  }
  if (first.label === "Uses concrete detail") {
    const prompt =
      category === "Technical"
        ? "For example, with [a small input], I expect [the output]. I would verify it by [the steps or test]."
        : category === "System design"
          ? "For [an example workload or failure scenario], I would expect [the behavior]. I would check [an observable measure or test]."
          : category === "Negotiation"
            ? "Specifically, I would like to discuss [a term or timeline], based on [a reason or comparison you can support]."
            : category === "Recruiter"
              ? "One specific example is [a real experience], where I [your action or contribution]."
              : "One concrete sign was [an observable change], shown by [an accurate measure, timeframe, or specific example].";
    return { title: "Sentence starter", prompt };
  }
  const starter = Object.hasOwn(starters, first.label)
    ? starters[first.label]
    : undefined;
  if (starter) return { title: "Sentence starter", prompt: starter };
  return {
    title: "Editing prompt",
    prompt:
      "Read your answer beside the question. Find one sentence related to the suggested step, and make that sentence clearer using details you can support.",
  };
}
