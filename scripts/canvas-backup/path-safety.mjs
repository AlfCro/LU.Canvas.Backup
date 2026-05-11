import { join } from 'node:path';

const MAX_NESTED_FILE_PATH_LENGTH = 230;
const MAX_OUTPUT_FOLDER_SEGMENT_LENGTH = 80;
const MAX_SAFE_PATH_SEGMENT_LENGTH = 120;
const MAX_PRESERVED_EXTENSION_LENGTH = 16;
const PRESERVED_FILE_EXTENSION_PATTERN = new RegExp(
  `\\.[A-Za-z0-9][A-Za-z0-9_-]{0,${MAX_PRESERVED_EXTENSION_LENGTH - 1}}$`,
);
const RESERVED_WINDOWS_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
]);

function fileTargetPath(courseDir, foldersById, file) {
  const folder = foldersById.get(String(file.folder_id));
  const folderSegments = folderPathSegments(folder);
  const fileName = `${file.id}-${sanitizeFileNameSegment(file.display_name ?? file.filename ?? `file-${file.id}`)}`;
  const nestedPath = join(courseDir, 'files', ...folderSegments, fileName);

  if (nestedPath.length <= MAX_NESTED_FILE_PATH_LENGTH) {
    return nestedPath;
  }

  return pathWithSafeFileName(join(courseDir, 'files', '_flat'), fileName);
}

function folderPathSegments(folder) {
  if (!folder) {
    return ['_unknown_folder'];
  }

  const fullName = folder.full_name ?? folder.context_name ?? folder.name ?? `folder-${folder.id}`;
  return String(fullName)
    .split('/')
    .map(sanitizeSegment)
    .filter(Boolean);
}

function courseFolderName(course) {
  const label = course.sis_course_id
    ?? course.course_code
    ?? course.name
    ?? `course-${course.id}`;
  return prefixedSegment(String(course.id), String(label), MAX_OUTPUT_FOLDER_SEGMENT_LENGTH, '_');
}

function subaccountFolderName(subaccountEntry) {
  if (!subaccountEntry?.id) {
    return 'unknown-subaccount';
  }

  const label = subaccountEntry.name
    ?? subaccountEntry.account?.name
    ?? `account-${subaccountEntry.id}`;
  return prefixedSegment(String(subaccountEntry.id), String(label), MAX_OUTPUT_FOLDER_SEGMENT_LENGTH);
}

function numberedHtmlFileName(index, label) {
  const prefix = `${String(index + 1).padStart(3, '0')}-`;
  const extension = '.html';
  const labelMaxLength = MAX_SAFE_PATH_SEGMENT_LENGTH - prefix.length - extension.length;
  return `${prefix}${sanitizeSegment(label, labelMaxLength)}${extension}`;
}

function courseContentTargetPath(courseDir, folderName, fileName) {
  return pathWithSafeFileName(join(courseDir, folderName), fileName);
}

function pathWithSafeFileName(parentDir, fileName) {
  const targetPath = join(parentDir, fileName);

  if (targetPath.length <= MAX_NESTED_FILE_PATH_LENGTH) {
    return targetPath;
  }

  const maxFileNameLength = Math.max(1, MAX_NESTED_FILE_PATH_LENGTH - parentDir.length - 1);
  return join(parentDir, shortenPathSegment(fileName, maxFileNameLength));
}

function prefixedSegment(prefix, label, maxLength, separator = '-') {
  const safePrefix = sanitizeSegment(prefix, maxLength);
  const separatorLength = separator.length;
  const labelMaxLength = Math.max(1, maxLength - safePrefix.length - separatorLength);
  return `${safePrefix}${separator}${sanitizeSegment(label, labelMaxLength)}`;
}

function sanitizeSegment(value, maxLength = MAX_SAFE_PATH_SEGMENT_LENGTH) {
  const normalized = normalizePathSegment(value);
  const clipped = clipPathSegment(normalized, maxLength);
  return validWindowsPathSegment(clipped);
}

function sanitizeFileNameSegment(value) {
  const normalized = normalizePathSegment(value);
  const clipped = clipFileNameSegment(normalized);
  return validWindowsPathSegment(clipped);
}

function validWindowsPathSegment(value) {
  const fallback = value || 'untitled';
  const lower = fallback.toLowerCase();
  return RESERVED_WINDOWS_NAMES.has(lower) ? `_${fallback}` : fallback;
}

function normalizePathSegment(value) {
  return String(value)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
}

function clipPathSegment(value, maxLength = MAX_SAFE_PATH_SEGMENT_LENGTH) {
  return value
    .slice(0, maxLength)
    .replace(/[. ]+$/g, '');
}

function clipFileNameSegment(value) {
  if (value.length <= MAX_SAFE_PATH_SEGMENT_LENGTH) {
    return value;
  }

  const extension = preservedExtension(value);
  if (!extension) {
    return clipPathSegment(value);
  }

  const stemLength = MAX_SAFE_PATH_SEGMENT_LENGTH - extension.length;
  const stem = value
    .slice(0, stemLength)
    .replace(/[. ]+$/g, '');

  return `${stem || 'untitled'}${extension}`;
}

function preservedExtension(value) {
  const match = value.match(PRESERVED_FILE_EXTENSION_PATTERN);
  return match?.[0] ?? null;
}

function shortenPathSegment(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }

  const extension = preservedExtension(value);
  if (extension && extension.length < maxLength) {
    const stemLength = Math.max(1, maxLength - extension.length);
    const stem = value
      .slice(0, stemLength)
      .replace(/[. ]+$/g, '');

    return validWindowsPathSegment(`${stem || 'untitled'}${extension}`);
  }

  return validWindowsPathSegment(
    value
      .slice(0, maxLength)
      .replace(/[. ]+$/g, '') || 'untitled',
  );
}

export {
  courseContentTargetPath,
  courseFolderName,
  fileTargetPath,
  numberedHtmlFileName,
  pathWithSafeFileName,
  sanitizeFileNameSegment,
  sanitizeSegment,
  subaccountFolderName,
};
