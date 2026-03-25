import os
import logging
from supabase import create_client, Client

logger = logging.getLogger("Database")

DEFAULT_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
DEFAULT_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""))

# Initialize client globally but allow it to be None if keys are missing initially
supabase: Client | None = None

if DEFAULT_URL and DEFAULT_KEY:
    try:
        supabase = create_client(DEFAULT_URL, DEFAULT_KEY)
        logger.info("Supabase client initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {e}")
else:
    logger.warning("Supabase credentials (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) not found in environment.")

def get_db() -> Client | None:
    return supabase
