import assert from "node:assert/strict";
import { test } from "node:test";
import { feedbackHelp } from "../../lib/feedback-help.ts";
import { categories, evaluate } from "../../lib/interview.ts";

const complete =
  "When my team started the project, I led the work and first tested an approach because the result reduced failures for 20 customers. Thank you for the opportunity. My priority is flexibility because of my experience. Could we discuss a request and confirm the next step? My background includes building products and I am interested in learning more. I clarify input requirements, use a hash map algorithm, compare time complexity, and test empty input and failure cases.";

test("feedback help uses the first unmatched check without rewriting or reassessing the review", () => {
  const review = evaluate(
    "During a project the team had unclear goals. First we tested a prototype because it reduced failures by 20 percent.",
    0,
    "Behavioral",
  );
  assert.equal(
    review.checks.find((check) => !check.pass).label,
    "Shows ownership",
  );
  const before = structuredClone(review);
  const help = feedbackHelp(review, "Behavioral");
  assert.equal(help.title, "Sentence starter");
  assert.match(help.prompt, /I was responsible for \[your part\]/);
  assert.match(help.prompt, /\[an action you took\]/);
  assert.deepEqual(review, before);
});

test("each current content check has a placeholder starter without invented numbers or personal facts", () => {
  const seen = new Set();
  for (const category of categories) {
    const review = evaluate("", 0, category);
    for (const check of review.checks) {
      if (check.label === "Keeps a useful length" || seen.has(check.label))
        continue;
      seen.add(check.label);
      const single = {
        ...review,
        checks: review.checks.map((item) => ({
          ...item,
          pass: item.label !== check.label,
        })),
      };
      const help = feedbackHelp(single, category);
      assert.equal(help.title, "Sentence starter", check.label);
      assert.match(help.prompt, /\[[^\]]+\]/, check.label);
      assert.doesNotMatch(
        help.prompt,
        /\d|guarantee|hired|target role|resume/i,
        check.label,
      );
    }
  }
  assert.ok(seen.size >= 15);
});

test("technical and negotiation help follows the actual next step rather than a generic work story", () => {
  const technical = evaluate(
    "My approach uses a cache. We compare time complexity and test duplicate keys.",
    0,
    "Technical",
  );
  assert.equal(
    technical.checks.find((check) => !check.pass).label,
    "Clarifies requirements",
  );
  assert.match(
    feedbackHelp(technical, "Technical").prompt,
    /input.*expected output.*constraint/,
  );
  const negotiation = evaluate(
    "Thank you for the opportunity. My priority is learning time because it is important to me. We can confirm the next step on Friday.",
    0,
    "Negotiation",
  );
  assert.equal(
    negotiation.checks.find((check) => !check.pass).label,
    "Makes a clear request",
  );
  assert.match(
    feedbackHelp(negotiation, "Negotiation").prompt,
    /Would you consider \[your specific request\]/,
  );
  assert.doesNotMatch(
    feedbackHelp(negotiation, "Negotiation").prompt,
    /salary|\d|STAR|project/,
  );
});

test("length help distinguishes expanding a short answer from trimming a long one", () => {
  const short = evaluate(
    "During a project, I led a team. First I tested because it reduced failures by 20%.",
    0,
    "Behavioral",
  );
  assert.deepEqual(
    short.checks.filter((check) => !check.pass).map((check) => check.label),
    ["Keeps a useful length"],
  );
  assert.equal(feedbackHelp(short, "Behavioral").title, "Editing prompt");
  assert.match(
    feedbackHelp(short, "Behavioral").prompt,
    /Add the context.*same real situation/,
  );
  const long = evaluate(complete + " detail".repeat(350), 0, "Technical");
  assert.deepEqual(
    long.checks.filter((check) => !check.pass).map((check) => check.label),
    ["Keeps a useful length"],
  );
  assert.match(feedbackHelp(long, "Technical").prompt, /Remove repeated setup/);
  const technical = { ...long, words: 20 };
  assert.match(
    feedbackHelp(technical, "Technical").prompt,
    /requirement.*test or failure case/,
  );
  assert.doesNotMatch(
    feedbackHelp(technical, "Technical").prompt,
    /project|team|outcome/,
  );
});

test("all-pass reviews get category-specific rehearsal with no missing-setup requirement", () => {
  const relevant = {
    Technical: /example input.*check the result yourself/,
    "System design": /dependency.*fail.*recovers/,
    Negotiation: /request.*next step/,
    Recruiter: /experience.*interests/,
    Behavioral: /what you did.*result/,
    Leadership: /what you did.*result/,
    "Role-specific": /what you did.*result/,
  };
  for (const category of categories) {
    const review = evaluate(complete, 0, category);
    assert.equal(review.score, 100);
    const help = feedbackHelp(review, category);
    assert.equal(help.title, "Rehearsal prompt");
    assert.match(help.prompt, relevant[category]);
    assert.doesNotMatch(
      help.prompt,
      /target role|resume|configure|guarantee|hired/i,
    );
  }
});

test("unknown future check labels use a safe editing prompt, including object property names", () => {
  const review = evaluate("A short answer.", 0, "Behavioral");
  for (const label of [
    "A future check",
    "__proto__",
    "constructor",
    "toString",
  ]) {
    const help = feedbackHelp(
      {
        ...review,
        checks: [{ label, pass: false, advice: "Clarify this part." }],
      },
      "Behavioral",
    );
    assert.equal(help.title, "Editing prompt");
    assert.equal(typeof help.prompt, "string");
    assert.match(help.prompt, /details you can support/);
    assert.doesNotMatch(help.prompt, /all.*pass|target role|resume/i);
  }
});

test("concrete-detail help does not invent past outcomes for technical or negotiation answers", () => {
  for (const [category, pattern] of [
    ["Technical", /small input.*output.*verify/],
    ["System design", /workload or failure scenario.*expect/],
    ["Negotiation", /term or timeline.*comparison you can support/],
  ]) {
    const review = evaluate(
      complete.replace("20 customers", "other people"),
      0,
      category,
    );
    assert.equal(
      review.checks.find((check) => !check.pass).label,
      "Uses concrete detail",
    );
    const help = feedbackHelp(review, category);
    assert.match(help.prompt, pattern);
    assert.doesNotMatch(
      help.prompt,
      /was|we (increased|reduced)|my (team|project)|\d/,
    );
  }
});
