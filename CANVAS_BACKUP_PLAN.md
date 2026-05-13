# Canvas Backup Plan

## Current Instruction

As of 2026-05-13, `scripts/canvas-backup.mjs` is approved as the first validation and emergency backup path. Planning remains the source of truth for scope decisions, with an emergency bias to capture too much Canvas course content and metadata rather than risk missing material after selecting the right courses. Broad discovery should use Canvas root account `1` and its nested subaccount tree; earlier account-specific checks against familiar areas are validation examples only. The approved direct mode includes staff users/enrollments with Canvas-returned login/SIS identifiers preserved, sections, tabs, settings, read-only course-adjacent metadata, subaccount metadata, fully paginates module items, retries thrown fetch/network errors, requires explicit output paths for backup runs so retries reuse the same directory, writes per-course file-size summaries from Canvas file metadata, and has Windows path-length fallbacks for generated content and files. All HTTP requests include a configurable `User-Agent` header, defaulting to `LU.Canvas.Backup/1.0 (Local Canvas backup)`, because Canvas will require an identifying client header. Course backup directories are now grouped by the course's direct Canvas account/subaccount, and the nested layout has been validated against the two-course sample. Direct course file downloads should use the approved emergency maximum file size of 300 MB unless the operator overrides it. Files above that threshold should keep their Canvas metadata and a skip record, but their bytes should not be downloaded during constrained emergency runs. The approved local output root is `E:\CanvasBackup`, where TB-scale space is available. The emergency owner has clarified there is no major sensitive PII concern in this system, so privacy discussion should not block the backup.

## Goal

Prepare a Canvas API based backup that can preserve as much reachable course material, structure, metadata, and teacher information as possible under time pressure, after applying coarse course-selection filters that remove obvious noise.

The first useful output should answer:

- Which Canvas courses and sections are selected by the configured filters, and how they relate to any separately supplied external coverage data.
- Which educational materials and metadata exist in each course?
- How is each course structured?
- Who are the teachers, TAs, and designers responsible for each course?
- Which materials were backed up successfully, skipped, or failed?
- Which Canvas surfaces were unreachable because of permissions, API behavior, or time limits?
- Which redundant restore packages, such as Canvas content exports, were created and downloaded?

## Data Sources

| Source | Role | Notes |
| ------ | ---- | ----- |
| Canvas LMS | Source for course content, structure, files, pages, modules, metadata, exports, and teacher roles | Instance: https://lu.instructure.com/ |
| Canvas API docs | API reference | https://developerdocs.instructure.com/services/canvas |
| `Ladokstudent` inherited Canvas role | Not a backup data source | This is a student role, not a section. Do not deliberately fetch users for this role because the same student data exists elsewhere |
| Separate external coverage data, if provided | Optional source for course/student coverage checks | Use for matching/audit only; do not let missing mappings block broad Canvas capture |

## Discovery Strategy

1. Discover Canvas courses broadly within configured filters.
   - With an admin token, use `GET /api/v1/accounts/:account_id/courses` with root account `1`.
   - Fetch the configured account and recursive subaccount metadata with `GET /api/v1/accounts/:id` and `GET /api/v1/accounts/:account_id/sub_accounts`.
   - Use each course's direct `account_id` to group backup output by subaccount.
   - Include the relevant course states for the emergency run, initially `created`, `claimed`, `available`, and `completed` unless a narrower list is chosen.
   - Exclude obvious test, sandbox, template, and demo courses before backup, including `sandlåda`, `sandlada`, `sandbox`, `mall`, `template`, and `demo` spelling variants.
   - Match every configured course name/code and subaccount-name exclusion term only at field edges: the term must be at the absolute end of the field, or at the beginning followed by a non-`a-z` character.
   - Exclude courses whose direct Canvas subaccount name matches the configured `sandbox` term, because those subaccounts are only for sandbox courses.
   - Apply the approved initial `created_after` cutoff `2025-04-01`.
   - Request `include[]=total_students` and exclude courses where Canvas reports `total_students=0`. If Canvas does not report the count, keep the course for review rather than silently dropping it.
   - If no admin token is available, use `GET /api/v1/courses` only with explicit `--allow-user-course-discovery` / `CANVAS_ALLOW_USER_COURSE_DISCOVERY=true`, and document that coverage is limited to courses visible to that token.

