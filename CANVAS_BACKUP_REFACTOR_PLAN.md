# Canvas Backup Script Refactor Plan

## Decision

Completed on 2026-05-08: `scripts/canvas-backup.mjs` was split into multiple focused modules before adding more substantial backup behavior. This was done as a behavior-preserving maintenance slice; rerun the local verification commands before any broad backup run or further feature work.

Do not change Canvas API scope, output format, filtering defaults, privacy defaults, or command-line behavior as part of the refactor.

## Why Now

Before the split, `scripts/canvas-backup.mjs` was over 2,200 lines and contained several distinct responsibilities:

- CLI argument parsing, environment loading, and option validation.
- Canvas HTTP access, pagination, retry behavior, and downloads.
- Course discovery, course filtering, and subaccount grouping.
- Per-course backup orchestration.
- Direct resource capture for files, pages, modules, staff roles, structure, metadata, and quizzes.
- Content export creation and download.
- Manifest, retry-list, JSON, HTML, and error output.
- Windows-safe path and file-name handling.

The original file worked, but new changes were becoming harder to review safely. The conservative split should make future fixes easier without disturbing the already validated emergency backup behavior.

## Implemented Module Layout

`scripts/canvas-backup.mjs` remains the executable entrypoint with the same CLI behavior. It also re-exports the helper functions used by `scripts/canvas-backup.test.mjs` so existing tests remain useful while modules live underneath it.

```text
scripts/
  canvas-backup.mjs
  canvas-backup/
    canvas-api.mjs
    configuration.mjs
    course-backup.mjs
    course-selection.mjs
    output-files.mjs
    path-safety.mjs
    subaccounts.mjs
    utilities.mjs
```

Suggested ownership:

- `canvas-api.mjs`: `CanvasApi`, Canvas HTTP/network error classes, authorization scoping, retry handling, pagination, downloads, URL parameter helpers.
- `configuration.mjs`: defaults, option reading, output-dir validation, help text, redacted option printing.
- `course-selection.mjs`: discovered-course filtering, filter reasons, selection summaries, discovery scope validation, course discovery.
- `subaccounts.mjs`: account/subaccount metadata fetching, subaccount summaries, course-to-subaccount output grouping.
- `course-backup.mjs`: `backupCourse`, direct resource capture, staff roles, files, pages, modules, assignments, discussions, announcements, quizzes, course-adjacent metadata, content exports.
- `output-files.mjs`: JSON/text/HTML writers, syllabus writer, manifest error recording, retry-list building, error serialization and redaction.
- `path-safety.mjs`: Windows-safe segment sanitizing, output folder names, generated content paths, file target paths, extension preservation.
- `utilities.mjs`: `mapLimit`, sleep, `.env` loading, argument parsing, primitive readers, list/string/date/boolean normalization, small generic helpers.

If a split creates circular imports, prefer moving the smallest shared helper to `utilities.mjs` or `path-safety.mjs` rather than creating a broad shared module.

## Refactor Sequence

All items below were completed on 2026-05-08.

1. Extract pure path and file-name helpers to `path-safety.mjs`.
   - Keep existing exported names available from `scripts/canvas-backup.mjs`.
   - Run the path-related tests immediately after this slice.

2. Extract generic utilities and primitive readers to `utilities.mjs`.
   - Keep behavior for empty values, booleans, lists, dates, retry delay, sleep, and concurrency unchanged.

3. Extract `CanvasApi` and HTTP-related errors to `canvas-api.mjs`.
   - Keep bearer-token scoping exactly as validated: send Canvas authorization only to the configured Canvas origin.
   - Preserve retry behavior for retryable statuses and thrown network failures.

4. Extract configuration and CLI helpers to `configuration.mjs`.
   - Keep CLI flags, environment variable names, defaults, help text, and redacted `--check-config` output unchanged.

5. Extract course selection and subaccount logic to `course-selection.mjs` and `subaccounts.mjs`.
   - Keep list-only manifests and selected/excluded reason counts unchanged.
   - Keep subaccount folder naming and grouping unchanged.

6. Extract per-course backup logic to `course-backup.mjs`.
   - Keep output paths, resource filenames, manifest summaries, and error behavior unchanged.
   - Avoid adding new endpoints during this slice.

7. Leave `scripts/canvas-backup.mjs` as a thin entrypoint.
   - It should load `.env`, parse options, create the API client, discover/select courses, write top-level manifests, run course backups, write `backup-manifest.json`, and set exit codes.
   - It should re-export the functions currently imported by `scripts/canvas-backup.test.mjs`, either directly or via module re-exports.

## Verification

Run these after the refactor and before any backup execution. They passed locally on 2026-05-08 after the module split:

```powershell
node --check scripts\canvas-backup.mjs
node scripts\canvas-backup.mjs --help
node scripts\canvas-backup.mjs --check-config
node --test scripts\canvas-backup.test.mjs
```

No token-backed Canvas API call is required for the refactor validation. Do not run export validation as part of this refactor unless it is separately approved, because content exports start Canvas jobs.

## Acceptance Criteria

- The CLI commands and environment variables behave as before.
- Existing tests pass without weakening assertions.
- `--check-config` still redacts the token and can run without a token.
- `--help` still documents the same operational options.
- Existing output layout is unchanged, including `subaccounts/<account-id>-<account-name>/courses/...`.
- `retry-list.json`, `backup-manifest.json`, per-course manifests, `.error.json` files, and generated content paths remain compatible with existing validation output.
- No broad backup, real Canvas export job, or new endpoint behavior is introduced by the refactor itself.

## Timing Guidance

If a broad emergency run is imminent, defer the refactor until after that run and keep the validated script stable. If there is time before the next operational backup action, do the refactor first so future fixes are easier to inspect and test.
