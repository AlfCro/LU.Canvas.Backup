import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  readBoolean,
  readDate,
  readInteger,
  readList,
  readString,
} from './utilities.mjs';
import {
  DEFAULT_USER_AGENT,
  normalizeUserAgent,
} from './canvas-api.mjs';

const DEFAULT_BASE_URL = 'https://lu.beta.instructure.com';
const DEFAULT_MODE = 'direct';
const DEFAULT_OUTPUT_ROOT = 'E:\\CanvasBackup';
const DEFAULT_COURSE_STATES = ['created', 'claimed', 'available', 'completed'];
const DEFAULT_EXCLUDED_COURSE_NAME_TERMS = ['test', 'sandlåda', 'sandlada', 'sandbox', 'mall', 'template', 'demo'];
const DEFAULT_EXCLUDED_SUBACCOUNT_NAME_TERMS = ['sandbox'];
const DEFAULT_EXCLUDE_COURSES_WITHOUT_STUDENTS = true;
const DEFAULT_EXPORT_TYPES = ['common_cartridge'];
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_FILE_CONCURRENCY = 4;
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_EXPORT_POLL_SECONDS = 15;
const DEFAULT_EXPORT_TIMEOUT_MINUTES = 90;
const DEFAULT_STAFF_INCLUDE_DELETED = false;

async function readOptions(args, { requireToken } = { requireToken: true }) {
  const courseIds = await readCourseIds(args);
  const baseUrl = readString(args.baseUrl ?? process.env.CANVAS_BASE_URL, DEFAULT_BASE_URL);
  const token = readString(args.token ?? process.env.CANVAS_TOKEN, null);

  if (requireToken && !token) {
    throw new Error('CANVAS_TOKEN is required. Put it in .env or pass --token.');
  }

  const { outputDir, outputWasExplicit } = resolveOutputDir(args);
  validateOutputDirForRun(args, outputWasExplicit);
  const mode = readString(args.mode ?? process.env.CANVAS_BACKUP_MODE, DEFAULT_MODE);

  if (!['direct', 'exports', 'both'].includes(mode)) {
    throw new Error(`Unsupported --mode "${mode}". Use direct, exports, or both.`);
  }

  const noNameExclusions = readBoolean(
    args.noNameExclusions ?? process.env.CANVAS_NO_NAME_EXCLUSIONS,
    false,
  );
  const noSubaccountNameExclusions = readBoolean(
    args.noSubaccountNameExclusions ?? process.env.CANVAS_NO_SUBACCOUNT_NAME_EXCLUSIONS,
    false,
  );
  const staffIncludeDeleted = readBoolean(
    args.staffIncludeDeleted ?? process.env.CANVAS_STAFF_INCLUDE_DELETED,
    DEFAULT_STAFF_INCLUDE_DELETED,
  );
  const configuredExcludeCoursesWithoutStudents = readBoolean(
    args.excludeCoursesWithoutStudents ?? process.env.CANVAS_EXCLUDE_COURSES_WITHOUT_STUDENTS,
    DEFAULT_EXCLUDE_COURSES_WITHOUT_STUDENTS,
  );
  const includeCoursesWithoutStudents = readBoolean(
    args.includeCoursesWithoutStudents ?? process.env.CANVAS_INCLUDE_COURSES_WITHOUT_STUDENTS,
    null,
  );

  return {
    accountId: readString(args.accountId ?? process.env.CANVAS_ACCOUNT_ID, null),
    baseUrl,
    concurrency: readInteger(args.concurrency ?? process.env.CANVAS_CONCURRENCY, DEFAULT_CONCURRENCY),
    createdAfter: readDate(args.createdAfter ?? process.env.CANVAS_CREATED_AFTER),
    courseIds,
    courseStates: readList(args.courseStates ?? process.env.CANVAS_COURSE_STATES, DEFAULT_COURSE_STATES),
    excludeCourseNameTerms: noNameExclusions
      ? []
      : readList(
        args.excludeCourseNameTerms ?? process.env.CANVAS_EXCLUDE_COURSE_NAME_TERMS,
        DEFAULT_EXCLUDED_COURSE_NAME_TERMS,
      ),
    excludeSubaccountNameTerms: noSubaccountNameExclusions
      ? []
      : readList(
        args.excludeSubaccountNameTerms ?? process.env.CANVAS_EXCLUDE_SUBACCOUNT_NAME_TERMS,
        DEFAULT_EXCLUDED_SUBACCOUNT_NAME_TERMS,
      ),
    excludeCoursesWithoutStudents: includeCoursesWithoutStudents === null
      ? configuredExcludeCoursesWithoutStudents
      : !includeCoursesWithoutStudents,
    exportPollSeconds: readInteger(args.exportPollSeconds ?? process.env.CANVAS_EXPORT_POLL_SECONDS, DEFAULT_EXPORT_POLL_SECONDS),
    exportTimeoutMinutes: readInteger(args.exportTimeoutMinutes ?? process.env.CANVAS_EXPORT_TIMEOUT_MINUTES, DEFAULT_EXPORT_TIMEOUT_MINUTES),
    exportTypes: readList(args.exportTypes ?? process.env.CANVAS_EXPORT_TYPES, DEFAULT_EXPORT_TYPES),
    fileConcurrency: readInteger(args.fileConcurrency ?? process.env.CANVAS_FILE_CONCURRENCY, DEFAULT_FILE_CONCURRENCY),
    listOnly: Boolean(args.listOnly),
    allowUserCourseDiscovery: readBoolean(
      args.allowUserCourseDiscovery ?? process.env.CANVAS_ALLOW_USER_COURSE_DISCOVERY,
      false,
    ),
    maxCourses: readInteger(args.maxCourses ?? process.env.CANVAS_MAX_COURSES, null),
    maxFileSizeMb: readInteger(args.maxFileSizeMb ?? process.env.CANVAS_MAX_FILE_SIZE_MB, null),
    maxRetries: readInteger(args.maxRetries ?? process.env.CANVAS_MAX_RETRIES, DEFAULT_MAX_RETRIES),
    mode,
    noNameExclusions,
    noSubaccountNameExclusions,
    outputDir,
    outputWasExplicit,
    skipCompletedCourses: readBoolean(
      args.skipCompletedCourses ?? process.env.CANVAS_SKIP_COMPLETED_COURSES,
      false,
    ),
    skipFileDownloads: readBoolean(args.skipFileDownloads ?? process.env.CANVAS_SKIP_FILE_DOWNLOADS, false),
    staffIncludeDeleted,
    token,
    userAgent: readUserAgent(args.userAgent ?? process.env.CANVAS_USER_AGENT),
    waitExports: args.noWaitExports ? false : readBoolean(process.env.CANVAS_WAIT_EXPORTS, true),
  };
}

