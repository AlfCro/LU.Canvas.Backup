import { createWriteStream } from 'node:fs';
import {
  mkdir,
  rename,
  unlink,
} from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  appendParams,
  fileExistsWithSize,
  getNextLink,
  isAbsoluteUrl,
  normalizeBaseUrl,
  parseRetryAfter,
  retryDelaySeconds,
  shouldSendCanvasAuthorization,
  sleep,
} from './utilities.mjs';

const JSON_ACCEPT_HEADER = 'application/json+canvas-string-ids';
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

class CanvasHttpError extends Error {
  constructor(message, { status, url, body }) {
    super(message);
    this.name = 'CanvasHttpError';
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

class CanvasNetworkError extends Error {
  constructor(message, { url, cause }) {
    super(message);
    this.name = 'CanvasNetworkError';
    this.url = url;
    this.causeMessage = cause?.message ?? String(cause);
  }
}

class CanvasApi {
  constructor({ baseUrl, token, maxRetries, sleepFn = sleep }) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token;
    this.maxRetries = maxRetries;
    this.sleep = sleepFn;
  }

  async request(pathOrUrl, options = {}) {
    const response = await this.fetchRaw(pathOrUrl, {
      ...options,
      headers: {
        Accept: JSON_ACCEPT_HEADER,
        ...(options.headers ?? {}),
      },
    });
    const text = await response.text();

    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      throw new CanvasHttpError(`Canvas returned non-JSON from ${response.url}`, {
        status: response.status,
        url: response.url,
        body: text.slice(0, 1000),
      });
    }
  }

  async listPaginated(pathOrUrl, params = {}) {
    const items = [];
    let nextUrl = pathOrUrl;
    let nextParams = params;

    while (nextUrl) {
      const response = await this.fetchRaw(nextUrl, {
        headers: { Accept: JSON_ACCEPT_HEADER },
        params: nextParams,
      });
      const page = await response.json();

      if (!Array.isArray(page)) {
        throw new CanvasHttpError(`Expected a paginated array from ${response.url}`, {
          status: response.status,
          url: response.url,
          body: JSON.stringify(page).slice(0, 1000),
        });
      }

      items.push(...page);
      nextUrl = getNextLink(response.headers.get('link'));
      nextParams = {};
    }

    return items;
  }

  async download(pathOrUrl, targetPath, expectedSize) {
    await mkdir(dirname(targetPath), { recursive: true });

    if (await fileExistsWithSize(targetPath, expectedSize)) {
      return { status: 'skipped', path: targetPath };
    }

    const partialPath = `${targetPath}.partial`;
    const response = await this.fetchRaw(pathOrUrl, {
      headers: { Accept: '*/*' },
    });

    if (!response.body) {
      throw new CanvasHttpError(`Canvas returned an empty download body from ${response.url}`, {
        status: response.status,
        url: response.url,
        body: '',
      });
    }

    try {
      await pipeline(Readable.fromWeb(response.body), createWriteStream(partialPath));
      await rename(partialPath, targetPath);
    } catch (error) {
      await unlink(partialPath).catch(() => {});
      throw error;
    }

    return { status: 'downloaded', path: targetPath };
  }

  async fetchRaw(pathOrUrl, options = {}) {
    const method = options.method ?? 'GET';
    const url = this.buildUrl(pathOrUrl, options.params ?? {});
    const headers = {
      ...(options.headers ?? {}),
    };
    const body = options.body;

    if (shouldSendCanvasAuthorization(url, this.baseUrl)) {
      headers.Authorization ??= `Bearer ${this.token}`;
    }

    if (body instanceof URLSearchParams && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let response;

      try {
        response = await fetch(url, {
          method,
          headers,
          body,
          redirect: 'follow',
        });
      } catch (error) {
        if (attempt === this.maxRetries) {
          throw new CanvasNetworkError(
            `Canvas ${method} ${url} failed before an HTTP response: ${error?.message ?? String(error)}`,
            { url, cause: error },
          );
        }

        await this.sleep(retryDelaySeconds(attempt));
        continue;
      }

      if (response.ok) {
        return response;
      }

      const retryAfterSeconds = parseRetryAfter(response.headers.get('retry-after'));
      const responseBody = await response.text().catch(() => '');

      if (!RETRYABLE_STATUSES.has(response.status) || attempt === this.maxRetries) {
        throw new CanvasHttpError(
          `Canvas ${method} ${url} failed with HTTP ${response.status}`,
          {
            status: response.status,
            url,
            body: responseBody.slice(0, 2000),
          },
        );
      }

      await this.sleep(retryAfterSeconds ?? retryDelaySeconds(attempt));
    }

    throw new Error(`Unexpected retry loop exit for ${method} ${url}`);
  }

  buildUrl(pathOrUrl, params = {}) {
    const url = isAbsoluteUrl(pathOrUrl)
      ? new URL(pathOrUrl)
      : new URL(pathOrUrl, this.baseUrl);
    appendParams(url.searchParams, params);
    return url.toString();
  }
}

export {
  CanvasApi,
  CanvasHttpError,
  CanvasNetworkError,
};
