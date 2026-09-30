# InterviewOS

A private interview-preparation workspace for typed or voice practice, role and resume context, STAR stories, mock interviews, transparent feedback, and saved progress. Built-in coaching works without an AI provider. See [RESEARCH.md](RESEARCH.md) for feature sources and limitations.

Recent changes are in [CHANGELOG.md](CHANGELOG.md); next priorities and commercial gaps are in [ROADMAP.md](ROADMAP.md).

## Quick start

Requirements: Node.js 22.13 or newer (Node 24 LTS recommended) and npm. Use the checked-in package lock.

```sh
npm ci
npm run dev:local
```

Open the sign-in URL printed in the terminal, normally `http://127.0.0.1:5173/signin-with-chatgpt?return_to=/`, to enter the development-only synthetic account. Or open `http://127.0.0.1:5173/` to try guest practice. This account is local to this checkout; it is not your hosted account.

`dev:local` checks the Node version and installed tools, applies pending local migrations, and starts a loopback-only server. Local records live in `.wrangler/state` and survive Ctrl+C and restarting the same command. Migrations are idempotent and do not reset records or touch the hosted database. You do not need Cloudflare credentials. Use the same printed hostname each time so browser sign-in and temporary practice handoffs stay in the same browser origin. Save or export unsaved work before stopping or reloading.

If port 5173 is occupied, stop the other server or use `npm run dev:local -- --port 5174`, then open the newly printed URL. The app never silently moves to another port. `npm run dev:local -- --help` explains the options. Missing dependencies prompt `npm ci`; unsupported Node versions prompt an upgrade before starting tools.

For separate migration/framework commands, `npm run db:migrate:local` followed by `npm run dev` remains available. Managed preview checkouts should keep using `npm run dev`; `dev:local` intentionally refuses that execution profile instead of changing its authentication or hosting configuration.

If your execution environment cannot write npm's default cache, select a writable cache, for example `npm ci --cache /tmp/interviewos-npm-cache`.

## Quality checks

```sh
npm run test:install       # Install Playwright Chromium once
npm run check             # Lint, types, automated tests, production build
```

Individual commands:

- `npm run lint`
- `npm run typecheck`
- `npm run test:startup`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

`npm run check` includes a real local-start smoke test: it copies an allowlisted set of application files into a temporary directory, links installed dependencies, starts the actual local command, saves synthetic profile/story/answer records, verifies an occupied-port failure, and restarts to confirm persistence. It does not copy `.env` files, credentials, normal records or the checkout execution profile. Only the temporary fixture is removed.

Playwright starts its own loopback-only server on port 4173 and creates an isolated synthetic database in `.wrangler/test-state`. It never reuses the normal development database or a running server. Test state is reset at the start of each run. No live microphone, AI provider, real account, or production data is needed. Failures retain screenshots and traces in `test-results/`; open the HTML report with `npx playwright show-report`.

Set `E2E_PORT` if 4173 is occupied. To use an installed Chromium instead of downloading one, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path. The test suite is cross-platform and has no developer-specific file paths.

The GitHub Actions workflow runs the same quality checks on pushes and pull requests. `npm run build` produces output; it does not deploy it.

## Two ways to practice

**Quick practice is the default.** Choose one of four plain-language goals (or keep the selected introduction), select Start practicing, answer one question, and get one useful improvement. No resume, story library, or AI key is required. Extra voice controls, answer frameworks, exports, and detailed rubric checks are progressively disclosed.

**Advanced workspace is always one switch away.** It includes role/resume context, STAR stories, the complete question bank, technical/system-design practice, five-question mocks, timers, progress charts, workspace export, and optional AI. Switching modes keeps current answers, reviews, profiles, stories, and saved history. Switching into Quick practice ends any active mock sequence while preserving its current answer and saved reviews.

1. In Quick practice, select Start practicing with the default goal or choose another goal
2. Type an answer, then choose Get feedback. If a question does not fit, Try another question stays within the same goal and asks before replacing any unsaved answer
3. Read one next improvement. Help me with this step opens an optional sentence starter or editing prompt; fill placeholders with details you can support and label hypothetical technical examples. Detailed rubric checks remain optional. They show the exact matched text with a short excerpt, explain non-matches, and disclose the 60–300 word range. A match is a keyword signal, not proof that an answer is complete or correct
4. Choose Try again to edit the answer as a fresh attempt. Earlier saved attempts remain in history
5. Open Saved answers to search by question, answer text, or category. Search words can match across these fields; short previews show relevant answer context. Choose an answer to read it, export its review, or practice it again. Back to saved answers returns to the chosen row; the Saved answers tab also opens the list. The search stays in place through practice and mode switches during this visit; Clear search restores the full list. Saved timestamps include the time so repeated questions are easier to distinguish

