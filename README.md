# InterviewOS

A private interview-preparation workspace combining ten researched capabilities. See RESEARCH.md for source links, feature coverage, and limits.

## Architecture

- React/Vinext and Cloudflare Worker runtime.
- D1 records table keyed by authenticated user and record ID.
- Server-side validation, user-scoped reads/writes/deletes, same-origin mutation checks, and bounded inputs.
- Profiles, STAR stories, and completed answers are persisted. Drafts remain in component state until explicitly saved or exported.
- Optional OpenAI Responses integration via OPENAI_API_KEY and OPENAI_MODEL. Secrets never enter client bundles or saved records.

## Local development

Install locked dependencies with npm ci. Run npm run db:generate after schema changes. Run npm run build, then apply pending drizzle migrations with the starter's documented local D1 command. Run npm run dev. Local preview sign-in is /signin-with-chatgpt?return_to=/; it is development-only. Production uses the Sites authentication boundary.

Use npm run build for production output and node node_modules/typescript/bin/tsc --noEmit for type validation. Tests are in tests/ and use Playwright from the desktop runtime when available.

## Optional AI

No AI provider credential is included. The site owner can provision an OpenAI API key, configure OPENAI_API_KEY as a secret in Sites, optionally configure OPENAI_MODEL, and redeploy. In the app, enable AI under Research & settings. Calls send only the current question, answer, profile, and at most five saved stories. Model usage can incur provider charges. Responses use store:false; this does not override provider abuse-monitoring policies.

## Known limits

- Built-in rubric is keyword-based and English-focused, not a correctness or hiring assessment.
- Browser transcription depends on browser service availability. Typed practice always works.
- No native hidden overlay, screen capture, video recording, direct meeting capture, or code execution.
- Resume import accepts text; PDF/Word content must be pasted.
- Persisted sessions represent individual reviewed answers; mock practice groups a five-question flow visually.
- AI and real microphone behavior require live credentials/device permissions and cannot be verified with synthetic browser tests alone.
