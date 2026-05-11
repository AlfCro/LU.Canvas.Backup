import { serializeError } from './output-files.mjs';
import {
  mapLimit,
  normalizeSearchText,
} from './utilities.mjs';

function selectCoursesForBackup(courses, options, subaccountIndex = null) {
  const explicitCourseIds = options.courseIds.length > 0;
  const decisions = courses.map((course) => ({
    course,
    reasons: explicitCourseIds ? [] : courseFilterReasons(course, options, subaccountIndex),
  }));
  const selectedBeforeLimit = decisions.filter((decision) => decision.reasons.length === 0);
  const selectedDecisions = options.maxCourses
    ? selectedBeforeLimit.slice(0, options.maxCourses)
    : selectedBeforeLimit;
  const excludedDecisions = decisions.filter((decision) => decision.reasons.length > 0);

  if (options.maxCourses && selectedBeforeLimit.length > options.maxCourses) {
    for (const decision of selectedBeforeLimit.slice(options.maxCourses)) {
      excludedDecisions.push({
        course: decision.course,
        reasons: [`max_courses_limit:${options.maxCourses}`],
      });
    }
  }

  return {
    courses: selectedDecisions.map((decision) => decision.course),
    summary: {
      discoveredCourseCount: courses.length,
      selectedCourseCount: selectedDecisions.length,
      excludedCourseCount: excludedDecisions.length,
      filters: courseFilterSummary(options),
      excludedReasonCounts: countExcludedReasons(excludedDecisions),
      excludedCourses: excludedDecisions.map((decision) => ({
        ...courseSelectionRecord(decision.course, subaccountIndex),
        reasons: decision.reasons,
      })),
    },
  };
}

function courseFilterReasons(course, options, subaccountIndex = null) {
  const reasons = [];
  const excludedNameTerm = matchingExcludedNameTerm(course, options.excludeCourseNameTerms);

  if (excludedNameTerm) {
    reasons.push(`name_contains:${excludedNameTerm}`);
  }

  const excludedSubaccountNameTerm = matchingExcludedSubaccountNameTerm(
    course,
    options.excludeSubaccountNameTerms,
    subaccountIndex,
  );

  if (excludedSubaccountNameTerm) {
    reasons.push(`subaccount_name_contains:${excludedSubaccountNameTerm}`);
  }

  const createdAtReason = createdAtFilterReason(course, options.createdAfter);
  if (createdAtReason) {
    reasons.push(createdAtReason);
  }

  const statusReason = courseStatusFilterReason(course, options.courseStates);
  if (statusReason) {
    reasons.push(statusReason);
  }

  const studentEnrollmentReason = studentEnrollmentFilterReason(
    course,
    options.excludeCoursesWithoutStudents,
  );
  if (studentEnrollmentReason) {
    reasons.push(studentEnrollmentReason);
  }

  return reasons;
}

function matchingExcludedNameTerm(course, excludedTerms = []) {
  if (!excludedTerms.length) {
    return null;
  }

  const nameTexts = [course.name, course.course_code]
    .filter(Boolean)
    .map(normalizeSearchText);

  return excludedTerms.find((term) => (
    nameTexts.some((nameText) => normalizedTextMatchesExcludedTerm(nameText, term))
  )) ?? null;
}

function normalizedTextMatchesExcludedTerm(nameText, term) {
  const normalizedTerm = normalizeSearchText(term);
  return matchesAtFieldEdge(nameText, normalizedTerm);
}

function matchesAtFieldEdge(nameText, term) {
  if (nameText.endsWith(term)) {
    return true;
  }

  if (!nameText.startsWith(term)) {
    return false;
  }

  const nextCharacter = nameText[term.length];
  return nextCharacter !== undefined && !/[a-z]/.test(nextCharacter);
}

function matchingExcludedSubaccountNameTerm(course, excludedTerms = [], subaccountIndex = null) {
  if (!excludedTerms.length) {
    return null;
  }

  const subaccountName = subaccountNameForCourse(course, subaccountIndex);
  if (!subaccountName) {
    return null;
  }

  const nameText = normalizeSearchText(subaccountName);

  return excludedTerms.find((term) => normalizedTextMatchesExcludedTerm(nameText, term)) ?? null;
}

function createdAtFilterReason(course, createdAfter) {
  if (!createdAfter) {
    return null;
  }

  if (!course.created_at) {
    return 'missing_created_at';
  }

  const createdAtMs = Date.parse(course.created_at);
  if (!Number.isFinite(createdAtMs)) {
    return `invalid_created_at:${course.created_at}`;
  }

  return createdAtMs >= Date.parse(createdAfter)
    ? null
    : `created_before:${createdAfter}`;
}