Saved-answer details in both modes offer Compare with an earlier answer when a separate record has the same trimmed question and category and a strictly earlier save time. It shows the nearest earlier save beside the selected answer, with complete text, precise timestamps and whitespace-based word counts. The comparison starts collapsed, changes nothing, and keeps an open practice draft intact. It does not infer improved quality from length or rubric scores. Editing a saved record updates its timestamp; this comparison is not a complete revision or attempt history. Equal timestamps do not establish which save came first.

Built-in feedback works for guests. Saving requires sign-in and an available workspace; the UI reports whether the answer is actually saved. Failed saves can be retried directly without duplicating the answer. Where supported, choosing Sign in keeps a temporary copy of the current practice answer in this tab for up to 30 minutes. On return, choose Resume answer or Discard draft. Resuming does not save anything to your account: review the answer and explicitly save it. If browser storage is unavailable or the app is embedded, download the draft or explicitly continue without it before navigation.

All seven advanced interview categories contain at least five distinct questions. Starting a mock starts a fresh answer; changing category or choosing another question ends that sequence. Finishing or ending a mock shows a round-by-round recap in Progress (or Saved answers in Quick practice). It distinguishes saved answers, unsaved answers, explicit skips, an unanswered current round, and questions not reached. A saved version remains accessible when later changes were not saved; deleting it updates the recap. The retained current draft can still be reviewed and saved after ending, including in Quick practice. A separate retry creates a new attempt outside the finished mock.

The recap suggests one next practice step from an available saved review, or prioritizes returning to the current unsaved answer. It stays in memory for this visit until the next mock or a page reload. Individual saved answers remain in history after reload; a persistent mock group is not yet stored. It does not judge interview readiness or score skipped/unanswered questions as failures.

Drafts are held in memory, and remain when switching modes or ordinary workspace sections. Replacing an unsaved answer or story asks first. The goal picker offers Resume current answer when a draft is already in progress. Quick practice brings feedback and the returning goal chooser into view with keyboard focus on their headings. Background save completion does not interrupt reading or move focus. Closing or reloading the page with unsaved changes triggers the browser's warning; export or save before leaving. The explicit Sign in action is the only browser-storage exception: it writes the current question, answer, category, effective voice duration, feedback-presence flag, retry focus, and workspace mode to sessionStorage. It excludes profiles, stories, account identifiers, saved-record IDs, and AI output. The copy expires after 30 minutes, is removed on resume/discard, and is never automatically uploaded. Active transcription must stop before capture; an interrupted mock resumes only its current answer. Other unsaved edits still trigger the browser's warning. Initial load failure blocks writes until a successful retry, so an empty screen cannot overwrite an existing workspace. Failed saves preserve input, and requests have bounded timeouts. Workspace responses are validated before changing local state. If a save acknowledgement is missing or describes different data, the answer is marked Save not confirmed: retry uses the same record ID, even if the first request already reached storage. Unconfirmed deletions retain the visible item until a retry confirms removal.

If a save or deletion returns a sign-in-required response after the workspace loaded, the app keeps open drafts and visible history, brings recovery instructions into view, and blocks further writes. Choose Sign in to use the answer handoff above, or Check sign-in if you have already signed in elsewhere. A successful same-page check reloads saved records while preserving the current answer, story editor, and edited profile fields. It does not save or delete anything automatically; retry the intended action explicitly. Repeated sign-in or connection failures keep writes blocked. Full sign-in navigation still preserves only the current practice answer where supported; other unsaved edits require export or staying on the page.

Advanced workspace → Progress → Export workspace downloads a local JSON snapshot of the saved stories and answers available in this tab, the current profile, and any open unsaved story or practice answer. Draft-only work can be exported too. Recovery notices also offer Export open work when an unsaved profile or story needs preserving before sign-in. The export identifies unsaved profile edits, unconfirmed answer saves and whether saved workspace data was available; a failed load cannot produce a complete account export. Existing `profile`, `stories` and `sessions` fields remain, with additive `exportInfo` and `drafts` sections. Exporting neither saves nor clears your work. Keep the file private because it may contain resume text, answers and optional coaching. Copy text back manually if needed; automatic import is not implemented. Temporary sign-in copies must be resumed before they become current work, and current-visit mock grouping is not included.

