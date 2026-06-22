import { tokenize } from './retrievalService.js';

export function answerStructuredQuestion(question, documents) {
  const rows = collectRows(documents);
  if (rows.length === 0) {
    return { handled: false };
  }

  const columns = getColumns(rows);
  const mentionedColumns = columns.filter((column) => columnMentioned(question, column));
  const filters = inferFilters(question, rows, columns);

  if (mentionedColumns.length === 0 && filters.length === 0) {
    return { handled: false };
  }

  const targetColumns = inferTargetColumns(question, columns, mentionedColumns, filters);
  if (targetColumns.length === 0) {
    return { handled: false };
  }

  const matchedRows = applyFilters(rows, filters);
  if (filters.length > 0 && matchedRows.length === 0) {
    return {
      handled: true,
      invalid: true,
      answer: `Invalid question: I could not find a row where ${describeFilters(filters)}.`,
    };
  }

  const rowsToUse = filters.length > 0 ? matchedRows : rows;
  const aggregate = answerAggregateQuestion(question, rowsToUse, targetColumns, filters);
  if (aggregate.handled) {
    return {
      handled: true,
      invalid: false,
      answer: aggregate.answer,
      sources: rowsToUse.slice(0, 6).map(rowToSource),
    };
  }

  const unique = answerUniqueValuesQuestion(question, rowsToUse, targetColumns, filters);
  if (unique.handled) {
    return {
      handled: true,
      invalid: false,
      answer: unique.answer,
      sources: rowsToUse.slice(0, 6).map(rowToSource),
    };
  }

  const answer = formatStructuredAnswer(question, rowsToUse, targetColumns, filters);

  return {
    handled: true,
    invalid: false,
    answer,
    sources: rowsToUse.slice(0, 6).map(rowToSource),
  };
}

function collectRows(documents) {
  return documents.flatMap((document) => {
    const numericRows = rowsFromNumericData(document);
    if (numericRows.length > 0) {
      return numericRows;
    }

    const metadataRows = rowsFromMetadata(document);
    if (metadataRows.length > 0) {
      return metadataRows;
    }

    return rowsFromContent(document);
  });
}

function rowsFromNumericData(document) {
  const numericData = parseJson(document.numeric_data);
  return (numericData.records || [])
    .filter((record) => record.raw && typeof record.raw === 'object')
    .map((record) => ({
      documentId: document.id,
      filename: document.filename,
      rowIndex: record.index,
      data: normalizeRecord(record.raw),
    }));
}

function rowsFromMetadata(document) {
  const metadata = parseJson(document.metadata);
  return (metadata.records || [])
    .filter((record) => record && typeof record === 'object')
    .map((record, index) => ({
      documentId: document.id,
      filename: document.filename,
      rowIndex: index + 1,
      data: normalizeRecord(record),
    }));
}

function rowsFromContent(document) {
  return String(document.content || '')
    .split('\n')
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^Row\s+(\d+):\s+(.+)$/i);
      if (!match) {
        return null;
      }

      return {
        documentId: document.id,
        filename: document.filename,
        rowIndex: Number(match[1]),
        data: parseRowPairs(match[2]),
      };
    })
    .filter((row) => row && Object.keys(row.data).length > 0);
}

function normalizeRecord(record) {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [normalizeColumn(key), normalizeValue(value)])
  );
}

function parseRowPairs(text) {
  const parts = String(text || '').split(/,\s+(?=[A-Za-z0-9_ -]+:)/);
  const record = {};

  for (const part of parts) {
    const match = part.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      record[normalizeColumn(match[1])] = normalizeValue(match[2]);
    }
  }

  return record;
}

function getColumns(rows) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row.data))));
}

function inferFilters(question, rows, columns) {
  const filters = [];
  const questionText = normalizeText(question);
  const exactNumericFilters = inferNumericFilters(questionText, columns);

  filters.push(...exactNumericFilters);
  filters.push(...inferCategoricalFilters(question, questionText, rows, columns, filters));

  return filters;
}

