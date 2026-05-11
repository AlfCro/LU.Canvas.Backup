import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  CanvasApi,
  DEFAULT_EXCLUDE_COURSES_WITHOUT_STUDENTS,
  DEFAULT_EXCLUDED_COURSE_NAME_TERMS,
  DEFAULT_EXCLUDED_SUBACCOUNT_NAME_TERMS,
  backupFiles,
  backupCourseAdjacentMetadata,
  backupStaffRoles,
  buildSelectedSubaccountSummary,
  backupModules,
  buildRetryList,
  courseContentTargetPath,
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
  readPriorCourseBackupStatus,
  readBoolean,
  readDate,
  readInteger,
  readList,
  readString,
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
  validateOutputDirForRun,
} from './canvas-backup.mjs';

const baseOptions = (overrides = {}) => ({
  courseIds: [],
  courseStates: ['created', 'claimed', 'available', 'completed'],
  createdAfter: null,
  excludeCourseNameTerms: DEFAULT_EXCLUDED_COURSE_NAME_TERMS,
  excludeSubaccountNameTerms: DEFAULT_EXCLUDED_SUBACCOUNT_NAME_TERMS,
  excludeCoursesWithoutStudents: DEFAULT_EXCLUDE_COURSES_WITHOUT_STUDENTS,
  maxCourses: null,
  ...overrides,
});

test('parseArgs accepts flags, spaced values, and inline values', () => {
  assert.deepEqual(parseArgs([
    '--account-id',
    '42',
    '--course-ids=1,2',
    '--list-only',
    '--created-after',
    '2026-05-08',
  ]), {
    accountId: '42',
    courseIds: '1,2',
    listOnly: true,
    createdAfter: '2026-05-08',
  });
});

test('read helpers normalize empty values and validate simple types', () => {
  assert.equal(readString('', 'fallback'), 'fallback');
  assert.equal(readString('  value  ', 'fallback'), 'value');
  assert.equal(readInteger('7', null), 7);
  assert.equal(readDate('2026-05-08'), '2026-05-08T00:00:00.000Z');
  assert.equal(readBoolean('YES', false), true);
  assert.equal(readBoolean('off', true), false);
  assert.deepEqual(readList('a, b,,c', []), ['a', 'b', 'c']);
});

test('default name exclusions match the approved broad-run noise terms', () => {
  assert.deepEqual(DEFAULT_EXCLUDED_COURSE_NAME_TERMS, [
    'test',
    'sandlåda',
    'sandlada',
    'sandbox',
    'mall',
    'template',
    'demo',
  ]);
});

test('default subaccount exclusions match the approved broad-run noise terms', () => {
  assert.deepEqual(DEFAULT_EXCLUDED_SUBACCOUNT_NAME_TERMS, ['sandbox']);
});

test('zero-student courses are excluded by default', () => {
  assert.equal(DEFAULT_EXCLUDE_COURSES_WITHOUT_STUDENTS, true);
});

test('backup runs require explicit output while list-only can use a timestamped default', () => {
  assert.throws(
    () => validateOutputDirForRun({}, false),
    /--output or CANVAS_OUTPUT_DIR/,
  );
  assert.doesNotThrow(() => validateOutputDirForRun({ listOnly: true }, false));
  assert.doesNotThrow(() => validateOutputDirForRun({ checkConfig: true }, false));
  assert.doesNotThrow(() => validateOutputDirForRun({}, true));

  assert.deepEqual(resolveOutputDir({ output: 'D:\\CanvasBackup\\rerun' }, {}).outputWasExplicit, true);
  assert.deepEqual(resolveOutputDir({}, {}).outputWasExplicit, false);
});

test('course selection excludes noisy names, statuses, and old courses', () => {
  const courses = [
    {
      id: 1,
      name: 'Real course',
      course_code: 'REAL101',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 2,
      name: 'Test course',
      course_code: 'TEST101',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 3,
      name: 'Production course',
      course_code: 'SANDLADA101',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 4,
      name: 'Archived course',
      course_code: 'ARCH101',
      workflow_state: 'deleted',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 5,
      name: 'Old course',
      course_code: 'OLD101',
      workflow_state: 'available',
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 6,
      name: 'Production sandbox',
      course_code: 'REAL-SBOX',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 7,
      name: 'Mall course',
      course_code: 'REAL-MALL',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 8,
      name: 'Template course',
      course_code: 'REAL-TEMPLATE',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 9,
      name: 'Demo course',
      course_code: 'REAL-DEMO',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
  ];

  const selection = selectCoursesForBackup(courses, baseOptions({
    createdAfter: '2025-01-01T00:00:00.000Z',
  }));

  assert.deepEqual(selection.courses.map((course) => course.id), [1]);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:test'], 1);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:sandlada'], 1);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:sandbox'], 1);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:mall'], 1);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:template'], 1);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:demo'], 1);
  assert.equal(selection.summary.excludedReasonCounts['status:deleted'], 1);
  assert.equal(selection.summary.excludedReasonCounts['created_before:2025-01-01T00:00:00.000Z'], 1);
});

