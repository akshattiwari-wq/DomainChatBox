import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

let openai;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openai;
}

export async function generateEmbeddings(inputs) {
  const client = getOpenAIClient();
  if (!client || !Array.isArray(inputs) || inputs.length === 0) {
    return null;
  }

  try {
    const response = await client.embeddings.create({
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: inputs,
    });

    return response.data.map((item) => item.embedding);
  } catch (error) {
    console.error('Embedding generation failed:', error?.message || error);
    return null;
  }
}

export async function generateEmbedding(input) {
  if (!input) {
    return null;
  }

  const embeddings = await generateEmbeddings([input]);
  return embeddings?.[0] ?? null;
}
