# InterviewOS product roadmap

## Product direction

Help someone turn a real experience into a clearer interview answer, then improve it with a focused retry. Quick practice is the default; Advanced workspace exposes deeper tools without creating a separate account, data store, or paid-plan assumption.

The commercial positioning is a hypothesis, not a validated market claim: an evidence-backed preparation workspace connecting personal stories, a target role, focused drills, and progress across interview rounds. A story bank or seniority focus alone is not a unique differentiator.

## Current foundation

- Quick flow: choose a goal → answer one question → one improvement → retry
- Quick users can try another question before answering, with no empty saved attempts, draft replacement protection, and keyboard context for the changed prompt
- Quick stage changes reveal the feedback or goal heading and preserve a useful keyboard position; ordinary save completion does not interrupt reading
- No required resume, long setup, or AI key for built-in feedback
- Quick/Advanced switches share drafts, reviews, profiles, stories, and saved answers
- Quick saved-answer navigation opens one answer at a time, with visible Back navigation, keyboard focus restoration, and precise saved timestamps
- Optional saved-answer comparison shows real text and word counts beside the nearest earlier save for the same prompt/category, with save-time and heuristic limitations; drafts and stored records stay unchanged
- Saved-answer search matches question, answer text and category, with relevant previews, result counts and clear recovery when nothing matches; the query survives ordinary practice/mode detours
- Thirty-five built-in questions across seven categories; five distinct questions per mock
- Current-visit mock recap shows each round's actual outcome, saved-answer access, a direct return to an unsaved current answer, and one grounded next practice step
- Validated rechecks detect a changed saved answer against this tab's confirmed/unconfirmed payloads, preserve current work as a separate unsaved attempt, and keep matching uncertain writes on the same retry ID
- Local workspace exports retain current profile edits and open answer/story drafts alongside available saved records, clearly identify unavailable data and unconfirmed saves, and leave editor state unchanged; automatic import remains unimplemented
- Explicit saved/unsaved/unconfirmed state, direct failed-save retry, draft protection, and isolated asynchronous callbacks
- Question replacements and Quick goal changes wait for finishing speech recognition so delayed final words remain in the current draft; no automatic replacement or save follows completion
- Workspace load/save/delete acknowledgements are validated before state updates; uncertain saves retry the same record without duplicates and malformed loads cannot partially replace the editor
- Integrated Chromium tests cover actual browser-offline saves and the native client timeout for stalled loads and already-committed saves, preserving drafts, unlocking controls and confirming same-record retries
- When sign-in is lost during a save or deletion, a focused recovery notice preserves drafts and visible records; further writes require a validated reload, and edited profile/story fields survive a same-page sign-in recheck
- Guest sign-in keeps a validated temporary practice copy in the same tab, with explicit resume/discard and export fallback; recovery never saves to an account automatically
- Explained built-in practice suggestions, including category-specific rehearsal steps when all basic checks match; no target-role setup is required
- Detailed reviews show actual keyword matches in bounded answer excerpts, non-matches and the word-count range; explanations use the scoring rules and avoid treating a match as proof of quality
- Optional help in current and saved Quick reviews turns the next step into a placeholder starter or editing/rehearsal prompt, with no generated personal claims or automatic answer changes
- Optional AI setup distinguishes configured, absent and failed checks with a content-free retry; validated replies preserve prior drafts/feedback on malformed output and stay within the saved-coaching limit
- Optional AI starts with profile/story sharing off; independent choices and a readable request preview disclose current unsaved profile fields and the first five saved stories before an explicit request
- Existing local databases initialized from the original SQL can safely adopt the migration ledger only after exact schema/history checks and a verified private backup; mismatches stop without resetting records
- One local-start command checks Node/dependencies, applies local migrations, prints exact practice/sign-in URLs and rejects occupied ports; a disposable real-start/restart smoke test verifies saved profile/story/answer persistence
- Portable local setup, synthetic-data tests, and a draft-PR CI gate
- A separate Firefox/WebKit compatibility gate covers guest recovery and retry/history, narrow-viewport draft/export continuity, and uncertain-save recovery alongside the full Chromium/API suite

