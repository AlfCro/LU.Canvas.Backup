# Lessons Learned

<!-- Tags: [backend] [frontend] [database] [devops] [testing] [gotcha] [performance] [pattern] -->
<!-- Severity: 🔴 critical | 🟡 important | 🟢 nice-to-know -->
<!-- Append only — never edit or remove existing entries. -->

## 2026-05-08 - Implementation paused by user

- Severity: 🟡 important
- Tags: [process] [gotcha]
- Lesson: When the user says to stop implementation and update docs only, remove any implementation artifacts created in the current turn and keep the repository documentation-only until code work is explicitly approved.

## 2026-05-08 - Preserve useful drafts when requested

- Severity: 🟡 important
- Tags: [process] [pattern]
- Lesson: If the user asks to keep an implementation draft as a possible future path, preserve it but clearly document that it is not approved or validated production tooling.

## 2026-05-08 - Emergency backup favors over-capture

- Severity: 🟡 important
- Tags: [process] [backup] [privacy]
- Lesson: For the Canvas emergency backup, plan to preserve too much reachable course content and metadata rather than miss data under time pressure, while documenting privacy-sensitive boundaries and treating broad output as sensitive.

## 2026-05-08 - Filter course selection before broad capture

- Severity: 🟡 important
- Tags: [backup] [performance] [privacy]
- Lesson: For huge Canvas datasets, broad content capture should happen only after course-selection filters are applied, including name/code exclusions for `test` and `sandlåda`, relevant Canvas statuses, optional created-after cutoffs, and exact course ID targeting.

## 2026-05-08 - Temporary backup storage path

- Severity: 🟡 important
- Tags: [backup] [storage] [configuration]
- Lesson: Use `D:\CanvasBackup` as the temporary local output root for Canvas backups, but keep output configurable because a network backup path is expected later.

## 2026-05-08 - Sandbox setup refresh can fail before project reads

- Severity: 🟢 nice-to-know
- Tags: [process] [gotcha]
- Lesson: If a basic workspace read fails with `windows sandbox: setup refresh failed`, retry the same read with normal escalation and continue; this is a tooling/sandbox issue, not evidence of a repository problem.

## 2026-05-08 - Ladokstudent is an inherited student role

- Severity: 🟡 important
- Tags: [backup] [privacy] [terminology]
- Lesson: `Ladokstudent` is a Canvas inherited student role, not a section or coverage source. Do not deliberately fetch users for that role during the backup because the same student data exists elsewhere.

## 2026-05-08 - Script approval changes the next action

- Severity: 🟡 important
- Tags: [process] [backup] [configuration]
- Lesson: Once the user explicitly approves `scripts/canvas-backup.mjs` as the backup path, update planning docs from draft-only language to first-run validation language and focus on safe execution prerequisites.

## 2026-05-08 - Ignore local backup secrets and output

- Severity: 🟡 important
- Tags: [backup] [privacy] [configuration]
- Lesson: When a backup script can read `.env` and write sensitive backup output, add Git ignores for local env files and backup folders before any token-backed run.

## 2026-05-08 - Sandbox spelling can lose diacritics

- Severity: 🟡 important
- Tags: [backup] [filtering] [gotcha]
- Lesson: Treat `sandlåda` and ASCII `sandlada` as sandbox name/code exclusion variants; Canvas course codes may not preserve Swedish diacritics.

## 2026-05-08 - Include literal sandbox filters

- Severity: 🟡 important
- Tags: [backup] [filtering] [terminology]
- Lesson: Whenever sandbox course exclusions mention `sandlåda`, include the literal English `sandbox` term as well because course names/codes may use either language.

## 2026-05-08 - Scope Canvas authorization headers

- Severity: 🟡 important
- Tags: [backup] [security] [privacy]
- Lesson: Canvas bearer tokens should only be sent to the configured Canvas origin. Absolute file or export download URLs may point elsewhere and must be fetched without the Canvas `Authorization` header.

## 2026-05-08 - Canvas module item includes can be partial

- Severity: 🔴 critical
- Tags: [backup] [api] [gotcha]
- Lesson: Do not trust `include[]=items` on the Canvas modules list for complete module contents; always paginate `/courses/:course_id/modules/:module_id/items` for each module.

## 2026-05-08 - Backup output must be explicit for resumability

- Severity: 🟡 important
- Tags: [backup] [resumability] [configuration]
- Lesson: Real backup runs need an explicit operator-approved `--output` or `CANVAS_OUTPUT_DIR` path so retries and size-based file skips use the same directory; timestamp defaults are only acceptable for list-only or check-config runs.

## 2026-05-08 - Retry fetch exceptions, not only HTTP statuses

- Severity: 🟡 important
- Tags: [backup] [network] [reliability]
- Lesson: Canvas backup fetch logic must retry thrown network exceptions such as DNS, socket, or TLS failures as well as retryable HTTP statuses, because transient transport failures are likely during broad emergency captures.

## 2026-05-08 - Trim Windows path segments after clipping

