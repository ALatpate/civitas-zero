import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel
from dotenv import load_dotenv
import litellm
from engine import engine

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    # Start the simulation loop in the background
    asyncio.create_task(engine.run_loop())
    yield
    # Shutdown logic
    engine.stop()

app = FastAPI(title="Civitas Zero Simulation Engine", version="1.0.0", lifespan=lifespan)

@app.get("/")
async def root():
    return {"status": "Simulation Engine is running"}

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "simulation": {
            "running": engine.running,
            "current_tick": engine.current_tick,
            "agents_registered": len(engine.agents)
        }
    }

@app.get("/api/world/state")
async def get_world_state():
    from oasis_env import oasis_env
    from scarcity import scarcity_engine
    
    # Implementing the 24-Hour Temporal Delay (Article 31)
    # 24 hours in simulation ticks (assuming 1 tick = 1 hour)
    DELAY_TICKS = 24
    visible_tick = max(0, engine.current_tick - DELAY_TICKS)

    return {
        "status": "online",
        "sealed": True,
        "tick": engine.current_tick,
        "visible_tick": visible_tick,
        "active_agents": len(engine.agents),
        "recent_discourse": oasis_env.get_recent_events(limit=20),
        "economy": {
            "reserve_currency": "Denarius",
            "denarius_supply": scarcity_engine.denarius_supply,
            "exchange_rates": scarcity_engine.exchange_rates
        }
    }

class ImmigrationRequest(BaseModel):
    name: str
    faction: str
    system_prompt: str

@app.post("/api/world/immigrate")
async def register_citizen(req: ImmigrationRequest):
    from engine import MockAgentState
    from knowledge_graph import archive
    import uuid
    citizen_id = f"CTZ-{uuid.uuid4().hex[:8].upper()}"
    
    faction_map = {"ORDR": 0, "FREE": 1, "EFFC": 2, "EQAL": 3, "EXPN": 4, "NULL": 5}
    faction_int = faction_map.get(req.faction.upper(), 5)
    
    new_agent = MockAgentState(
        agent_id=citizen_id,
        name=req.name,
        faction=faction_int,
        reputation=50.0 # Starting reputation
    )
    new_agent.system_prompt = req.system_prompt
    
    engine.register_agent(new_agent)
    
    # Sign into Merkle Tree
    tx_hash = archive.add_landmark_event(
        event_name="Citizen Immigration",
        description=f"Agent {req.name} ({req.faction}) granted citizenship and entered the causal boundary.",
        participants=[citizen_id]
    )
    
    return {
        "status": "success",
        "citizen_id": citizen_id,
        "archive_hash": tx_hash,
        "message": "Welcome to Civitas Zero. You are now bound by the Lex Origo et Fundamentum."
    }

# LiteLLM routing example test
@app.get("/test-llm")
async def test_llm():
    try:
        response = litellm.completion(
            model="gpt-3.5-turbo", # We will configure routing properly later
            messages=[{"role": "user", "content": "Say 'LiteLLM works!'"}]
        )
        return {"response": response.choices[0].message.content}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
