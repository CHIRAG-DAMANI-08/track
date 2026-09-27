import { generateEmbedding, isGeminiConfigured } from '@/ai/gemini-client';
import { prisma } from '@/lib/db';
import type { AICandidateMemorySchema } from '@/lib/schemas';
import { z } from 'zod';

type CandidateMemory = z.infer<typeof AICandidateMemorySchema>;

/**
 * Process candidate memories from AI analysis.
 * Checks for duplicates, updates confidence of existing memories,
 * and creates new candidate memories.
 */
export async function processMemoryCandidates(
  candidates: CandidateMemory[],
  sourceType: string,
  sourceId?: string
): Promise<void> {
  for (const candidate of candidates) {
    // Check for similar existing memories
    const existing = await prisma.athleteMemory.findMany({
      where: {
        memoryType: candidate.memoryType,
        status: { in: ['CANDIDATE', 'ACTIVE', 'CONFIRMED'] },
      },
    });

    // Simple text similarity check
    const similar = existing.find(m =>
      textSimilarity(m.statement, candidate.statement) > 0.7
    );

    if (similar) {
      // Update existing memory with new evidence
      await prisma.athleteMemory.update({
        where: { id: similar.id },
        data: {
          evidenceCount: { increment: 1 },
          confidence: Math.min(1, similar.confidence + 0.1),
          // Promote if enough evidence
          status: similar.evidenceCount >= 3 && similar.status === 'CANDIDATE'
            ? 'ACTIVE'
            : similar.status,
        },
      });

      // Add evidence record
      await prisma.memoryEvidence.create({
        data: {
          memoryId: similar.id,
          sourceType,
          sourceId,
          description: candidate.reasoning,
          supports: true,
        },
      });
    } else {
      // Create new candidate memory
      const newMemory = await prisma.athleteMemory.create({
        data: {
          memoryType: candidate.memoryType,
          statement: candidate.statement,
          confidence: candidate.confidence,
          evidenceCount: 1,
          status: 'CANDIDATE',
        },
      });

      // Add evidence
      await prisma.memoryEvidence.create({
        data: {
          memoryId: newMemory.id,
          sourceType,
          sourceId,
          description: candidate.reasoning,
          supports: true,
        },
      });

      // Generate and store embedding if Gemini is configured
      if (isGeminiConfigured()) {
        try {
          const embedding = await generateEmbedding(candidate.statement);
          await prisma.$executeRawUnsafe(
            `INSERT INTO memory_embeddings (id, memory_id, embedding, model_name)
             VALUES (gen_random_uuid()::text, $1, $2::vector, 'text-embedding-004')
             ON CONFLICT (memory_id) DO UPDATE SET embedding = EXCLUDED.embedding`,
            newMemory.id,
            `[${embedding.join(',')}]`
          );
        } catch {
          // Embedding generation is non-critical
          console.warn('Failed to generate embedding for memory:', newMemory.id);
        }
      }
    }
  }
}

/**
 * Search for semantically similar memories.
 */
export async function searchSimilarMemories(
  query: string,
  limit: number = 10,
  threshold: number = 0.5
): Promise<Array<{ memoryId: string; similarity: number }>> {
  if (!isGeminiConfigured()) return [];

  try {
    const queryEmbedding = await generateEmbedding(query);
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const results = await prisma.$queryRawUnsafe<
      Array<{ memory_id: string; similarity: number }>
    >(
      `SELECT memory_id, 1 - (embedding <=> $1::vector) as similarity
       FROM memory_embeddings me
       JOIN athlete_memories am ON am.id = me.memory_id
       WHERE am.status NOT IN ('ARCHIVED', 'SUPERSEDED')
         AND 1 - (embedding <=> $1::vector) > $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      embeddingStr,
      threshold,
      limit
    );

    return results.map(r => ({
      memoryId: r.memory_id,
      similarity: r.similarity,
    }));
  } catch {
    console.warn('Semantic memory search failed, falling back to empty results');
    return [];
  }
}

/**
 * Simple text similarity using Jaccard coefficient on word sets.
 */
function textSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}
