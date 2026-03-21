-- HNSW index for pgvector cosine KNN (`<=>`); partial index skips rows without embeddings.
CREATE INDEX IF NOT EXISTS "ProjectMemory_embedding_hnsw_idx" ON "ProjectMemory" USING hnsw ("embedding" vector_cosine_ops) WHERE ("embedding" IS NOT NULL);