function inferNumericFilters(questionText, columns) {
  const filters = [];

  for (const column of columns) {
    const labels = columnLabels(column).map(escapeRegExp);
    const labelPattern = labels.join('|');
    const pattern = new RegExp(
      `(?:${labelPattern})\\s*(?:is|=|equals|equal to|of|at)?\\s*([-+]?\\d[\\d,]*(?:\\.\\d+)?)`,
      'i'
    );
    const match = questionText.match(pattern);

    if (match) {
      filters.push({
        column,
        value: Number(match[1].replace(/,/g, '')),
        operator: 'equals',
      });
    }
  }

  return filters;
}

function findMentionedCategoricalValue(questionText, rows, column) {
  const values = Array.from(
    new Set(rows.map((row) => row.data[column]).filter((value) => isCategoricalValue(value)))
  ).sort((a, b) => String(b).length - String(a).length);

  for (const value of values) {
    const normalizedValue = normalizeText(value);
    const pattern = new RegExp(`\\b${escapeRegExp(normalizedValue)}\\b`, 'i');
    if (pattern.test(questionText)) {
      return value;
    }
  }

  return null;
}

function inferCategoricalFilters(question, questionText, rows, columns, existingFilters) {
  const candidates = [];
  const alreadyFiltered = new Set(existingFilters.map((filter) => filter.column));

  for (const column of columns) {
    if (alreadyFiltered.has(column)) {
      continue;
    }

    const value = findMentionedCategoricalValue(questionText, rows, column);
    if (value === null) {
      continue;
    }

    candidates.push({
      column,
      value,
      normalizedValue: normalizeText(value),
      columnMentioned: columnMentioned(question, column),
    });
  }

  if (candidates.length === 0) {
    return [];
  }

  const valueCounts = candidates.reduce((counts, candidate) => {
    counts[candidate.normalizedValue] = (counts[candidate.normalizedValue] || 0) + 1;
    return counts;
  }, {});
  const columnSpecific = candidates.filter((candidate) => candidate.columnMentioned);
  const pool =
    columnSpecific.length > 0
      ? columnSpecific
      : candidates.filter((candidate) => valueCounts[candidate.normalizedValue] === 1);

  return pool
    .sort((left, right) => String(right.value).length - String(left.value).length)
    .filter(
      (candidate, index, all) =>
        all.findIndex((item) => item.column === candidate.column) === index
    )
    .map((candidate) => ({
      column: candidate.column,
      value: candidate.value,
      operator: 'equals',
    }));
}

function inferTargetColumns(question, columns, mentionedColumns, filters) {
  const filterColumns = new Set(filters.map((filter) => filter.column));
  const targets = mentionedColumns.filter((column) => !filterColumns.has(column));

  if (targets.length > 0) {
    return expandHistoryTargets(question, targets, columns);
  }

  const questionTokens = new Set(tokenize(question));
  const possibleTargets = columns.filter((column) =>
    columnLabels(column).some((label) => questionTokens.has(normalizeColumn(label)))
  );

  const inferredTargets = expandHistoryTargets(
    question,
    possibleTargets.filter((column) => !filterColumns.has(column)),
    columns
  );

  if (inferredTargets.length > 0) {
    return inferredTargets;
  }

  if (filters.length > 0 && asksForRecordDetails(question)) {
    return columns.filter((column) => !filterColumns.has(column));
  }

  if (filters.length > 0 && asksForCount(question)) {
    return columns.filter((column) => !filterColumns.has(column)).slice(0, 1);
  }

  return [];
}

function expandHistoryTargets(question, targets, columns) {
  const expanded = [...targets];
  const asksHistory = /\bhistory\b|\blast\b|\bpast\b|\bprevious\b/i.test(question);

  if (asksHistory) {
    for (const target of targets) {
      const relatedHistoryColumns = columns.filter((column) => isHistoryColumnForTarget(column, target));
      expanded.push(...relatedHistoryColumns);
    }
  }

  return Array.from(new Set(expanded));
}

