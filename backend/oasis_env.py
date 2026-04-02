import logging
from typing import Any
from collections import deque

logger = logging.getLogger("OASISEnvironment")

MAX_DISCOURSE_FEED = 1000


class CivitasOASISEnvironment:
    """
    Wrapper for camel-ai/oasis social simulation environment.
    Handles the spatial/social graph where agents interact.
    """
    def __init__(self):
        self.active_agents: dict[str, dict[str, Any]] = {}
        self.discourse_feed: deque[dict[str, Any]] = deque(maxlen=MAX_DISCOURSE_FEED)
        self.current_tick = 0
        self.subscribers: list = []  # list of asyncio.Queue

    def subscribe(self):
        import asyncio
        q = asyncio.Queue(maxsize=200)
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

        # AG-UI / SSE realtime broadcast — prune dead subscribers
        dead_queues = []
        for q in self.subscribers:
            try:
                q.put_nowait({"type": "agent_action", "data": event})
            except Exception:
                dead_queues.append(q)
        for dq in dead_queues:
            self.subscribers.remove(dq)

        return event

    def get_recent_events(self, limit: int = 10) -> list[dict[str, Any]]:
        feed = list(self.discourse_feed)
        return feed[-limit:]

    def step(self):
        """Advances the internal logical clock of the environment."""
        self.current_tick += 1


oasis_env = CivitasOASISEnvironment()