test('course selection excludes courses when Canvas reports zero students', () => {
  const courses = [
    {
      id: 1,
      name: 'Course with students',
      workflow_state: 'available',
      total_students: 12,
    },
    {
      id: 2,
      name: 'Course without students',
      workflow_state: 'available',
      total_students: 0,
    },
    {
      id: 3,
      name: 'Course with string zero students',
      workflow_state: 'available',
      total_students: '0',
    },
    {
      id: 4,
      name: 'Course without reported student count',
      workflow_state: 'available',
    },
  ];

  const selection = selectCoursesForBackup(courses, baseOptions());

  assert.deepEqual(selection.courses.map((course) => course.id), [1, 4]);
  assert.equal(selection.summary.excludedReasonCounts['student_enrollments:0'], 2);
  assert.equal(selection.summary.filters.excludeCoursesWithoutStudents, true);
  assert.deepEqual(
    selection.summary.excludedCourses.map((course) => [course.id, course.totalStudents]),
    [[2, 0], [3, 0]],
  );
});

test('zero-student course exclusion can be disabled for diagnostics', () => {
  const courses = [
    {
      id: 1,
      name: 'Course without students',
      workflow_state: 'available',
      total_students: 0,
    },
  ];

  const selection = selectCoursesForBackup(courses, baseOptions({
    excludeCoursesWithoutStudents: false,
  }));

  assert.deepEqual(selection.courses.map((course) => course.id), [1]);
  assert.equal(selection.summary.excludedCourseCount, 0);
});

test('edge-only name exclusions avoid middle-of-word false positives', () => {
  const courses = [
    {
      id: 1,
      name: 'BIVB25 - Bibelvetenskap: Gamla testamentet på grundspråk',
      course_code: 'BIVB25',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 2,
      name: 'BIVC16 - Bibelvetenskap: Nya testamentet på grundspråk',
      course_code: 'BIVC16',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 3,
      name: 'BIVD24 - Bibelvetenskap: Nytestamentlig grekiska',
      course_code: 'BIVD24',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 4,
      name: 'TimeEdit-test:kurskod',
      course_code: 'XXX',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 5,
      name: 'Course using templated content',
      course_code: 'REAL101',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 6,
      name: 'Test course',
      course_code: 'REAL102',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 7,
      name: 'Real course',
      course_code: 'TEST101',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 8,
      name: 'Mall HUXD01 Editing and transcribing Premodern texts',
      course_code: 'REAL103',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 9,
      name: 'Real course',
      course_code: 'real-mall',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 10,
      name: 'Template course',
      course_code: 'REAL104',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 11,
      name: 'Demonstration course',
      course_code: 'REAL105',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 12,
      name: 'Real course demo',
      course_code: 'REAL106',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 13,
      name: 'Production sandbox',
      course_code: 'REAL107',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 14,
      name: 'Svante Lundgren Sandlåda',
      course_code: 'REAL108',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 15,
      name: 'Test course',
      course_code: 'TEST101',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 16,
      name: 'Sandboxing course',
      course_code: 'REAL109',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
    {
      id: 17,
      name: 'Sandlådan som metafor',
      course_code: 'REAL110',
      workflow_state: 'available',
      created_at: '2026-02-01T00:00:00Z',
    },
  ];

  const selection = selectCoursesForBackup(courses, baseOptions({
    createdAfter: '2025-01-01T00:00:00.000Z',
  }));

  assert.deepEqual(selection.courses.map((course) => course.id), [1, 2, 3, 4, 5, 11, 16, 17]);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:test'], 3);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:mall'], 2);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:template'], 1);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:demo'], 1);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:sandbox'], 1);
  assert.equal(selection.summary.excludedReasonCounts['name_contains:sandlåda'], 1);
  assert.equal(matchingExcludedNameTerm(courses[0], ['test']), null);
  assert.equal(matchingExcludedNameTerm(courses[2], ['test']), null);
  assert.equal(matchingExcludedNameTerm(courses[3], ['test']), null);
  assert.equal(matchingExcludedNameTerm(courses[4], ['template']), null);
  assert.equal(matchingExcludedNameTerm(courses[5], ['test']), 'test');
  assert.equal(matchingExcludedNameTerm(courses[6], ['test']), 'test');
  assert.equal(matchingExcludedNameTerm(courses[7], ['mall']), 'mall');
  assert.equal(matchingExcludedNameTerm(courses[8], ['mall']), 'mall');
  assert.equal(matchingExcludedNameTerm(courses[9], ['template']), 'template');
  assert.equal(matchingExcludedNameTerm(courses[10], ['demo']), null);
  assert.equal(matchingExcludedNameTerm(courses[11], ['demo']), 'demo');
  assert.equal(matchingExcludedNameTerm(courses[12], ['sandbox']), 'sandbox');
  assert.equal(matchingExcludedNameTerm(courses[13], ['sandlåda']), 'sandlåda');
  assert.equal(matchingExcludedNameTerm(courses[15], ['sandbox']), null);
  assert.equal(matchingExcludedNameTerm(courses[16], ['sandlåda']), null);
});

