import os
import sys
import logging
import unittest
import requests
from unittest.mock import patch, MagicMock

# Ensure we can import from the current directory
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

from dotenv import load_dotenv
from providers import ComputeMatrix

# Load environment variables
DOTENV_PATH = os.path.join(CURRENT_DIR, "..", "..", ".env")
load_dotenv(DOTENV_PATH)

class TestComputeMatrix(unittest.TestCase):
    
    @patch('requests.get')
    def test_primary_healthy(self, mock_get):
        # Mock MLX healthy
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_get.return_value = mock_resp
        
        provider = ComputeMatrix.get_active_provider()
        self.assertEqual(provider['name'], 'MLX')
        self.assertEqual(provider['base_url'], os.environ.get("SOVEREIGN_PRIMARY_BASE_URL"))

    @patch('requests.get')
    def test_primary_fails_fallback_healthy(self, mock_get):
        # Mock MLX fails, Ollama healthy
        def side_effect(url, timeout=None):
            if "8080" in url:
                raise requests.exceptions.ConnectionError("Connection Refused")
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            return mock_resp
            
        mock_get.side_effect = side_effect
        
        provider = ComputeMatrix.get_active_provider()
        self.assertEqual(provider['name'], 'Ollama (Fallback)')
        self.assertEqual(provider['base_url'], os.environ.get("SOVEREIGN_FALLBACK_BASE_URL"))

    @patch('requests.get')
    def test_all_fail_no_cloud(self, mock_get):
        # Mock all fail
        mock_get.side_effect = requests.exceptions.ConnectionError("All Down")
        
        # Ensure no cloud key
        with patch.dict(os.environ, {"CLOUD_FALLBACK_KEY": ""}):
            with self.assertRaises(ConnectionError):
                ComputeMatrix.get_active_provider()

if __name__ == '__main__':
    # Set up basic logging to see the provider routing in action
    logging.basicConfig(level=logging.INFO)
    unittest.main()
