import type { Profile, Review, Session, Story } from "./interview";

export type PracticeExportDraft = {
  question: string;
  category: string;
  answer: string;
  seconds: number;
  review: Review | null;
  ai: string;
  focus: string;
  saveState: "unsaved" | "unconfirmed";
};

type ExportState = {
  profile: Profile;
  profileHasUnsavedChanges: boolean;
  savedWorkspaceAvailable: boolean;
  stories: Story[];
  sessions: Session[];
  storyDraft: Story | null;
  practiceDraft: PracticeExportDraft | null;
};

/** A local snapshot, not a server backup or a claim that drafts were saved. */
export function workspaceExport(state: ExportState, now = new Date()) {
  return {
    exportInfo: {
      format: "interviewos-workspace",
      version: 1,
      exportedAt: now.toISOString(),
      savedWorkspaceAvailable: state.savedWorkspaceAvailable,
      profileHasUnsavedChanges: state.profileHasUnsavedChanges,
      scope:
        "The current profile, saved stories and answers available in this tab, and open unsaved drafts. Unavailable server data is not included.",
      restore:
        "Keep this file for reference or copy text back manually. Automatic import is not supported.",
    },
    // Keep the existing top-level export fields compatible. The profile is the
    // current editor value, including unsaved edits as identified above.
    profile: state.profile,
    stories: state.stories,
    sessions: state.sessions,
    drafts: {
      story: state.storyDraft,
      practice: state.practiceDraft,
    },
  };
}