function resolveOutputDir(args, env = process.env) {
  const configuredOutput = readString(args.output ?? env.CANVAS_OUTPUT_DIR, null);

  if (configuredOutput) {
    return {
      outputDir: configuredOutput,
      outputWasExplicit: true,
    };
  }

  const nowStamp = new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').replace('Z', 'Z');
  return {
    outputDir: join(DEFAULT_OUTPUT_ROOT, `canvas-${nowStamp}`),
    outputWasExplicit: false,
  };
}

function validateOutputDirForRun(args, outputWasExplicit) {
  if (outputWasExplicit || args.checkConfig || args.listOnly) {
    return;
  }

  throw new Error('Backup runs require --output or CANVAS_OUTPUT_DIR so retries resume into the same directory. Use --list-only for timestamped selection checks.');
}

function readUserAgent(value) {
  if (typeof value === 'boolean') {
    throw new Error('--user-agent requires a value. Use --user-agent "..." or CANVAS_USER_AGENT=...');
  }

  return normalizeUserAgent(readString(value, DEFAULT_USER_AGENT));
}

async function readCourseIds(args) {
  const ids = readList(args.courseIds ?? process.env.CANVAS_COURSE_IDS, []);
  const courseIdsFile = readString(args.courseIdsFile ?? process.env.CANVAS_COURSE_IDS_FILE, null);

  if (!courseIdsFile) {
    return ids;
  }

  const fileContent = await readFile(courseIdsFile, 'utf8');
  const fileIds = fileContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  return [...new Set([...ids, ...fileIds])];
}