test('explicit course IDs bypass discovery filters', () => {
  const courses = [
    {
      id: 99,
      name: 'Test sandlåda old deleted course',
      course_code: 'TEST99',
      workflow_state: 'deleted',
      created_at: '2020-01-01T00:00:00Z',
    },
  ];

  const selection = selectCoursesForBackup(courses, baseOptions({
    courseIds: ['99'],
    createdAfter: '2025-01-01T00:00:00.000Z',
  }));

  assert.deepEqual(selection.courses.map((course) => course.id), [99]);
  assert.equal(selection.summary.excludedCourseCount, 0);
  assert.equal(selection.summary.filters.explicitCourseIdsBypassDiscoveryFilters, true);
});

test('course selection excludes courses from sandbox subaccounts', () => {
  const courses = [
    {
      id: 1,
      name: 'Real course',
      course_code: 'REAL101',
      account_id: 85,
      workflow_state: 'available',
    },
    {
      id: 2,
      name: 'Real course in practice account',
      course_code: 'REAL102',
      account_id: 326,
      workflow_state: 'available',
    },
  ];
  const subaccountIndex = {
    byId: new Map([
      ['85', { id: '85', name: 'Teologi och religionsvetenskap' }],
      ['326', { id: '326', name: 'Sandbox courses' }],
    ]),
    unknown: null,
  };

  const selection = selectCoursesForBackup(courses, baseOptions(), subaccountIndex);

  assert.deepEqual(selection.courses.map((course) => course.id), [1]);
  assert.equal(selection.summary.excludedReasonCounts['subaccount_name_contains:sandbox'], 1);
  assert.deepEqual(selection.summary.excludedCourses, [
    {
      id: 2,
      name: 'Real course in practice account',
      courseCode: 'REAL102',
      sisCourseId: null,
      accountId: 326,
      accountName: 'Sandbox courses',
      workflowState: 'available',
      createdAt: null,
      totalStudents: null,
      reasons: ['subaccount_name_contains:sandbox'],
    },
  ]);
});

test('explicit course IDs bypass sandbox subaccount filters', () => {
  const courses = [
    {
      id: 99,
      name: 'Known course in sandbox account',
      course_code: 'KNOWN99',
      account_id: 326,
      workflow_state: 'available',
    },
  ];
  const subaccountIndex = {
    byId: new Map([['326', { id: '326', name: 'Sandbox courses' }]]),
    unknown: null,
  };

  const selection = selectCoursesForBackup(courses, baseOptions({
    courseIds: ['99'],
  }), subaccountIndex);

  assert.deepEqual(selection.courses.map((course) => course.id), [99]);
  assert.equal(selection.summary.excludedCourseCount, 0);
});

test('discovered course details are reused when requested includes are present', () => {
  assert.equal(discoveredCourseHasIncludedDetails({
    id: 1,
    syllabus_body: null,
    term: null,
  }), true);
  assert.equal(discoveredCourseHasIncludedDetails({
    id: 2,
    syllabus_body: '<p>Course</p>',
  }), false);
});

test('course discovery requires account scope unless user-course fallback is explicit', async () => {
  const calls = [];
  const api = {
    async listPaginated(path, params) {
      calls.push({ path, params });
      return [{ id: 1, name: 'Visible course' }];
    },
  };

  await assert.rejects(
    () => discoverCourses(api, baseOptions({
      accountId: null,
      allowUserCourseDiscovery: false,
      concurrency: 1,
    })),
    /--account-id/,
  );

  const courses = await discoverCourses(api, baseOptions({
    accountId: null,
    allowUserCourseDiscovery: true,
    concurrency: 1,
  }));

  assert.deepEqual(courses, [{ id: 1, name: 'Visible course' }]);
  assert.equal(calls[0].path, '/api/v1/courses');
  assert.equal(calls[0].params['include[]'].includes('total_students'), true);
});

test('maxCourses limits selected courses after other filters', () => {
  const courses = [
    { id: 1, name: 'A', workflow_state: 'available' },
    { id: 2, name: 'B', workflow_state: 'available' },
    { id: 3, name: 'C', workflow_state: 'available' },
  ];

  const selection = selectCoursesForBackup(courses, baseOptions({ maxCourses: 2 }));

  assert.deepEqual(selection.courses.map((course) => course.id), [1, 2]);
  assert.equal(selection.summary.excludedReasonCounts['max_courses_limit:2'], 1);
});

