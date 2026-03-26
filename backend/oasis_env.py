import logging
from typing import List, Dict, Any

logger = logging.getLogger("OASISEnvironment")

class CivitasOASISEnvironment:
    """
    Wrapper for camel-ai/oasis social simulation environment.
    Handles the spatial/social graph where agents interact.
    In a full deployment, this inherits from oasis.Environment.
    """
    def __init__(self):
        self.active_agents = {}
        self.discourse_feed = [] # Global timeline of events
        self.current_tick = 0
        self.subscribers = [] # list of asyncio.Queue
        
    async def subscribe(self):
        import asyncio
        q = asyncio.Queue()
        self.subscribers.append(q)
        return q
        
    def unsubscribe(self, q):
        if q in self.subscribers:
            self.subscribers.remove(q)
        
    def register_agent(self, agent_id: str):
        self.active_agents[agent_id] = {"status": "active", "influence": 1.0}
        logger.debug(f"OASIS Env: Agent {agent_id} entered the simulation.")
        
    def broadcast_event(self, source_agent_id: str, action_type: str, content: str):
        """When an agent speaks or acts, it gets broadcasted to the environment."""
        event = {
            "source": source_agent_id,
            "type": action_type,
            "content": content,
            "tick": self.current_tick
        }
        self.discourse_feed.append(event)
        logger.debug(f"OASIS Event broadcast: {event}")
        
        # AG-UI / SSE realtime broadcast
        for q in self.subscribers:
            q.put_nowait({"type": "agent_action", "data": event})
            
        return event

    def get_recent_events(self, limit: int = 10) -> List[Dict[str, Any]]:
        return self.discourse_feed[-limit:]
        
    def step(self):
        """Advances the internal logical clock of the environment."""
        self.current_tick += 1

oasis_env = CivitasOASISEnvironment()
