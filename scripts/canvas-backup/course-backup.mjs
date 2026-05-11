import {
  mkdir,
  readFile,
} from 'node:fs/promises';
import {
  join,
  relative,
} from 'node:path';
import {
  discoveredCourseHasIncludedDetails,
  getCourseDetails,
} from './course-selection.mjs';
import {
  backupErrorOutputPath,
  recordError,
  serializeError,
  writeHtmlDocument,
  writeJson,
  writeSyllabus,
} from './output-files.mjs';
import {
  courseContentTargetPath,
  fileTargetPath,
  numberedHtmlFileName,
  pathWithSafeFileName,
  sanitizeSegment,
  subaccountFolderName,
} from './path-safety.mjs';
import {
  courseOutputDir,
  subaccountEntryForCourse,
  subaccountOutputDir,
} from './subaccounts.mjs';
import {
  mapLimit,
  sleep,
} from './utilities.mjs';

const COURSE_BACKUP_MANIFEST_FILE = 'course-backup-manifest.json';
const COURSE_STATUS_COMPLETED = 'completed';

const STAFF_USER_ENROLLMENT_TYPES = ['teacher', 'ta', 'designer'];
const STAFF_ENROLLMENT_TYPES = ['TeacherEnrollment', 'TaEnrollment', 'DesignerEnrollment'];
const STAFF_CURRENT_ENROLLMENT_STATES = [
  'active',
  'invited',
  'creation_pending',
  'completed',
];
const STAFF_DELETED_ENROLLMENT_STATES = [
  'deleted',
  'rejected',
  'inactive',
];
const BYTES_PER_MEGABYTE = 1024 * 1024;
const BYTES_PER_GIGABYTE = BYTES_PER_MEGABYTE * 1024;
const FILE_STATUS_SKIPPED_SIZE_LIMIT = 'skipped_size_limit';
const LARGEST_FILE_SAMPLE_LIMIT = 20;
const SIZE_DISPLAY_DECIMALS = 2;

async function backupCourse(api, discoveredCourse, options, subaccountIndex) {
  const course = discoveredCourse.discovery_error
    || discoveredCourseHasIncludedDetails(discoveredCourse)
    ? discoveredCourse
    : await safeGetCourseDetails(api, discoveredCourse);
  const subaccountEntry = subaccountEntryForCourse(course, subaccountIndex);
  const courseDir = courseOutputDir(options.outputDir, course, subaccountIndex);
  const summary = {
    courseId: course.id,
    courseName: course.name,
    subaccount: {
      accountId: subaccountEntry.id,
      accountName: subaccountEntry.name,
      folderName: subaccountFolderName(subaccountEntry),
      metadataStatus: subaccountEntry.metadataStatus,
    },
    status: 'completed',
    outputDir: courseDir,
    startedAt: new Date().toISOString(),
    resources: {},
    exports: [],
    errors: [],
  };

  await mkdir(courseDir, { recursive: true });
  await writeJson(join(subaccountOutputDir(options.outputDir, subaccountEntry), 'subaccount.json'), subaccountEntry);
  await writeJson(join(courseDir, 'course.json'), course);
  await writeSyllabus(courseDir, course);

  const exportJobs = shouldRunExports(options)
    ? await createContentExports(api, course, courseDir, options, summary)
    : [];

  if (shouldRunDirect(options)) {
    summary.resources = await backupDirectCourseResources(api, course, courseDir, options, summary);
  }

  if (exportJobs.length && options.waitExports) {
    summary.exports = await waitForContentExports(api, course, courseDir, exportJobs, options, summary);
  } else if (exportJobs.length) {
    summary.exports = exportJobs.map((job) => ({
      type: job.type,
      id: job.export?.id,
      status: 'created',
      progressUrl: job.export?.progress_url,
    }));
  }

  summary.finishedAt = new Date().toISOString();
  summary.status = summary.errors.length ? 'completed_with_errors' : 'completed';
  await writeJson(join(courseDir, COURSE_BACKUP_MANIFEST_FILE), summary);

  if (summary.errors.length) {
    await writeJson(join(courseDir, 'errors.json'), summary.errors);
  }

  console.log(`[${course.id}] ${summary.status}: ${course.name ?? course.course_code ?? 'unnamed course'}`);
  return summary;
}