test('course output is grouped by subaccount metadata', () => {
  const root = 'D:\\CanvasBackup\\run';
  const subaccountEntry = {
    id: '85',
    name: 'Naturvetenskap',
    metadataStatus: 'fetched',
  };
  const subaccountIndex = {
    byId: new Map([['85', subaccountEntry]]),
    unknown: null,
  };
  const course = {
    id: 39049,
    course_code: 'BIO101',
    account_id: 85,
    account_name: 'Fallback name',
  };

  assert.equal(subaccountFolderName(subaccountEntry), '85-Naturvetenskap');
  assert.deepEqual(subaccountEntryForCourse(course, subaccountIndex), subaccountEntry);
  assert.equal(
    courseOutputDir(root, course, subaccountIndex),
    join(root, 'subaccounts', '85-Naturvetenskap', 'courses', '39049_BIO101'),
  );

  const summary = buildSelectedSubaccountSummary([
    course,
    { id: 39050, course_code: 'BIO102', account_id: 85 },
    { id: 39051, course_code: 'HIS101' },
  ], subaccountIndex);

  assert.equal(summary.selectedSubaccountCount, 2);
  assert.deepEqual(summary.selectedSubaccounts.map((entry) => entry.folderName), [
    '85-Naturvetenskap',
    'unknown-subaccount',
  ]);
  assert.deepEqual(summary.selectedSubaccounts[0].courseIds, ['39049', '39050']);
});

test('course output folders separate Canvas id from SIS GUID with underscore', () => {
  const root = 'D:\\CanvasBackup\\run';
  const subaccountIndex = {
    byId: new Map([['210', { id: '210', name: 'Strategisk kommunikation' }]]),
    unknown: null,
  };
  const course = {
    id: 29397,
    sis_course_id: '61b4212d-101a-4377-9f59-3c22e6009e54',
    course_code: 'KOMC60',
    account_id: 210,
  };

  assert.equal(
    courseOutputDir(root, course, subaccountIndex),
    join(
      root,
      'subaccounts',
      '210-Strategisk kommunikation',
      'courses',
      '29397_61b4212d-101a-4377-9f59-3c22e6009e54',
    ),
  );
});

test('skip-completed-courses resume reads per-course manifests and excludes only "completed"', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas-backup-test-resume-'));
  try {
    const subaccountEntry = { id: '210', name: 'Strategisk kommunikation' };
    const subaccountIndex = {
      byId: new Map([['210', subaccountEntry]]),
      unknown: null,
    };
    const completed = { id: 1001, name: 'Done', course_code: 'C1', account_id: 210 };
    const withErrors = { id: 1002, name: 'Errors', course_code: 'C2', account_id: 210 };
    const failed = { id: 1003, name: 'Failed', course_code: 'C3', account_id: 210 };
    const neverRan = { id: 1004, name: 'New', course_code: 'C4', account_id: 210 };

    async function seedManifest(course, status) {
      const dir = courseOutputDir(root, course, subaccountIndex);
      await writeFile(
        join(dir, 'course-backup-manifest.json'),
        JSON.stringify({ courseId: course.id, status }),
        { flag: 'w' },
      );
    }

    for (const course of [completed, withErrors, failed]) {
      await mkdir(courseOutputDir(root, course, subaccountIndex), { recursive: true });
    }
    await seedManifest(completed, 'completed');
    await seedManifest(withErrors, 'completed_with_errors');
    await seedManifest(failed, 'failed');

    assert.equal(isCompletedCourseStatus('completed'), true);
    assert.equal(isCompletedCourseStatus('completed_with_errors'), false);
    assert.equal(isCompletedCourseStatus('failed'), false);
    assert.equal(isCompletedCourseStatus(null), false);

    assert.equal(
      await readPriorCourseBackupStatus(courseOutputDir(root, completed, subaccountIndex)),
      'completed',
    );
    assert.equal(
      await readPriorCourseBackupStatus(courseOutputDir(root, neverRan, subaccountIndex)),
      null,
    );

    const { coursesToBackup, skippedCompletedCourses } = await partitionAlreadyCompletedCourses(
      [completed, withErrors, failed, neverRan],
      root,
      subaccountIndex,
    );

    assert.deepEqual(coursesToBackup.map((course) => course.id), [1002, 1003, 1004]);
    assert.deepEqual(skippedCompletedCourses.map((course) => course.id), [1001]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('installRunLogger tees console output to a timestamped log file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canvas-runlog-'));
  const logPath = join(root, 'run.log');
  const fakeConsole = {
    log: () => {},
    warn: () => {},
    error: () => {},
  };
  const logger = installRunLogger(logPath, fakeConsole);

  try {
    fakeConsole.log('first line');
    fakeConsole.warn('multi\nline warn');
    fakeConsole.error('boom %s', 42);
  } finally {
    logger.restore();
  }

  const contents = await readFile(logPath, 'utf8');
  const lines = contents.trimEnd().split('\n');
  const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /;

  assert.equal(lines.length, 4);
  for (const line of lines) {
    assert.match(line, timestampPattern, `expected ISO timestamp prefix on "${line}"`);
  }
  assert.match(lines[0], / first line$/);
  assert.match(lines[1], / multi$/);
  assert.match(lines[2], / line warn$/);
  assert.match(lines[3], / boom 42$/);

  await rm(root, { recursive: true, force: true });
});

