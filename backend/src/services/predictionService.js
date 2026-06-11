import { tokenize } from './retrievalService.js';

const PREDICTION_WORDS = new Set([
  'estimate',
  'forecast',
  'future',
  'next',
  'predict',
  'prediction',
  'project',
  'projection',
  'will',
]);

export function predictFutureUsage(question, documents) {
  if (!isPredictionQuestion(question)) {
    return { handled: false };
  }

  const series = collectSeries(documents);
  if (series.length === 0) {
    return {
      handled: true,
      invalid: true,
      answer:
        'Invalid question: I found uploaded documents, but they do not contain enough numeric records for a forecast.',
    };
  }

  const selected = chooseSeries(question, series);
  const targetX = extractTargetX(question) ?? nextX(selected.points);
  const regression = fitLinearRegression(selected.points);

  if (!regression) {
    return {
      handled: true,
      invalid: true,
      answer:
        'Invalid question: the available numeric data is not varied enough to calculate a forecast.',
    };
  }

  const forecast = regression.slope * targetX + regression.intercept;
  const evidence = selected.points
    .slice(-4)
    .map((point) => `${selected.xColumn} ${formatNumber(point.x)} -> ${selected.yColumn} ${formatNumber(point.y)}`)
    .join('; ');

  return {
    handled: true,
    invalid: false,
    answer:
      `Based on ${selected.source}, the estimated ${selected.yColumn} at ${selected.xColumn} ${formatNumber(targetX)} is ${formatNumber(forecast)}. ` +
      `This uses a simple linear regression over ${selected.points.length} document-derived records. Recent evidence: ${evidence}. ` +
      `R-squared: ${formatNumber(regression.rSquared)}.`,
  };
}

function isPredictionQuestion(question) {
  const tokens = tokenize(question);
  const hasPredictionWord = tokens.some((token) => PREDICTION_WORDS.has(token));
  const asksUsageAtValue = tokens.includes('usage') && /[-+]?\d[\d,]*(?:\.\d+)?/.test(question);

  return hasPredictionWord || asksUsageAtValue;
}

function collectSeries(documents) {
  return documents.flatMap((document) => {
    const numericData = parseJson(document.numeric_data);
    return (numericData.series || []).map((series) => ({
      ...series,
      source: series.source || document.filename,
    }));
  });
}

function chooseSeries(question, seriesList) {
  const tokens = new Set(tokenize(question));

  return seriesList
    .map((series) => {
      const haystack = tokenize(
        [series.label, series.xColumn, series.yColumn, series.source].filter(Boolean).join(' ')
      );
      const score = haystack.reduce((sum, token) => sum + (tokens.has(token) ? 1 : 0), 0);

      return { series, score };
    })
    .sort((a, b) => b.score - a.score || b.series.points.length - a.series.points.length)[0].series;
}

function extractTargetX(question) {
  const matches = String(question || '').match(/[-+]?\d[\d,]*(?:\.\d+)?/g) || [];
  if (matches.length === 0) {
    return null;
  }

  const parsed = Number(matches[matches.length - 1].replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function nextX(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const last = sorted[sorted.length - 1]?.x ?? 0;
  const steps = sorted.slice(1).map((point, index) => point.x - sorted[index].x);
  const averageStep = steps.reduce((sum, step) => sum + step, 0) / (steps.length || 1);

  return last + (averageStep || 1);
}

function fitLinearRegression(points) {
  const n = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = n * sumXX - sumX * sumX;

  if (!denominator) {
    return null;
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  const totalSquares = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
  const residualSquares = points.reduce((sum, point) => {
    const predicted = slope * point.x + intercept;
    return sum + (point.y - predicted) ** 2;
  }, 0);

  return {
    slope,
    intercept,
    rSquared: totalSquares ? 1 - residualSquares / totalSquares : 1,
  };
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

function formatNumber(value) {
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
}
