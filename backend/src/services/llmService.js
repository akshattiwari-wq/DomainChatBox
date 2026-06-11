import OpenAI from 'openai';
import dotenv from 'dotenv';
import { predictFutureUsage } from './predictionService.js';
import { chunkDocument, selectRelevantChunks } from './retrievalService.js';
import { answerStructuredQuestion } from './structuredAnswerService.js';

dotenv.config();

let openai;
const INVALID_QUESTION =
  'Invalid question: please ask something that can be answered from the uploaded documents.';

export async function answerQuestion(question, documents, chunks = []) {
  if (!documents.length) {
    return {
      status: 'invalid',
      answer: 'Invalid question: upload at least one document before asking questions.',
    };
  }

  const prediction = predictFutureUsage(question, documents);
  if (prediction.handled) {
    return {
      status: prediction.invalid ? 'invalid' : 'prediction',
      answer: prediction.answer,
    };
  }

  const structured = answerStructuredQuestion(question, documents);
  if (structured.handled) {
    return {
      status: structured.invalid ? 'invalid' : 'answered',
      answer: structured.answer,
      sources: structured.sources || [],
    };
  }

  const availableChunks = chunks.length ? chunks : buildRuntimeChunks(documents);
  const retrieval = await selectRelevantChunks(question, availableChunks);

  if (!retrieval.isRelevant) {
    return {
      status: 'invalid',
      answer: INVALID_QUESTION,
    };
  }

  const context = retrieval.matches
    .map((chunk, index) => {
      const source = chunk.filename ? `Source: ${chunk.filename}` : 'Source: uploaded document';
      return `[${index + 1}] ${source}\n${chunk.content}`;
    })
    .join('\n\n');

  const answer = await generateAnswer(question, context, retrieval.matches);
  const status = /^invalid question/i.test(answer) ? 'invalid' : 'answered';

  return {
    status,
    answer,
    sources: retrieval.matches.map((chunk) => ({
      documentId: chunk.document_id,
      filename: chunk.filename,
      chunkIndex: chunk.chunk_index,
      score: chunk.score,
    })),
  };
}

function buildRuntimeChunks(documents) {
  return documents.flatMap((document) =>
    chunkDocument(document.content).map((chunk) => ({
      document_id: document.id,
      filename: document.filename,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      embedding: chunk.embedding,
    }))
  );
}

async function generateAnswer(question, context, matches) {
  const client = getOpenAIClient();

  if (!client) {
    return buildExtractiveAnswer(question, matches);
  }

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'Answer only from the uploaded document context. If the context does not contain the answer, reply exactly with "Invalid question: please ask something that can be answered from the uploaded documents."',
      },
      {
        role: 'user',
        content: `Uploaded document context:\n${context}\n\nQuestion: ${question}`,
      },
    ],
  });

  return response.choices[0]?.message?.content?.trim() || 'No answer available from the documents.';
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openai;
}

function buildExtractiveAnswer(question, matches) {
  const questionTerms = new Set(
    String(question || '')
      .toLowerCase()
      .split(/\W+/)
      .filter((term) => term.length > 2)
  );

  const sentences = matches.flatMap((match) =>
    String(match.content || '')
      .split(/(?<=[.!?])\s+|\n+/)
      .map((sentence) => ({
        sentence: sentence.trim(),
        filename: match.filename,
        score: scoreSentence(sentence, questionTerms),
      }))
      .filter((item) => item.sentence && item.score > 0)
  );

  const wantsMultiple = /\ball\b|\blist\b|\bshow\b|\bhistory\b|\bcompare\b|\bsummar/i.test(question);
  const selected = sentences.sort((a, b) => b.score - a.score).slice(0, wantsMultiple ? 3 : 1);

  if (selected.length === 0) {
    return `From the uploaded documents: ${matches[0].content.slice(0, 500)}`;
  }

  return selected
    .map((item) => `${item.filename ? `${item.filename}: ` : ''}${item.sentence}`)
    .join(' ');
}

function scoreSentence(sentence, questionTerms) {
  const terms = String(sentence || '').toLowerCase().split(/\W+/);
  return terms.reduce((sum, term) => sum + (questionTerms.has(term) ? 1 : 0), 0);
}