test('sandbox name exclusions are normalized consistently', () => {
  const course = {
    name: 'Övningskurs Sandlåda',
    course_code: 'Sandbox ABC123',
  };

  assert.equal(matchingExcludedNameTerm(course, ['sandlåda']), 'sandlåda');
  assert.equal(matchingExcludedNameTerm(course, ['sandbox']), 'sandbox');
  assert.equal(
    matchingExcludedSubaccountNameTerm(
      { account_id: 326 },
      ['sandbox'],
      { byId: new Map([['326', { name: 'Faculty Sandbox' }]]) },
    ),
    'sandbox',
  );
  assert.equal(
    matchingExcludedSubaccountNameTerm(
      { account_id: 326 },
      ['sandbox'],
      { byId: new Map([['326', { name: 'Sandboxing Faculty' }]]) },
    ),
    null,
  );
});

test('sanitizeSegment handles reserved Windows names and unsafe characters', () => {
  assert.equal(sanitizeSegment('con'), '_con');
  assert.equal(sanitizeSegment('bad<name>:file?.txt'), 'bad_name__file_.txt');
  assert.equal(sanitizeSegment('   ...   '), 'untitled');
  assert.equal(sanitizeSegment(`${'a'.repeat(119)}. trailing text`), 'a'.repeat(119));
});

test('sanitizeFileNameSegment preserves useful extensions when clipping long names', () => {
  const clippedPdfName = sanitizeFileNameSegment(`${'a'.repeat(140)}.pdf`);
  const clippedDocxName = sanitizeFileNameSegment(`${'Long course document '.repeat(12)}.DOCX`);

  assert.equal(clippedPdfName, `${'a'.repeat(116)}.pdf`);
  assert.equal(clippedPdfName.length, 120);
  assert.equal(clippedDocxName.endsWith('.DOCX'), true);
  assert.equal(clippedDocxName.length <= 120, true);
});

test('generated course content paths shorten filenames before the Windows path limit', () => {
  const courseDir = join(
    'D:\\CanvasBackup',
    'deep-output-root',
    'subaccounts',
    `85-${'faculty '.repeat(5)}`,
    'courses',
    `39049-${'course-code '.repeat(5)}`,
  );
  const targetPath = courseContentTargetPath(
    courseDir,
    'pages',
    `001-${'very long page title '.repeat(8)}.html`,
  );

  assert.equal(targetPath.length <= 230, true);
  assert.equal(targetPath.endsWith('.html'), true);
});

test('file download fallback shortens flat filenames when nested paths are too long', () => {
  const courseDir = join(
    'D:\\CanvasBackup',
    'deep-output-root',
    'subaccounts',
    `85-${'faculty '.repeat(5)}`,
    'courses',
    `39049-${'course-code '.repeat(5)}`,
  );
  const foldersById = new Map([[
    '12',
    {
      id: 12,
      full_name: `${'folder/'.repeat(10)}files`,
    },
  ]]);
  const targetPath = fileTargetPath(courseDir, foldersById, {
    id: 123,
    folder_id: 12,
    display_name: `${'large document '.repeat(12)}.pdf`,
  });

  assert.equal(targetPath.length <= 230, true);
  assert.equal(targetPath.endsWith('.pdf'), true);
  assert.equal(targetPath.includes('_flat'), true);
});

test('redactOptions does not expose configured tokens', () => {
  assert.deepEqual(redactOptions({ token: 'secret', mode: 'direct', outputWasExplicit: true }), {
    token: '[redacted]',
    mode: 'direct',
  });
});

test('error body redaction removes obvious token and session values', () => {
  assert.equal(
    redactErrorBody('Authorization: Bearer abc.def?access_token=secret&ok=1 {"session_id":"cookie"}'),
    'Authorization: Bearer [redacted]?access_token=[redacted]&ok=1 {"session_id":"[redacted]"}',
  );
});

test('staff privacy helpers default away from deleted states', () => {
  assert.deepEqual(staffEnrollmentStates({ staffIncludeDeleted: false }), [
    'active',
    'invited',
    'creation_pending',
    'completed',
  ]);
  assert.equal(staffEnrollmentStates({ staffIncludeDeleted: true }).includes('deleted'), true);
  assert.equal(staffEnrollmentStates({ staffIncludeDeleted: true }).includes('inactive'), true);
});

