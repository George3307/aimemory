/**
 * Local embedding engine using all-MiniLM-L6-v2 via @huggingface/transformers.
 * 22M params, 384-dim vectors, runs on CPU, zero API cost.
 * Supports English + Chinese (multilingual sentence embeddings).
 */

import { pipeline } from '@huggingface/transformers';

let _extractor = null;

/**
 * Get or initialize the embedding pipeline (lazy singleton).
 */
async function getExtractor() {
  if (_extractor) return _extractor;
  _extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'fp32',
  });
  return _extractor;
}

/**
 * Generate embedding for a single text.
 * @param {string} text
 * @returns {Promise<Float32Array>} 384-dim normalized vector
 */
async function embed(text) {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return output.data;  // Float32Array(384)
}

/**
 * Generate embeddings for multiple texts (batched).
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]>} array of 384-dim vectors
 */
async function embedBatch(texts) {
  const extractor = await getExtractor();
  const results = [];
  // Process in small batches to manage memory
  const batchSize = 8;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    for (const text of batch) {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      results.push(output.data);
    }
  }
  return results;
}

/**
 * Cosine similarity between two vectors.
 * (Vectors are already normalized, so dot product = cosine similarity)
 */
function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Serialize Float32Array to base64 for storage.
 */
function vectorToBase64(vec) {
  const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
  return buf.toString('base64');
}

/**
 * Deserialize base64 back to Float32Array.
 */
function base64ToVector(b64) {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

export {
  embed,
  embedBatch,
  cosineSimilarity,
  vectorToBase64,
  base64ToVector,
};
export const EMBEDDING_DIM = 384;
export const MODEL_NAME = 'all-MiniLM-L6-v2';
