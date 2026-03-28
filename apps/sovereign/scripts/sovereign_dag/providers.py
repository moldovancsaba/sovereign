import os
import logging
import requests
from typing import List, Optional, Any, Dict, Tuple
from openai import OpenAI
import instructor
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables
DOTENV_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")
load_dotenv(DOTENV_PATH)

# Environment Variables mapping
PRIMARY_BASE_URL = os.environ.get("SOVEREIGN_PRIMARY_BASE_URL", "http://127.0.0.1:8080/v1")
PRIMARY_MODEL = os.environ.get("SOVEREIGN_PRIMARY_MODEL", "mlx-model")
FALLBACK_BASE_URL = os.environ.get("SOVEREIGN_FALLBACK_BASE_URL", "http://127.0.0.1:11434/v1")
FALLBACK_MODEL = os.environ.get("SOVEREIGN_FALLBACK_MODEL", "Granite-4.0-H-1B")
EMBEDDING_BASE_URL = os.environ.get("SOVEREIGN_EMBEDDING_BASE_URL", "http://127.0.0.1:11434/v1")
EMBEDDING_MODEL = os.environ.get("SOVEREIGN_EMBEDDING_MODEL", "nomic-embed-text")

# Cloud provider fallback (Optional)
CLOUD_FALLBACK_KEY = os.environ.get("CLOUD_FALLBACK_KEY")
CLOUD_BASE_URL = os.environ.get("CLOUD_BASE_URL")
CLOUD_MODEL = os.environ.get("CLOUD_MODEL", "gpt-4o")

class ComputeMatrix:
    """Manages LLM provider abstraction and fallback logic."""
    
    @staticmethod
    def get_active_provider() -> Dict[str, Any]:
        """
        Pings providers in order of priority to find the first healthy one.
        Returns a dictionary with base_url and model.
        """
        # Try Primary (MLX)
        try:
            # We use a short timeout for health check
            # For MLX/Ollama, /v1/models is a standard check
            health_url = f"{PRIMARY_BASE_URL.rstrip('/')}/models"
            response = requests.get(health_url, timeout=2.0)
            if response.status_code == 200:
                return {"base_url": PRIMARY_BASE_URL, "model": PRIMARY_MODEL, "name": "MLX"}
        except Exception:
            logger.debug("Primary provider (MLX) unavailable.")

        # Try Fallback (Ollama)
        try:
            health_url = f"{FALLBACK_BASE_URL.rstrip('/')}/models"
            response = requests.get(health_url, timeout=2.0)
            if response.status_code == 200:
                return {"base_url": FALLBACK_BASE_URL, "model": FALLBACK_MODEL, "name": "Ollama (Fallback)"}
        except Exception:
            logger.debug("Fallback provider (Ollama) unavailable.")

        # Try Cloud Fallback
        if CLOUD_FALLBACK_KEY:
            logger.info("Local providers failed. Falling back to Cloud.")
            return {
                "base_url": CLOUD_BASE_URL or "https://api.openai.com/v1", 
                "model": CLOUD_MODEL, 
                "name": "Cloud Fallback", 
                "api_key": CLOUD_FALLBACK_KEY
            }

        raise ConnectionError("No healthy LLM providers found in the Compute Matrix.")

    @classmethod
    def get_client(cls) -> Tuple[OpenAI, str]:
        """Returns an OpenAI client and the model name for the active provider."""
        provider = cls.get_active_provider()
        logger.info(f"COMPUTE MATRIX: Routing to {provider['name']} ({provider['base_url']})")
        
        client = OpenAI(
            base_url=provider["base_url"],
            api_key=provider.get("api_key", "sovereign"), # Key for local providers is ignored
        )
        return client, provider["model"]

    @classmethod
    def get_instructor_client(cls, mode=instructor.Mode.JSON) -> Tuple[Any, str]:
        """Returns an instructor-wrapped client and model name."""
        base_client, model = cls.get_client()
        return instructor.from_openai(base_client, mode=mode), model

    @classmethod
    def generate_embedding(cls, text: str) -> List[float]:
        """Generates embedding using the configured embedding provider."""
        # Embeddings usually stay on a specific provider for stability
        client = OpenAI(
            base_url=EMBEDDING_BASE_URL,
            api_key="sovereign",
        )
        response = client.embeddings.create(
            input=[text],
            model=EMBEDDING_MODEL
        )
        return response.data[0].embedding

# Global easy-access functions
def get_llm_client() -> Tuple[OpenAI, str]:
    return ComputeMatrix.get_client()

def get_instructor_llm_client(mode=instructor.Mode.JSON) -> Tuple[Any, str]:
    return ComputeMatrix.get_instructor_client(mode=mode)

def get_embedding(text: str) -> List[float]:
    return ComputeMatrix.generate_embedding(text)