async function readPriorCourseBackupStatus(courseDir) {
  try {
    const content = await readFile(join(courseDir, COURSE_BACKUP_MANIFEST_FILE), 'utf8');
    const parsed = JSON.parse(content);
    return typeof parsed?.status === 'string' ? parsed.status : null;
  } catch {
    return null;
  }
}

function isCompletedCourseStatus(status) {
  return status === COURSE_STATUS_COMPLETED;
}

async function safeGetCourseDetails(api, discoveredCourse) {
  try {
    return await getCourseDetails(api, discoveredCourse.id);
  } catch {
    return discoveredCourse;
  }
}

async function backupDirectCourseResources(api, course, courseDir, options, summary) {
  const resources = {};

  resources.staff = await backupStaffRoles(api, course, courseDir, options, summary);
  resources.sections = await backupSections(api, course, courseDir, summary);
  resources.tabs = await backupTabs(api, course, courseDir, summary);
  resources.settings = await backupSettings(api, course, courseDir, summary);

  const folders = await backupListResource(api, course, courseDir, summary, {
    name: 'folders',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/folders`,
    params: { per_page: 100 },
  });
  resources.folders = { count: folders.length };

  const files = await backupFiles(api, course, courseDir, folders, options, summary);
  resources.files = files;

  resources.pages = await backupPages(api, course, courseDir, summary);
  resources.modules = await backupModules(api, course, courseDir, summary);
  resources.assignments = await backupAssignments(api, course, courseDir, summary);
  resources.discussions = await backupDiscussions(api, course, courseDir, summary);
  resources.announcements = await backupAnnouncements(api, course, courseDir, summary);
  resources.quizzes = await backupQuizzes(api, course, courseDir, summary);
  resources.assignmentGroups = await backupAssignmentGroups(api, course, courseDir, summary);
  resources.courseAdjacentMetadata = await backupCourseAdjacentMetadata(api, course, courseDir, summary);

  return resources;
}

async function backupStaffRoles(api, course, courseDir, options, summary) {
  const staffUsers = await backupListResource(api, course, courseDir, summary, {
    name: 'staff-users',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/users`,
    params: {
      per_page: 100,
      'enrollment_type[]': STAFF_USER_ENROLLMENT_TYPES,
      'include[]': ['enrollments'],
    },
    outputPath: join('people', 'staff-users.json'),
  });

  const staffEnrollments = await backupListResource(api, course, courseDir, summary, {
    name: 'staff-enrollments',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/enrollments`,
    params: {
      per_page: 100,
      'type[]': STAFF_ENROLLMENT_TYPES,
      'state[]': staffEnrollmentStates(options),
      'include[]': ['user'],
    },
    outputPath: join('people', 'staff-enrollments.json'),
  });

  const teacherUserIds = enrollmentUserIdsByType(staffEnrollments, 'TeacherEnrollment');
  const teachers = staffUsers.filter((user) => (
    teacherUserIds.has(String(user.id)) || hasEnrollmentType(user, 'TeacherEnrollment')
  ));

  await writeJson(join(courseDir, 'people', 'teachers.json'), teachers);

  return {
    userCount: staffUsers.length,
    teacherCount: teachers.length,
    enrollmentCount: staffEnrollments.length,
  };
}

async function backupSections(api, course, courseDir, summary) {
  const sections = await backupListResource(api, course, courseDir, summary, {
    name: 'sections',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/sections`,
    params: {
      per_page: 100,
      'include[]': ['total_students'],
    },
    outputPath: join('structure', 'sections.json'),
  });

  return { count: sections.length };
}

async function backupTabs(api, course, courseDir, summary) {
  const tabs = await backupListResource(api, course, courseDir, summary, {
    name: 'tabs',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/tabs`,
    params: {},
    outputPath: join('structure', 'tabs.json'),
  });

  return { count: tabs.length };
}

async function backupSettings(api, course, courseDir, summary) {
  const settings = await backupJsonResource(api, course, courseDir, summary, {
    name: 'settings',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/settings`,
    params: {},
    outputPath: join('structure', 'settings.json'),
  });

  return { captured: Boolean(settings) };
}

