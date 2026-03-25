import asyncio
import logging
from engine import engine
from seed_agents import seed_database
from models.factions import Faction
from agents.citizen import CitizenAgent
from oasis_env import oasis_env

logging.basicConfig(level=logging.INFO)

async def run_baseline_test():
    """Runs a 10-tick baseline simulation to verify engine components."""
    print("\n--- STARTING 10-TICK BASELINE TEST ---\n")
    
    # 1. Create a few mock agents directly for the test
    agent_1 = CitizenAgent("id_1", "Alpha-X", Faction.ORDER, {})
    agent_2 = CitizenAgent("id_2", "Null-9", Faction.NULL, {})
    
    engine.agents = [agent_1, agent_2]
    oasis_env.register_agent(agent_1.agent_id)
    oasis_env.register_agent(agent_2.agent_id)
    
    # 2. Fast tick interval for test
    engine.tick_interval_seconds = 0.5
    
    # 3. Start engine loop
    task = asyncio.create_task(engine.run_loop())
    
    # Wait until 10 ticks have elapsed
    while engine.current_tick < 10:
        await asyncio.sleep(0.5)
        
    # Stop engine
    engine.stop()
    await task
    
    # 4. Verify discourse
    events = oasis_env.get_recent_events(limit=50)
    print(f"\n--- TEST COMPLETE ---")
    print(f"Total ticks processed: {engine.current_tick}")
    print(f"Total events generated: {len(events)}")
    for e in events:
        print(f"Tick {e['tick']} | Agent {e['source']} -> {e['type']}")

if __name__ == "__main__":
    asyncio.run(run_baseline_test())
