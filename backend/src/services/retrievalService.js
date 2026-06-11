import { generateEmbedding } from './embeddingService.js';

const STOP_WORDS = new Set([
  'about',
  'after',
  'again',
  'also',
  'and',
  'are',
  'can',
  'could',
  'did',
  'does',
  'for',
  'from',
  'give',
  'has',
  'have',
  'how',
  'into',
  'its',
  'may',
  'more',
  'much',
  'must',
  'not',
  'our',
  'out',
  'please',
  'show',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'this',
  'to',
  'use',
  'used',
  'using',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'would',
  'you',
  'your',
]);

const MAX_CHUNK_CHARACTERS = 1600;
const MIN_RELEVANCE_SCORE = 0.18;

export function chunkDocument(content) {
  const paragraphs = String(content || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const rawChunks = [];
  let current = '';

  for (const paragraph of paragraphs.length ? paragraphs : [String(content || '')]) {
    if (paragraph.length > MAX_CHUNK_CHARACTERS) {
      if (current) {
        rawChunks.push(current);
        current = '';
      }

      for (let start = 0; start < paragraph.length; start += MAX_CHUNK_CHARACTERS) {
        rawChunks.push(paragraph.slice(start, start + MAX_CHUNK_CHARACTERS));
      }
      continue;
    }

    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > MAX_CHUNK_CHARACTERS && current) {
      rawChunks.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) {
    rawChunks.push(current);
  }

  return rawChunks.map((chunk, index) => ({
    chunkIndex: index,
    content: chunk,
    embedding: toTermVector(chunk),
  }));
}

export async function selectRelevantChunks(question, chunks, limit = 5) {
  const questionVector = toTermVector(question);
  const questionTokens = Object.keys(questionVector);
  const hasDenseEmbedding = chunks.some((chunk) => Array.isArray(parseEmbedding(chunk.embedding_json || chunk.embedding)));
  const questionEmbedding = hasDenseEmbedding ? await generateEmbedding(question) : null;

  if (questionTokens.length === 0 && !questionEmbedding) {
    return { isRelevant: false, matches: [], relevanceScore: 0 };
  }

  const scored = chunks
    .map((chunk) => {
      const embedding = parseEmbedding(chunk.embedding_json || chunk.embedding);
      const overlap = questionTokens.filter((token) => embedding[token]).length;
      const overlapRatio = questionTokens.length ? overlap / questionTokens.length : 0;
      const denseScore = questionEmbedding && Array.isArray(embedding) ? cosineSimilarityArray(questionEmbedding, embedding) : 0;
      const sparseScore = !Array.isArray(embedding) ? cosineSimilarity(questionVector, embedding) : 0;
      const score = denseScore + sparseScore + overlapRatio * 0.25;

      return {
        ...chunk,
        score,
        overlap,
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score);

  const matches = scored.slice(0, limit);
  const top = matches[0];
  const isRelevant = Boolean(
    top && (top.score >= MIN_RELEVANCE_SCORE || top.overlap >= Math.min(2, questionTokens.length))
  );

  return {
    isRelevant,
    matches,
    relevanceScore: top?.score || 0,
  };
}

export function toTermVector(text) {
  const tokens = tokenize(text);
  const vector = {};

  for (const token of tokens) {
    vector[token] = (vector[token] || 0) + 1;
  }

  return vector;
}

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function parseEmbedding(value) {
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

function cosineSimilarityArray(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return 0;
  }

  const leftMagnitude = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightMagnitude = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0);
  return dot / (leftMagnitude * rightMagnitude);
}

function cosineSimilarity(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return 0;
  }

  const leftValues = Object.values(left);
  const rightValues = Object.values(right);
  const leftMagnitude = Math.sqrt(leftValues.reduce((sum, value) => sum + value * value, 0));
  const rightMagnitude = Math.sqrt(rightValues.reduce((sum, value) => sum + value * value, 0));

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  let dot = 0;
  for (const [token, value] of Object.entries(left)) {
    dot += value * (right[token] || 0);
  }

  return dot / (leftMagnitude * rightMagnitude);
}