function redactOptions(options) {
  const {
    outputWasExplicit: _outputWasExplicit,
    ...redactedOptions
  } = options;

  return {
    ...redactedOptions,
    token: options.token ? '[redacted]' : null,
  };
}

function printHelp() {
  console.log(`Canvas emergency backup

Usage:
  node scripts/canvas-backup.mjs --account-id 1 --mode direct
  node scripts/canvas-backup.mjs --course-ids 123,456 --mode both

Required:
  CANVAS_TOKEN or --token       Canvas access token with read access to courses.

Common options:
  --base-url URL                Defaults to ${DEFAULT_BASE_URL}
  --user-agent TEXT             Defaults to ${DEFAULT_USER_AGENT}; env CANVAS_USER_AGENT.
  --account-id ID               Backup courses from an account, for admin tokens.
  --course-ids 1,2,3            Backup explicit course IDs instead of discovery.
  --course-ids-file PATH        Newline-separated course IDs.
  --allow-user-course-discovery Allow limited /api/v1/courses discovery without --account-id.
  --course-states a,b           Discovery states. Default ${DEFAULT_COURSE_STATES.join(',')}.
  --created-after YYYY-MM-DD    Keep discovered courses created on or after this date.
  --exclude-course-name-terms a,b
                                Exclude discovered courses whose name/code matches these terms.
                                Default ${DEFAULT_EXCLUDED_COURSE_NAME_TERMS.join(',')}.
                                Terms match only at name/code field edges.
  --no-name-exclusions          Disable the default name/code exclusions.
  --exclude-subaccount-name-terms a,b
                                Exclude discovered courses whose subaccount name matches these terms.
                                Default ${DEFAULT_EXCLUDED_SUBACCOUNT_NAME_TERMS.join(',')}.
                                Terms match only at subaccount-name field edges.
  --no-subaccount-name-exclusions
                                Disable the default subaccount name exclusions.
  --include-courses-without-students
                                Keep discovered courses even when Canvas reports total_students as 0.
  --mode direct|exports|both    direct saves API files/metadata; exports uses Canvas content exports.
  --output PATH                 Required for backup runs so retries can resume in the same directory.
                                List-only/check-config runs default to ${DEFAULT_OUTPUT_ROOT}\\canvas-<timestamp>.
                                Course backups are grouped under subaccounts\\<account-id>-<account-name>\\courses.
  --concurrency N               Courses processed at once. Default ${DEFAULT_CONCURRENCY}.
  --file-concurrency N          File downloads per course. Default ${DEFAULT_FILE_CONCURRENCY}.
  --max-courses N               Limit selected courses after filters for sampling.
  --max-file-size-mb N          Skip individual Canvas course file downloads larger than N MB.
                                File metadata and skip records are still saved.
  --staff-include-deleted       Include deleted/rejected/inactive staff enrollments. Default ${DEFAULT_STAFF_INCLUDE_DELETED}.
  --export-types a,b            Default ${DEFAULT_EXPORT_TYPES.join(',')}.
  --export-timeout-minutes N    Default ${DEFAULT_EXPORT_TIMEOUT_MINUTES}.
  --no-wait-exports             Create Canvas export jobs without waiting/downloading.
  --skip-file-downloads         Save file metadata only.
  --skip-completed-courses      On resume, skip courses whose previous course-backup-manifest.json
                                has status "completed". Courses with completed_with_errors,
                                failed, or no prior manifest are still processed.
  --check-config                Print redacted config and stop before Canvas calls.
  --list-only                   List discovered courses and stop.
`);
}

export {
  DEFAULT_BASE_URL,
  DEFAULT_EXCLUDE_COURSES_WITHOUT_STUDENTS,
  DEFAULT_EXCLUDED_COURSE_NAME_TERMS,
  DEFAULT_EXCLUDED_SUBACCOUNT_NAME_TERMS,
  printHelp,
  readOptions,
  readUserAgent,
  redactOptions,
  resolveOutputDir,
  validateOutputDirForRun,
};