2. Use external coverage data only if it is provided separately.
   - Do not load Canvas users just because they have the inherited `Ladokstudent` role.
   - Extract candidate course codes, section identifiers, SIS identifiers, term information, and any Canvas-related mapping fields from the external data.
   - Use external coverage data to identify expected courses and gaps, not to exclude otherwise reachable Canvas courses.

3. Reconcile coverage while backup continues.
   - Match external coverage entries to Canvas courses/sections when external coverage data exists.
   - Record unmatched external coverage entries.
   - Record Canvas courses with no external match when external coverage data exists.
   - Record Canvas courses where teacher discovery fails.

4. Discover teachers and roles from Canvas.
   - For every matched or in-scope course, call `GET /api/v1/courses/:course_id/users`.
   - Filter by `enrollment_type[]=teacher`, `enrollment_type[]=ta`, and `enrollment_type[]=designer`.
   - Include enrollments so role, state, and section context are preserved.
   - Store enough identity data for follow-up. Staff login/SIS-style identifiers returned by Canvas must be preserved in staff user/enrollment snapshots because they are needed for matching, while deleted/rejected/inactive staff enrollments remain opt-in.

5. Capture content and metadata by inclusion.
   - If a course-level API surface plausibly helps restore, audit, or understand a course, include it.
   - Prefer storing raw JSON plus normalized manifests over deciding up front what will be useful.
   - Capture both direct API material and Canvas export packages when permissions and time allow.

## Course Selection Filters

The backup should capture broadly inside the selected course set, but the selected course set must be filtered enough to keep the emergency run tractable.

Default broad-run filters:

- Exclude courses whose name or course code matches `test`, `sandlåda`, `sandlada`, `sandbox`, `mall`, `template`, or `demo`.
- Exclude courses whose direct Canvas subaccount name matches `sandbox`.
- Match every configured course name/code and subaccount-name exclusion term only at field edges: the term must be at the absolute end of the field, or at the beginning followed by a non-`a-z` character.
- Include only configured Canvas course states. The current script default is `created`, `claimed`, `available`, and `completed`.
- Use the approved initial `created_after` cutoff `2025-04-01`. Date-only values should mean the start of that day; courses without `created_at` should be excluded when this filter is active unless they were selected by explicit ID.
- Exclude courses where Canvas reports `total_students=0`; explicit course ID backups should bypass this filter.
- Support `max_courses` / `--max-courses` as a dry-run or sampling safety valve.

Targeted backup filters:

- `course_ids` and `course_ids_file` must support exact course ID backups.
- Explicit course ID backups should bypass broad discovery filters, including course name/code exclusions, subaccount name exclusions, zero-student exclusions, and created-after filtering, so a known course can always be backed up.
- `list_only` should show the selected course set and write selection manifests before any backup content is fetched.

Every run should save the effective filters and a course-selection manifest with selected and excluded counts, reason counts, and enough excluded-course metadata to audit why courses were skipped.

## API Inventory

