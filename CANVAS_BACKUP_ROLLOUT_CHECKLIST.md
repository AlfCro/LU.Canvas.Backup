# Canvas Backup Rollout Checklist

Use this checklist to move from planning to the first validated Canvas backup run. The script is approved as the first validation and emergency backup path. Root account `1`, `E:\CanvasBackup`, the `2025-04-01` cutoff, and zero-student exclusion are now approved. No major sensitive PII concern is expected; use the current script boundary and do not let privacy discussion block preservation.

## Required Decisions

- [x] Canvas broad discovery scope is known: root account `1`, including nested subaccounts under that root.
- [x] Example local config points at Canvas beta by default: `CANVAS_BASE_URL=https://lu.beta.instructure.com`.
- [ ] Current-user course discovery is not used for a broad emergency run unless `--allow-user-course-discovery` / `CANVAS_ALLOW_USER_COURSE_DISCOVERY=true` has been explicitly approved as a limited fallback.
- [ ] Subaccount grouping is accepted: course backups will be written under `subaccounts/<account-id>-<account-name>/courses/<course-id>_<sis-course-id-or-code>/`.
- [ ] Canvas token scope is understood, and the token is stored outside Git.
- [x] Canvas requests use a non-empty User-Agent. The default is the generic local identifier `LU.Canvas.Backup/1.0 (Local Canvas backup)`.
- [ ] Relevant Canvas course states are approved. Current script default: `created`, `claimed`, `available`, `completed`.
- [x] First broad-run `created_after` cutoff is approved: `2025-04-01`.
- [x] Courses where Canvas reports `total_students=0` are excluded from broad discovery. Courses with no reported count are kept for review.
- [ ] Course name/code exclusions are approved. The example config uses `test`, `sandlåda`, `sandlada`, `sandbox`, `mall`, `template`, and `demo`, with every term matched only at field edges.
- [ ] Subaccount name exclusions are approved. The example config excludes direct Canvas subaccounts whose name matches `sandbox` at field edges.
- [x] Small validation course IDs are chosen. First validation used a small explicit two-course sample.
- [x] Output root is approved: `E:\CanvasBackup`. Backup runs require an explicit stable `--output` or `CANVAS_OUTPUT_DIR` run folder under that root; reuse it for retries.
- [x] Available storage is broadly approved: `E:\CanvasBackup` has TB-scale space. Still review root list-only counts and file-size summaries before broad content backup.
- [x] Maximum Canvas course file download size is approved: use `--max-file-size-mb 300` / `CANVAS_MAX_FILE_SIZE_MB=300`; over-limit file metadata is still saved, but bytes are skipped.
- [x] `E:\CanvasBackup` is explicitly accepted for the first run.
- [x] Use the current first-pass boundary without further privacy debate before backup: the script does not deliberately fetch submissions, grades, activity logs, private conversations, or student-role membership including `Ladokstudent`.
- [x] The emergency owner has clarified that there is no major sensitive PII concern expected in this system. Keep tokens and backup output out of Git, but do not let privacy discussion block preservation.
- [x] Staff privacy setting for the emergency run uses the current script default: `--staff-include-deleted=false`; staff login/SIS-style identifiers returned by Canvas are always included for follow-up matching.
- [ ] External coverage data availability is known, including matching fields if data is provided.
- [ ] Canvas content export behavior is approved: export types, whether to wait for exports, and timeout.
- [x] Canvas Studio media is explicitly deferred and should not be downloaded here.
- [x] Canvas New Quizzes are documented as a known gap only; make no large effort now to fetch New Quizzes data. The current direct quiz endpoints cover classic Canvas quizzes.

## Local Preflight

