#!/usr/bin/env node
// Approved first-run path for Canvas backup validation and emergency capture.
// Keep privacy, storage, and course-scope decisions documented before broad runs.
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CanvasApi,
  DEFAULT_USER_AGENT,
} from './canvas-backup/canvas-api.mjs';
import {
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
} from './canvas-backup/configuration.mjs';
import {
  backupCourse,
  backupCourseAdjacentMetadata,
  backupFiles,
  backupModules,
  backupStaffRoles,
  fileDownloadSizeLimit,
  isCompletedCourseStatus,
  readPriorCourseBackupStatus,
  staffEnrollmentStates,
  summarizeFileSizes,
} from './canvas-backup/course-backup.mjs';
import {
  courseFilterReasons,
  courseFilterSummary,
  discoverCourses,
  discoveredCourseHasIncludedDetails,
  getCourseDetails,
  matchingExcludedNameTerm,
  matchingExcludedSubaccountNameTerm,
  selectCoursesForBackup,
  validateDiscoveryScope,
} from './canvas-backup/course-selection.mjs';
import {
  buildRetryList,
  redactErrorBody,
  serializeError,
  writeJson,
} from './canvas-backup/output-files.mjs';
import { installRunLogger } from './canvas-backup/run-log.mjs';
import {
  courseContentTargetPath,
  fileTargetPath,
  sanitizeFileNameSegment,
  sanitizeSegment,
  subaccountFolderName,
} from './canvas-backup/path-safety.mjs';
import {
  buildSelectedSubaccountSummary,
  courseOutputDir,
  fetchSubaccountMetadata,
  subaccountEntryForCourse,
  updateSubaccountSelection,
  writeSubaccountMetadata,
} from './canvas-backup/subaccounts.mjs';
import {
  loadDotEnv,
  mapLimit,
  parseArgs,
  readBoolean,
  readDate,
  readInteger,
  readList,
  readString,
  shouldSendCanvasAuthorization,
} from './canvas-backup/utilities.mjs';
async function main() {
  await loadDotEnv('.env');

  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const options = await readOptions(args, { requireToken: !args.checkConfig });

  if (args.checkConfig) {
    console.log(JSON.stringify(redactOptions(options), null, 2));
    return;
  }

  validateDiscoveryScope(options);

  const api = new CanvasApi({
    baseUrl: options.baseUrl,
    token: options.token,
    maxRetries: options.maxRetries,
    userAgent: options.userAgent,
  });

  await mkdir(options.outputDir, { recursive: true });
  installRunLogger(join(options.outputDir, 'run.log'));

  logStartupBanner(api, options);

  const manifest = {
    startedAt: new Date().toISOString(),
    baseUrl: api.baseUrl,
    mode: options.mode,
    outputDir: options.outputDir,
    accountId: options.accountId ?? null,
    explicitCourseIds: options.courseIds,
    courseStates: options.courseStates,
    courseFilters: courseFilterSummary(options),
    courses: [],
    errors: [],
  };

  await writeJson(join(options.outputDir, 'run-options.json'), redactOptions(options));

  const discoveryScope = describeDiscoveryScope(options);
  console.log(`Discovering courses from ${discoveryScope}. This can take several minutes for large accounts.`);
  const courses = await discoverCourses(api, options, {
    onPage: ({ pageNumber, totalSoFar, hasMore }) => {
      const suffix = hasMore ? '' : ' (last page)';
      console.log(`  page ${pageNumber}: ${totalSoFar} course(s) so far${suffix}`);
    },
  });
  console.log(`Discovered ${courses.length} course(s).`);

  const subaccountCandidateSelection = selectCoursesForBackup(courses, {
    ...options,
    excludeSubaccountNameTerms: [],
    maxCourses: null,
  });
  console.log(`Fetching subaccount metadata for ${subaccountCandidateSelection.courses.length} candidate course(s)...`);
  const subaccountIndex = await fetchSubaccountMetadata(api, subaccountCandidateSelection.courses, options);
  console.log(`Fetched metadata for ${subaccountIndex.summary.fetchedSubaccountCount} subaccount(s).`);

  console.log('Applying course selection filters...');
  const selection = selectCoursesForBackup(courses, options, subaccountIndex);
  console.log(`Selected ${selection.summary.selectedCourseCount}/${selection.summary.discoveredCourseCount} course(s); ${selection.summary.excludedCourseCount} excluded.`);

  const { coursesToBackup, skippedCompletedCourses } = options.skipCompletedCourses
    ? await partitionAlreadyCompletedCourses(selection.courses, options.outputDir, subaccountIndex)
    : { coursesToBackup: selection.courses, skippedCompletedCourses: [] };
  const selectedCourses = coursesToBackup;

  updateSubaccountSelection(subaccountIndex, selectedCourses);
  await writeSubaccountMetadata(options.outputDir, subaccountIndex);

  selection.summary.subaccounts = buildSelectedSubaccountSummary(selectedCourses, subaccountIndex);
  manifest.courseSelection = selection.summary;
  manifest.subaccounts = subaccountIndex.summary;
  manifest.errors.push(...subaccountIndex.errors);

  if (skippedCompletedCourses.length) {
    manifest.skippedCompletedCourses = skippedCompletedCourses.map((course) => ({
      courseId: course.id,
      courseName: course.name ?? null,
    }));
    console.log(`Skipping ${skippedCompletedCourses.length} course(s) already marked "completed" in their course-backup-manifest.json.`);
  }

  await writeJson(join(options.outputDir, 'courses.json'), selectedCourses);
  await writeJson(join(options.outputDir, 'course-selection.json'), selection.summary);

  if (options.listOnly) {
    for (const course of selectedCourses) {
      console.log(`${course.id}\t${course.course_code ?? ''}\t${course.name ?? ''}`);
    }
    console.log(`Listed ${selectedCourses.length}/${courses.length} course(s). No backup was written beyond manifests.`);
    return;
  }

  console.log(`Backing up ${selectedCourses.length}/${courses.length} discovered course(s) to ${options.outputDir}`);

  manifest.courses = await mapLimit(selectedCourses, options.concurrency, async (course) => {
    try {
      return await backupCourse(api, course, options, subaccountIndex);
    } catch (error) {
      const serializedError = serializeError(error);
      manifest.errors.push({
        scope: `course:${course.id}`,
        ...serializedError,
      });
      return {
        courseId: course.id,
        courseName: course.name,
        status: 'failed',
        errors: [serializedError],
      };
    }
  });

  manifest.finishedAt = new Date().toISOString();
  manifest.status = manifest.errors.length || manifest.courses.some((course) => course.errors?.length)
    ? 'completed_with_errors'
    : 'completed';

  await writeJson(join(options.outputDir, 'backup-manifest.json'), manifest);
  await writeJson(join(options.outputDir, 'retry-list.json'), buildRetryList(manifest));

  const failedCourses = manifest.courses.filter((course) => course.status === 'failed').length;
  const courseErrors = manifest.courses.reduce((count, course) => count + (course.errors?.length ?? 0), 0);

  console.log(`Backup ${manifest.status}: ${selectedCourses.length - failedCourses}/${selectedCourses.length} course(s) completed.`);
  if (failedCourses || courseErrors || manifest.errors.length) {
    console.log(`Recorded ${failedCourses} failed course(s) and ${courseErrors + manifest.errors.length} error(s). See backup-manifest.json.`);
    process.exitCode = failedCourses === selectedCourses.length ? 1 : 2;
  }
}