| Area | Endpoint | Why It Matters | Priority |
| ---- | -------- | -------------- | -------- |
| Account course list | `GET /api/v1/accounts/:account_id/courses` | Broad course discovery for admin tokens from root account `1`; request `include[]=total_students` for zero-student filtering | P0 |
| Account metadata | `GET /api/v1/accounts/:id` | Preserve account/subaccount names, parent IDs, root IDs, and identifiers used for grouping | P0 |
| Recursive subaccount list | `GET /api/v1/accounts/:account_id/sub_accounts` | Preserve the subaccount tree and course/subaccount counts where available | P0 |
| Current-user course list | `GET /api/v1/courses` | Opt-in fallback discovery when only a user-scoped token exists; not a substitute for admin account discovery | P0 |
| Course details | `GET /api/v1/courses/:id` | Syllabus, term, sections, tabs, teachers, concluded status | P0 |
| Course users | `GET /api/v1/courses/:course_id/users` | Teacher, TA, designer backup | P0 |
| Course sections | `GET /api/v1/courses/:course_id/sections` | Preserve section structure and matching clues | P0 |
| Course enrollments | `GET /api/v1/courses/:course_id/enrollments` | Preserve staff role and section context needed for follow-up; do not fetch `Ladokstudent` users | P0 for staff roles |
| Folders | `GET /api/v1/courses/:course_id/folders` | Preserve file hierarchy | P0 |
| Files | `GET /api/v1/courses/:course_id/files` | Download course documents and media files | P0 |
| Modules | `GET /api/v1/courses/:course_id/modules` | Preserve course structure | P0 |
| Module items | `GET /api/v1/courses/:course_id/modules/:module_id/items` | Preserve ordered links to pages, files, assignments, quizzes, and external URLs | P0 |
| Pages | `GET /api/v1/courses/:course_id/pages` | Preserve Canvas-authored pages and embedded links | P0 |
| Assignments | `GET /api/v1/courses/:course_id/assignments` | Preserve assignment instructions and dates | P0 |
| Assignment groups | `GET /api/v1/courses/:course_id/assignment_groups` | Preserve assignment organization | P0 |
| Quizzes | `GET /api/v1/courses/:course_id/quizzes` | Preserve classic Canvas quiz metadata | P0 |
| Quiz questions | `GET /api/v1/courses/:course_id/quizzes/:quiz_id/questions` | Preserve classic Canvas quiz assessment content when permissions allow | P0 |
| Discussions | `GET /api/v1/courses/:course_id/discussion_topics` | Preserve discussion prompts and announcements | P0 |
| Course tabs | `GET /api/v1/courses/:course_id/tabs` | Preserve navigation/course structure clues | P0 |
| Course settings | `GET /api/v1/courses/:course_id/settings` | Preserve relevant visibility and course behavior settings | P0 |
| Rubrics | `GET /api/v1/courses/:course_id/rubrics` | Preserve grading criteria and assessment context | P1, now in direct mode |
| Outcome groups | `GET /api/v1/courses/:course_id/outcome_groups` | Preserve course learning outcome structure | P1, now in direct mode |
| Outcome links | `GET /api/v1/courses/:course_id/outcome_group_links` | Preserve linked course outcomes | P1, now in direct mode |
| External tools | `GET /api/v1/courses/:course_id/external_tools` with parent tools included | Preserve LTI references and restore clues | P1, now in direct mode |
| Calendar events | `GET /api/v1/calendar_events` scoped with `context_codes[]=course_:id` | Preserve schedule context | P1, now in direct mode |
| Group categories | `GET /api/v1/courses/:course_id/group_categories` | Preserve group structure without student memberships | P1, now in direct mode |
| Groups | `GET /api/v1/courses/:course_id/groups` without group users/memberships | Preserve group names/settings without deliberate student membership capture | P1, now in direct mode |
| Content exports | `POST /api/v1/courses/:course_id/content_exports` | Redundant Common Cartridge or file zip package for restore | P0 when permissions and timing allow |

## Backup Scope

Emergency P0 backup:

- Course manifest, identifiers, term, account, sections, tabs, settings, and raw course metadata.
- Subaccount metadata and course grouping by direct Canvas account/subaccount.
- Course discovery metadata including `total_students`, with zero-student courses excluded before backup.
- Teacher, TA, designer, and other current staff role metadata needed for follow-up.
- Staff login/SIS-style identifiers returned by Canvas, including fields such as `login_id`, `sis_login_id`, and `sis_user_id` when present.
- Folder and file inventory.
- Per-course file-size summary from Canvas-reported file metadata, including known/unknown file-size counts, total reported bytes, largest reported files, and over-limit totals when a maximum file size is configured.
- Downloadable course files.
- Approved maximum Canvas course file download size of 300 MB via `--max-file-size-mb 300` / `CANVAS_MAX_FILE_SIZE_MB=300`; file metadata is still preserved when a file is too large to download.
- Modules and module items.
- Pages, including body HTML where available.
- Syllabus body where available.
- Assignments, assignment groups, quizzes, quiz questions, discussions, and announcements.
- Canvas content export packages, especially Common Cartridge and file zip exports, when permissions and time allow.
- Per-endpoint success, skip, and failure manifests.
- Optional deleted/rejected/inactive staff enrollments only when `--staff-include-deleted=true` is approved for the run.

Emergency P1 backup:

- Rubrics, outcomes, calendar events, external tool references, groups, and other course-adjacent metadata that helps reconstruct teaching context.
- Course group membership, group users, and group activity streams remain outside deliberate first-pass capture because they are closer to student membership/activity data.
- Broader non-student enrollment summaries if needed for course/section coverage, while keeping personal data exposure visible in manifests.
- Raw JSON snapshots for any course-level endpoint that is cheap, paginated, and relevant enough to preserve.

Emergency P2 / policy-sensitive backup:

