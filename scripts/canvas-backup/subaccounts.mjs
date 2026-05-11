import { join } from 'node:path';
import {
  serializeError,
  writeJson,
} from './output-files.mjs';
import {
  courseFolderName,
  subaccountFolderName,
} from './path-safety.mjs';
import {
  mapLimit,
  uniqueStrings,
} from './utilities.mjs';

async function fetchSubaccountMetadata(api, selectedCourses, options) {
  const errors = [];
  const entriesById = new Map();

  function recordErrorForScope(scope, error) {
    errors.push({
      at: new Date().toISOString(),
      scope,
      ...serializeError(error),
    });
  }

  function addCanvasAccount(account, source) {
    if (!account?.id) {
      return;
    }

    const id = normalizeAccountId(account.id);
    const existing = entriesById.get(id);
    const accountValue = {
      ...(existing?.account ?? {}),
      ...account,
    };

    entriesById.set(id, {
      id,
      name: accountValue.name ?? existing?.name ?? null,
      parentAccountId: normalizeAccountId(accountValue.parent_account_id ?? existing?.parentAccountId),
      rootAccountId: normalizeAccountId(accountValue.root_account_id ?? existing?.rootAccountId),
      workflowState: accountValue.workflow_state ?? existing?.workflowState ?? null,
      metadataStatus: 'fetched',
      metadataSources: uniqueStrings([...(existing?.metadataSources ?? []), source]),
      account: accountValue,
    });
  }

  if (options.accountId) {
    try {
      const account = await api.request(`/api/v1/accounts/${encodeURIComponent(options.accountId)}`);
      addCanvasAccount(account, 'scope-account');
    } catch (error) {
      recordErrorForScope(`account:${options.accountId}`, error);
    }

    try {
      const subaccounts = await api.listPaginated(
        `/api/v1/accounts/${encodeURIComponent(options.accountId)}/sub_accounts`,
        {
          per_page: 100,
          recursive: true,
          'include[]': ['course_count', 'sub_account_count'],
        },
      );

      for (const subaccount of subaccounts) {
        addCanvasAccount(subaccount, 'recursive-subaccount-list');
      }
    } catch (error) {
      recordErrorForScope(`subaccounts:${options.accountId}`, error);
    }
  }

  const selectedAccountIds = uniqueStrings(selectedCourses
    .map(courseAccountId)
    .filter(Boolean));
  const missingAccountIds = selectedAccountIds.filter((accountId) => !entriesById.has(accountId));
  const fetchedMissingAccounts = await mapLimit(missingAccountIds, options.concurrency, async (accountId) => {
    try {
      return {
        accountId,
        account: await api.request(`/api/v1/accounts/${encodeURIComponent(accountId)}`),
      };
    } catch (error) {
      recordErrorForScope(`account:${accountId}`, error);
      return { accountId, account: null };
    }
  });

  for (const { accountId, account } of fetchedMissingAccounts) {
    if (account) {
      addCanvasAccount(account, 'selected-course-account');
      continue;
    }

    const fallbackCourse = selectedCourses.find((course) => courseAccountId(course) === accountId);
    entriesById.set(accountId, fallbackSubaccountEntry(fallbackCourse, accountId));
  }

  for (const course of selectedCourses) {
    const accountId = courseAccountId(course);
    if (accountId && !entriesById.has(accountId)) {
      entriesById.set(accountId, fallbackSubaccountEntry(course, accountId));
    }
  }

  const unknownEntry = selectedCourses.some((course) => !courseAccountId(course))
    ? unknownSubaccountEntry()
    : null;
  const entries = [...entriesById.values()].sort(compareSubaccountEntries);

  if (unknownEntry) {
    entries.push(unknownEntry);
  }

  const selectedSummary = buildSelectedSubaccountSummary(selectedCourses, {
    byId: entriesById,
    unknown: unknownEntry,
  });

  for (const entry of entries) {
    const selectedSubaccount = selectedSummary.selectedSubaccounts
      .find((subaccount) => subaccount.accountId === entry.id);
    entry.selectedCourseCount = selectedSubaccount?.courseCount ?? 0;
  }

  return {
    generatedAt: new Date().toISOString(),
    scopeAccountId: options.accountId ?? null,
    byId: entriesById,
    unknown: unknownEntry,
    entries,
    errors,
    summary: {
      generatedAt: new Date().toISOString(),
      scopeAccountId: options.accountId ?? null,
      fetchedSubaccountCount: entries.filter((entry) => entry.metadataStatus === 'fetched').length,
      selectedSubaccountCount: selectedSummary.selectedSubaccountCount,
      unknownCourseAccountCount: selectedCourses.filter((course) => !courseAccountId(course)).length,
      errorCount: errors.length,
    },
  };
}