- [x] `node --check scripts\canvas-backup.mjs` passed on 2026-05-08 after the root account, E-drive, and zero-student filter changes.
- [x] `node scripts\canvas-backup.mjs --help` printed the expected options on 2026-05-08, including the field-edge exclusion notes, `--include-courses-without-students`, `--max-file-size-mb`, and no obsolete staff identifier redaction flag.
- [x] `node --test scripts\canvas-backup.test.mjs` passed on 2026-05-08, including the review hardening tests, sandbox subaccount exclusion tests, uniform edge-only filter tests, zero-student selection tests, staff login/SIS identifier preservation test, file-size download limit test, and metadata-only file-size summary test.
- [x] User-Agent update validation passed on 2026-05-13: syntax, help, redacted check-config, and `node --test scripts\canvas-backup.test.mjs`.
- [x] `.env` exists locally only if a token is needed; it is ignored by Git.
- [x] `node scripts\canvas-backup.mjs --check-config` can print the redacted configuration before any Canvas API calls, even before a token is configured; it now shows account `1`, `E:\CanvasBackup` timestamped output, `excludeSubaccountNameTerms`, `excludeCoursesWithoutStudents`, and no obsolete staff identifier redaction option.
- [x] `E:\CanvasBackup` is the approved local output root, and the user has confirmed TB-scale space is available there.
- [ ] `E:\CanvasBackup` is mounted and writable from the execution environment. On 2026-05-08, this Codex shell reported `E:\` as not ready, so the root account list-only run did not start.
- [ ] Confirm `run-options.json` shows the intended `baseUrl` before any production or broad backup run.
- [ ] The approved root account `1` selected-course count and file-size summaries are reviewed before broad content backup.
- [ ] Confirm the actual broad-run `run-options.json` shows the expected non-empty `userAgent` before broad backup content is fetched.
- [ ] Confirm the actual broad-run `run-options.json` shows the approved `CANVAS_MAX_FILE_SIZE_MB=300` before broad backup content is fetched.
- [ ] Per-course `metadata/file-size-summary.json` files are reviewed from a metadata-only or small direct run before approving broad storage assumptions.
- [ ] The selected mode is reviewed:
  - `direct` for API snapshots and files.
  - `exports` for Canvas export packages only.
  - `both` for emergency over-capture after validation. The example config uses `both`.
- [ ] Concurrency is conservative for first validation: start with `--concurrency 1` and modest `--file-concurrency`.

## Refactor Validation

Use this only after implementing the behavior-preserving module split described in `CANVAS_BACKUP_REFACTOR_PLAN.md`. No token-backed Canvas API calls or export jobs are required for this validation.

- [x] `node --check scripts\canvas-backup.mjs` passes after the module split.
- [x] `node scripts\canvas-backup.mjs --help` prints the expected options after the module split.
- [x] `node scripts\canvas-backup.mjs --check-config` prints redacted effective options after the module split.
- [x] `node --test scripts\canvas-backup.test.mjs` passes after the module split.
- [x] CLI flags, environment variables, output layout, manifests, privacy defaults, filter behavior, and Canvas API scope are unchanged by the refactor.

## List-Only Selection Check

Run list-only before fetching backup content whenever time allows.

Root account `1` broad selection check is the next required operational gate. Earlier account-specific checks below are validation examples from familiar areas, not production scopes.

Pending root account `1` check:

- Output: stable folder under `E:\CanvasBackup`
- Account: `1`
- Filters: states `created`, `claimed`, `available`, `completed`; `created_after` `2025-04-01`; course name/code exclusions `test`, `sandlåda`, `sandlada`, `sandbox`, `mall`, `template`, and `demo`; subaccount exclusion `sandbox`; exclude Canvas-reported `total_students=0`
- Review selected counts, excluded reason counts, selected subaccount distribution, and file-size summaries before broad content backup.

Validation history (familiar-area examples, not production scopes):

- Several list-only runs against familiar account scopes were used to validate selection behavior with the approved filters. They confirmed: redacted `run-options.json` written, plausible `subaccounts.json` content, selected/excluded counts present in `course-selection.json`, sandbox child subaccounts at 0 selected courses, and the configured course name/code and subaccount-name exclusion terms applying at field edges as documented.
- A subset of these runs deliberately disabled the `created_after` cutoff with `--created-after=` to exercise the historical course population of accounts whose discovered courses predated the example cutoff. With the example cutoff in place those accounts selected 0 courses; with the cutoff disabled they selected most of the discovered set under the direct account.
- One familiar-area list-only example surfaced possible local utility/support or programme shell courses in its selected set. The lesson is that broad generic exclusion terms should not be added for such locally named courses without owner review, because they may be legitimate backup scope.

```powershell
node scripts\canvas-backup.mjs `
  --account-id 1 `
  --course-states created,claimed,available,completed `
  --created-after 2025-04-01 `
  --output E:\CanvasBackup\selection-check-root-1 `
  --list-only
```