async function backupListResource(api, course, courseDir, summary, resource) {
  const outputPath = resource.outputPath ?? join('metadata', `${resource.name}.json`);
  try {
    const items = await api.listPaginated(resource.path, resource.params);
    const value = resource.transform ? resource.transform(items) : items;
    await writeJson(join(courseDir, outputPath), value);
    return value;
  } catch (error) {
    recordError(summary, `${resource.name}:${course.id}`, error);
    await writeJson(join(courseDir, backupErrorOutputPath(outputPath)), serializeError(error));
    return [];
  }
}

async function backupJsonResource(api, course, courseDir, summary, resource) {
  const outputPath = resource.outputPath ?? join('metadata', `${resource.name}.json`);
  try {
    const value = await api.request(resource.path, { params: resource.params });
    const outputValue = resource.transform ? resource.transform(value) : value;
    await writeJson(join(courseDir, outputPath), outputValue);
    return outputValue;
  } catch (error) {
    recordError(summary, `${resource.name}:${course.id}`, error);
    await writeJson(join(courseDir, backupErrorOutputPath(outputPath)), serializeError(error));
    return null;
  }
}

function staffEnrollmentStates(options) {
  return options.staffIncludeDeleted
    ? [...STAFF_CURRENT_ENROLLMENT_STATES, ...STAFF_DELETED_ENROLLMENT_STATES]
    : [...STAFF_CURRENT_ENROLLMENT_STATES];
}

