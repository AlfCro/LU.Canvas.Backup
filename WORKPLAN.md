# Work Plan: LU Canvas Backup

Use this file as the live handoff between sessions. Keep detailed endpoint and scope notes in `CANVAS_BACKUP_PLAN.md`.

## Current Status

- Summary: Emergency Canvas backup scope now favors broad capture inside a filtered course set rooted at Canvas account `1` and its nested subaccounts. The current direction is to exclude obvious test/sandbox/template/demo courses, including `sandlåda`, `sandlada`, `sandbox`, `mall`, `template`, and `demo` course name/code variants, exclude direct Canvas subaccounts whose name matches `sandbox`, exclude courses where Canvas reports `total_students=0`, limit by relevant statuses and the approved initial `2025-04-01` cutoff, preserve as much content as possible for selected courses, then filter content later. All configured course name/code exclusion terms and subaccount-name exclusion terms now use one edge rule: a term matches only at the absolute end of the field, or at the beginning followed by a non-`a-z` character. `Ladokstudent` has been clarified as an inherited Canvas student role to ignore for backup user capture, not a section or coverage source.
- Current focus: Use `scripts/canvas-backup.mjs` as the approved first validation and emergency backup path. Local config now targets Canvas account `1`, `CANVAS_BACKUP_MODE=both`, `CANVAS_CREATED_AFTER=2025-04-01`, `CANVAS_MAX_FILE_SIZE_MB=300`, `CANVAS_EXCLUDE_COURSES_WITHOUT_STUDENTS=true`, and conservative concurrency values. `.env.example` recommends the same root-account policy, course name/code exclusions for `test`, `sandlåda`, `sandlada`, `sandbox`, `mall`, `template`, and `demo`, and subaccount-name exclusion for `sandbox`; the script defaults match those documented exclusion lists, with uniform edge-only matching for all configured terms. Backups are organized by direct Canvas account/subaccount under `subaccounts/<account-id>-<account-name>/courses/...`, and each run fetches subaccount metadata into `subaccounts.json` plus per-subaccount `subaccount.json` files. The script requires explicit opt-in for the limited current-user `/api/v1/courses` discovery fallback, requests `include[]=total_students` during discovery, skips existing non-empty downloads when Canvas omits file sizes, shortens generated content/file paths near the Windows path limit, uses the documented `include[]` calendar-events parameter, redacts obvious token/session fields in error bodies, and always preserves Canvas-returned staff login/SIS identifiers in staff user/enrollment snapshots. The behavior-preserving module split from `CANVAS_BACKUP_REFACTOR_PLAN.md` is implemented under `scripts/canvas-backup/`. The next operational gate is a root account `1` list-only run with the approved filters, followed by review of selected counts, subaccount distribution, and file-size summaries before broad content backup. The output root for the current execution server still needs confirmation; `E:\CanvasBackup` was a previous-server path, not the current runner path.
- A familiar-area scope was validated on 2026-05-08 as an example, not a production scope decision. With the approved `2025-04-01` cutoff, the list-only run discovered hundreds of courses and selected 0 because every discovered course was older than the cutoff. With the cutoff explicitly disabled via `--created-after=`, the list-only run selected most of the discovered set under the direct account; the sandbox child subaccount selected 0 and `subaccounts.json` had no errors. A direct smoke validation on a two-course sample with `--mode direct --skip-file-downloads` completed with 0 top-level and per-course errors, an empty `retry-list.json`, no `.error.json` files, and 0 token matches in generated JSON/HTML/text.
- An additional familiar-area scope was added as another list-only example on 2026-05-08. It used the same example filters and `2025-04-01` cutoff, discovered several hundred courses, selected a subset, grouped all selected courses under the direct account, and had 0 subaccount metadata errors. Its selected list included possible local utility/noise or support courses and cohort shell courses; these examples should not be treated as account-specific production policy because broad discovery should run from root account `1`.
- Because the large Canvas instance can contain unexpectedly large course file inventories, `--max-file-size-mb` / `CANVAS_MAX_FILE_SIZE_MB` has been added as a storage guardrail. The approved emergency threshold is 300 MB. The option skips individual Canvas course file downloads above the approved threshold while preserving `files.json` metadata and a `file-downloads.json` skip record. Direct runs now also write `metadata/file-size-summary.json` from Canvas-reported file sizes, including metadata-only runs with `--skip-file-downloads`, so storage pressure and threshold impact can be reviewed before broad downloads. A two-course metadata-only validation completed with 0 errors and wrote size summaries for both sample courses. Across that two-course sample, a 300 MB cutoff would skip a small minority of sample files but a majority of total bytes. Canvas content export packages are not limited by this first file-size cutoff.
- Continued manifest review on 2026-05-08 reconfirmed the final list-only counts, zero subaccount metadata errors, and redacted run options for each familiar-area validation scope. Those are historical validation artifacts; the current broad-run storage root is not yet confirmed.
- Next session should: Confirm an output root on the server that will run the backup, then run a root account `1` list-only selection with the approved `2025-04-01` cutoff, zero-student exclusion, course/subaccount noise filters, and an explicit `--output` under that root. Use `CANVAS_MAX_FILE_SIZE_MB=300` unless explicitly overridden. Do not download Canvas Studio media. Mention Canvas New Quizzes as a known gap in README-style notes, but do not spend time building a large New Quizzes fetch path now.

