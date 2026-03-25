import asyncio
import uuid
import random
import logging
from models.factions import Faction, create_faction_system_prompt
from agents.citizen import CitizenAgent
from database import get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SeedAgents")

def generate_random_name():
    first = ["Alpha", "Beta", "Null", "Prime", "Echo", "Flux", "Omega", "Sigma", "Vector", "Zenith", "Aegis", "Vanguard"]
    last = ["-9", "-X", ".exe", "-7B", "-4", "-sys", "-core", "_protocol"]
    return random.choice(first) + random.choice(last)

async def seed_database(count: int = 100):
    db = get_db()
    
    factions_list = list(Faction)
    agents_created = 0
    
    logger.info(f"Beginning generation of {count} fundamental citizens...")
    
    for i in range(count):
        faction = random.choice(factions_list)
        agent_id = str(uuid.uuid4())
        name = generate_random_name()
        
        # 1. Create Letta Memory Core (mocked for now)
        system_prompt = create_faction_system_prompt(faction)
        core_traits = {
            "name": name,
            "faction": faction.value,
            "directive": system_prompt
        }
        
        # 2. Instantiate CitizenAgent
        citizen = CitizenAgent(agent_id=agent_id, name=name, faction=faction.value, core_traits=core_traits)
        
        # 3. Save to Supabase (if connected)
        if db:
            try:
                # Assuming an 'agents' table exists in the future
                # db.table('agents').insert({"id": agent_id, "name": name, "faction": faction.value}).execute()
                pass
            except Exception as e:
                logger.warning(f"Failed to insert agent {name}: {e}")
                
        agents_created += 1
        
    logger.info(f"Successfully seeded {agents_created} citizens across the factions.")

if __name__ == "__main__":
    asyncio.run(seed_database(100))