function logStartupBanner(api, options) {
  console.log(`Canvas backup starting at ${new Date().toISOString()}`);
  console.log(`  Canvas:      ${api.baseUrl}`);
  console.log(`  Mode:        ${options.mode}`);
  console.log(`  Output:      ${options.outputDir}`);
  console.log(`  User agent:  ${options.userAgent}`);
  console.log(`  Concurrency: ${options.concurrency} course(s), ${options.fileConcurrency} file(s)/course`);
  if (options.maxFileSizeMb) {
    console.log(`  File limit:  ${options.maxFileSizeMb} MB per file`);
  }
  if (options.skipCompletedCourses) {
    console.log('  Resume mode: skipping courses with a prior "completed" course-backup-manifest.json');
  }
  if (options.listOnly) {
    console.log('  List-only:   no backup will be written beyond manifests');
  }
}

function describeDiscoveryScope(options) {
  if (options.courseIds.length) {
    return `${options.courseIds.length} explicit course ID(s)`;
  }
  if (options.accountId) {
    return `account ${options.accountId}`;
  }
  return 'the authenticated user (/api/v1/courses fallback)';
}

async function partitionAlreadyCompletedCourses(courses, outputDir, subaccountIndex) {
  const results = await mapLimit(courses, 8, async (course) => {
    const courseDir = courseOutputDir(outputDir, course, subaccountIndex);
    const status = await readPriorCourseBackupStatus(courseDir);
    return { course, status };
  });

  const coursesToBackup = [];
  const skippedCompletedCourses = [];

  for (const { course, status } of results) {
    if (isCompletedCourseStatus(status)) {
      skippedCompletedCourses.push(course);
    } else {
      coursesToBackup.push(course);
    }
  }

  return { coursesToBackup, skippedCompletedCourses };
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

export {
  CanvasApi,
  DEFAULT_BASE_URL,
  DEFAULT_USER_AGENT,
  DEFAULT_EXCLUDE_COURSES_WITHOUT_STUDENTS,
  DEFAULT_EXCLUDED_COURSE_NAME_TERMS,
  DEFAULT_EXCLUDED_SUBACCOUNT_NAME_TERMS,
  backupCourseAdjacentMetadata,
  backupFiles,
  backupStaffRoles,
  buildRetryList,
  buildSelectedSubaccountSummary,
  backupModules,
  courseContentTargetPath,
  courseFilterReasons,
  courseOutputDir,
  discoverCourses,
  discoveredCourseHasIncludedDetails,
  fileTargetPath,
  fileDownloadSizeLimit,
  installRunLogger,
  isCompletedCourseStatus,
  matchingExcludedNameTerm,
  matchingExcludedSubaccountNameTerm,
  parseArgs,
  partitionAlreadyCompletedCourses,
  readBoolean,
  readDate,
  readInteger,
  readList,
  readOptions,
  readPriorCourseBackupStatus,
  readString,
  readUserAgent,
  redactErrorBody,
  redactOptions,
  resolveOutputDir,
  sanitizeFileNameSegment,
  sanitizeSegment,
  selectCoursesForBackup,
  shouldSendCanvasAuthorization,
  staffEnrollmentStates,
  summarizeFileSizes,
  subaccountEntryForCourse,
  subaccountFolderName,
  updateSubaccountSelection,
  validateOutputDirForRun,
};

if (isMainModule()) {
  main().catch((error) => {
    console.error(error?.stack ?? error?.message ?? String(error));
    process.exitCode = 1;
  });
}