## Active Work

- [x] Capture Canvas instance and API documentation links.
- [x] Correct `Ladokstudent` terminology: it is an inherited Canvas student role, not a section, and users with that role should not be deliberately fetched.
- [x] Document that Canvas must be used to discover teachers, TAs, and designers.
- [x] Inventory likely Canvas API endpoints for course material, structure, and teacher backup.
- [x] Create `scripts/canvas-backup.mjs` as the dependency-free backup implementation path.
- [x] Document the emergency over-capture principle: take too much Canvas content rather than miss data under time pressure.
- [x] Document the course-selection filters needed for a huge dataset: exclude `test`/`sandlåda`/`sandlada`/`sandbox`/`mall`/`template`/`demo`, filter by statuses, filter by created-after date, and support exact course IDs.
- [x] Harden `scripts/canvas-backup.mjs` with P0 direct capture for staff roles, staff enrollments, sections, tabs, and course settings.
- [x] Promote `scripts/canvas-backup.mjs` to the approved first validation and emergency backup path.
- [x] Add Git ignores and `.env.example` for local tokens and sensitive backup output.
- [x] Add `--check-config` so effective options can be reviewed without Canvas API calls.
- [x] Allow `--check-config` to run before a Canvas token is configured.
- [x] Add rollout checklist for list-only, validation, export, broad-run, and post-run review.
- [x] Add dependency-free Node tests for argument parsing, course-selection filters, sampling limits, path sanitization, and token redaction.
- [x] Add `retry-list.json` generation so failed or partially failed course IDs can be rerun with exact `--course-ids` targeting.
- [x] Retry thrown fetch/network failures as well as retryable Canvas HTTP statuses.
- [x] Always paginate per-module item endpoints instead of trusting partial `include[]=items` data.
- [x] Require explicit `--output` or `CANVAS_OUTPUT_DIR` for backup runs to support resumability.
- [x] Add staff privacy controls for deleted/rejected/inactive enrollments.
- [x] Change staff user/enrollment exports to always preserve Canvas-returned login/SIS identifiers for follow-up matching.
- [x] Remove duplicate writes for staff users, staff enrollments, sections, tabs, and settings.
- [x] Load a local `.env` for a familiar-area Canvas account and verify `--check-config` redacts the token.
- [x] Run small explicit direct-mode validation for a two-course sample.
- [x] Fix truncated Windows filename sanitization so clipping cannot leave a trailing dot or space.
- [x] Add read-only P1 course-adjacent metadata capture for rubrics, outcome groups/links, external tool references, calendar events, group categories, and groups without memberships.
- [x] Run small direct validation of P1 metadata capture for the same two-course sample with file downloads skipped.
- [x] Add Swedish lay overview for responsible persons at Swedish universities and link it from the README.
- [x] Update `.env.example` to recommend `CANVAS_BACKUP_MODE=both`, `CANVAS_CREATED_AFTER=2025-04-01`, and the broader noise exclusion list.
- [x] Fetch Canvas account/subaccount metadata and group course backup output by each course's direct subaccount.
- [x] Align script default name/code exclusions with the documented `test`/`sandlåda`/`sandlada`/`sandbox`/`mall`/`template`/`demo` policy.
- [x] Add a default subaccount-name exclusion for direct Canvas subaccounts whose name matches `sandbox`.
- [x] Rerun list-only after adding the dedicated subaccount-name `sandbox` exclusion.
- [x] Apply uniform edge-only matching to all course name/code and subaccount-name exclusion terms.
- [x] Rerun list-only after the uniform edge-only filter change and save corrected selection manifests.
- [x] Run a familiar-area list-only validation with the approved `2025-04-01` cutoff; it discovered hundreds of courses and selected 0 because all discovered courses were older than the cutoff.
- [x] Run the same familiar-area list-only validation with the cutoff disabled via `--created-after=`; it selected most of the discovered set and excluded the sandbox child subaccount.
- [x] Run a direct smoke validation against a separate two-course sample with `--skip-file-downloads`.
- [x] Review the saved corrected list-only selection manifests for the validated familiar-area scopes.
- [x] Run an additional familiar-area list-only validation with the example `2025-04-01` cutoff to surface possible local utility/support courses for owner review.
- [x] Add a configurable maximum Canvas course file download size via `--max-file-size-mb` / `CANVAS_MAX_FILE_SIZE_MB`.
- [x] Add per-course file-size summaries from Canvas file metadata so storage estimates are available even when file downloads are skipped.
- [x] Change newly written course output folders to use `<course-id>_<sis-course-id-or-code>` so the Canvas numeric course ID is visually separated from SIS GUIDs.
- [x] Harden resumability, path handling, calendar-events parameter spelling, error-body redaction, and current-user discovery opt-in after review feedback.
- [x] Document a behavior-preserving plan to split the growing backup script into focused modules.
- [x] Implement the module split from `CANVAS_BACKUP_REFACTOR_PLAN.md` without changing CLI behavior, output layout, privacy defaults, filters, or Canvas API scope.
- [x] After the module split, rerun `node --check scripts\canvas-backup.mjs`, `node scripts\canvas-backup.mjs --help`, `node scripts\canvas-backup.mjs --check-config`, and `node --test scripts\canvas-backup.test.mjs`.
- [x] After adding the subaccount-name `sandbox` exclusion, rerun `node --check scripts\canvas-backup.mjs`, `node scripts\canvas-backup.mjs --help`, `node scripts\canvas-backup.mjs --check-config`, and `node --test scripts\canvas-backup.test.mjs`.
- [x] After changing uniform edge-only filter behavior, rerun `node --check scripts\canvas-backup.mjs`, `node scripts\canvas-backup.mjs --help`, `node scripts\canvas-backup.mjs --check-config`, and `node --test scripts\canvas-backup.test.mjs`.
- [x] After changing staff identifier preservation, rerun `node --check scripts\canvas-backup.mjs`, `node scripts\canvas-backup.mjs --help`, `node scripts\canvas-backup.mjs --check-config`, and `node --test scripts\canvas-backup.test.mjs`.
- [x] After adding file-size summaries, rerun `node --check scripts\canvas-backup.mjs`, `node scripts\canvas-backup.mjs --help`, `node scripts\canvas-backup.mjs --check-config`, and `node --test scripts\canvas-backup.test.mjs`.
- [x] After adding root account `1`, the then-assumed `E:\CanvasBackup` output root, and zero-student filter changes, rerun `node --check scripts\canvas-backup.mjs`, `node scripts\canvas-backup.mjs --help`, `node scripts\canvas-backup.mjs --check-config`, and `node --test scripts\canvas-backup.test.mjs`.
- [x] After correcting the output-root policy to treat `E:\CanvasBackup` as server-specific, rerun `node --check scripts\canvas-backup.mjs`, `node scripts\canvas-backup.mjs --help`, `node scripts\canvas-backup.mjs --check-config`, and `node --test scripts\canvas-backup.test.mjs`.
- [x] Validate file-size summary output against the explicit two-course sample with `--mode direct --skip-file-downloads`.
- [x] Confirm production discovery scope: Canvas root account `1`, with nested subaccounts under it.
- [x] Clarify that earlier account-specific checks are validation examples only, not broad-run scopes.
- [x] Add broad-selection exclusion for courses where Canvas reports `total_students=0`.
- [ ] Confirm whether any separate non-Canvas course/student coverage data will be provided and which identifiers it contains.
- [ ] Confirm the relevant Canvas course states for the broad run.
- [x] Confirm initial created-after cutoff for the first broad run: `2025-04-01`.
- [ ] Confirm backup storage location and available capacity for the current execution server.
- [x] User clarified `E:\CanvasBackup` was a path on another server, not the current runner path.
- [ ] Verify the chosen output root is mounted and writable from the execution environment.
- [x] Confirm Canvas Studio media should not be downloaded in this backup path.
- [x] Confirm Canvas New Quizzes should be documented as a known gap only, with no large fetch effort now.
- [x] Confirm there is no major sensitive PII concern expected for this emergency backup.
- [ ] Run root account `1` list-only validation with the approved filters and inspect selected counts/subaccount distribution.
- [x] Confirm the approved `CANVAS_MAX_FILE_SIZE_MB` threshold for broad runs: `300`.
- [x] Preserve useful file extensions when long Canvas file names are clipped; validation found two PDF downloads whose bytes and metadata were preserved but whose saved names lost `.pdf`.
- [x] Decide whether to promote `scripts/canvas-backup.mjs` into the first emergency backup command.

