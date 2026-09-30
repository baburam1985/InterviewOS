import { emptyProfile, type Profile, type Story } from "./interview";

export type CoachingContextChoices = { profile: boolean; stories: boolean };

/** Include personal context only when explicitly selected for AI coaching. */
export function coachingRequest(
  question: string,
  answer: string,
  category: string,
  profile: Profile,
  stories: Story[],
  choices: CoachingContextChoices,
) {
  return {
    question,
    answer,
    category,
    profile: choices.profile
      ? {
          role: profile.role,
          company: profile.company,
          resume: profile.resume,
          job: profile.job,
        }
      : { ...emptyProfile },
    stories: choices.stories
      ? stories
          .slice(0, 5)
          .map(({ title, situation, task, action, result }) => ({
            title,
            situation,
            task,
            action,
            result,
          }))
      : [],
  };
}