- Student submissions.
- Grades and gradebook exports.
- `Ladokstudent` or other student-role user lists.
- Student activity logs and analytics.
- Private conversations or inbox messages.

These are not first-pass targets unless the emergency owner explicitly widens the backup scope. If unexpected scope-sensitive content appears incidentally inside course pages, files, or Canvas export packages, preserve the backup and flag it for later review rather than deleting data during the emergency capture.

Scope boundary note: the first-pass script deliberately avoids student-role lists, submissions, grades, analytics, and private conversations. The emergency owner has clarified that there is no major sensitive PII concern in this system, so privacy discussion should not block preservation. Error bodies are still redacted for obvious bearer token, token parameter, and session fields.

Known content gap: the current quiz endpoints cover classic Canvas quizzes. Canvas New Quizzes are LTI-based; mention the limitation in README-style handoff notes, but do not spend time on a large New Quizzes fetch path now.

Known external media gap: Canvas Studio media should not be downloaded here because it is usually large. Preserve Studio or LTI references as metadata only unless a separate follow-up scope is approved.

General rule: if it is plausibly teaching material, structure, restore metadata, or staff role/coverage data, capture it. If it is primarily private student record data or student-role membership, get an explicit decision before deliberately fetching it.

## Output Expectations

The approved script writes a clear, restartable structure:

```text
E:\CanvasBackup/
  canvas-<timestamp>/
    run-options.json
    courses.json
    course-selection.json
    subaccounts.json
    backup-manifest.json
    retry-list.json
    subaccounts/
      <account-id>-<account-name>/
        subaccount.json
        courses/
          <course-id>_<sis-course-id-or-code>/
            course.json
            syllabus.html
            course-backup-manifest.json
            errors.json
            metadata/
              folders.json
              files.json
              file-size-summary.json
              file-downloads.json
              pages.json
              pages.full.json
              modules.json
              modules.full.json
              assignments.json
              assignment-groups.json
              discussion-topics.json
              announcements.json
              quizzes.json
              quiz-question-downloads.json
              rubrics.json
              outcome-groups.json
              outcome-group-links.json
              external-tools.json
              calendar-events.json
              group-categories.json
              groups.json
            people/
              staff-users.json
              teachers.json
              staff-enrollments.json
            structure/
              sections.json
              tabs.json
              settings.json
            pages/
            assignments/
            discussions/
            announcements/
            quizzes/
              questions/
            files/
            exports/
```

`E:\CanvasBackup` is the approved local output root. Backup runs require `--output` or `CANVAS_OUTPUT_DIR` so retries and size-based file skips resume in the same directory. List-only and check-config runs may still create timestamped folders under `E:\CanvasBackup`. Use a stable run folder under this root for broad backup and reuse it for retries.

Each manifest should include counts, timestamps, API endpoint names, request parameters, retry-safe failure records, subaccount grouping information, and enough path information to find both API snapshots and downloaded files. Course folders use the Canvas numeric course ID, an underscore, then the SIS course ID when available, falling back to course code or name. `subaccounts.json` should summarize fetched account/subaccount metadata and any metadata fetch errors; each subaccount folder should also contain its own `subaccount.json`. `retry-list.json` should summarize failed and partially failed course IDs so a follow-up run can use exact `--course-ids` targeting. People and structure resources should be written once in their semantic folder instead of duplicated under `metadata/`.

Each direct course backup writes `metadata/file-size-summary.json` from the Canvas file inventory, even when `--skip-file-downloads` is used. When `--max-file-size-mb 300` / `CANVAS_MAX_FILE_SIZE_MB=300` is set, `metadata/files.json` remains the full Canvas file inventory, `metadata/file-size-summary.json` records over-limit totals, and `metadata/file-downloads.json` should mark over-limit files as skipped by size limit rather than errors. This threshold applies only when Canvas reports a file size. Export package downloads are not covered by this first cutoff unless a separate export-size policy is approved.

If external coverage data is provided later, add a `coverage/` area beside the run manifest for input summaries, Canvas matches, unmatched external records, and unmatched Canvas courses.

## Safety Requirements

