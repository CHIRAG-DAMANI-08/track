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
