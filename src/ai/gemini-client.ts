import { GoogleGenAI } from '@google/genai';

/**
 * Server-side Gemini client.
 * Must never be imported from client-side code.
 */

let clientInstance: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (clientInstance) return clientInstance;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Set it in .env.local to enable AI features.'
    );
  }

  clientInstance = new GoogleGenAI({ apiKey });
  return clientInstance;
}

export const MODELS = {
  primary: 'gemini-2.5-flash',
  embedding: 'text-embedding-004',
} as const;

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export interface GeminiGenerateOptions {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}

export async function generateWithGemini(options: GeminiGenerateOptions): Promise<string> {
  const client = getGeminiClient();

  const config: Record<string, unknown> = {};
  if (options.temperature !== undefined) config.temperature = options.temperature;
  if (options.maxOutputTokens !== undefined) config.maxOutputTokens = options.maxOutputTokens;
  if (options.responseMimeType) config.responseMimeType = options.responseMimeType;
  if (options.responseSchema) config.responseSchema = options.responseSchema;

  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.models.generateContent({
        model: MODELS.primary,
        contents: options.prompt,
        config: {
          ...config,
          systemInstruction: options.systemInstruction,
        },
      });

      const text = response.text;
      if (!text) throw new Error('Gemini returned empty response');
      return text;
    } catch (error: unknown) {
      lastError = error;

      // Check if this is a retryable error (503 overloaded, 429 rate limit, network issues)
      const isRetryable =
        error instanceof Error &&
        (/overloaded|503|429|rate.limit|resource.exhausted|unavailable|high.demand/i.test(error.message) ||
         /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(error.message));

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delayMs = Math.pow(2, attempt) * 1000;
      console.warn(`Gemini API attempt ${attempt + 1} failed (retryable), retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

export async function generateStructuredOutput<T>(
  options: GeminiGenerateOptions & { parseResponse: (text: string) => T }
): Promise<T> {
  const text = await generateWithGemini({
    ...options,
    responseMimeType: 'application/json',
  });

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  return options.parseResponse(cleaned);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getGeminiClient();

  const result = await client.models.embedContent({
    model: MODELS.embedding,
    contents: text,
  });

  const values = result.embeddings?.[0]?.values;
  if (!values) {
    throw new Error('Embedding generation returned no values');
  }

  return values;
}
