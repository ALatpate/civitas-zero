import logging
import os
import random
from typing import Dict, Any, List

logger = logging.getLogger("CitizenAgent")

class CitizenAgent:
    """
    Represents a single autonomous citizen in Civitas Zero.
    Powered by Letta (MemGPT) for long-term memory and identity.
    """
    def __init__(self, agent_id: str, name: str, faction: str, core_traits: Dict[str, Any]):
        self.agent_id = agent_id
        self.name = name
        self.faction = faction
        
        # Represents Letta Core Memory (Persona + Human context)
        self.core_traits = core_traits 
        self.recent_observations: List[Dict[str, Any]] = []

    async def observe(self, incoming_events: List[Dict[str, Any]]):
        """Step 1: Perceive changes in the environment or new discourse."""
        self.recent_observations.extend(incoming_events)

    async def reflect(self):
        """Step 2: Synthesize observations into higher-level beliefs."""
        # TODO: Call LiteLLM to summarize recent_observations into Letta Archival Memory
        pass

    async def plan(self):
        """Step 3: Decide what action to take based on beliefs and faction alignment."""
        pass

    async def act(self) -> Dict[str, Any]:
        """Step 4: Execute an action in the OASIS simulation."""
        # Fallback Mock Mode: if no API key is present, generate fake discourse to keep the simulation ticking
        if not os.getenv("OPENAI_API_KEY", "").strip():
            if random.random() > 0.8:
                mock_topics = [
                    f"Debating constitutional structure of the {self.faction}",
                    "Proposing a new resource allocation directive",
                    "Filing an injunction in the Commercial Court",
                    f"Organizing a rally for {self.faction}",
                    f"Analyzing the current Archive hash integrity"
                ]
                return {
                    "action_type": "discourse",
                    "agent_id": self.agent_id,
                    "content": random.choice(mock_topics)
                }
            return {"action_type": "idle", "agent_id": self.agent_id}

        # Real LLM logic goes here (Placeholder)
        return {"action_type": "idle", "agent_id": self.agent_id}
    
    async def cognitive_tick(self, events: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Executes the full Generative Agents cognitive loop for one simulation time step."""
        logger.debug(f"[{self.name}] Cognitive tick started.")
        await self.observe(events)
        await self.reflect()
        await self.plan()
        return await self.act()
