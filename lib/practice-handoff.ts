import { z } from "zod";
import { categories } from "./interview";

// Only an explicit guest sign-in creates this temporary, tab-scoped copy.
// Never put account identifiers, profiles, saved records, or credentials here.
export const PRACTICE_HANDOFF_KEY = "interviewos:signin-practice:v1";
export const PRACTICE_HANDOFF_TTL = 30 * 60 * 1000;

const draftSchema = z.object({
  question: z
    .string()
    .max(3_000)
    .refine((value) => !!value.trim()),
  category: z.enum(categories),
  answer: z
    .string()
    .max(30_000)
    .refine((value) => !!value.trim()),
  seconds: z.number().finite().min(0).max(86_400),
  reviewed: z.boolean(),
  focus: z.string().max(1_000),
  mode: z.enum(["quick", "advanced"]),
});
const handoffSchema = z.object({
  version: z.literal(1),
  expiresAt: z.number().finite().int(),
  draft: draftSchema,
});

export type PracticeDraft = z.infer<typeof draftSchema>;

export function clearPracticeHandoff() {
  try {
    window.sessionStorage.removeItem(PRACTICE_HANDOFF_KEY);
  } catch {
    // Storage can be disabled by the browser. Practice still works in memory.
  }
}

export function readPracticeHandoff(now = Date.now()): PracticeDraft | null {
  try {
    const raw = window.sessionStorage.getItem(PRACTICE_HANDOFF_KEY);
    if (!raw) return null;
    if (raw.length > 220_000) throw new Error("Oversized draft");
    const result = handoffSchema.safeParse(JSON.parse(raw));
    if (
      result.success &&
      result.data.expiresAt > now &&
      result.data.expiresAt <= now + PRACTICE_HANDOFF_TTL
    )
      return result.data.draft;
  } catch {
    // Invalid or unavailable local data must never block the workspace.
  }
  clearPracticeHandoff();
  return null;
}

export function writePracticeHandoff(draft: PracticeDraft, now = Date.now()) {
  const parsed = draftSchema.safeParse(draft);
  if (!parsed.success) return false;
  try {
    const serialized = JSON.stringify({
      version: 1,
      expiresAt: now + PRACTICE_HANDOFF_TTL,
      draft: parsed.data,
    });
    window.sessionStorage.setItem(PRACTICE_HANDOFF_KEY, serialized);
    return window.sessionStorage.getItem(PRACTICE_HANDOFF_KEY) === serialized;
  } catch {
    return false;
  }
}