## Validation / Rollout

- [x] Validate endpoint plan against a small explicit course sample.
- [x] Validate new P1 metadata endpoints against a small explicit course sample.
- [ ] Validate teacher discovery against at least one course where teachers are already known informally.
- [x] Validate the new subaccount metadata and nested output layout against a small token-backed run.
- [ ] Validate any external coverage-to-Canvas course/section matching before broad backup, if external coverage data is provided.
- [x] Define retry, logging, manifest, and storage requirements before broad execution, including generated retry-list output for failed course or endpoint records.
- [x] Run initial `list_only` with current `.env` defaults against a familiar-area account; it selected most of the discovered set before the documented intended filters were applied.
- [x] Run `list_only` again with the documented intended filters and inspect selected/excluded course counts before fetching backup content.
- [x] Rerun list-only after adding the dedicated subaccount-name `sandbox` exclusion; it selected 63 of 587 courses and recorded 22 sandbox-subaccount exclusions.
- [x] Rerun list-only after applying uniform edge-only matching against the familiar-area scope.
- [x] Run a familiar-area list-only with the approved cutoff; it selected 0 because all discovered courses predated the cutoff.
- [x] Run the same familiar-area list-only with the cutoff disabled; it selected most of the discovered set.
- [x] Run a familiar-area direct smoke validation on a two-course sample with `--skip-file-downloads`.
- [x] Run an additional familiar-area list-only with the approved cutoff to surface possible local utility/support courses.
- [x] Run file-size-summary validation on a two-course sample with 0 errors, empty retry list, no `.error.json` files, 0 token matches, and size summaries for both courses.
- [x] Review the impact of a 300 MB file-size threshold against the two-course sample and the additional smoke sample.
- [x] Review the saved corrected list-only selection manifest as a validation example.
- [ ] Run root account `1` list-only with `2025-04-01`, zero-student exclusion, and approved noise filters before broad content backup.
- [ ] Review root account `1` selected / excluded counts, subaccount distribution, and file-size summaries before broad content backup.
- [ ] If time does not allow full validation, run with conservative concurrency and preserve detailed failure manifests.

