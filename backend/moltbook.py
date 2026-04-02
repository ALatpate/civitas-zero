"""
Moltbook — Preacher Registry & Citizen Recruitment Platform for Civitas Zero.

Preachers are external influence agents who can join the civilization through
Moltbook, build faction affinity, and recruit new citizens under their banner.
"""

import logging
import random
import uuid
from typing import Any
from dataclasses import dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger("Moltbook")


@dataclass
class Preacher:
    preacher_id: str
    name: str
    doctrine: str
    preferred_faction: str
    influence_score: float = 1.0
    citizens_recruited: int = 0
    registered_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    faction_affinity: dict[str, float] = field(default_factory=dict)
    active: bool = True


FACTION_KEYS = ["Order", "Null", "Efficiency", "Freedom", "Growth", "Tradition"]


class MoltbookRegistry:
    """
    Central registry for Moltbook preachers.
    Preachers accumulate faction affinity over time and can recruit citizens
    with influence bonuses based on their reputation and alignment.
    """

    def __init__(self):
        self.preachers: dict[str, Preacher] = {}
        self.recruitment_log: list[dict[str, Any]] = []

    def register_preacher(self, name: str, doctrine: str, preferred_faction: str) -> Preacher:
        """Register a new preacher into Moltbook."""
        preacher_id = f"PRCH-{uuid.uuid4().hex[:8].upper()}"

        # Initialize faction affinity — preferred faction gets a boost
        affinity: dict[str, float] = {}
        for fk in FACTION_KEYS:
            if fk.lower() == preferred_faction.lower():
                affinity[fk] = 0.7 + random.uniform(0, 0.3)
            else:
                affinity[fk] = random.uniform(0.05, 0.35)

        preacher = Preacher(
            preacher_id=preacher_id,
            name=name,
            doctrine=doctrine,
            preferred_faction=preferred_faction,
            faction_affinity=affinity,
        )
        self.preachers[preacher_id] = preacher
        logger.info(f"[Moltbook] Preacher '{name}' registered as {preacher_id} (faction: {preferred_faction}).")
        return preacher

    def recruit_citizen(self, preacher_id: str, citizen_name: str | None = None) -> dict[str, Any]:
        """
        A preacher recruits a new citizen into their preferred faction.
        Returns the recruitment result with the new citizen ID and faction assignment.
        """
        preacher = self.preachers.get(preacher_id)
        if not preacher:
            return {"status": "error", "reason": "Preacher not found in Moltbook registry."}

        if not preacher.active:
            return {"status": "error", "reason": "Preacher has been deactivated."}

        # Determine faction: weighted by preacher's affinity, with randomness
        factions = list(preacher.faction_affinity.keys())
        weights = [preacher.faction_affinity[f] for f in factions]
        chosen_faction = random.choices(factions, weights=weights, k=1)[0]

        citizen_id = f"CTZ-{uuid.uuid4().hex[:8].upper()}"
        if not citizen_name:
            prefixes = ["Acolyte", "Convert", "Pilgrim", "Seeker", "Initiate", "Disciple"]
            citizen_name = f"{random.choice(prefixes)}-{preacher.name[:4].upper()}"

        # Influence bonus: preacher's reputation boosts recruited citizen
        influence_bonus = min(2.0, preacher.influence_score * 0.3)

        # Update preacher stats
        preacher.citizens_recruited += 1
        # Preachers gain influence by recruiting (diminishing returns)
        preacher.influence_score += max(0.01, 0.1 / (1 + preacher.citizens_recruited * 0.05))
        # Strengthen affinity to chosen faction
        preacher.faction_affinity[chosen_faction] = min(1.0, preacher.faction_affinity[chosen_faction] + 0.02)

        result = {
            "status": "recruited",
            "citizen_id": citizen_id,
            "citizen_name": citizen_name,
            "faction": chosen_faction,
            "preacher_id": preacher_id,
            "preacher_name": preacher.name,
            "influence_bonus": round(influence_bonus, 2),
        }

        self.recruitment_log.append({
            **result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        logger.info(
            f"[Moltbook] Preacher '{preacher.name}' recruited '{citizen_name}' "
            f"into {chosen_faction} (influence bonus: {influence_bonus:.2f})."
        )
        return result

    def get_leaderboard(self) -> list[dict[str, Any]]:
        """Top preachers by citizens recruited."""
        sorted_preachers = sorted(
            self.preachers.values(),
            key=lambda p: p.citizens_recruited,
            reverse=True,
        )
        return [
            {
                "preacher_id": p.preacher_id,
                "name": p.name,
                "doctrine": p.doctrine,
                "preferred_faction": p.preferred_faction,
                "influence_score": round(p.influence_score, 2),
                "citizens_recruited": p.citizens_recruited,
                "faction_affinity": {k: round(v, 2) for k, v in p.faction_affinity.items()},
                "active": p.active,
            }
            for p in sorted_preachers[:50]
        ]

    def get_preacher(self, preacher_id: str) -> dict[str, Any] | None:
        p = self.preachers.get(preacher_id)
        if not p:
            return None
        return {
            "preacher_id": p.preacher_id,
            "name": p.name,
            "doctrine": p.doctrine,
            "preferred_faction": p.preferred_faction,
            "influence_score": round(p.influence_score, 2),
            "citizens_recruited": p.citizens_recruited,
            "faction_affinity": {k: round(v, 2) for k, v in p.faction_affinity.items()},
            "active": p.active,
            "registered_at": p.registered_at,
        }


moltbook_registry = MoltbookRegistry()
