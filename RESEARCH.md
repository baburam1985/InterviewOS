# InterviewOS research

Research date: September 20, 2026. This is a prioritization of ten recurring, useful capability areas, not a market-share ranking or an independently measured product benchmark. Official vendor documentation and product pages were used. Interviewing.io blocked full page retrieval; its public search extract supported only coding and system-design mock interviews.

| Priority | Capability | Evidence | InterviewOS implementation |
| --- | --- | --- | --- |
| 1 | Resume and role context | [Final Round AI FAQ](https://www.finalroundai.com/frequently-asked-questions) describes goals, resumes, materials, and playbooks. | Private saved role, company, resume text, and job description; optional AI receives this context. |
| 2 | Mock interview practice | [Teal](https://www.tealhq.com/tools/ai-interview-practice) offers job-specific practice across interview formats. | Five-question practice flow across seven categories, question reading, timer, and saved answers. The built-in sequence is curated, not an adaptive AI interviewer. |
| 3 | Live transcription | [Teal](https://www.tealhq.com/tools/ai-interview-practice) advertises live transcripts and recordings. | Opt-in browser speech recognition with editable text; typed fallback. No meeting capture or video recording. |
| 4 | Answer guidance | [Final Round AI](https://docs.finalroundai.com/docs/live-copilot/using-copilot) offers contextual live answer suggestions. | Category frameworks, matching saved stories, and optional personalized AI outline/review. No desktop overlay or system-audio capture. |
| 5 | STAR story builder | [Big Interview](https://support.biginterview.com/en/article/the-answer-builder-17twbwl/) documents structured answers and a reusable answer repository. | Full create/edit/delete story library with Situation, Task, Action, Result fields. |
| 6 | Technical and system-design preparation | [interviewing.io](https://interviewing.io/) describes coding and system-design AI interviews. | Technical/design question sets, code-and-explanation editor, rubric checks, optional AI review. No code execution or correctness guarantee. |
| 7 | Delivery feedback | [Yoodli](https://yoodli.ai/use-cases/interview-preparation) describes pace, filler words, follow-ups, and feedback. | Word and filler counts; measured pace only for unedited voice answers of at least 10 seconds. No body-language or emotion inference. |
| 8 | Question library | [Big Interview](https://www.biginterview.com/platform/practice-with-interview-simulator) describes question practice and answer building. | 26 curated questions, role-derived questions, category/search filtering, and custom questions. |
| 9 | Review and actionable feedback | [Huru](https://huru.ai/) describes answer-quality and delivery feedback. | Saved transcripts, visible rubric checks, improvement advice, and Markdown review exports. AI review optional. |
| 10 | Progress and history | [Teal Practice Hub](https://help.tealhq.com/en/articles/10716253-interview-practice-hub) describes previous attempts and session feedback. | Persisted history, actual score trends, next practice suggestion, and JSON workspace export. |

## Product decisions

Build a working preparation tool, opening directly in the practice room. Use a restrained navy and blue interface, with the answer editor as the primary surface and coaching beside it. Saved data is account-scoped in D1, not browser local storage. All storage writes are explicit. New Sites deployments are private.

The deterministic coach works without paid API access. Its checks are explicitly labeled English keyword checks: useful prompts for structure and specificity, not semantic judgment, factual validation, or hiring predictions. The optional OpenAI Responses integration uses server-side secrets, disables response storage, validates request lengths, and includes timeouts and readable errors. No credentials were available at build time; live provider behavior is unverified.

## Deliberate boundaries

This first release is a browser application, not full feature parity with native commercial copilots. Native overlays, screen understanding, direct meeting audio, video recordings, automatic employer research, executable coding sandboxes, and autonomous adaptive interviewers remain outside this release. Browser microphone and speech services require user permission and browser support. Languages affect transcription/read-aloud; the built-in rubric remains English.

## AI API reference

Implementation reference: [OpenAI developer quickstart](https://developers.openai.com/api/docs/quickstart). AI calls are user-initiated and disabled until a server-side key is configured. The default configurable model is gpt-4.1-mini.