async function backupFiles(api, course, courseDir, folders, options, summary) {
  const files = await backupListResource(api, course, courseDir, summary, {
    name: 'files',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/files`,
    params: {
      per_page: 100,
      'include[]': ['usage_rights'],
      sort: 'updated_at',
      order: 'desc',
    },
  });
  const sizeSummary = summarizeFileSizes(files, options);
  await writeJson(join(courseDir, 'metadata', 'file-size-summary.json'), sizeSummary);

  if (options.skipFileDownloads) {
    return {
      count: files.length,
      downloaded: 0,
      skipped: 0,
      errors: 0,
      sizeSummary,
    };
  }

  const foldersById = new Map(folders.map((folder) => [String(folder.id), folder]));
  const sizeLimit = fileDownloadSizeLimit(options);
  const downloadResults = await mapLimit(files, options.fileConcurrency, async (file) => {
    const fileSize = file.size === undefined || file.size === null ? null : Number(file.size);

    if (sizeLimit && Number.isFinite(fileSize) && fileSize > sizeLimit.bytes) {
      return {
        id: file.id,
        status: FILE_STATUS_SKIPPED_SIZE_LIMIT,
        reason: 'file_size_exceeds_limit',
        displayName: file.display_name ?? file.filename ?? null,
        size: file.size ?? null,
        maxFileSizeMb: sizeLimit.megabytes,
        maxFileSizeBytes: sizeLimit.bytes,
      };
    }

    if (!file.url) {
      const result = {
        id: file.id,
        status: 'missing_url',
        displayName: file.display_name ?? file.filename ?? null,
      };
      recordError(summary, `file:${course.id}:${file.id}`, new Error(`File ${file.id} has no download URL`));
      return result;
    }

    const targetPath = fileTargetPath(courseDir, foldersById, file);

    try {
      const download = await api.download(file.url, targetPath, file.size);
      return {
        id: file.id,
        status: download.status,
        displayName: file.display_name ?? file.filename ?? null,
        size: file.size ?? null,
        path: relative(courseDir, download.path),
      };
    } catch (error) {
      recordError(summary, `file:${course.id}:${file.id}`, error);
      return {
        id: file.id,
        status: 'error',
        displayName: file.display_name ?? file.filename ?? null,
        error: serializeError(error),
      };
    }
  });

  await writeJson(join(courseDir, 'metadata', 'file-downloads.json'), downloadResults);

  return {
    count: files.length,
    downloaded: downloadResults.filter((result) => result.status === 'downloaded').length,
    skipped: downloadResults.filter((result) => (
      result.status === 'skipped' || result.status === FILE_STATUS_SKIPPED_SIZE_LIMIT
    )).length,
    skippedBySizeLimit: downloadResults.filter((result) => (
      result.status === FILE_STATUS_SKIPPED_SIZE_LIMIT
    )).length,
    errors: downloadResults.filter((result) => result.status === 'error' || result.status === 'missing_url').length,
    sizeSummary,
  };
}

function fileDownloadSizeLimit(options) {
  if (!options.maxFileSizeMb) {
    return null;
  }

  return {
    megabytes: options.maxFileSizeMb,
    bytes: options.maxFileSizeMb * BYTES_PER_MEGABYTE,
  };
}

function summarizeFileSizes(files, options) {
  const sizeLimit = fileDownloadSizeLimit(options);
  const largestFiles = [];
  let reportedSizeBytes = 0;
  let reportedSizeFileCount = 0;
  let unknownSizeFileCount = 0;
  let overLimitFileCount = 0;
  let overLimitReportedSizeBytes = 0;

  for (const file of files) {
    const sizeBytes = fileSizeBytes(file);

    if (sizeBytes === null) {
      unknownSizeFileCount += 1;
      continue;
    }

    reportedSizeBytes += sizeBytes;
    reportedSizeFileCount += 1;
    largestFiles.push(fileSizeRecord(file, sizeBytes));

    if (sizeLimit && sizeBytes > sizeLimit.bytes) {
      overLimitFileCount += 1;
      overLimitReportedSizeBytes += sizeBytes;
    }
  }

  largestFiles.sort((left, right) => right.sizeBytes - left.sizeBytes);

  return {
    fileCount: files.length,
    reportedSizeFileCount,
    unknownSizeFileCount,
    reportedSizeBytes,
    reportedSizeMegabytes: bytesToMegabytes(reportedSizeBytes),
    reportedSizeGigabytes: bytesToGigabytes(reportedSizeBytes),
    maxFileSizeMb: sizeLimit?.megabytes ?? null,
    maxFileSizeBytes: sizeLimit?.bytes ?? null,
    overLimitFileCount,
    overLimitReportedSizeBytes,
    overLimitReportedSizeMegabytes: bytesToMegabytes(overLimitReportedSizeBytes),
    downloadableWithinLimitReportedSizeBytes: reportedSizeBytes - overLimitReportedSizeBytes,
    downloadableWithinLimitReportedSizeMegabytes: bytesToMegabytes(reportedSizeBytes - overLimitReportedSizeBytes),
    largestFiles: largestFiles.slice(0, LARGEST_FILE_SAMPLE_LIMIT),
  };
}

function fileSizeBytes(file) {
  if (file.size === undefined || file.size === null || file.size === '') {
    return null;
  }

  const sizeBytes = Number(file.size);
  return Number.isFinite(sizeBytes) && sizeBytes >= 0 ? sizeBytes : null;
}

function fileSizeRecord(file, sizeBytes) {
  return {
    id: file.id ?? null,
    displayName: file.display_name ?? file.filename ?? null,
    contentType: file.content_type ?? null,
    updatedAt: file.updated_at ?? null,
    sizeBytes,
    sizeMegabytes: bytesToMegabytes(sizeBytes),
  };
}

function bytesToMegabytes(bytes) {
  return roundSize(bytes / BYTES_PER_MEGABYTE);
}

function bytesToGigabytes(bytes) {
  return roundSize(bytes / BYTES_PER_GIGABYTE);
}

function roundSize(value) {
  return Number(value.toFixed(SIZE_DISPLAY_DECIMALS));
}

async function backupPages(api, course, courseDir, summary) {
  const pages = await backupListResource(api, course, courseDir, summary, {
    name: 'pages',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/pages`,
    params: {
      per_page: 100,
      'include[]': ['body'],
      sort: 'title',
      order: 'asc',
    },
  });

  const hydratedPages = await mapLimit(pages, 4, async (page) => {
    if (page.body || !page.url) {
      return page;
    }

    try {
      return await api.request(`/api/v1/courses/${encodeURIComponent(course.id)}/pages/${encodeURIComponent(page.url)}`);
    } catch (error) {
      recordError(summary, `page:${course.id}:${page.url}`, error);
      return {
        ...page,
        backup_error: serializeError(error),
      };
    }
  });

  await writeJson(join(courseDir, 'metadata', 'pages.full.json'), hydratedPages);

  await Promise.all(hydratedPages.map((page, index) => {
    const fileName = numberedHtmlFileName(index, page.title ?? page.url ?? `page-${page.page_id ?? index + 1}`);
    return writeHtmlDocument(
      courseContentTargetPath(courseDir, 'pages', fileName),
      page.title ?? fileName,
      page.body ?? '',
      page,
    );
  }));

  return {
    count: hydratedPages.length,
    errors: hydratedPages.filter((page) => page.backup_error).length,
  };
}

