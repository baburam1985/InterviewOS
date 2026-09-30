import { z } from "zod";
import { api, ApiError } from "./client-api";
import { sessionSchema } from "./api-validation";
import type { coachingRequest } from "./coaching-context";

const availabilitySchema = z.object({ available: z.boolean() });
const coachingSchema = z.object({
  // Use the saved-answer limit so accepted coaching remains saveable.
  text: sessionSchema.shape.ai.unwrap().refine((text) => !!text.trim()),
});

export async function loadCoachingAvailability(signal?: AbortSignal) {
  const result = availabilitySchema.safeParse(
    await api<unknown>("/api/coach", { signal }),
  );
  if (!result.success)
    throw new ApiError("AI setup returned an unexpected response.", 502);
  return result.data.available;
}

export async function requestCoaching(
  request: ReturnType<typeof coachingRequest>,
  signal?: AbortSignal,
) {
  const result = coachingSchema.safeParse(
    await api<unknown>("/api/coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    }),
  );
  if (!result.success)
    throw new ApiError(
      "AI returned an unexpected response. Your answer and any previous feedback are unchanged. Retry AI coaching or use built-in feedback.",
      502,
    );
  return result.data.text;
}