async function writeSubaccountMetadata(outputDir, subaccountIndex) {
  const output = {
    generatedAt: subaccountIndex.generatedAt,
    scopeAccountId: subaccountIndex.scopeAccountId,
    subaccounts: subaccountIndex.entries,
    errors: subaccountIndex.errors,
  };

  await writeJson(join(outputDir, 'subaccounts.json'), output);

  await mapLimit(subaccountIndex.entries, 4, async (entry) => {
    await writeJson(join(subaccountOutputDir(outputDir, entry), 'subaccount.json'), entry);
  });
}

function buildSelectedSubaccountSummary(courses, subaccountIndex) {
  const groups = new Map();

  for (const course of courses) {
    const entry = subaccountEntryForCourse(course, subaccountIndex);
    const key = entry.id ?? 'unknown';

    if (!groups.has(key)) {
      groups.set(key, {
        accountId: entry.id,
        accountName: entry.name,
        folderName: subaccountFolderName(entry),
        courseCount: 0,
        courseIds: [],
      });
    }

    const group = groups.get(key);
    group.courseCount += 1;
    group.courseIds.push(String(course.id));
  }

  return {
    selectedSubaccountCount: groups.size,
    selectedSubaccounts: [...groups.values()].sort((left, right) => (
      String(left.accountName ?? left.accountId ?? '').localeCompare(
        String(right.accountName ?? right.accountId ?? ''),
        'sv-SE',
      )
    )),
  };
}

function updateSubaccountSelection(subaccountIndex, selectedCourses) {
  const selectedSummary = buildSelectedSubaccountSummary(selectedCourses, subaccountIndex);

  for (const entry of subaccountIndex.entries) {
    const selectedSubaccount = selectedSummary.selectedSubaccounts
      .find((subaccount) => subaccount.accountId === entry.id);
    entry.selectedCourseCount = selectedSubaccount?.courseCount ?? 0;
  }

  subaccountIndex.summary = {
    ...subaccountIndex.summary,
    selectedSubaccountCount: selectedSummary.selectedSubaccountCount,
    unknownCourseAccountCount: selectedCourses.filter((course) => !courseAccountId(course)).length,
  };

  return subaccountIndex;
}

function subaccountEntryForCourse(course, subaccountIndex) {
  const accountId = courseAccountId(course);

  if (accountId && subaccountIndex.byId.has(accountId)) {
    return subaccountIndex.byId.get(accountId);
  }

  if (accountId) {
    return fallbackSubaccountEntry(course, accountId);
  }

  return subaccountIndex.unknown ?? unknownSubaccountEntry();
}

function fallbackSubaccountEntry(course, accountId) {
  return {
    id: normalizeAccountId(accountId),
    name: course?.account_name ?? `Account ${accountId}`,
    parentAccountId: null,
    rootAccountId: null,
    workflowState: null,
    metadataStatus: 'course-fallback',
    metadataSources: ['course-account-fields'],
    account: null,
    selectedCourseCount: 0,
  };
}

function unknownSubaccountEntry() {
  return {
    id: null,
    name: 'Unknown subaccount',
    parentAccountId: null,
    rootAccountId: null,
    workflowState: null,
    metadataStatus: 'missing-course-account',
    metadataSources: [],
    account: null,
    selectedCourseCount: 0,
  };
}

function compareSubaccountEntries(left, right) {
  return String(left.name ?? left.id ?? '').localeCompare(
    String(right.name ?? right.id ?? ''),
    'sv-SE',
  );
}

function courseAccountId(course) {
  return normalizeAccountId(course?.account_id ?? course?.accountId);
}

function normalizeAccountId(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return String(value);
}

function subaccountOutputDir(outputDir, subaccountEntry) {
  return join(outputDir, 'subaccounts', subaccountFolderName(subaccountEntry));
}

function courseOutputDir(outputDir, course, subaccountIndex) {
  return join(
    subaccountOutputDir(outputDir, subaccountEntryForCourse(course, subaccountIndex)),
    'courses',
    courseFolderName(course),
  );
}

export {
  buildSelectedSubaccountSummary,
  courseOutputDir,
  fetchSubaccountMetadata,
  subaccountEntryForCourse,
  subaccountOutputDir,
  updateSubaccountSelection,
  writeSubaccountMetadata,
};
