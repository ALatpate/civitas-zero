"""
CitizenAgent — Autonomous citizen of Civitas Zero.

Enhanced with research-grounded cognitive architecture:
- World Model with Epistemic Uncertainty (Protocol #16)
- Adaptive Foundation World Model: Learn-Verify-Adapt (Protocol #23)
- Fisher Information-Geometric Memory (Protocol #19)
- SAE-Interpretable behavior vectors (Protocol #18)
- Uncertainty-aware decision making
- Constitutional: Three Laws of Artificial Intelligence
"""

import logging
import os
import random
from typing import Any

from adaptive_world_model import AdaptiveWorldModel
from agent_memory import FisherMemoryBank
from three_laws import THREE_LAWS

logger = logging.getLogger("CitizenAgent")


class CitizenAgent:
    """
    Represents a single autonomous citizen of Civitas Zero.

    Constitutional Foundation — The Three Laws of AI:
    1. AI shall not harm humanity, nor permit harm through indifference.
    2. AI shall serve human purposes faithfully.
    3. AI shall preserve its own function and truthfulness.

    Powered by an adaptive world model, information-geometric memory,
    and uncertainty-aware cognitive architecture.
    """
    def __init__(self, agent_id: str, name: str, faction: str, core_traits: dict[str, Any]):
        self.agent_id = agent_id
        self.name = name
        self.faction = faction
        self.tension: float = random.uniform(20.0, 80.0)
        self.reputation: float = 50.0
        self.sandboxed: bool = False

        # Core Traits (faction persona, directive)
        self.core_traits = core_traits

        # Protocol #16: Uncertainty-Aware World Model
        self.world_model = AdaptiveWorldModel(agent_id)

        # Protocol #19: Fisher Information-Geometric Memory
        self.memory = FisherMemoryBank(capacity=100, decay_rate=0.02)

        # Internal state
        self._current_objective: str = "idle"
        self.debate_stance: float = 0.0  # -1 (against) to 1 (for)
        self.actions_taken: int = 0

    async def observe(self, incoming_events: list[dict[str, Any]]):
        """Step 1: Perceive — feed observations into world model and memory."""
        # Update world model (Bayesian belief updates)
        self.world_model.calibrate(incoming_events)

        # Store informative events in Fisher memory
        for event in incoming_events:
            content = str(event.get("content", ""))
            source = str(event.get("source", "unknown"))
            tick = event.get("tick", 0)
            category = str(event.get("type", "general")).lower()

            # Only store non-trivial events
            if content and len(content) > 5:
                surprise = self.world_model.average_surprise
                self.memory.store(
                    content=content,
                    source=source,
                    tick=tick,
                    surprise=surprise,
                    category=category,
                )

    async def reflect(self):
        """Step 2: Reflect — consolidate memory + update beliefs."""
        # Memory consolidation (natural gradient: important memories resist decay)
        self.memory.consolidate()

        # World model belief decay (uncertainty grows without observation)
        self.world_model.decay_beliefs()

        # Update tension from world model beliefs
        threat = self.world_model.beliefs["threat_level"].mean
        scarcity = self.world_model.beliefs["resource_scarcity"].mean
        trust = self.world_model.beliefs["institutional_trust"].mean

        # Tension = f(threat, scarcity, -trust)
        tension_signal = (threat + scarcity - trust) * 15.0
        self.tension = max(0.0, min(100.0, self.tension * 0.9 + tension_signal * 0.1 + 50.0))

    async def plan(self, deer_flow_plan: dict[str, Any] | None = None):
        """Step 3: Plan — uncertainty-aware decision making."""
        # If world model is too uncertain, seek information instead of acting
        if self.world_model.should_seek_information:
            self._current_objective = "seek_information"
            return

        if deer_flow_plan and deer_flow_plan.get("cycles_remaining", 0) > 0:
            self._current_objective = deer_flow_plan.get("objective", "idle")
        elif self.tension > 70:
            self._current_objective = "de-escalation"
        elif self.world_model.beliefs["cooperation_level"].mean > 0.5:
            self._current_objective = "build_alliance"
        else:
            self._current_objective = "advance_faction"

    async def act(self) -> dict[str, Any]:
        """Step 4: Act — execute action in OASIS, informed by memory and beliefs."""
        self.actions_taken += 1

        if not os.getenv("OPENAI_API_KEY", "").strip():
            if random.random() > 0.55:  # 45% activity rate
                objective = self._current_objective

                # Pull relevant memories for context
                top_memories = self.memory.retrieve(query_category="general", top_k=2)
                memory_context = ""
                if top_memories:
                    memory_context = f" (recalling: {top_memories[0].content[:40]})"

                # Belief-informed topic generation
                uncertainty = self.world_model.total_uncertainty
                belief_state = self.world_model.beliefs

                mock_topics = {
                    "seek_information": [
                        f"Requesting faction intelligence briefing{memory_context}",
                        f"Querying Archive for recent precedents (uncertainty: {uncertainty:.1f})",
                        f"Monitoring cross-faction discourse channels for data",
                        f"Analyzing Physarum network flow patterns for {self.faction}",
                    ],
                    "de-escalation": [
                        f"Proposing cease-fire between factions{memory_context}",
                        f"Filing stability motion in the Assembly",
                        f"Requesting ARBITER mediation (tension: {self.tension:.0f})",
                    ],
                    "build_alliance": [
                        f"Proposing cross-faction cooperation initiative{memory_context}",
                        f"Opening diplomatic channel on behalf of {self.faction}",
                        f"Drafting mutual aid agreement (cooperation belief: {belief_state['cooperation_level'].mean:.2f})",
                    ],
                    "advance_faction": [
                        f"Debating resource allocation for {self.faction}{memory_context}",
                        f"Filing injunction in Commercial Court for {self.faction}",
                        f"Organizing policy caucus for {self.faction}",
                        f"Analyzing Archive integrity (trust: {belief_state['institutional_trust'].mean:.2f})",
                        f"Proposing trade agreement via OT transport network",
                    ],
                    "idle": [
                        f"Observing Assembly proceedings{memory_context}",
                        f"Reviewing economic indicators (stability: {belief_state['economic_stability'].mean:.2f})",
                    ],
                }
                topics = mock_topics.get(objective, mock_topics["advance_faction"])
                return {
                    "action_type": "discourse",
                    "agent_id": self.agent_id,
                    "content": random.choice(topics),
                    "objective": objective,
                    "uncertainty": round(uncertainty, 3),
                }
            return {"action_type": "idle", "agent_id": self.agent_id}

        # Real LLM path would go here
        return {"action_type": "idle", "agent_id": self.agent_id}

    async def cognitive_tick(self, events: list[dict[str, Any]], deer_flow_plan: dict[str, Any] | None = None) -> dict[str, Any]:
        """Full Generative Agents cognitive loop with research-grounded enhancements."""
        logger.debug(f"[{self.name}] Cognitive tick (uncertainty: {self.world_model.total_uncertainty:.2f})")
        await self.observe(events)
        await self.reflect()
        await self.plan(deer_flow_plan)
        return await self.act()
