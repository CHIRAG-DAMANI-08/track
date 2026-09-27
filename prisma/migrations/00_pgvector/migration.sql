-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Memory embeddings table (pgvector types not directly in Prisma)
CREATE TABLE IF NOT EXISTS memory_embeddings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  memory_id TEXT NOT NULL REFERENCES athlete_memories(id) ON DELETE CASCADE,
  embedding vector(768),
  model_name TEXT NOT NULL DEFAULT 'text-embedding-004',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(memory_id)
);

-- Create IVFFlat index for similarity search
CREATE INDEX IF NOT EXISTS idx_memory_embeddings_vector 
ON memory_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 10);

-- Function for similarity search
CREATE OR REPLACE FUNCTION search_similar_memories(
  query_embedding vector(768),
  match_count INT DEFAULT 10,
  similarity_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  memory_id TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    me.memory_id,
    1 - (me.embedding <=> query_embedding) AS similarity
  FROM memory_embeddings me
  JOIN athlete_memories am ON am.id = me.memory_id
  WHERE am.status NOT IN ('ARCHIVED', 'SUPERSEDED')
    AND 1 - (me.embedding <=> query_embedding) > similarity_threshold
  ORDER BY me.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