- Use HTTPS only.
- Send tokens in the `Authorization` header, never in URLs.
- Send a non-empty `User-Agent` header on HTTP requests. The default is `LU.Canvas.Backup/1.0 (Local Canvas backup)` and can be overridden with `--user-agent` / `CANVAS_USER_AGENT`.
- Send the Canvas `Authorization` header only to the configured Canvas origin; fetch absolute external file/export download URLs without the Canvas bearer token.
- Keep `.env`, tokens, and backup output out of Git.
- Use `--check-config` to inspect the redacted effective configuration before API calls; it can run before a token is configured.
- Pass `--output` or set `CANVAS_OUTPUT_DIR` for every real backup run.
- Use root `--account-id 1` / `CANVAS_ACCOUNT_ID=1` for broad admin discovery, or exact `--course-ids` for targeted backups. Use the current-user `/api/v1/courses` fallback only when explicitly approved with `--allow-user-course-discovery`.
- Keep `CANVAS_USER_AGENT` non-empty and confirm `run-options.json` records the expected value before broad backup content is fetched.
- Keep subaccount name exclusions enabled for broad discovery unless the emergency owner explicitly approves `--no-subaccount-name-exclusions` / `CANVAS_NO_SUBACCOUNT_NAME_EXCLUSIONS=true`.
- Run `node --test scripts\canvas-backup.test.mjs` after changes to the script's option parsing, course-selection filters, path handling, staff identity output, or redaction behavior.
- Keep broad backup output and local tokens out of Git. Store broad output under `E:\CanvasBackup`.
- `E:\CanvasBackup` has TB-scale space available, but still review list-only counts and file-size summaries before broad direct/API and export-package copies.
- Use `--max-file-size-mb 300` / `CANVAS_MAX_FILE_SIZE_MB=300` when local or network storage is too constrained for every large course file. Treat skipped large files as known gaps, not failures.
- Do not download Canvas Studio media in this backup path.
- Start with a small course sample before broad execution when time allows. If timing does not allow it, keep concurrency conservative and preserve detailed manifests.
- Rate limit and retry politely; Canvas APIs are paginated. Retry both retryable HTTP statuses and thrown fetch/network errors.
- Always paginate `/courses/:course_id/modules/:module_id/items`; do not trust embedded `include[]=items` module lists for complete item coverage.
- Content export creation is in scope for emergency over-capture, but it starts asynchronous Canvas jobs. Run it so it does not block direct API/file capture.

## Script Maintenance

The approved backup entrypoint has been split into focused modules under `scripts/canvas-backup/` according to `CANVAS_BACKUP_REFACTOR_PLAN.md`. Keep future changes inside the relevant module where possible, and preserve CLI flags, environment variables, defaults, output layout, manifests, privacy defaults, filter behavior, and Canvas API scope unless a separate planning decision explicitly changes them.

After script changes, rerun local verification before any backup execution:

```powershell
node --check scripts\canvas-backup.mjs
node scripts\canvas-backup.mjs --help
node scripts\canvas-backup.mjs --check-config
node --test scripts\canvas-backup.test.mjs
```

Do not use the refactor slice to add endpoints or run Canvas content exports; export validation remains a separate approval because it starts Canvas jobs.

## Rollout Checklist

Use `CANVAS_BACKUP_ROLLOUT_CHECKLIST.md` for the concrete preflight, list-only selection check, small-course validation, export validation, broad-run gate, and post-run review steps. Keep this plan focused on scope and endpoint strategy; keep operational checkboxes in the rollout checklist.

## Open Questions Before Broad Execution

- Root account `1` is the broad discovery scope; nested subaccounts under it are included through the account tree.
- Will any separate non-Canvas course/student coverage export be available?
- Which fields map optional external coverage data to Canvas sections or courses?
- Which completed/concluded, unpublished, and historical courses are reachable with the available token?
- Canvas Studio content is not in scope for download here.
- Canvas New Quizzes are documentation-only for now; no large fetch effort is planned.
- `E:\CanvasBackup` is the approved local backup root and has TB-scale space available.
- Root account `1` list-only counts and file-size summaries still need review before broad content backup.
- Approved: use `CANVAS_MAX_FILE_SIZE_MB=300` for broad emergency runs unless explicitly overridden.
- Approved: send `CANVAS_USER_AGENT=LU.Canvas.Backup/1.0 (Local Canvas backup)` unless a local operator needs a different institutional identifier.
- Approved default: both the executable fallback and `.env.example` use `CANVAS_BASE_URL=https://lu.beta.instructure.com`; production runs should review and override the base URL deliberately.
- No major sensitive PII concern is expected; keep the current script scope and avoid privacy debate as a blocker.
