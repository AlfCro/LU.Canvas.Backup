# Project: LU Canvas Backup

## Overview

This project is for emergency planning and eventual tooling to back up educational material from Lund University's Canvas instance:

- Canvas instance: https://lu.instructure.com/
- Canvas API documentation: https://developerdocs.instructure.com/services/canvas

Current direction, updated on 2026-05-08: `scripts/canvas-backup.mjs` is approved as the first validation and emergency backup path. Broad discovery should work from Canvas root account `1`, whose nested subaccounts are the real scope; account-specific checks against familiar areas are validation examples, not production scopes. The emergency backup still has an over-capture bias inside the selected course set, but the selected set now excludes courses where Canvas reports `total_students=0`. The approved script's direct mode includes staff role metadata, current staff enrollments, staff login/SIS identifiers returned by Canvas, sections, tabs, settings, subaccount metadata, and read-only course-adjacent metadata in addition to content/material surfaces. Course backup directories are grouped by each course's direct Canvas account/subaccount. The example configuration now uses `CANVAS_ACCOUNT_ID=1`, `CANVAS_BACKUP_MODE=both`, `CANVAS_CREATED_AFTER=2025-04-01` as the approved initial cutoff, `CANVAS_MAX_FILE_SIZE_MB=300`, and `CANVAS_EXCLUDE_COURSES_WITHOUT_STUDENTS=true`. The approved local output root is `E:\CanvasBackup`, where TB-scale space is available. Deleted/rejected/inactive staff enrollments require an explicit option, but the emergency owner has clarified there is no major sensitive PII concern in this system, so privacy discussion should not block the backup. The script defaults now match the documented test/sandbox/template/demo course name/code exclusion list, with all configured course name/code and subaccount-name exclusion terms matched only at field edges. A term matches at the absolute end of the field, or at the beginning followed by a non-`a-z` character. The script requires explicit opt-in for limited current-user course discovery and includes generated content/file path fallbacks for Windows. The first small direct validation, follow-up P1 metadata validation, subaccount-aware list-only validation, nested subaccount output validation, corrected uniform-edge-filter list-only validation, an additional direct smoke validation, and two-course file-size-summary validation all completed successfully for the current samples/scopes. The backup implementation is now split into focused modules under `scripts/canvas-backup/` while keeping the same CLI behavior, output layout, staff deleted-enrollment privacy default, and Canvas API scope. Direct course file downloads now use the approved 300 MB maximum file size via `--max-file-size-mb` / `CANVAS_MAX_FILE_SIZE_MB`; over-limit file metadata is preserved while bytes are skipped. Direct runs also write `metadata/file-size-summary.json` from Canvas-reported file sizes, including metadata-only runs with `--skip-file-downloads`, so operators can review storage pressure and known gaps.

For a Swedish non-technical description aimed at responsible persons at Swedish universities, see `ANSVARIGA_UNIVERSITET.md`.

## Objective

Use the Canvas API to discover and back up:

- All relevant course documents and files.
- Course structure, especially modules and module items.
- Canvas-authored content such as pages, syllabus bodies, assignments, quizzes, discussions, and announcements.
- Teacher, TA, and designer information, because those staff roles are backup-relevant and are not covered by student-role data.
- Canvas account/subaccount metadata for the selected courses, with backup output organized by subaccount.
- Additional course-level metadata and adjacent teaching material when available, even if it later turns out to be redundant.

`Ladokstudent` is the name of a Canvas inherited student role, not a section or coverage source. Do not deliberately fetch or reconcile users just because they have that role; the same student data exists elsewhere and is outside the first-pass backup scope. Canvas sections can still be preserved as course structure metadata.

Emergency collection principle: first select a relevant course set, then capture broadly inside that set. When a Canvas surface is plausibly connected to course delivery, backup coverage, restore ability, or teacher follow-up, capture it and let manifests make later filtering possible. Exclusions should be explicit and documented.