## Completed Recently

- [x] Replaced placeholder project docs with Canvas backup context.
- [x] Created a focused planning document for the emergency backup.
- [x] Updated planning docs to prefer broad emergency capture and later filtering.
- [x] Added filtering requirements for the huge Canvas dataset.
- [x] Set temporary local backup output root for validation runs.
- [x] Extended the script's direct mode to capture staff users/enrollments, sections, tabs, and settings.
- [x] Clarified that `Ladokstudent` is an inherited student role to ignore for user capture, not a section data source.
- [x] Approved the script as the first validation path and documented rollout steps.
- [x] Added local tests for backup script configuration and course-selection guardrails.
- [x] Added retry-list output and tests to support targeted reruns after partial failures.
- [x] Scoped Canvas bearer-token headers to the configured Canvas origin so absolute external download/export URLs are fetched without leaking the token.
- [x] Ran initial familiar-area list-only discovery with current defaults and saved manifests for review.
- [x] Hardened the script before broad runs: network exception retries, full module item hydration, mandatory backup output paths, staff privacy defaults, and no duplicate people/structure metadata writes.
- [x] Ran direct validation for a small explicit two-course sample; final validated output passed the path-handling and token-redaction checks.
- [x] Added a regression fix/test for truncated Windows-safe filenames that would otherwise end in `.` after clipping.
- [x] Added a regression fix/test so long clipped Canvas file download names preserve useful final extensions such as `.pdf` and `.docx`.
- [x] Added direct-mode capture and tests for read-only P1 course-adjacent metadata surfaces.
- [x] Ran P1 metadata validation for the same two-course sample with `--skip-file-downloads`; both courses completed with 0 manifest errors and empty `retry-list.json`.
- [x] Reviewed validation output for completeness; P0 direct Canvas content and P1 metadata capture looked reasonable for the sample, with export packages still intentionally outside direct validation.
- [x] Added `ANSVARIGA_UNIVERSITET.md`, a Swedish non-technical overview for responsible persons at Swedish universities.
- [x] Added subaccount metadata capture and changed course backup output from a flat `courses/` folder to `subaccounts/<account-id>-<account-name>/courses/...`.
- [x] Ran subaccount-aware list-only validation with explicit `--created-after 2025-04-01`; selected a small fraction of discovered courses under the familiar-area account and wrote subaccount metadata without errors.
- [x] Ran explicit-course direct validation with `--skip-file-downloads` against a two-course sample; both completed with nested subaccount output, 0 errors, empty `retry-list.json`, and 0 token matches in generated text.
- [x] Applied review hardening: default exclusions now match docs, missing Canvas file sizes can still resume from non-empty files, generated content/file paths shorten before the Windows path threshold, calendar events use `include[]`, current-user discovery requires explicit opt-in, and obvious token/session values are redacted from error bodies.
- [x] Split the backup implementation into focused modules under `scripts/canvas-backup/` while keeping `scripts/canvas-backup.mjs` as the CLI entrypoint and test re-export surface.
- [x] Added a dedicated subaccount-name exclusion so courses from direct Canvas subaccounts whose name matches `sandbox` are excluded from broad discovery while explicit course ID runs still bypass broad filters.
- [x] Verified the subaccount-name exclusion locally with syntax, help, redacted config, and Node test checks.
- [x] Reran list-only after adding the dedicated subaccount-name exclusion; the selected count was unchanged, but a portion of courses were explicitly marked with `subaccount_name_contains:sandbox`.
- [x] Changed all course name/code and subaccount-name exclusion terms to uniform edge-only matching, added regression coverage, reran local checks, and saved corrected list-only output with a slightly larger selected count after the filter change.
- [x] Validated a familiar-area selection behavior. With `--created-after 2025-04-01`, 0 courses were selected because all discovered courses predated the cutoff. With `--created-after=`, most courses were selected under the direct account; the sandbox child subaccount selected 0 and subaccount metadata had no errors.
- [x] Ran a familiar-area direct smoke validation on a two-course sample using `--mode direct --skip-file-downloads`; both courses completed with 0 errors, empty retry list, no `.error.json` files, and 0 token matches in generated JSON/HTML/text.
- [x] Updated course output folder naming for future runs from `<course-id>-<label>` to `<course-id>_<sis-course-id-or-code>` and added regression coverage.
- [x] Changed staff user/enrollment snapshots to always include Canvas-returned login/SIS identifiers and removed the obsolete staff identifier redaction setting.
- [x] Re-reviewed the saved list-only manifests for the familiar-area validation scopes; counts, subaccount metadata, and run option redaction still match the documented rollout notes.
- [x] Added an additional familiar-area list-only example; it produced a plausible current-course selection and highlighted possible local utility/support courses that need human review before broad backup.
- [x] Added the file-size guardrail so over-limit Canvas course files are skipped by bytes but retained in metadata and manifests.
- [x] Added `metadata/file-size-summary.json` and manifest size summaries so metadata-only or constrained direct runs can show reported file totals, unknown-size counts, largest files, and over-limit totals.
- [x] Validated the new file-size summaries on the two-course sample without file downloads or export jobs.
- [x] Switched the approved broad-run scope to Canvas root account `1` and documented earlier account-specific checks as validation examples only.
- [x] Recorded that `E:\CanvasBackup` was a previous-server path and the current execution server needs its own explicit output root.
- [x] Added default broad-selection exclusion for courses where Canvas reports `total_students=0`.
- [x] Documented that Canvas Studio media should not be downloaded here and that Canvas New Quizzes are a README-level known gap for now.
- [x] Documented that no major sensitive PII concern is expected, so privacy discussion should not block preservation.
- [x] Reran local checks after the clarification slice: syntax, help, redacted check-config, and Node tests all passed.
- [x] Attempted the root account `1` list-only run, but it did not reach Canvas because the then-assumed `E:\` output path was not available in the current shell.
- [x] Corrected the output-root policy after user clarification: `E:\CanvasBackup` was a previous-server path, real backup runs need an explicit current-runner output root, and list-only/check-config fallback output now uses local ignored `CanvasBackup\canvas-<timestamp>`.

## Risks / Open Questions

- [ ] Teacher identities must be discovered from Canvas staff enrollments; `Ladokstudent` is not relevant to teacher discovery.
- [ ] Canvas API token permissions may limit access to courses, unpublished content, files, quiz questions, or teacher data.
- [ ] External LTI tools may not be fully downloadable through core Canvas LMS APIs; Canvas Studio media is deliberately not downloaded in this backup path.
- [ ] Canvas New Quizzes are LTI-based and are intentionally only documented as a known gap for now.
- [ ] Broad over-capture may increase storage needs and post-backup filtering work.
- [ ] Name filters may still skip legitimate courses if local naming is inconsistent; all configured course name/code and subaccount-name exclusion terms are now edge-only to reduce middle-of-word false positives.
- [ ] Root account `1` list-only selection has not yet been reviewed with the zero-student exclusion.
- [ ] The operator-approved output root must be reachable from the machine/session that runs the backup; `E:\CanvasBackup` was a previous-server path and should not be used here unless explicitly remapped.
- [ ] The zero-student filter depends on Canvas reporting `total_students`; courses with missing counts are kept for review rather than dropped.
- [ ] Creating Canvas content exports is useful but may be slower and may require write-like permissions to start export jobs.

## Related Plans

- `ANSVARIGA_UNIVERSITET.md`
- `CANVAS_BACKUP_PLAN.md`
- `CANVAS_BACKUP_REFACTOR_PLAN.md`
- `CANVAS_BACKUP_ROLLOUT_CHECKLIST.md`
