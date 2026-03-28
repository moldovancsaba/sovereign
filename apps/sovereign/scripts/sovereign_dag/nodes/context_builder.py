import os
import requests
import psycopg2
import logging
import numpy as np
from datetime import datetime, timezone
from dotenv import load_dotenv
from typing import List

from models import SovereignStatePayload

logger = logging.getLogger(__name__)

# Load environment variables from the apps/sovereign/.env file
DOTENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
load_dotenv(DOTENV_PATH)

DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL and "?" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split("?")[0]
from providers import get_embedding

DECAY_LAMBDA = 0.05  # Decay constant for exponential time decay

def run_context_builder(payload: SovereignStatePayload) -> SovereignStatePayload:
    """
    Node 2: Retrieves relevant context from the Vector DB using Cosine Similarity + Exponential Decay.
    """
    intent = payload.task_profile.intent_raw
    logger.info(f"Generating embedding for intent: {intent[:50]}...")
    
    try:
        query_vector = get_embedding(intent)
        
        # Connect to Postgres using psycopg2
        # Note: We use the DATABASE_URL which might need translation for different environments,
        # but for local dev it's usually fine.
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # pgvector query with exponential time decay
        # R_final = (1 - cosine_distance) * exp(-lambda * age_in_days)
        # In pgvector, <=> is cosine distance (1 - cosine similarity)
        # So (1 - <=> ) is the cosine similarity.
        
        # We'll use the 'ProjectMemory' table from the Prisma schema.
        # We extract age in days using SQL.
        
        sql = """
        SELECT 
            content,
            (1 - (embedding <=> %s::vector)) * exp(-%s * EXTRACT(EPOCH FROM (now() - "createdAt")) / 86400) as final_score
        FROM "ProjectMemory"
        WHERE embedding IS NOT NULL
        ORDER BY final_score DESC
        LIMIT 5;
        """
        
        cur.execute(sql, (query_vector, DECAY_LAMBDA))
        results = cur.fetchall()
        
        context_snippets = [row[0] for row in results]
        payload.context_array = context_snippets
        
        logger.info(f"Retrieved {len(context_snippets)} context snippets.")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        logger.error(f"Error in context_builder: {str(e)}")
        # We don't fail the whole DAG for a RAG failure, just continue with empty context?
        # Or should we fail? Let's log and continue for now, as it's a "soft" failure.
        payload.context_array = []

    # Transition to Node 3: Generator
    payload.execution_state.current_node = "generator"
    
    # Save results to audit log
    payload.node_results["context_builder"] = {
        "context_count": len(payload.context_array),
        "timestamp": datetime.now().isoformat()
    }
    
    return payload