Course selection principle: because the total Canvas dataset is huge, use coarse discovery filters before backup. Exclude obvious test/sandbox/template/demo courses by name, code, or direct subaccount name, including `sandlåda`, `sandlada`, `sandbox`, `mall`, `template`, and `demo` spelling variants. Apply the same edge rule to every configured term: the term must appear at the absolute end of the field, or at the beginning followed by a non-`a-z` character. Limit discovery to relevant Canvas statuses, use the approved initial created-after cutoff `2025-04-01`, exclude courses where Canvas reports `total_students=0`, and allow exact course ID lists when a targeted backup or retry is needed.

## Architecture

Planned emergency flow:

1. Discover as many relevant Canvas courses as the token, root account `1`, nested subaccounts, and course filters allow.
2. Fetch Canvas account/subaccount metadata for the configured account scope and for the direct account of every selected course.
3. If a separate course/student coverage file is provided, use it for coverage checks only; do not use the Canvas `Ladokstudent` inherited role as a discovery source or gate.
4. Use Canvas API calls to inventory and back up broad course structure, educational materials, metadata, and files.
5. Use Canvas API enrollment/user calls to discover teachers, TAs, designers, and other role metadata needed for follow-up.
6. Capture redundant forms where useful, such as direct API snapshots plus Canvas content export packages. Module items must be fetched through the paginated per-module endpoint, not trusted from the partial `include[]=items` expansion on the modules list.
7. Save per-course manifests that make it possible to verify coverage, retry failed resources, filter later, and restore or inspect material later.

The script is approved for first validation and emergency use, but every real run should still start safely, write auditable manifests, and use documented course-selection filters before broad content capture.

## Tech Stack

| Component | Planned Technology |
| --------- | ------------------ |
| Canvas access | Canvas REST API over HTTPS |
| Authentication | OAuth2 bearer token / Canvas access token in `Authorization` header |
| Course coverage source | Canvas course discovery plus any separately supplied coverage data; ignore `Ladokstudent` users for backup capture |
| Backup format | Files plus JSON manifests; direct API snapshots; Canvas content export packages where permissions and time allow |
| Backup storage | Approved local path: `E:\CanvasBackup` |
| Runtime | Dependency-free Node.js script at `scripts/canvas-backup.mjs` |

## Canvas API Surfaces

Primary discovery:

- `GET /api/v1/accounts/:account_id/courses` for admin-level course discovery from root account `1`, with `include[]=total_students` so zero-student courses can be excluded before backup.
- `GET /api/v1/accounts/:id` for account/subaccount metadata.
- `GET /api/v1/accounts/:account_id/sub_accounts` with recursive pagination for subaccount metadata under the configured scope.
- `GET /api/v1/courses` for courses visible to the current token.
- `GET /api/v1/courses/:id` with includes such as `syllabus_body`, `term`, `sections`, `teachers`, `tabs`, and `concluded`.

Teacher discovery:

- `GET /api/v1/courses/:course_id/users` with `enrollment_type[]=teacher`, `ta`, and `designer`.
- Include `enrollments` when needed to preserve role, section, state, and course context.
- Course list `include[]=teachers` can provide a faster first pass, but per-course users are the safer source of record.

Educational material and structure:

- Files and folders: `/courses/:course_id/files`, `/courses/:course_id/folders`.
- Pages: `/courses/:course_id/pages`.
- Modules and module items: `/courses/:course_id/modules`, `/courses/:course_id/modules/:module_id/items`.
- Assignments and assignment groups: `/courses/:course_id/assignments`, `/courses/:course_id/assignment_groups`.
- Discussions and announcements: `/courses/:course_id/discussion_topics`, including announcement filtering.
- Quizzes and quiz questions: `/courses/:course_id/quizzes`, `/courses/:course_id/quizzes/:quiz_id/questions` for classic Canvas quizzes. New Quizzes are LTI-based and should be mentioned as a known gap without a large fetch effort now.
- Course settings and tabs: `/courses/:course_id/settings`, `/courses/:course_id/tabs`.
- Packaged exports: `/courses/:course_id/content_exports` for `common_cartridge` and `zip` when permissions and timing allow.
- Additional emergency surfaces now captured in direct mode: sections, staff enrollments, rubrics, outcome groups and links, external tool references, calendar events, course group categories, course groups without memberships, and other course-level configuration that helps reconstruct or audit a course.

