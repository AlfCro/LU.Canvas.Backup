# LU Canvas Backup

Documentation and planning for an emergency backup of educational material and related course metadata from Lund University's Canvas instance.

Current status: `scripts/canvas-backup.mjs` is approved as the first validation and emergency backup path, with an emergency over-capture bias inside a filtered course set. Under the current time pressure, the intended approach is to exclude obvious noise first, then preserve too much reachable Canvas course content and metadata for selected courses rather than miss material.

For a Swedish lay overview aimed at responsible persons at Swedish universities, see `ANSVARIGA_UNIVERSITET.md`.


## Quick Start

Prerequisites:

- Node.js 20 or newer on `PATH`.
- A Canvas API token. Broad discovery (`/accounts/<id>/courses`) requires an admin-scoped token; targeted `--course-ids` runs work with any token that can read the listed courses.
- Write access to the backup output drive. The approved root is `E:\CanvasBackup`, where TB-scale space is available.

Configure:

1. Copy `.env.example` to `.env`.
2. Set `CANVAS_TOKEN=<your token>`. Adjust `CANVAS_ACCOUNT_ID`, `CANVAS_CREATED_AFTER`, exclusion lists, and `CANVAS_MAX_FILE_SIZE_MB` as needed.
3. Set `CANVAS_OUTPUT_DIR` to a stable run folder (e.g. `E:\CanvasBackup\run-2026-05-11`) for real backup runs. Leave blank for list-only/check-config — those default to a timestamped folder under `E:\CanvasBackup`.

Run (PowerShell):

```powershell
# 1. Verify the effective config (no Canvas API calls).
node scripts\canvas-backup.mjs --check-config

# 2. List the selected courses without backing anything up.
node scripts\canvas-backup.mjs --list-only

# 3. Real backup run. CANVAS_OUTPUT_DIR or --output is required.
node scripts\canvas-backup.mjs --output E:\CanvasBackup\run-2026-05-11

# 4. Resume an interrupted run into the same folder.
#    --skip-completed-courses skips courses whose course-backup-manifest.json
#    is already "completed"; everything else is retried.
node scripts\canvas-backup.mjs --output E:\CanvasBackup\run-2026-05-11 --skip-completed-courses
```

CLI flags override the matching `.env` values. Use `node scripts\canvas-backup.mjs --help` for the full option list.

Run output:

- `run.log` — tee'd, ISO-timestamped copy of every console line in the run folder. Appended across reruns into the same folder.
- `backup-manifest.json` — full run summary, written at the end.
- `retry-list.json` — failed/partially failed course IDs to feed back via `--course-ids`.
- `subaccounts/<account-id>-<account-name>/courses/<course-id>_<sis-or-code>/` — per-course content.

## Context

- Canvas instance: https://lu.instructure.com/
- Canvas API docs: https://developerdocs.instructure.com/services/canvas
- `Ladokstudent` is an inherited Canvas student role, not a section or backup source.
- Users with the `Ladokstudent` role should not be deliberately fetched; that student data exists elsewhere.
- Teachers, TAs, and designers must be discovered from Canvas staff roles.

## Documentation

- `ANSVARIGA_UNIVERSITET.md` is a Swedish non-technical overview for responsible persons at Swedish universities.
- `PROJECT.md` describes the project context, constraints, API surfaces, and open questions.
- `WORKPLAN.md` tracks current status and the next handoff.
- `CANVAS_BACKUP_PLAN.md` contains the endpoint inventory and proposed backup strategy.
- `CANVAS_BACKUP_REFACTOR_PLAN.md` describes the planned behavior-preserving split of the backup script into focused modules.
- `CANVAS_BACKUP_ROLLOUT_CHECKLIST.md` contains the preflight, validation, broad-run, and post-run checklist.
- `LESSONS.md` records append-only lessons learned.

## Backup Script

`scripts/canvas-backup.mjs` is the approved first-run entrypoint. Broad discovery should use Canvas root account `1`; earlier account-specific runs against familiar areas are validation examples only.

The backup implementation is split into focused modules under `scripts/canvas-backup/` for Canvas API access, configuration, course selection, subaccount grouping, per-course backup, output files, path safety, and generic utilities. The entrypoint keeps the same CLI behavior and re-exports helpers used by the tests.

In direct mode, the script captures course files/folders, pages, syllabus content, modules and fully paginated module items, assignments, quizzes and quiz questions, discussions, announcements, assignment groups, sections, tabs, settings, rubrics, outcome groups/links, group categories/groups without memberships, calendar events, external tool references, subaccount metadata, and staff role metadata for teachers, TAs, and designers. It can also create Canvas content exports when run in `exports` or `both` mode.

Backup output is organized by each course's direct Canvas account/subaccount under `subaccounts/<account-id>-<account-name>/courses/<course-id>_<sis-course-id-or-code>/`. The underscore makes the Canvas numeric course ID easier to distinguish from SIS GUIDs. Each run also writes `subaccounts.json` at the run root, and each subaccount folder contains a `subaccount.json` metadata snapshot.

After a backup run, `backup-manifest.json` records the full run summary and `retry-list.json` lists any failed or partially failed course IDs so a follow-up run can target them with `--course-ids`. Reuse the same explicit output folder for retries; existing non-empty downloads are skipped where possible, so interruption, storage exhaustion, or transient Canvas errors can be resumed to the same practical effect.

Each run also appends a tee'd, ISO-timestamped copy of console output to `run.log` inside the same output folder. Repeated runs against the same `--output` directory keep appending, so the file becomes a chronological record of every attempt against that backup set.