The heuristic rubric checks English structure and detail. It does not validate factual correctness, measure job readiness, or predict hiring outcomes. Preserve that distinction in the UI and any future marketing.

## Next small iterations

1. Keep the end-of-day local handoff on verified main. The target Mac has passed the real legacy-schema adoption, unchanged-record checks, restart and Chrome save/reload flow; repeat a final smoke check after syncing the final commit. Then validate first use with a small set of target users: can they find a suitable question, start without explanation, understand one next fix and its keyword evidence, use or adapt the optional starter, retry, and find saved work? Measure friction rather than adding features by default
2. Improve continuity: validate unreliable connections and interrupted acknowledgements on hosted infrastructure, in addition to synthetic recovery tests; validate guest and expired-session sign-in recovery through the hosted authentication and embedded-browser paths; validate the draft-inclusive local export with users before designing a safe import flow; validate changed-answer recovery with real multi-tab use and consider server version checks for edits that race after a reload; consider remembering the user's selected workspace mode; validate stage announcements with assistive technology and physical mobile keyboards in addition to automated focus/viewport checks
3. Make role context more useful: connect real stories and role requirements to targeted practice while keeping context optional and personal claims grounded in supplied evidence
4. Validate the current-visit mock recap with users before adding persistent group summaries; preserve individual reviews and distinguish skipped, unsaved, and unvisited rounds
5. Validate saved-answer search with larger histories and assistive technology, including query usefulness and performance; validate the optional same-question comparison for clarity, including save-time ordering and identical answers, without implying a validated performance score
6. Evaluate accessible PDF/DOCX import and question organization only after confirming demand; use explicit size/type limits and secure parsing

## Before a commercial pilot

- Verify hosted authentication and tenant isolation in the deployed environment; the current app depends on the Sites authentication boundary and must not be exposed directly as a standalone authenticated Worker
- Add per-user provider quotas, cost limits, concurrency controls, and observability before enabling paid AI at scale
- Complete authorized live checks for OpenAI responses, real microphone permissions/devices, production error handling, and hosted data migrations
- Define and implement privacy/retention controls, workspace deletion, account support, and a clear data-processing disclosure
- Test accessibility with keyboard and assistive technology, real mobile input/keyboard behavior, and supported browsers
- Conduct security and product review before making reliability or privacy guarantees

## Before charging customers

Pricing, subscriptions, billing, entitlement enforcement, refunds/support, and required legal documents are not implemented. Advanced workspace is currently a UI choice, not a paid tier. Research and validate those business decisions separately; do not imply that this build is launch-ready.

## Verification and iteration rules

Run `npm run check` on the final tree: lint, TypeScript, isolated local-start/restart smoke tests, unit tests, Chromium end-to-end/API tests, and production build. Also pass `npm run test:compat` for the three core journeys in each Firefox/WebKit engine. CI uses separate jobs; run these commands sequentially in one local checkout because they share disposable test state. Keep fixtures synthetic and local; the test runner resets only its dedicated `.wrangler/test-state` database and excludes AI secrets. Record the exact commit and both CI job results when publishing a change. Automated WebKit and narrow-view tests do not establish physical Safari/iPhone, touch, keyboard, assistive-technology or hosted-authentication behavior.

Current regression coverage includes tenant-scoped SQL, malformed/oversized/Unicode requests, server-owned reviews, record collisions, provider failures/cancellation, persistence, imports/exports/deletion, retries, draft guards, voice fallbacks, mocks, responsive layout, and Quick/Advanced continuity. Live services and physical devices require additional validation; mocked tests are not evidence that they work in production.

For each iteration, choose one bounded user-visible improvement, retain every existing capability unless deliberately redesigned, add regression coverage, and verify the final commit. Do not use passing heuristics or a growing feature count as a substitute for observed user benefit.
