import { z } from "zod";
import { api, ApiError } from "./client-api";
import {
  profileSchema,
  storySchema,
  sessionSchema,
  workspaceBodySchema,
} from "./api-validation";
import type { Profile, Story, Session } from "./interview";

export type WorkspaceData = {
  profile: Profile;
  story: Story;
  session: Session;
};
type WorkspaceKind = keyof WorkspaceData;
export type WorkspaceRecord = {
  [K in WorkspaceKind]: { kind: K; data: WorkspaceData[K] };
}[WorkspaceKind];

const reviewSchema = z.object({
  score: z.number().int().min(0).max(100),
  words: z.number().int().nonnegative(),
  fillers: z.number().int().nonnegative(),
  pace: z.number().finite().nonnegative().nullable(),
  checks: z
    .array(
      z.object({ label: z.string(), pass: z.boolean(), advice: z.string() }),
    )
    .min(1),
  next: z.string().trim().min(1),
});
const savedRecordSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("profile"), data: profileSchema }),
  z.object({ kind: z.literal("story"), data: storySchema }),
  z.object({
    kind: z.literal("session"),
    data: sessionSchema.extend({ review: reviewSchema }),
  }),
]);
const workspaceSchema = z.object({
  records: z.array(savedRecordSchema).refine((records) => {
    const ids = records.map((record) =>
      record.kind === "profile" ? "profile" : record.data.id,
    );
    return new Set(ids).size === ids.length;
  }),
  warning: z.string().optional(),
});
const saveEnvelopeSchema = z.object({ data: z.unknown() });
const deleteResponseSchema = z.object({ ok: z.literal(true) });

export async function loadWorkspace(): Promise<{
  records: WorkspaceRecord[];
  warning?: string;
}> {
  const result = workspaceSchema.safeParse(
    await api<unknown>("/api/workspace"),
  );
  if (!result.success)
    throw new ApiError(
      "Your workspace returned an unexpected response. Please retry loading it.",
      502,
    );
  return result.data;
}

export async function saveWorkspace<K extends WorkspaceKind>(
  kind: K,
  data: WorkspaceData[K],
): Promise<{ data: WorkspaceData[K] }> {
  const expected = workspaceBodySchema.safeParse({ kind, data });
  if (!expected.success)
    throw new ApiError("Check your fields and try again.", 400);
  const response = await api<unknown>("/api/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, data }),
  });
  const envelope = saveEnvelopeSchema.safeParse(response);
  const saved = savedRecordSchema.safeParse({
    kind,
    data: envelope.success ? envelope.data.data : undefined,
  });
  // Validate the complete acknowledgement before changing client state. Comparing
  // canonical input fields permits server trimming and server-owned reviews,
  // while rejecting a valid-looking response for a different record or answer.
  if (
    !saved.success ||
    JSON.stringify(workspaceBodySchema.parse(saved.data)) !==
      JSON.stringify(expected.data)
  )
    throw new ApiError(
      "The server did not confirm this save. Your input is still here. Retry saving to confirm it without creating another copy.",
      502,
    );
  return { data: saved.data.data as WorkspaceData[K] };
}

export async function deleteWorkspace(id: string, kind: "story" | "session") {
  const response = await api<unknown>(
    "/api/workspace?id=" + encodeURIComponent(id) + "&kind=" + kind,
    { method: "DELETE" },
  );
  if (!deleteResponseSchema.safeParse(response).success)
    throw new ApiError(
      "The server did not confirm deletion. The item is still shown here; please retry.",
      502,
    );
}