When a previous run was interrupted (for example by storage exhaustion) and the top-level `backup-manifest.json` was not written, use `--skip-completed-courses` on the retry to drop courses whose per-course `course-backup-manifest.json` already records `status: "completed"`. Courses with `completed_with_errors`, `failed`, or no prior manifest are still processed so the retry can finish them.

Backup runs require `--output` or `CANVAS_OUTPUT_DIR` so retries and file-download skips resume in the same directory. The approved local backup root is `E:\CanvasBackup`, where TB-scale space is available. List-only and check-config runs may still use timestamped folders under `E:\CanvasBackup`.

The approved emergency storage guardrail is `--max-file-size-mb 300` or `CANVAS_MAX_FILE_SIZE_MB=300`. Canvas course files larger than 300 MB are skipped by bytes, while the script still writes the full file inventory, a per-course `metadata/file-size-summary.json` from Canvas-reported file sizes, and each over-limit record in `metadata/file-downloads.json`. This limit does not currently govern Canvas content export package downloads.

Staff deleted/rejected/inactive enrollments are excluded by default. Use `--staff-include-deleted=true` only when that privacy tradeoff is approved. Staff user and enrollment snapshots always preserve Canvas-returned login/SIS-style identifiers such as `login_id`, `sis_login_id`, and `sis_user_id`, because those identifiers are needed for follow-up matching.

Copy `.env.example` to a local `.env` when token-backed runs are needed. Local `.env` files and backup output folders are ignored by Git because they may contain Canvas tokens or sensitive institutional data.

The example configuration uses `CANVAS_ACCOUNT_ID=1`, `CANVAS_BACKUP_MODE=both`, limits discovery to courses created on or after the approved initial cutoff `2025-04-01`, sets `CANVAS_MAX_FILE_SIZE_MB=300`, excludes obvious course name/code noise terms including `test`, `sandlåda`, `sandlada`, `sandbox`, `mall`, `template`, and `demo`, excludes courses whose direct Canvas subaccount name matches `sandbox`, and excludes courses where Canvas reports `total_students=0`. All configured course name/code and subaccount-name exclusion terms use the same edge rule: the term must be at the absolute end of the field, or at the beginning followed by a non-`a-z` character.

Broad discovery now requires an admin account scope through `--account-id` / `CANVAS_ACCOUNT_ID`, unless exact `--course-ids` are used. The limited current-user fallback through `/api/v1/courses` must be explicitly enabled with `--allow-user-course-discovery` or `CANVAS_ALLOW_USER_COURSE_DISCOVERY=true` so it is not mistaken for an admin emergency selection.

Use `node scripts\canvas-backup.mjs --check-config` to print the redacted effective configuration before making Canvas API calls. This works even before a local token is available, and shows `token: null` until `CANVAS_TOKEN` or `--token` is set.

The script retries retryable HTTP statuses and thrown fetch/network errors, and it skips already downloaded non-empty files when Canvas omits file sizes. It sends the Canvas bearer token only to the configured Canvas origin. Absolute external file or export download URLs are fetched without the Canvas `Authorization` header. Canvas error bodies in manifests are redacted for obvious bearer token, token parameter, and session fields, but they are not a full personal-data scrub.

Local verification:

```powershell
node --check scripts\canvas-backup.mjs
node scripts\canvas-backup.mjs --help
node --test scripts\canvas-backup.test.mjs
node scripts\canvas-backup.mjs --check-config
```

## Intended Backup Scope

The planned backup should cover course files, folders, pages, syllabus content, modules, module items, assignments, quizzes, discussions, announcements, course settings, tabs, sections, staff role metadata, course-adjacent metadata such as rubrics/outcomes/groups/calendar events/external tool references, and redundant Canvas content export packages where permissions and time allow.

Student submissions, grades, activity logs, and private communications are outside the current backup scope and should not be deliberately fetched unless explicitly approved later. The emergency owner has clarified that there is no major sensitive PII concern in this system; still keep tokens and institutional backup output out of Git.

The inherited `Ladokstudent` role is also outside deliberate user capture. It is student membership data, and that data is available elsewhere.

Classic Canvas quizzes are covered by the current Canvas quiz endpoints. Canvas New Quizzes are LTI-based; mention this limitation in README-style handoff notes, but do not spend time on a large New Quizzes fetch path now.

Canvas Studio media should not be downloaded by this backup path because it is usually large. Keep Studio or external LTI references as metadata only unless a separate follow-up scope is approved.

## Course Selection

The broad run should be filtered before content backup starts:

- Exclude courses whose name or course code matches obvious noise terms such as `test`, `sandlåda`, `sandlada`, `sandbox`, `mall`, `template`, or `demo`.
- Exclude courses whose direct Canvas subaccount name matches `sandbox`.
- Apply the same edge rule to every configured exclusion term: the term must be at the absolute end of the field, or at the beginning followed by a non-`a-z` character.
- Include only relevant Canvas course states.
- Use the approved initial created-after cutoff `2025-04-01`.
- Exclude courses where Canvas reports `total_students=0`; courses with no reported count are kept for review rather than silently dropped.
- Support exact backups from `--course-ids` or a course ID file.
- Run list-only first where possible to inspect selected and excluded counts.

## License

Copyright (c) 2026 Lund University. Licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). Free to use, modify, and distribute for any noncommercial purpose, including by other educational institutions, public research organizations, and government institutions. Commercial use requires a separate agreement.
