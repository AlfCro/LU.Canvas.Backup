import {
  mkdir,
  writeFile,
} from 'node:fs/promises';
import {
  dirname,
  join,
} from 'node:path';
import {
  escapeHtml,
  uniqueStrings,
} from './utilities.mjs';

async function writeSyllabus(courseDir, course) {
  if (!course.syllabus_body) {
    return;
  }

  await writeHtmlDocument(
    join(courseDir, 'syllabus.html'),
    `${course.name ?? course.course_code ?? course.id} syllabus`,
    course.syllabus_body,
    course,
  );
}

async function writeHtmlDocument(targetPath, title, body, metadata) {
  const metadataJson = escapeHtml(JSON.stringify(metadata, null, 2));
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    ${body || ''}
  </main>
  <details>
    <summary>Canvas metadata</summary>
    <pre>${metadataJson}</pre>
  </details>
</body>
</html>
`;
  await writeText(targetPath, html);
}

async function writeJson(targetPath, data) {
  await writeText(targetPath, `${JSON.stringify(data, null, 2)}\n`);
}

async function writeText(targetPath, content) {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, content, 'utf8');
}

function recordError(summary, scope, error) {
  summary.errors.push({
    at: new Date().toISOString(),
    scope,
    ...serializeError(error),
  });
}

function buildRetryList(manifest) {
  const courses = Array.isArray(manifest.courses) ? manifest.courses : [];
  const retryCourseIds = uniqueStrings(courses
    .filter((course) => course.status === 'failed' || (course.errors?.length ?? 0) > 0)
    .map((course) => course.courseId)
    .filter((courseId) => courseId !== undefined && courseId !== null));
  const courseFailures = courses
    .filter((course) => course.status === 'failed' || (course.errors?.length ?? 0) > 0)
    .map((course) => ({
      courseId: course.courseId ?? null,
      courseName: course.courseName ?? null,
      status: course.status ?? null,
      errorCount: course.errors?.length ?? 0,
    }));
  const endpointFailures = courses.flatMap((course) => (
    Array.isArray(course.errors)
      ? course.errors.map((error) => ({
        courseId: course.courseId ?? null,
        courseName: course.courseName ?? null,
        ...retryFailureRecord(error),
      }))
      : []
  ));
  const topLevelFailures = Array.isArray(manifest.errors)
    ? manifest.errors.map(retryFailureRecord)
    : [];

  return {
    generatedAt: new Date().toISOString(),
    retryCourseIds,
    retryCourseIdsArgument: retryCourseIds.join(','),
    courseFailures,
    endpointFailures,
    topLevelFailures,
  };
}

function retryFailureRecord(error) {
  return {
    scope: error?.scope ?? null,
    name: error?.name ?? null,
    message: error?.message ?? null,
    status: error?.status ?? null,
    url: error?.url ?? null,
    cause: error?.cause ?? null,
  };
}

function serializeError(error) {
  return {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    status: error?.status ?? null,
    url: error?.url ?? null,
    cause: error?.causeMessage ?? error?.cause?.message ?? null,
    body: redactErrorBody(error?.body),
  };
}

function redactErrorBody(body) {
  if (body === undefined || body === null) {
    return null;
  }

  return String(body)
    .replace(/\bBearer\s+[-._~+/=A-Za-z0-9]+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:access_token|token|session_id)=)[^&#\s"']+/gi, '$1[redacted]')
    .replace(/("(?:access_token|authenticity_token|session_id|token)"\s*:\s*")[^"]*(")/gi, '$1[redacted]$2');
}

function backupErrorOutputPath(outputPath) {
  return outputPath.endsWith('.json')
    ? `${outputPath.slice(0, -5)}.error.json`
    : `${outputPath}.error.json`;
}

export {
  backupErrorOutputPath,
  buildRetryList,
  recordError,
  redactErrorBody,
  serializeError,
  writeHtmlDocument,
  writeJson,
  writeSyllabus,
};