## Key Constraints & Decisions

1. `scripts/canvas-backup.mjs` is approved as the first validation and emergency backup path; broad execution should use approved root account `1`, `E:\CanvasBackup`, the `2025-04-01` cutoff, zero-student exclusion, and an explicit resumable output folder.
2. Favor broad capture inside the selected course set. In the emergency phase, taking too much Canvas course content is preferable to missing content, but the selected course set should still exclude obvious noise.
3. Do not store access tokens or secrets in the repository.
4. Prefer the `Authorization: Bearer <token>` header over query-string tokens.
5. Send the Canvas bearer token only to the Canvas origin. Absolute external download/export URLs must be fetched without the Canvas `Authorization` header.
6. Use read-only Canvas API calls as the baseline. Treat Canvas content export jobs as in scope for emergency capture when permissions and timing allow, because they provide a redundant restore-oriented package.
7. Back up educational material, course metadata, files, structure, and teacher/role metadata first. Avoid deliberate grade, submission, private conversation, or activity-log export in the current script path, but do not let privacy discussion delay the emergency backup.
8. Do not fetch users with the inherited `Ladokstudent` role for backup coverage; that student-role data exists elsewhere.
9. Treat Canvas as the source for teacher, TA, and designer assignments.
10. The discovery filters should exclude course names/codes using the terms `test`, `sandlåda`, `sandlada`, `sandbox`, `mall`, `template`, or `demo`, and direct Canvas subaccount names using `sandbox`. Every configured course or subaccount term is edge-only: the term must be at the absolute end of the field, or at the beginning followed by a non-`a-z` character. The filters also include only configured relevant statuses, require `created_at` on or after the approved initial cutoff `2025-04-01`, and exclude courses where Canvas reports `total_students=0`.
11. Explicit course ID backups should remain possible for targeted runs and should not be blocked by broad discovery filters.
12. Use `E:\CanvasBackup` as the local backup output root. Backup runs require an explicit `--output` or `CANVAS_OUTPUT_DIR` run folder so retries resume in the same directory.
13. Staff login/SIS-style identifiers returned by Canvas are always included in staff user/enrollment snapshots because they are needed for follow-up matching. Deleted/rejected/inactive staff enrollments still require explicit approval.
14. The first small direct validation used an explicit two-course sample. This validates the current script path for a small sample only; it does not approve broad-run filters or scope.
15. A follow-up direct validation used the same explicit two-course sample with `--skip-file-downloads`. It confirmed the P1 metadata files for rubrics, outcome groups/links, external tools, calendar events, group categories, and groups are written without endpoint errors for the sample courses.
16. Backup output is now grouped by direct Canvas account/subaccount under `subaccounts/<account-id>-<account-name>/courses/<course-id>_<sis-course-id-or-code>/`, with `subaccounts.json` at the run root and `subaccount.json` in each subaccount folder. Course folders use an underscore after the Canvas numeric course ID so SIS GUIDs remain readable.
17. Subaccount validation used a familiar account scope. The list-only run used explicit `--created-after 2025-04-01`, selected a small fraction of discovered courses under the target account, and wrote subaccount metadata without errors. After the sandbox subaccount exclusion and final uniform edge-only filter change, the list-only selection grew slightly under the same account, kept the configured sandbox child subaccount at 0 selected courses, and wrote subaccount metadata without errors. The explicit direct validation used a two-course sample with `--skip-file-downloads`; both completed with nested subaccount output, empty `retry-list.json`, no `.error.json` files, and 0 token matches in generated text. This validates the subaccount layout technically; the production scope is root account `1`.
18. A second familiar-scope check was another validation-only run, not a production scope decision. With the approved `--created-after 2025-04-01`, the list-only run discovered hundreds of courses and selected 0 because every discovered course was older than the cutoff. A second list-only run that disabled the cutoff with `--created-after=` selected most of the discovered set under the direct account, kept the sandbox child account at 0 selected courses, and wrote subaccount metadata without errors. A direct smoke validation on a small two-course sample with `--mode direct --skip-file-downloads` completed with nested subaccount output, empty `retry-list.json`, no `.error.json` files, and 0 token matches in generated JSON/HTML/text. For production, use root account `1` with the approved initial `2025-04-01` cutoff unless a targeted retry uses exact course IDs.
19. An additional familiar-scope list-only example used the example `--created-after 2025-04-01`, discovered several hundred courses, selected a portion, grouped all selected courses under the direct account, and wrote subaccount metadata without errors. The selected list included possible local utility/noise courses; do not add new generic exclusions for these without owner review because they may be legitimate support or programme shell courses.
20. Use `--max-file-size-mb 300` / `CANVAS_MAX_FILE_SIZE_MB=300` as the approved emergency storage guardrail. It skips individual Canvas course file downloads above 300 MB when Canvas reports a size, while still saving file metadata and a skip record. Each direct run writes `metadata/file-size-summary.json` so reported file totals, unknown-size counts, largest files, and over-limit totals can be reviewed even when file downloads are skipped. The threshold does not currently limit Canvas content export package downloads.
21. A file-size-summary validation used a two-course sample with `--mode direct --skip-file-downloads`. Both courses completed with empty retry lists, no `.error.json` files, and 0 token matches in generated JSON/HTML/text. The summaries showed file counts in the hundreds and total reported bytes ranging from a few hundred MiB to over a GiB per course, with 0 unknown-size files. A 300 MB cutoff would skip a small minority of sample files but a majority of total bytes.
22. Broad account discovery should use root `--account-id 1` / `CANVAS_ACCOUNT_ID=1` or exact `--course-ids`. The `/api/v1/courses` current-user fallback is intentionally opt-in only (`--allow-user-course-discovery` / `CANVAS_ALLOW_USER_COURSE_DISCOVERY=true`) because it can silently produce a tiny user-visible selection.
23. Broad emergency output can contain ordinary teaching material, discussions, pages, assignment descriptions, announcements, files, export packages, or Canvas error text. The emergency owner has clarified there is no major sensitive PII concern here, but the script still redacts obvious token/session fields in error bodies and local tokens/output must stay out of Git.
24. Canvas Studio media should not be downloaded in this backup path because it is usually large. Preserve ordinary Canvas/LTI references as metadata only unless a separate Studio follow-up is approved.
25. Canvas New Quizzes should be mentioned as a known gap in README-style handoff notes, but no large implementation effort should be spent now on fetching New Quizzes data.

## Open Questions

- [x] Canvas root account ID for broad discovery is `1`; nested subaccounts under root account `1` are in scope through the account tree.
- [ ] Will any separate non-Canvas course/student coverage file be provided for coverage checks?
- [ ] Which Canvas identifiers map to any external coverage data: `sis_course_id`, course code, section SIS ID, or another field?
- [ ] Which Canvas statuses are relevant enough for the first broad run?
- [x] Initial `created_after` cutoff `2025-04-01` is approved for the first broad run.
- [x] Earlier account-specific checks against familiar areas are validation examples only; broad production discovery should use root account `1`.
- [x] Canvas Studio media should not be downloaded in this backup path.
- [x] Canvas New Quizzes should be documented as a known gap, with no large fetch effort now.
- [x] No major sensitive PII concern is currently expected; do not let privacy discussion block preservation.
- [x] Use `E:\CanvasBackup` as the local backup root; TB-scale space is available there.
- [ ] Confirm selected-course counts and storage estimates from a root account `1` list-only run before broad content backup.
- [x] Use `CANVAS_MAX_FILE_SIZE_MB=300` for broad emergency runs unless the operator explicitly overrides it.