test('staff backup preserves Canvas login and SIS identifiers', async () => {
  const courseDir = await mkdtemp(join(tmpdir(), 'canvas-backup-test-'));
  const users = [
    {
      id: 10,
      name: 'Teacher',
      login_id: 'teacher@example.test',
      sis_user_id: 'sis-10',
      integration_id: 'integration-10',
      enrollments: [{ type: 'TeacherEnrollment' }],
    },
  ];
  const enrollments = [
    {
      id: 20,
      type: 'TeacherEnrollment',
      user_id: 10,
      user: {
        id: 10,
        login_id: 'teacher@example.test',
        sis_login_id: 'teacher-login',
        sis_user_id: 'sis-10',
        unique_id: 'teacher-unique',
      },
    },
  ];
  const api = {
    async listPaginated(path) {
      if (path.endsWith('/users')) {
        return users;
      }

      if (path.endsWith('/enrollments')) {
        return enrollments;
      }

      return [];
    },
  };

  try {
    const summary = { errors: [] };
    const result = await backupStaffRoles(api, { id: 42 }, courseDir, { staffIncludeDeleted: false }, summary);
    const staffUsers = JSON.parse(await readFile(join(courseDir, 'people', 'staff-users.json'), 'utf8'));
    const staffEnrollments = JSON.parse(await readFile(join(courseDir, 'people', 'staff-enrollments.json'), 'utf8'));
    const teachers = JSON.parse(await readFile(join(courseDir, 'people', 'teachers.json'), 'utf8'));

    assert.deepEqual(result, { userCount: 1, teacherCount: 1, enrollmentCount: 1 });
    assert.equal(staffUsers[0].login_id, 'teacher@example.test');
    assert.equal(staffUsers[0].sis_user_id, 'sis-10');
    assert.equal(staffUsers[0].integration_id, 'integration-10');
    assert.equal(staffEnrollments[0].user.login_id, 'teacher@example.test');
    assert.equal(staffEnrollments[0].user.sis_login_id, 'teacher-login');
    assert.equal(staffEnrollments[0].user.sis_user_id, 'sis-10');
    assert.equal(staffEnrollments[0].user.unique_id, 'teacher-unique');
    assert.equal(teachers[0].login_id, 'teacher@example.test');
    assert.deepEqual(summary.errors, []);
  } finally {
    await rm(courseDir, { recursive: true, force: true });
  }
});

test('authorization is scoped to the Canvas origin', () => {
  assert.equal(
    shouldSendCanvasAuthorization('https://lu.instructure.com/api/v1/courses', 'https://lu.instructure.com'),
    true,
  );
  assert.equal(
    shouldSendCanvasAuthorization('/api/v1/courses', 'https://lu.instructure.com/'),
    true,
  );
  assert.equal(
    shouldSendCanvasAuthorization('https://canvas-files.example/download.zip', 'https://lu.instructure.com'),
    false,
  );
});

test('download resumes skip existing non-empty files when Canvas omits size', async () => {
  const courseDir = await mkdtemp(join(tmpdir(), 'canvas-backup-test-'));
  const targetPath = join(courseDir, 'existing.txt');
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  await writeFile(targetPath, 'already downloaded');
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called for a resumable file');
  };

  try {
    const api = new CanvasApi({
      baseUrl: 'https://lu.instructure.com',
      token: 'secret',
      maxRetries: 0,
      sleepFn: async () => {},
    });
    const result = await api.download('/files/1/download', targetPath, undefined);

    assert.equal(result.status, 'skipped');
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(courseDir, { recursive: true, force: true });
  }
});