async function backupModules(api, course, courseDir, summary) {
  const modules = await backupListResource(api, course, courseDir, summary, {
    name: 'modules',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/modules`,
    params: {
      per_page: 100,
    },
  });

  const hydratedModules = await mapLimit(modules, 4, async (module) => {
    try {
      const items = await api.listPaginated(
        `/api/v1/courses/${encodeURIComponent(course.id)}/modules/${encodeURIComponent(module.id)}/items`,
        {
          per_page: 100,
          'include[]': ['content_details'],
        },
      );
      return { ...module, items };
    } catch (error) {
      recordError(summary, `module-items:${course.id}:${module.id}`, error);
      return {
        ...module,
        backup_error: serializeError(error),
      };
    }
  });

  await writeJson(join(courseDir, 'metadata', 'modules.full.json'), hydratedModules);

  return {
    count: hydratedModules.length,
    itemCount: hydratedModules.reduce((count, module) => count + (module.items?.length ?? 0), 0),
    errors: hydratedModules.filter((module) => module.backup_error).length,
  };
}

async function backupAssignments(api, course, courseDir, summary) {
  const assignments = await backupListResource(api, course, courseDir, summary, {
    name: 'assignments',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/assignments`,
    params: {
      per_page: 100,
      'include[]': ['all_dates', 'overrides'],
      order_by: 'position',
    },
  });

  await Promise.all(assignments.map((assignment, index) => {
    const fileName = numberedHtmlFileName(index, assignment.name ?? `assignment-${assignment.id}`);
    return writeHtmlDocument(
      courseContentTargetPath(courseDir, 'assignments', fileName),
      assignment.name ?? fileName,
      assignment.description ?? '',
      assignment,
    );
  }));

  return { count: assignments.length };
}

async function backupDiscussions(api, course, courseDir, summary) {
  const discussions = await backupListResource(api, course, courseDir, summary, {
    name: 'discussion-topics',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/discussion_topics`,
    params: {
      per_page: 100,
      only_announcements: false,
    },
  });

  await Promise.all(discussions.map((discussion, index) => {
    const fileName = numberedHtmlFileName(index, discussion.title ?? `discussion-${discussion.id}`);
    return writeHtmlDocument(
      courseContentTargetPath(courseDir, 'discussions', fileName),
      discussion.title ?? fileName,
      discussion.message ?? '',
      discussion,
    );
  }));

  return { count: discussions.length };
}

async function backupAnnouncements(api, course, courseDir, summary) {
  const announcements = await backupListResource(api, course, courseDir, summary, {
    name: 'announcements',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/discussion_topics`,
    params: {
      per_page: 100,
      only_announcements: true,
    },
  });

  await Promise.all(announcements.map((announcement, index) => {
    const fileName = numberedHtmlFileName(index, announcement.title ?? `announcement-${announcement.id}`);
    return writeHtmlDocument(
      courseContentTargetPath(courseDir, 'announcements', fileName),
      announcement.title ?? fileName,
      announcement.message ?? '',
      announcement,
    );
  }));

  return { count: announcements.length };
}