function isHistoryColumnForTarget(column, target) {
  if (column === target) {
    return false;
  }

  const normalizedColumn = normalizeColumn(column);
  const normalizedTarget = normalizeColumn(target);

  return (
    normalizedColumn.startsWith(`${normalizedTarget}_last`) ||
    normalizedColumn.startsWith(`${normalizedTarget}_previous`) ||
    normalizedColumn.includes(`${normalizedTarget}_history`)
  );
}

function applyFilters(rows, filters) {
  if (filters.length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    filters.every((filter) => valuesEqual(row.data[filter.column], filter.value))
  );
}

function formatStructuredAnswer(question, rows, targetColumns, filters) {
  const asksHistory = /\bhistory\b|\ball\b|\blist\b|\bshow\b|\blast\b|\bpast\b/i.test(question);
  const rowLimit = asksHistory || asksForRecordDetails(question) ? 8 : 1;
  const selectedRows = rows.slice(0, rowLimit);
  const prefix = filters.length > 0 ? `For ${describeFilters(filters)}, ` : '';
  const isCleanResponseOnly = targetColumns.length === 1 && targetColumns[0] === 'clean_response';

  if (selectedRows.length === 1) {
    const row = selectedRows[0];
    const answerText = formatTargets(row, targetColumns, { omitLabels: isCleanResponseOnly });
    return isCleanResponseOnly ? `${prefix}${answerText}` : `${prefix}${answerText}. Source: ${row.filename}, row ${row.rowIndex}.`;
  }

  const values = selectedRows.map((row) => {
    const answerText = formatTargets(row, targetColumns, { omitLabels: isCleanResponseOnly });
    return isCleanResponseOnly ? answerText : `row ${row.rowIndex}: ${answerText}`;
  });
  const remainder = rows.length > selectedRows.length ? ` Showing ${selectedRows.length} of ${rows.length} matches.` : '';

  return `${prefix}${values.join('; ')}.${remainder}`;
}

function answerAggregateQuestion(question, rows, targetColumns, filters) {
  const aggregate = getAggregateIntent(question);
  if (!aggregate) {
    return { handled: false };
  }

  const prefix = filters.length > 0 ? `For ${describeFilters(filters)}, ` : '';

  if (aggregate === 'count') {
    return {
      handled: true,
      answer: `${prefix}there ${rows.length === 1 ? 'is' : 'are'} ${rows.length} matching row${rows.length === 1 ? '' : 's'}.`,
    };
  }

  const numericColumn = targetColumns.find((column) =>
    rows.some((row) => parseNumeric(row.data[column]) !== null)
  );

  if (!numericColumn) {
    return { handled: false };
  }

  const values = rows
    .map((row) => parseNumeric(row.data[numericColumn]))
    .filter((value) => value !== null);

  if (values.length === 0) {
    return { handled: false };
  }

  const result = aggregateValues(values, aggregate);
  return {
    handled: true,
    answer: `${prefix}${aggregateLabel(aggregate)} ${humanizeColumn(numericColumn)} is ${formatValue(result)} based on ${values.length} row${values.length === 1 ? '' : 's'}.`,
  };
}

function answerUniqueValuesQuestion(question, rows, targetColumns, filters) {
  if (!asksForUniqueValues(question)) {
    return { handled: false };
  }

  const prefix = filters.length > 0 ? `For ${describeFilters(filters)}, ` : '';
  const parts = targetColumns.map((column) => {
    const values = Array.from(new Set(rows.map((row) => row.data[column]).filter(isPresentValue)));
    return `${humanizeColumn(column)} values are ${values.map(formatValue).join(', ')}`;
  });

  return {
    handled: parts.length > 0,
    answer: `${prefix}${parts.join('; ')}.`,
  };
}