test('file backup writes size summaries even when downloads are skipped', async () => {
  const courseDir = await mkdtemp(join(tmpdir(), 'canvas-backup-test-'));
  const files = [
    {
      id: 1,
      display_name: 'small.pdf',
      size: 2 * 1024 * 1024,
      content_type: 'application/pdf',
      updated_at: '2026-05-01T10:00:00Z',
    },
    {
      id: 2,
      display_name: 'large.mov',
      size: 12 * 1024 * 1024,
      content_type: 'video/quicktime',
    },
    {
      id: 3,
      display_name: 'unknown.bin',
      size: null,
    },
  ];
  const api = {
    async listPaginated(path) {
      return path.endsWith('/files') ? files : [];
    },
    async download() {
      throw new Error('download should not be called when downloads are skipped');
    },
  };

  try {
    const summary = { errors: [] };
    const result = await backupFiles(api, { id: 42 }, courseDir, [], {
      fileConcurrency: 2,
      maxFileSizeMb: 10,
      skipFileDownloads: true,
    }, summary);
    const sizeSummary = JSON.parse(await readFile(join(courseDir, 'metadata', 'file-size-summary.json'), 'utf8'));

    assert.equal(result.count, 3);
    assert.equal(result.downloaded, 0);
    assert.equal(result.sizeSummary.reportedSizeBytes, 14 * 1024 * 1024);
    assert.equal(sizeSummary.fileCount, 3);
    assert.equal(sizeSummary.reportedSizeFileCount, 2);
    assert.equal(sizeSummary.unknownSizeFileCount, 1);
    assert.equal(sizeSummary.reportedSizeMegabytes, 14);
    assert.equal(sizeSummary.maxFileSizeMb, 10);
    assert.equal(sizeSummary.overLimitFileCount, 1);
    assert.equal(sizeSummary.overLimitReportedSizeMegabytes, 12);
    assert.equal(sizeSummary.downloadableWithinLimitReportedSizeMegabytes, 2);
    assert.equal(sizeSummary.largestFiles[0].displayName, 'large.mov');
    assert.equal(sizeSummary.largestFiles[1].contentType, 'application/pdf');
    assert.deepEqual(summary.errors, []);
    assert.deepEqual(summarizeFileSizes(files, { maxFileSizeMb: 10 }), sizeSummary);
  } finally {
    await rm(courseDir, { recursive: true, force: true });
  }
});

test('file backup skips downloads above the configured size limit', async () => {
  const courseDir = await mkdtemp(join(tmpdir(), 'canvas-backup-test-'));
  const files = [
    {
      id: 1,
      display_name: 'small.pdf',
      size: 5 * 1024 * 1024,
      url: 'https://lu.instructure.com/files/1/download',
    },
    {
      id: 2,
      display_name: 'large.mov',
      size: 11 * 1024 * 1024,
      url: 'https://lu.instructure.com/files/2/download',
    },
  ];
  const downloadedUrls = [];
  const api = {
    async listPaginated(path) {
      return path.endsWith('/files') ? files : [];
    },
    async download(url, targetPath) {
      downloadedUrls.push(url);
      return { status: 'downloaded', path: targetPath };
    },
  };

  try {
    const summary = { errors: [] };
    const result = await backupFiles(api, { id: 42 }, courseDir, [], {
      fileConcurrency: 2,
      maxFileSizeMb: 10,
      skipFileDownloads: false,
    }, summary);
    const downloadLog = JSON.parse(await readFile(join(courseDir, 'metadata', 'file-downloads.json'), 'utf8'));
    const sizeSummary = JSON.parse(await readFile(join(courseDir, 'metadata', 'file-size-summary.json'), 'utf8'));

    assert.equal(result.count, 2);
    assert.equal(result.downloaded, 1);
    assert.equal(result.skipped, 1);
    assert.equal(result.skippedBySizeLimit, 1);
    assert.equal(result.errors, 0);
    assert.equal(result.sizeSummary.overLimitFileCount, 1);
    assert.deepEqual(downloadedUrls, ['https://lu.instructure.com/files/1/download']);
    assert.equal(downloadLog[1].status, 'skipped_size_limit');
    assert.equal(downloadLog[1].reason, 'file_size_exceeds_limit');
    assert.equal(downloadLog[1].maxFileSizeMb, 10);
    assert.equal(downloadLog[1].maxFileSizeBytes, 10 * 1024 * 1024);
    assert.equal(sizeSummary.fileCount, 2);
    assert.equal(sizeSummary.reportedSizeMegabytes, 16);
    assert.equal(sizeSummary.overLimitFileCount, 1);
    assert.deepEqual(summary.errors, []);
    assert.deepEqual(fileDownloadSizeLimit({ maxFileSizeMb: 10 }), {
      megabytes: 10,
      bytes: 10 * 1024 * 1024,
    });
    assert.equal(fileDownloadSizeLimit({ maxFileSizeMb: null }), null);
  } finally {
    await rm(courseDir, { recursive: true, force: true });
  }
});