A successful workspace recheck can reveal that a saved answer changed since this tab loaded. If its content differs from this tab's last confirmed save and its unconfirmed write attempts, the app keeps the current editor as a separate unsaved attempt and explains that its next explicit save creates another history entry. The refreshed saved version stays intact. A matching write whose acknowledgement was lost retains the same ID for retry, so rechecking does not create a duplicate. Review recalculation and timestamp-only changes do not count as content changes. This is recovery during an explicit reload, not live cross-tab synchronization or server-side conflict locking; concurrent changes made after that reload still need stronger version control before a multi-device reliability guarantee.

## Architecture and data boundaries

- React/Vinext with a Cloudflare Worker runtime
- Local/hosted D1 records keyed by authenticated user and record ID
- Server-side schema validation and authoritative review calculation
- User-scoped reads, writes, and deletes; atomic protection against record-kind collisions
- Same-origin mutation checks and bounded request bodies
- Profiles, STAR stories, and reviewed answers persist only when saved

Production must run behind the Sites authentication boundary. The application trusts the authenticated-user headers supplied by that boundary; do not expose its Worker directly as a standalone authenticated service. The loopback sign-in helper is development-only and excluded from production builds. Production deployment and remote database migrations are separate owner-authorized operations.

For schema changes, edit `db/schema.ts`, run `npm run db:generate`, and check in the generated migration before applying it locally.

## Optional AI

No AI credential is included or required. The site owner can configure `OPENAI_API_KEY` as a server-side Sites secret, optionally set `OPENAI_MODEL`, and publish through their existing hosting workflow. Never commit credentials. In the app, enable AI in Research & settings and choose Get AI coaching. The setup status distinguishes a configured key, no configured key, a pending check and a failed/unexpected check. Check AI setup retries only the same-origin application endpoint and sends no practice content to a provider. A configured key does not establish provider access, billing readiness or response quality; coaching still requires an explicit request.

Each request sends the current question, answer and interview category to OpenAI. Profile and story sharing both start off. In the practice room, explicitly include the current role/company/resume/job-description fields (including unsaved edits), up to the first five saved stories, both, or neither. Review request contents shows the same context used to build the request; story IDs/tags and undisclosed extra fields are excluded. Enabling AI, changing a choice or opening the preview does not send a request. The choices last for this visit and clear when AI is turned off or the page reloads. Provider usage can incur charges. Requests use `store:false`; this does not override provider abuse-monitoring policies. The key never enters client bundles or saved records. AI output is advisory and must not be treated as a hiring assessment.

AI replies are validated before display or saved-state changes. Missing, non-text, blank or oversized replies produce a recoverable error and retain the current answer, previous coaching and saved record status. Accepted text follows the same 20,000-character limit as saved coaching, so an unexpected oversized reply cannot make an otherwise valid answer unsaveable. Retry explicitly or continue with built-in feedback. Setup checks time out after 15 seconds; explicit coaching requests retain their 50-second client timeout. Automated responses remain synthetic, not live provider validation.

## Known limits

- The built-in rubric uses English keywords. It indicates structure and detail, not answer correctness or hiring likelihood
- Recruiter and negotiation answers use category-specific checks; other nontechnical prompts use a general STAR-style rubric
- Voice transcription depends on browser/platform support and its speech service. Audio may be sent to that service; this app stores only transcripts explicitly saved with a review
- Speaking pace is shown only for unedited voice answers with at least ten measured seconds. Paused time and typed text are not presented as speaking pace
- Resume import accepts `.txt`; paste text from PDF or Word documents
- No native hidden overlay, screen capture, direct meeting capture, video recording, or code execution
- Sessions represent individual reviewed answers; mock recaps last for the current visit and do not yet have a persistent group summary
- Automated tests simulate provider failures and microphone events. Live AI, actual microphone devices, hosted authentication, and production deployment require separate authorized validation
- Sign-in draft recovery is tested in the same-tab local authentication flow. An embedded app requires download or explicit continuation before sign-in because opening the top-level page can change storage context. Hosted redirects, storage partitioning, a different tab/device, or a closed tab still require separate validation; export important work before leaving those contexts