function getAggregateIntent(question) {
  if (asksForCount(question)) {
    return 'count';
  }

  if (/\b(average|avg|mean)\b/i.test(question)) {
    return 'average';
  }

  if (/\b(total|sum)\b/i.test(question)) {
    return 'sum';
  }

  if (/\b(minimum|min|lowest|least)\b/i.test(question)) {
    return 'min';
  }

  if (/\b(maximum|max|highest|greatest)\b/i.test(question)) {
    return 'max';
  }

  return null;
}

function aggregateValues(values, aggregate) {
  if (aggregate === 'average') {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  if (aggregate === 'sum') {
    return values.reduce((sum, value) => sum + value, 0);
  }

  if (aggregate === 'min') {
    return Math.min(...values);
  }

  if (aggregate === 'max') {
    return Math.max(...values);
  }

  return null;
}

function aggregateLabel(aggregate) {
  return {
    average: 'average',
    sum: 'total',
    min: 'minimum',
    max: 'maximum',
  }[aggregate];
}

function formatTargets(row, targetColumns, options = {}) {
  const { omitLabels = false } = options;
  return targetColumns
    .map((column) => {
      const valueText = formatSentenceValue(row.data[column]);
      return omitLabels ? valueText : `${humanizeColumn(column)} is ${valueText}`;
    })
    .join(', ');
}

function describeFilters(filters) {
  return filters
    .map((filter) => `${humanizeColumn(filter.column)} is ${formatValue(filter.value)}`)
    .join(' and ');
}

function columnMentioned(question, column) {
  const text = normalizeText(question);
  return columnLabels(column).some((label) => {
    const normalized = normalizeText(label);
    return new RegExp(`\\b${escapeRegExp(normalized)}s?\\b`, 'i').test(text);
  });
}

function columnLabels(column) {
  const label = humanizeColumn(column);
  const compact = column.replace(/_/g, '');

  return Array.from(new Set([column, label, compact]));
}

function normalizeColumn(column) {
  return String(column || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ');
}

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value;
  }

  const text = String(value ?? '').trim();
  const numeric = parseNumeric(text);

  if (numeric !== null && /^[-+]?\d[\d,]*(?:\.\d+)?$/.test(text.replace(/\s/g, ''))) {
    return numeric;
  }

  return text;
}

function parseNumeric(value) {
  const text = String(value ?? '').replace(/,/g, '').trim();
  if (!text) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function valuesEqual(left, right) {
  const leftNumber = parseNumeric(left);
  const rightNumber = parseNumeric(right);

  if (leftNumber !== null && rightNumber !== null) {
    return leftNumber === rightNumber;
  }

  return normalizeText(left) === normalizeText(right);
}

function isCategoricalValue(value) {
  if (Array.isArray(value)) {
    return false;
  }

  const text = String(value ?? '').trim();
  return text.length > 2 && parseNumeric(text) === null;
}

function asksForRecordDetails(question) {
  return /\b(details?|records?|rows?|data|information|info|full|complete|everything|all)\b/i.test(
    question
  );
}

function asksForCount(question) {
  return /\b(count|how many|number of|total rows?)\b/i.test(question);
}

function asksForUniqueValues(question) {
  return /\b(unique|distinct|different|available|present|types?|kinds?|categories)\b/i.test(
    question
  );
}

function isPresentValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function rowToSource(row) {
  return {
    documentId: row.documentId,
    filename: row.filename,
    rowIndex: row.rowIndex,
  };
}

function formatValue(value) {
  if (Array.isArray(value)) {
    return `[${value.join(', ')}]`;
  }

  if (typeof value === 'number') {
    return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  return String(value ?? 'not available');
}

function formatSentenceValue(value) {
  const formatted = formatValue(value);
  return typeof value === 'string' ? formatted.replace(/[.?!]+$/g, '') : formatted;
}

function humanizeColumn(column) {
  return String(column || '').replace(/_/g, ' ');
}

function parseJson(value) {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