function courseStatusFilterReason(course, allowedStates) {
  const status = course.workflow_state ?? course.state;

  if (!status || !allowedStates.length) {
    return null;
  }

  const normalizedAllowedStates = new Set(allowedStates.map(normalizeSearchText));

  return normalizedAllowedStates.has(normalizeSearchText(status))
    ? null
    : `status:${status}`;
}

function studentEnrollmentFilterReason(course, excludeCoursesWithoutStudents) {
  if (!excludeCoursesWithoutStudents) {
    return null;
  }

  const totalStudents = totalStudentsForCourse(course);
  if (totalStudents === null) {
    return null;
  }

  return totalStudents <= 0 ? 'student_enrollments:0' : null;
}

function totalStudentsForCourse(course) {
  const value = course.total_students ?? course.totalStudents;

  if (value === undefined || value === null || value === '') {
    return null;
  }

  const totalStudents = Number(value);
  return Number.isFinite(totalStudents) ? totalStudents : null;
}

function courseSelectionRecord(course, subaccountIndex = null) {
  const accountName = subaccountNameForCourse(course, subaccountIndex);

  return {
    id: course.id ?? null,
    name: course.name ?? null,
    courseCode: course.course_code ?? null,
    sisCourseId: course.sis_course_id ?? null,
    accountId: course.account_id ?? null,
    accountName,
    workflowState: course.workflow_state ?? course.state ?? null,
    createdAt: course.created_at ?? null,
    totalStudents: totalStudentsForCourse(course),
  };
}

function courseFilterSummary(options) {
  return {
    explicitCourseIds: options.courseIds,
    explicitCourseIdsBypassDiscoveryFilters: options.courseIds.length > 0,
    courseStates: options.courseStates,
    createdAfter: options.createdAfter,
    excludedCourseNameTerms: options.excludeCourseNameTerms,
    excludedSubaccountNameTerms: options.excludeSubaccountNameTerms,
    excludeCoursesWithoutStudents: options.excludeCoursesWithoutStudents,
    maxCourses: options.maxCourses,
  };
}

function countExcludedReasons(excludedDecisions) {
  const counts = {};

  for (const decision of excludedDecisions) {
    for (const reason of decision.reasons) {
      counts[reason] = (counts[reason] ?? 0) + 1;
    }
  }

  return counts;
}

async function discoverCourses(api, options) {
  validateDiscoveryScope(options);

  if (options.courseIds.length) {
    return mapLimit(options.courseIds, options.concurrency, async (courseId) => {
      try {
        return await getCourseDetails(api, courseId);
      } catch (error) {
        return {
          id: courseId,
          name: `Course ${courseId}`,
          discovery_error: serializeError(error),
        };
      }
    });
  }

  const include = ['term', 'account_name', 'syllabus_body', 'concluded', 'total_students'];

  if (options.accountId) {
    return api.listPaginated(`/api/v1/accounts/${encodeURIComponent(options.accountId)}/courses`, {
      per_page: 100,
      'include[]': include,
      'state[]': options.courseStates,
      sort: 'sis_course_id',
      order: 'asc',
    });
  }

  return api.listPaginated('/api/v1/courses', {
    per_page: 100,
    'include[]': include,
    'state[]': options.courseStates,
  });
}

function validateDiscoveryScope(options) {
  if (options.courseIds.length || options.accountId || options.allowUserCourseDiscovery) {
    return;
  }

  throw new Error('Course discovery requires --account-id for admin-scoped backup runs. Use --course-ids for targeted backups, or pass --allow-user-course-discovery when the limited /api/v1/courses fallback is intentional.');
}

async function getCourseDetails(api, courseId) {
  return api.request(`/api/v1/courses/${encodeURIComponent(courseId)}`, {
    params: {
      'include[]': ['term', 'account_name', 'syllabus_body', 'concluded', 'total_students'],
    },
  });
}

function discoveredCourseHasIncludedDetails(course) {
  return Object.hasOwn(course, 'syllabus_body') && Object.hasOwn(course, 'term');
}

function subaccountNameForCourse(course, subaccountIndex = null) {
  const accountId = normalizeAccountId(course?.account_id ?? course?.accountId);
  const metadataName = accountId
    ? subaccountIndex?.byId?.get(accountId)?.name
    : subaccountIndex?.unknown?.name;

  return metadataName ?? course?.account_name ?? course?.accountName ?? null;
}

function normalizeAccountId(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value);
}

export {
  courseFilterReasons,
  courseFilterSummary,
  discoverCourses,
  discoveredCourseHasIncludedDetails,
  getCourseDetails,
  matchingExcludedNameTerm,
  matchingExcludedSubaccountNameTerm,
  selectCoursesForBackup,
  validateDiscoveryScope,
};