Review:

- [x] `run-options.json` redacts the token.
- [x] `subaccounts.json` exists and fetched subaccount metadata looks plausible for the selected account scope.
- [x] `course-selection.json` includes selected and excluded counts.
- [x] `course-selection.json` includes selected subaccount counts and course IDs grouped by subaccount.
- [x] `course-selection.json` excludes courses from direct Canvas subaccounts whose name matches `sandbox` at field edges.
- [x] Excluded reason counts are present for the current-defaults run, including `name_contains:test`, `name_contains:sandlåda`, and status reasons.
- [x] Excluded course samples were reviewed after the false-positive fix; the final uniform edge-filter run has no `name_contains:test`, `name_contains:template`, or `name_contains:demo` exclusions in this scope, and `name_contains:mall` applies to sandbox-account mall courses.
- [x] A familiar-area scope was checked both with and without the example cutoff; the no-cutoff run is the only one that exercises its historical course population.
- [x] Continued manifest review on 2026-05-08 reconfirmed the final list-only counts, zero subaccount metadata errors, and redacted run options for each familiar-area validation scope.
- [x] An additional familiar-area scope was checked as a read-only example; the run had zero subaccount metadata errors and redacted run options.
- [ ] Root account `1` list-only check has been run with the zero-student exclusion.
- [ ] Selected course count and file-size summaries are plausible for the emergency time window. `E:\CanvasBackup` has TB-scale space, but the root account `1` selection still needs review before broad downloads or exports.

## Small Course Validation

Use explicit course IDs so name, status, and created-date filters do not block known validation courses.

```powershell
node scripts\canvas-backup.mjs `
  --course-ids <course-id-1>,<course-id-2> `
  --mode direct `
  --output E:\CanvasBackup\validation-direct `
  --concurrency 1 `
  --file-concurrency 2
