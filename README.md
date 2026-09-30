# InterviewOS

A private interview-preparation workspace for typed or voice practice, role and resume context, STAR stories, mock interviews, transparent feedback, and saved progress. Built-in coaching works without an AI provider. See [RESEARCH.md](RESEARCH.md) for feature sources and limitations.

## Quick start

Requirements: Node.js 22.13 or newer (Node 24 LTS recommended) and npm. Use the checked-in package lock.

```sh
npm ci
npm run db:migrate:local
npm run dev
```

Open `http://localhost:5173/signin-with-chatgpt?return_to=/` to enter the development-only synthetic account. Local records live in `.wrangler/state`; the migration command is idempotent, uses only local D1, and never touches the hosted database. You do not need Cloudflare credentials for this workflow.

If your execution environment cannot write npm's default cache, select a writable cache, for example `npm ci --cache /tmp/interviewos-npm-cache`.

## Quality checks

```sh
npm run test:install       # Install Playwright Chromium once
npm run check             # Lint, types, automated tests, production build
```

Individual commands:

- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

Playwright starts its own loopback-only server on port 4173 and creates an isolated synthetic database in `.wrangler/test-state`. It never reuses the normal development database or a running server. Test state is reset at the start of each run. No live microphone, AI provider, real account, or production data is needed. Failures retain screenshots and traces in `test-results/`; open the HTML report with `npx playwright show-report`.

Set `E2E_PORT` if 4173 is occupied. To use an installed Chromium instead of downloading one, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable path. The test suite is cross-platform and has no developer-specific file paths.

The GitHub Actions workflow runs the same quality checks on pushes and pull requests. `npm run build` produces output; it does not deploy it.

## Two ways to practice

**Quick practice is the default.** Choose one of four plain-language goals (or keep the selected introduction), select Start practicing, answer one question, and get one useful improvement. No resume, story library, or AI key is required. Extra voice controls, answer frameworks, exports, and detailed rubric checks are progressively disclosed.

**Advanced workspace is always one switch away.** It includes role/resume context, STAR stories, the complete question bank, technical/system-design practice, five-question mocks, timers, progress charts, workspace export, and optional AI. Switching modes keeps current answers, reviews, profiles, stories, and saved history. Switching into Quick practice ends any active mock sequence while preserving its current answer and saved reviews.

1. In Quick practice, select Start practicing with the default goal or choose another goal
2. Type an answer, then choose Get feedback
3. Read one next improvement; expand detailed feedback if useful
4. Choose Try again to edit the answer as a fresh attempt. Earlier saved attempts remain in history
5. Open Saved answers to revisit or retry any prior answer

Built-in feedback works for guests. Saving requires sign-in and an available workspace; the UI reports whether the answer is actually saved. Failed saves can be retried directly without duplicating the answer. Where supported, choosing Sign in keeps a temporary copy of the current practice answer in this tab for up to 30 minutes. On return, choose Resume answer or Discard draft. Resuming does not save anything to your account: review the answer and explicitly save it. If browser storage is unavailable or the app is embedded, download the draft or explicitly continue without it before navigation.

All seven advanced interview categories contain at least five distinct questions. Starting a mock starts a fresh answer; changing category or choosing another question ends that sequence. Saved answers remain individual reviews. Finishing a mock reports how many were saved.

Drafts are held in memory, and remain when switching modes or ordinary workspace sections. Replacing an unsaved answer or story asks first. The goal picker offers Resume current answer when a draft is already in progress. Closing or reloading the page with unsaved changes triggers the browser's warning; export or save before leaving. The guest Sign in action is the only browser-storage exception: it writes the current question, answer, category, effective voice duration, feedback-presence flag, retry focus, and workspace mode to sessionStorage. It excludes profiles, stories, account identifiers, saved-record IDs, and AI output. The copy expires after 30 minutes, is removed on resume/discard, and is never automatically uploaded. Active transcription must stop before capture; an interrupted mock resumes only its current answer. Other unsaved edits still trigger the browser's warning. Initial load failure blocks writes until a successful retry, so an empty screen cannot overwrite an existing workspace. Failed saves preserve input, and requests have bounded timeouts.

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

No AI credential is included or required. The site owner can configure `OPENAI_API_KEY` as a server-side Sites secret, optionally set `OPENAI_MODEL`, and publish through their existing hosting workflow. Never commit credentials. In the app, enable AI in Research & settings and choose Get AI coaching.

Each request sends the current question, answer, category, profile (including resume and job description), and up to five saved stories to OpenAI. Provider usage can incur charges. Requests use `store:false`; this does not override provider abuse-monitoring policies. The key never enters client bundles or saved records. AI output is advisory and must not be treated as a hiring assessment.

## Known limits

- The built-in rubric uses English keywords. It indicates structure and detail, not answer correctness or hiring likelihood
- Recruiter and negotiation answers use category-specific checks; other nontechnical prompts use a general STAR-style rubric
- Voice transcription depends on browser/platform support and its speech service. Audio may be sent to that service; this app stores only transcripts explicitly saved with a review
- Speaking pace is shown only for unedited voice answers with at least ten measured seconds. Paused time and typed text are not presented as speaking pace
- Resume import accepts `.txt`; paste text from PDF or Word documents
- No native hidden overlay, screen capture, direct meeting capture, video recording, or code execution
- Sessions represent individual reviewed answers; mocks do not yet have a persistent group summary
- Automated tests simulate provider failures and microphone events. Live AI, actual microphone devices, hosted authentication, and production deployment require separate authorized validation
- Sign-in draft recovery is tested in the same-tab local authentication flow. An embedded app requires download or explicit continuation before sign-in because opening the top-level page can change storage context. Hosted redirects, storage partitioning, a different tab/device, or a closed tab still require separate validation; export important work before leaving those contexts