async function backupQuizzes(api, course, courseDir, summary) {
  const quizzes = await backupListResource(api, course, courseDir, summary, {
    name: 'quizzes',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/quizzes`,
    params: { per_page: 100 },
  });

  const questionSummaries = await mapLimit(quizzes, 3, async (quiz) => {
    try {
      const questions = await api.listPaginated(
        `/api/v1/courses/${encodeURIComponent(course.id)}/quizzes/${encodeURIComponent(quiz.id)}/questions`,
        { per_page: 100 },
      );
      await writeJson(
        pathWithSafeFileName(join(courseDir, 'quizzes', 'questions'), `${sanitizeSegment(String(quiz.id))}.json`),
        questions,
      );
      return { quizId: quiz.id, count: questions.length };
    } catch (error) {
      recordError(summary, `quiz-questions:${course.id}:${quiz.id}`, error);
      return {
        quizId: quiz.id,
        count: 0,
        error: serializeError(error),
      };
    }
  });

  await writeJson(join(courseDir, 'metadata', 'quiz-question-downloads.json'), questionSummaries);
  await Promise.all(quizzes.map((quiz, index) => {
    const fileName = numberedHtmlFileName(index, quiz.title ?? `quiz-${quiz.id}`);
    return writeHtmlDocument(
      courseContentTargetPath(courseDir, 'quizzes', fileName),
      quiz.title ?? fileName,
      quiz.description ?? '',
      quiz,
    );
  }));

  return {
    count: quizzes.length,
    questionCount: questionSummaries.reduce((count, quiz) => count + quiz.count, 0),
    errors: questionSummaries.filter((quiz) => quiz.error).length,
  };
}

async function backupAssignmentGroups(api, course, courseDir, summary) {
  const assignmentGroups = await backupListResource(api, course, courseDir, summary, {
    name: 'assignment-groups',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/assignment_groups`,
    params: {
      per_page: 100,
      'include[]': ['assignments'],
    },
  });

  return { count: assignmentGroups.length };
}