```

Small-course validation history (summary):

- A first direct validation used a two-course sample and completed with 0 manifest errors, an empty `retry-list.json`, every reported file downloaded, and 0 token matches in generated text. It also surfaced a Windows path-sanitization bug for truncated trailing-dot filenames, which was fixed and covered by a regression test.
- A P1 metadata validation against the same small sample with `--skip-file-downloads` confirmed that rubrics, outcome groups/links, external tool references, calendar events, group categories, and groups are written without P1 endpoint error files.
- A subaccount-layout validation confirmed that course backups are nested under `subaccounts/<account-id>-<account-name>/courses/`, with `subaccount.json` beside the `courses/` folder, and that no token appears in generated JSON/HTML/text files.
- A file-size-summary validation with `--skip-file-downloads` confirmed that `metadata/file-size-summary.json` is written for each course with reported file counts, total reported bytes, unknown-size counts, and largest-file records.
- A direct smoke validation on a separate familiar-area two-course sample confirmed end-to-end direct capture for staff, sections, file metadata, pages, modules, module items, assignments, discussions/announcements, classic quizzes and questions, external tools, calendar events, and groups, with 0 errors and 0 token matches in generated output.

Validate:

- [x] Course metadata, syllabus, sections, tabs, settings, modules, pages, assignments, discussions, quizzes, and files are present where expected.
- [x] Course directories are nested under the expected `subaccounts/<account-id>-<account-name>/courses/` folder, with a `subaccount.json` file beside the `courses/` folder.
- [x] New P1 direct metadata surfaces are present or have recorded endpoint errors: rubrics, outcome groups/links, external tool references, calendar events, group categories, and groups without memberships.
- [x] Staff users and staff enrollments include teachers, TAs, and designers when present.
- [x] Staff users and staff enrollments preserve Canvas-returned login/SIS identifiers when present.
- [x] File inventory summaries are written to `metadata/file-size-summary.json`; local tests and a two-course token-backed metadata-only validation cover the summary path.
- [x] Module item counts look complete for courses with modules; the script should paginate `/modules/:id/items`.
- [x] Staff users, staff enrollments, sections, tabs, and settings are written once under `people/` or `structure/`, not duplicated under `metadata/`.
- [x] No deliberate student-role user list is fetched.
- [x] File downloads use stable paths and no token appears in generated text output.
- [ ] Permission failures are recorded in course manifests instead of stopping the whole run. No permission failures occurred during the first direct validation, so this still needs an error-bearing validation case or broad-run evidence.
- [ ] At least one known teacher course is checked manually.

## Export Validation

Run exports on a small course sample after direct validation.

```powershell
node scripts\canvas-backup.mjs `
  --course-ids <course-id> `
  --mode exports `
  --export-types common_cartridge `
  --output E:\CanvasBackup\validation-exports `
  --concurrency 1
```

Validate:

- [ ] Export creation is permitted by the token.
- [ ] Export progress files and final export metadata are written.
- [ ] Downloaded packages have expected extensions and non-zero sizes.
- [ ] Long-running exports do not block direct API/file capture plans.

## Broad Emergency Run

Proceed after the list-only and small-course checks are reviewed, or after the emergency owner explicitly accepts the risk of skipping validation.

- [ ] Use the approved root account `1` scope.
- [ ] Pass `--account-id 1` / `CANVAS_ACCOUNT_ID=1` for broad discovery, or use exact `--course-ids` for targeted retries.
- [ ] Confirm the selected-course subaccount distribution is plausible before fetching broad backup content.
- [ ] Use the approved states, cutoff, course name/code exclusions, subaccount name exclusions, and output path.
- [ ] Use an explicit output path that can be reused for retry runs.
- [ ] Keep zero-student exclusion enabled for broad discovery unless an exact `--course-ids` retry intentionally bypasses filters.
- [ ] Set the approved `--max-file-size-mb 300` / `CANVAS_MAX_FILE_SIZE_MB=300` threshold when storage is constrained, and treat `skipped_size_limit` records as known gaps.
- [ ] Use approved staff deleted-enrollment setting; do not include deleted/rejected/inactive staff enrollments unless explicitly needed.
- [ ] Keep concurrency conservative unless the small run showed stable API behavior.
- [ ] Prefer `--mode both` when storage and export timing allow redundant capture.
- [ ] Preserve manifests even when individual endpoints fail.
- [ ] Do not broaden into student submissions, grades, activity logs, private conversations, deliberate `Ladokstudent` user capture, Canvas Studio downloads, or large New Quizzes work without explicit approval.
- [ ] Keep tokens and output out of Git; no major sensitive PII concern is expected, so do not let privacy discussion block preservation.

## Post-Run Review

- [ ] `backup-manifest.json` status is reviewed.
- [ ] Failed courses and endpoint errors are counted and triaged.
- [ ] `retry-list.json` is reviewed and used for any targeted `--course-ids` retry run.
- [ ] Course-selection manifest is saved with the backup for audit.
- [ ] `subaccounts.json` and per-subaccount `subaccount.json` files are saved with the backup for audit.
- [ ] Storage location is protected as institutional backup output and kept out of Git.
- [ ] Any remaining manual retry notes are added from failed course or endpoint records.
- [ ] Any unexpected scope-sensitive incidental content is flagged for later review rather than deleted during emergency preservation.
