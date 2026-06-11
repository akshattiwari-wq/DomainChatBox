import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import { parse } from 'csv-parse/sync';

const NUMBER_PATTERN = /[-+]?\d[\d,]*(?:\.\d+)?/g;

export async function parseDocument(file) {
  const buffer = file.buffer;
  const originalName = file.originalname;
  const filename = originalName.toLowerCase();
  let text = '';
  const metadata = {
    source: originalName,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  };
  let numericData = emptyNumericData();

  if (filename.endsWith('.pdf')) {
    const data = await pdf(buffer);
    text = data.text;
    metadata.type = 'pdf';
    metadata.pages = data.numpages;
  } else if (filename.endsWith('.docx') || filename.endsWith('.doc')) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
    metadata.type = 'word';
  } else if (filename.endsWith('.csv')) {
    const records = parse(buffer.toString('utf-8'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
    const columns = Object.keys(records[0] || {});
    text = tableToText(originalName, records, columns);
    numericData = extractNumericDataFromRecords(records, originalName);
    metadata.type = 'csv';
    metadata.rowCount = records.length;
    metadata.columns = columns;
    metadata.sampleRows = records.slice(0, 5);
  } else {
    text = buffer.toString('utf-8');
    metadata.type = 'text';
    numericData = extractNumericDataFromText(text, originalName);
  }

  text = normalizeText(text);
  metadata.characterCount = text.length;
  metadata.wordCount = text ? text.split(/\s+/).length : 0;

  if (!text.trim()) {
    throw new Error(`No readable text could be extracted from ${originalName}`);
  }

  return { text, metadata, numericData };
}

export const saveDocument = parseDocument;

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function tableToText(filename, records, columns) {
  const header = `CSV file: ${filename}\nRows: ${records.length}\nColumns: ${columns.join(', ')}`;
  const visibleRows = records.slice(0, 20);
  const rows = visibleRows.map((record, index) => {
    const values = columns.map((column) => `${column}: ${record[column] ?? ''}`).join(', ');
    return `Row ${index + 1}: ${values}`;
  });

  const summary = records.length > visibleRows.length ? `\n...and ${records.length - visibleRows.length} more rows.` : '';
  return [header, ...rows].join('\n') + summary;
}

function emptyNumericData() {
  return {
    records: [],
    series: [],
  };
}

function extractNumericDataFromRecords(records, source) {
  const numericRecords = records
    .map((record, index) => {
      const values = {};

      for (const [key, value] of Object.entries(record)) {
        const parsed = parseNumber(value);
        if (parsed !== null) {
          values[key] = parsed;
        }
      }

      return {
        index: index + 1,
        values,
        raw: record,
      };
    })
    .filter((record) => Object.keys(record.values).length > 0);

  return {
    records: numericRecords,
    series: buildSeries(numericRecords, source),
  };
}

function extractNumericDataFromText(text, source) {
  const numericRecords = normalizeText(text)
    .split('\n')
    .map((line, index) => {
      const matches = line.match(NUMBER_PATTERN) || [];
      const values = {};

      matches.forEach((match, valueIndex) => {
        const parsed = parseNumber(match);
        if (parsed !== null) {
          values[`value_${valueIndex + 1}`] = parsed;
        }
      });

      return {
        index: index + 1,
        values,
        raw: { line },
      };
    })
    .filter((record) => Object.keys(record.values).length > 0);

  return {
    records: numericRecords,
    series: buildSeries(numericRecords, source),
  };
}

function buildSeries(numericRecords, source) {
  if (numericRecords.length < 2) {
    return [];
  }

  const columns = Array.from(
    new Set(numericRecords.flatMap((record) => Object.keys(record.values)))
  );

  if (columns.length === 0) {
    return [];
  }

  if (columns.length === 1) {
    const yColumn = columns[0];
    const points = numericRecords
      .filter((record) => Number.isFinite(record.values[yColumn]))
      .map((record) => ({
        x: record.index,
        y: record.values[yColumn],
        rowIndex: record.index,
      }));

    return points.length >= 2
      ? [{ source, label: `${yColumn} by row`, xColumn: 'row', yColumn, points }]
      : [];
  }

  const series = [];

  for (const xColumn of columns) {
    for (const yColumn of columns) {
      if (xColumn === yColumn) continue;

      const points = numericRecords
        .filter(
          (record) =>
            Number.isFinite(record.values[xColumn]) && Number.isFinite(record.values[yColumn])
        )
        .map((record) => ({
          x: record.values[xColumn],
          y: record.values[yColumn],
          rowIndex: record.index,
        }))
        .sort((a, b) => a.x - b.x);

      if (points.length >= 2 && hasVariedX(points)) {
        series.push({
          source,
          label: `${yColumn} by ${xColumn}`,
          xColumn,
          yColumn,
          points,
        });
      }
    }
  }

  return series;
}

function hasVariedX(points) {
  return new Set(points.map((point) => point.x)).size > 1;
}

function parseNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const match = String(value ?? '').replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}
