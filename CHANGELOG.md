# Product changes

## September 30, 2026

- **Saved-answer navigation:** Quick practice opens one selected answer at a time instead of placing its detail below a long history list. Back returns focus to the selected row, saved timestamps include seconds, and mode switches preserve the shared selection. Regression coverage includes keyboard/mobile navigation, exports, cancellation, failed deletion, and current-draft safety
- **Mock recaps ([PR #4](https://github.com/baburam1985/InterviewOS/pull/4)):** Show actual round outcomes, access saved answers, and choose one next practice step. The recap lasts for the current visit; individual saved answers remain durable
- **Guest sign-in recovery ([PR #3](https://github.com/baburam1985/InterviewOS/pull/3)):** Explicitly resume or discard a temporary same-tab practice copy after sign-in. Unsupported storage and embedded views offer export before continuing; recovery never saves to an account automatically
- **Transparent feedback ([PR #2](https://github.com/baburam1985/InterviewOS/pull/2)):** Explain the basis of practice suggestions, keep target-role setup optional, and remove duplicate Quick save notices
- **Workable foundation and simpler start ([PR #1](https://github.com/baburam1985/InterviewOS/pull/1)):** Quick practice by default, optional Advanced workspace, guarded drafts and retries, validated tenant-scoped storage, portable tests, and CI

These changes support testing the product, not a production-readiness claim. Hosted authentication, live devices/provider behavior, privacy/account controls, operating limits, and commercial setup remain in [ROADMAP.md](ROADMAP.md).
