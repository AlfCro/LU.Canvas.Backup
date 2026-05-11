import {
  readFile,
  stat,
} from 'node:fs/promises';

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

async function fileExistsWithSize(path, expectedSize) {
  try {
    const existing = await stat(path);

    if (!existing.isFile()) {
      return false;
    }

    if (expectedSize === undefined || expectedSize === null) {
      return existing.size > 0;
    }

    return existing.size === Number(expectedSize);
  } catch {
    return false;
  }
}

function appendParams(searchParams, params) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, item);
      }
      continue;
    }

    searchParams.set(key, value);
  }
}

function getNextLink(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  const links = linkHeader.split(',');
  for (const link of links) {
    const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match && match[2] === 'next') {
      return match[1];
    }
  }

  return null;
}

function parseRetryAfter(value) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return seconds;
  }

  const dateMs = Date.parse(value);
  if (!Number.isFinite(dateMs)) {
    return null;
  }

  return Math.max(1, Math.ceil((dateMs - Date.now()) / 1000));
}

function retryDelaySeconds(attempt) {
  return Math.min(60, 2 ** attempt);
}

function sleep(seconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, seconds * 1000);
  });
}

function readInteger(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got "${value}"`);
  }

  return parsed;
}

function readDate(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const text = String(value).trim();
  const normalizedText = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T00:00:00Z`
    : text;
  const parsed = Date.parse(normalizedText);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected an ISO date or timestamp, got "${value}"`);
  }

  return new Date(parsed).toISOString();
}

function readBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Expected a boolean value, got "${value}"`);
}

function readString(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const text = String(value).trim();
  return text || fallback;
}

function readList(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => readList(item, []));
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values) {
  return [...new Set(values.map(String))];
}

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument "${token}". Use --help for usage.`);
    }

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const key = toCamelCase(rawKey);

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function normalizeSearchText(value) {
  return String(value).normalize('NFKC').toLocaleLowerCase('sv-SE');
}

async function loadDotEnv(path) {
  let content;

  try {
    content = await readFile(path, 'utf8');
  } catch {
    return;
  }

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function normalizeBaseUrl(value) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, '');
}

function isAbsoluteUrl(value) {
  return /^https?:\/\//i.test(value);
}

function shouldSendCanvasAuthorization(url, baseUrl) {
  return new URL(url, normalizeBaseUrl(baseUrl)).origin === new URL(normalizeBaseUrl(baseUrl)).origin;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export {
  appendParams,
  escapeHtml,
  fileExistsWithSize,
  getNextLink,
  isAbsoluteUrl,
  loadDotEnv,
  mapLimit,
  normalizeBaseUrl,
  normalizeSearchText,
  parseArgs,
  parseRetryAfter,
  readBoolean,
  readDate,
  readInteger,
  readList,
  readString,
  retryDelaySeconds,
  shouldSendCanvasAuthorization,
  sleep,
  uniqueStrings,
};