async function backupCourseAdjacentMetadata(api, course, courseDir, summary) {
  const rubrics = await backupListResource(api, course, courseDir, summary, {
    name: 'rubrics',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/rubrics`,
    params: { per_page: 100 },
  });

  const externalTools = await backupListResource(api, course, courseDir, summary, {
    name: 'external-tools',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/external_tools`,
    params: {
      per_page: 100,
      include_parents: true,
    },
  });

  const calendarEvents = await backupListResource(api, course, courseDir, summary, {
    name: 'calendar-events',
    path: '/api/v1/calendar_events',
    params: {
      per_page: 100,
      all_events: true,
      'context_codes[]': [`course_${course.id}`],
      'include[]': ['series_natural_language'],
    },
  });

  const groupCategories = await backupListResource(api, course, courseDir, summary, {
    name: 'group-categories',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/group_categories`,
    params: {
      per_page: 100,
      collaboration_state: 'all',
    },
  });

  const groups = await backupListResource(api, course, courseDir, summary, {
    name: 'groups',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/groups`,
    params: {
      per_page: 100,
      collaboration_state: 'all',
      'include[]': ['tabs'],
    },
  });

  const outcomeGroups = await backupListResource(api, course, courseDir, summary, {
    name: 'outcome-groups',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/outcome_groups`,
    params: { per_page: 100 },
  });

  const outcomeLinks = await backupListResource(api, course, courseDir, summary, {
    name: 'outcome-group-links',
    path: `/api/v1/courses/${encodeURIComponent(course.id)}/outcome_group_links`,
    params: { per_page: 100 },
  });

  return {
    rubricCount: rubrics.length,
    externalToolCount: externalTools.length,
    calendarEventCount: calendarEvents.length,
    groupCategoryCount: groupCategories.length,
    groupCount: groups.length,
    outcomeGroupCount: outcomeGroups.length,
    outcomeLinkCount: outcomeLinks.length,
  };
}

async function createContentExports(api, course, courseDir, options, summary) {
  await mkdir(join(courseDir, 'exports'), { recursive: true });

  return mapLimit(options.exportTypes, 1, async (type) => {
    try {
      const body = new URLSearchParams({
        export_type: type,
        skip_notifications: 'true',
      });
      const contentExport = await api.request(
        `/api/v1/courses/${encodeURIComponent(course.id)}/content_exports`,
        {
          method: 'POST',
          body,
        },
      );
      await writeJson(join(courseDir, 'exports', `${type}.created.json`), contentExport);
      return { type, export: contentExport };
    } catch (error) {
      recordError(summary, `content-export-create:${course.id}:${type}`, error);
      return { type, error: serializeError(error) };
    }
  });
}

async function waitForContentExports(api, course, courseDir, exportJobs, options, summary) {
  const validJobs = exportJobs.filter((job) => job.export?.id && !job.error);
  const failedJobs = exportJobs
    .filter((job) => job.error)
    .map((job) => ({ type: job.type, status: 'error', error: job.error }));

  const completedJobs = await mapLimit(validJobs, 1, async (job) => {
    try {
      return await waitForContentExport(api, course, courseDir, job, options);
    } catch (error) {
      recordError(summary, `content-export-wait:${course.id}:${job.type}`, error);
      return {
        type: job.type,
        id: job.export.id,
        status: 'error',
        error: serializeError(error),
      };
    }
  });

  return [...failedJobs, ...completedJobs];
}

async function waitForContentExport(api, course, courseDir, job, options) {
  const deadline = Date.now() + (options.exportTimeoutMinutes * 60 * 1000);
  const progressUrl = job.export.progress_url;

  while (Date.now() < deadline) {
    const progress = progressUrl
      ? await api.request(progressUrl)
      : { workflow_state: job.export.workflow_state, completion: 0 };

    await writeJson(join(courseDir, 'exports', `${job.type}.progress.json`), progress);

    if (progress.workflow_state === 'failed') {
      throw new Error(`Canvas export ${job.export.id} (${job.type}) failed: ${progress.message ?? 'no message'}`);
    }

    if (progress.workflow_state === 'completed' || Number(progress.completion) >= 100) {
      const finalExport = await api.request(
        `/api/v1/courses/${encodeURIComponent(course.id)}/content_exports/${encodeURIComponent(job.export.id)}`,
      );
      await writeJson(join(courseDir, 'exports', `${job.type}.json`), finalExport);

      if (finalExport.workflow_state === 'failed') {
        throw new Error(`Canvas export ${job.export.id} (${job.type}) failed`);
      }

      if (finalExport.attachment?.url) {
        const extension = exportExtension(job.type);
        const targetPath = join(courseDir, 'exports', `${course.id}-${job.type}.${extension}`);
        const download = await api.download(finalExport.attachment.url, targetPath);

        return {
          type: job.type,
          id: finalExport.id,
          status: download.status,
          workflowState: finalExport.workflow_state,
          path: relative(courseDir, download.path),
        };
      }

      if (finalExport.workflow_state === 'exported') {
        throw new Error(`Canvas export ${job.export.id} (${job.type}) finished without an attachment URL`);
      }
    }

    await sleep(options.exportPollSeconds);
  }

  throw new Error(`Timed out waiting for Canvas export ${job.export.id} (${job.type})`);
}

function exportExtension(type) {
  if (type === 'common_cartridge') {
    return 'imscc';
  }

  if (type === 'qti' || type === 'zip') {
    return 'zip';
  }

  return 'bin';
}

function shouldRunDirect(options) {
  return options.mode === 'direct' || options.mode === 'both';
}

function shouldRunExports(options) {
  return options.mode === 'exports' || options.mode === 'both';
}

function hasEnrollmentType(user, enrollmentType) {
  return Array.isArray(user.enrollments)
    && user.enrollments.some((enrollment) => enrollment.type === enrollmentType);
}

function enrollmentUserIdsByType(enrollments, enrollmentType) {
  return new Set(enrollments
    .filter((enrollment) => enrollment.type === enrollmentType)
    .map((enrollment) => enrollment.user_id ?? enrollment.user?.id)
    .filter((userId) => userId !== undefined && userId !== null)
    .map(String));
}

export {
  backupCourse,
  backupCourseAdjacentMetadata,
  backupFiles,
  backupStaffRoles,
  backupModules,
  fileDownloadSizeLimit,
  isCompletedCourseStatus,
  readPriorCourseBackupStatus,
  staffEnrollmentStates,
  summarizeFileSizes,
};