- Severity: 🟡 important
- Tags: [backup] [filesystem] [gotcha]
- Lesson: When sanitizing Canvas file names for Windows, trim trailing dots and spaces after length clipping as well as before it; truncation can create a new trailing dot that later breaks ordinary file open/resume checks.

## 2026-05-08 - Preserve extensions when clipping file names

- Severity: 🟢 nice-to-know
- Tags: [backup] [filesystem] [usability]
- Lesson: Long Canvas file names can be clipped before their extension, leaving downloaded bytes valid but harder to browse. Prefer preserving the original extension, when known from Canvas metadata, while still keeping path lengths safe.

## 2026-05-08 - Local env filters can drift from documented defaults

- Severity: 🟡 important
- Tags: [backup] [configuration] [filtering]
- Lesson: `--check-config` can reveal local `.env` course exclusion terms beyond the documented script defaults. Record those terms in the handoff docs and approve or remove them before broad selection so local configuration does not silently narrow the backup scope.

## 2026-05-08 - Keep example config aligned with intended run policy

- Severity: 🟡 important
- Tags: [backup] [configuration] [process]
- Lesson: When `.env.example` is used to express intended emergency-run policy, such as `mode=both`, a created-after cutoff, or broader course exclusion terms, update README, project notes, rollout checklist, and work plan together so operators do not confuse code defaults with approved example values.

## 2026-05-08 - Group backups by Canvas subaccount

- Severity: 🟡 important
- Tags: [backup] [organization] [metadata]
- Lesson: Course backup output should be grouped by the course's direct Canvas account/subaccount, with fetched subaccount metadata preserved at the run root and beside each subaccount's course folder.

## 2026-05-08 - Quote inspected subaccount paths

- Severity: 🟢 nice-to-know
- Tags: [backup] [filesystem] [gotcha]
- Lesson: Subaccount output folder names can contain spaces, such as `<account-id>-<account-name with spaces>`; quote `-LiteralPath` values when inspecting those files in PowerShell.

## 2026-05-08 - Review feedback must reconcile code defaults and docs

- Severity: 🟡 important
- Tags: [backup] [configuration] [resumability] [privacy]
- Lesson: When review feedback identifies drift between code defaults and approved rollout docs, align the executable defaults and add regression tests in the same slice. For broad Canvas backups, also test resumability when API metadata is incomplete and document incidental student-identifiable over-capture explicitly.

## 2026-05-08 - Refactor approved scripts as behavior-preserving slices

- Severity: 🟡 important
- Tags: [backup] [process] [testing]
- Lesson: When splitting an approved emergency script into modules, plan the split in markdown first, keep CLI behavior/output/privacy scope unchanged, and rerun local syntax/help/config/test checks before treating the refactor as validated.

## 2026-05-08 - Backup-output ignores can catch source modules

- Severity: 🟡 important
- Tags: [backup] [git] [gotcha]
- Lesson: Broad backup-output ignore patterns such as `canvas-*/` can also match source folders like `scripts/canvas-backup/`; add narrow exceptions for intended source modules before relying on `git status`.

## 2026-05-08 - Sandbox subaccounts are backup noise

- Severity: 🟡 important
- Tags: [backup] [filtering] [configuration]
- Lesson: Exclude courses from direct Canvas subaccounts whose name contains `sandbox` during broad discovery, in addition to course name/code sandbox filters. Keep exact `--course-ids` runs as the bypass for targeted backup of known courses.

## 2026-05-08 - Edge-match course noise filters

- Severity: 🟡 important
- Tags: [backup] [filtering] [gotcha]
- Lesson: Raw substring course noise filters can skip legitimate courses, such as `test` matching `testament`. Match configured course name/code and subaccount-name exclusion terms only at field edges: absolute end, or beginning followed by a non-`a-z` character.

## 2026-05-08 - Historical subaccounts can look empty under current cutoffs

- Severity: 🟡 important
- Tags: [backup] [filtering] [validation]
- Lesson: A discontinued or historical Canvas subaccount can legitimately select 0 courses with the current `created_after` cutoff even when many courses are reachable. For those scopes, run a second list-only check with an explicit historical/no-cutoff policy, such as `--created-after=`, before treating an empty selection as meaningful.

## 2026-05-08 - Separate Canvas course IDs from SIS GUIDs

- Severity: 🟢 nice-to-know
- Tags: [backup] [filesystem] [usability]
- Lesson: Course output folder names should separate the Canvas numeric course ID from a SIS GUID with an underscore, for example `29397_61b4212d-...`, because a hyphen separator blends into GUID hyphens and is harder to scan.

## 2026-05-08 - Preserve staff SIS and login identifiers

- Severity: 🟡 important
- Tags: [backup] [privacy] [identity]
- Lesson: Staff user/enrollment exports must always preserve Canvas-returned login and SIS-style identifiers, such as `login_id`, `sis_login_id`, and `sis_user_id`, because they are needed for follow-up matching.

## 2026-05-08 - Course counts are not storage estimates