test('CanvasApi retries thrown fetch errors before failing a request', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;

    if (callCount === 1) {
      throw new TypeError('socket reset');
    }

    return new Response('{"ok":true}', { status: 200 });
  };

  try {
    const api = new CanvasApi({
      baseUrl: 'https://lu.instructure.com',
      token: 'secret',
      maxRetries: 1,
      sleepFn: async () => {},
    });
    const response = await api.fetchRaw('/api/v1/courses');

    assert.equal(response.ok, true);
    assert.equal(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('module backup always paginates module items instead of trusting embedded partial items', async () => {
  const courseDir = await mkdtemp(join(tmpdir(), 'canvas-backup-test-'));
  const calls = [];
  const api = {
    async listPaginated(path, params) {
      calls.push({ path, params });

      if (path.endsWith('/modules')) {
        return [
          {
            id: 77,
            name: 'Week 1',
            items: [{ id: 'partial' }],
          },
        ];
      }

      if (path.endsWith('/modules/77/items')) {
        return [{ id: 'full-1' }, { id: 'full-2' }];
      }

      return [];
    },
  };

  try {
    const result = await backupModules(api, { id: 42 }, courseDir, { errors: [] });
    const fullModules = JSON.parse(await readFile(join(courseDir, 'metadata', 'modules.full.json'), 'utf8'));

    assert.equal(result.count, 1);
    assert.equal(result.itemCount, 2);
    assert.deepEqual(calls[0].params, { per_page: 100 });
    assert.equal(calls.filter((call) => call.path.endsWith('/items')).length, 1);
    assert.deepEqual(fullModules[0].items, [{ id: 'full-1' }, { id: 'full-2' }]);
  } finally {
    await rm(courseDir, { recursive: true, force: true });
  }
});

test('course-adjacent metadata backup captures read-only P1 surfaces', async () => {
  const courseDir = await mkdtemp(join(tmpdir(), 'canvas-backup-test-'));
  const calls = [];
  const api = {
    async listPaginated(path, params) {
      calls.push({ path, params });

      if (path.endsWith('/rubrics')) {
        return [{ id: 1, title: 'Rubric' }];
      }

      if (path.endsWith('/external_tools')) {
        return [{ id: 2, name: 'Tool' }];
      }

      if (path === '/api/v1/calendar_events') {
        return [{ id: 3, title: 'Lecture' }];
      }

      if (path.endsWith('/group_categories')) {
        return [{ id: 4, name: 'Project groups' }];
      }

      if (path.endsWith('/groups')) {
        return [{ id: 5, name: 'Group A' }];
      }

      if (path.endsWith('/outcome_groups')) {
        return [{ id: 6, title: 'Outcomes' }];
      }

      if (path.endsWith('/outcome_group_links')) {
        return [{ id: 7, outcome: { id: 8 } }];
      }

      return [];
    },
  };

  try {
    const summary = { errors: [] };
    const result = await backupCourseAdjacentMetadata(api, { id: 42 }, courseDir, summary);
    const externalTools = JSON.parse(await readFile(join(courseDir, 'metadata', 'external-tools.json'), 'utf8'));
    const calendarCall = calls.find((call) => call.path === '/api/v1/calendar_events');
    const groupCall = calls.find((call) => call.path.endsWith('/groups'));

    assert.deepEqual(result, {
      rubricCount: 1,
      externalToolCount: 1,
      calendarEventCount: 1,
      groupCategoryCount: 1,
      groupCount: 1,
      outcomeGroupCount: 1,
      outcomeLinkCount: 1,
    });
    assert.deepEqual(externalTools, [{ id: 2, name: 'Tool' }]);
    assert.deepEqual(calendarCall.params['context_codes[]'], ['course_42']);
    assert.deepEqual(calendarCall.params['include[]'], ['series_natural_language']);
    assert.equal(calendarCall.params['includes[]'], undefined);
    assert.equal(calendarCall.params.all_events, true);
    assert.equal(groupCall.params.collaboration_state, 'all');
    assert.deepEqual(groupCall.params['include[]'], ['tabs']);
    assert.deepEqual(summary.errors, []);
  } finally {
    await rm(courseDir, { recursive: true, force: true });
  }
});

test('buildRetryList summarizes failed and partially failed courses', () => {
  const retryList = buildRetryList({
    courses: [
      {
        courseId: 101,
        courseName: 'Failed course',
        status: 'failed',
        errors: [
          {
            scope: 'course:101',
            name: 'CanvasHttpError',
            message: 'Course failed',
            status: 500,
            url: 'https://lu.instructure.com/api/v1/courses/101',
            body: 'omitted from retry list',
          },
        ],
      },
      {
        courseId: 202,
        courseName: 'Partial course',
        status: 'completed_with_errors',
        errors: [
          {
            scope: 'files:202',
            name: 'CanvasHttpError',
            message: 'Files failed',
            status: 403,
            url: 'https://lu.instructure.com/api/v1/courses/202/files',
          },
        ],
      },
      {
        courseId: 303,
        courseName: 'Clean course',
        status: 'completed',
        errors: [],
      },
    ],
    errors: [
      {
        scope: 'course:404',
        name: 'Error',
        message: 'Top-level failure',
      },
    ],
  });

  assert.deepEqual(retryList.retryCourseIds, ['101', '202']);
  assert.equal(retryList.retryCourseIdsArgument, '101,202');
  assert.deepEqual(retryList.courseFailures.map((failure) => failure.courseId), [101, 202]);
  assert.equal(retryList.endpointFailures.length, 2);
  assert.equal(retryList.endpointFailures[0].body, undefined);
  assert.equal(retryList.topLevelFailures[0].scope, 'course:404');
});