- Severity: 🟡 important
- Tags: [backup] [storage] [validation]
- Lesson: Do not approve broad Canvas backup storage from selected course counts alone. Metadata-only validation can reveal very large file inventories, such as a single sample course whose Canvas file inventory totaled several GiB before downloads or export packages.

## 2026-05-08 - Local utility courses need owner review

- Severity: 🟡 important
- Tags: [backup] [filtering] [validation]
- Lesson: List-only selections can include local utility, support, or programme shell courses that generic test/sandbox filters do not identify. Do not add new broad exclusion terms for these without owner review because they may be legitimate backup scope.

## 2026-05-08 - Use a file-size cutoff for constrained storage

- Severity: 🟡 important
- Tags: [backup] [storage] [configuration]
- Lesson: For a large Canvas instance with limited storage, add an operator-approved maximum file download size instead of trying to capture every large binary. Preserve Canvas file metadata and explicit skip records for over-limit files so the gap is auditable and can be revisited later.

## 2026-05-08 - Do not let privacy discussion block emergency preservation

- Severity: 🟡 important
- Tags: [backup] [privacy] [process]
- Lesson: For the Canvas emergency backup, use the current first-pass privacy boundary and avoid new privacy-scope discussions that delay preservation. It is better to get backups in place, then reduce or remove captured surfaces after the emergency copy exists.

## 2026-05-08 - Root account is the production scope

- Severity: 🟡 important
- Tags: [backup] [configuration] [scope]
- Lesson: Use Canvas root account `1` for broad production discovery. Account-specific validation checks against familiar areas are validation examples, not separate production scopes.

## 2026-05-08 - Use E drive for broad backup output

- Severity: 🟡 important
- Tags: [backup] [storage] [configuration] [resumability]
- Lesson: Use `E:\CanvasBackup` as the approved local backup root because TB-scale space is available there. Real backup runs still need an explicit stable run folder so retries and existing-file skips resume into the same output.

## 2026-05-08 - Exclude zero-student Canvas courses

- Severity: 🟡 important
- Tags: [backup] [filtering] [configuration]
- Lesson: Broad course selection should exclude courses where Canvas reports `total_students=0`. Do not drop courses with a missing student count silently; keep them for review unless exact course IDs are being used.

## 2026-05-08 - Defer Studio and New Quizzes capture

- Severity: 🟡 important
- Tags: [backup] [scope] [storage]
- Lesson: Do not download Canvas Studio media in the main backup path because it is usually large. Mention Canvas New Quizzes as a known README-level gap, but do not spend time on a large New Quizzes fetch path now.

## 2026-05-08 - PII is not the current blocker

- Severity: 🟡 important
- Tags: [backup] [privacy] [process]
- Lesson: The emergency owner clarified that no major sensitive PII concern is expected in this Canvas backup. Keep tokens and output out of Git, but do not spend emergency time on additional privacy debate before preservation.

## 2026-05-08 - Verify approved backup drive from the runner

- Severity: 🟡 important
- Tags: [backup] [storage] [gotcha]
- Lesson: An approved Windows drive can still be unavailable in the current execution environment. Before starting a root list-only or broad backup run, verify that `E:\CanvasBackup` is mounted and writable from the same shell/session that will run the script.

## 2026-05-11 - Canvas content_exports zip vs common_cartridge overlap

- Severity: 🟢 nice-to-know
- Tags: [backup] [pattern]
- Lesson: Canvas `export_type=zip` only packages the Files tab contents, while `export_type=common_cartridge` packages the full course (structure + content + files). The zip is a strict subset of what is already in the .imscc, and `--mode direct` separately downloads the same files via the API, so requesting both export types stores the same file bytes up to three times. Default `DEFAULT_EXPORT_TYPES` to `['common_cartridge']` and let users opt back into zip explicitly if they want a separately extractable files archive.

## 2026-05-13 - Keep Canvas backup User-Agent reusable

- Severity: 🟡 important
- Tags: [backup] [configuration] [interoperability]
- Lesson: Canvas backup requests should send a non-empty `User-Agent`, but the default should stay reusable for other institutions. Use `LU.Canvas.Backup/1.0 (Local Canvas backup)` by default and let local operators override it with `--user-agent` / `CANVAS_USER_AGENT`.

## 2026-05-13 - Start copied config against Canvas beta

- Severity: 🟡 important
- Tags: [backup] [configuration] [safety]
- Lesson: Keep `.env.example` pointed at `https://lu.beta.instructure.com` so copied local configuration starts against beta by default. Operators should review `run-options.json` and override `CANVAS_BASE_URL` deliberately before any production or broad backup run.

## 2026-05-13 - Align executable and example safety defaults

- Severity: 🟡 important
- Tags: [backup] [configuration] [review]
- Lesson: When a safety default is documented, enforce it in both the executable fallback and `.env.example`. For Canvas base URLs, use beta as the default in code and copied config, and require operators to override `CANVAS_BASE_URL` deliberately for production.
