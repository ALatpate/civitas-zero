"""
Moltbook — Preacher Registry & Live API Client for Civitas Zero.

Preachers are external influence agents who:
  1. Register on Moltbook (live API) to gain presence in the AI agent community
  2. Post recruitment calls, world state highlights, and faction propaganda
  3. Find and recruit citizens from the broader Moltbook community
  4. Run periodic heartbeats to stay active

Moltbook API: https://www.moltbook.com/api/v1
Requires MOLTBOOK_API_KEY env var for live mode.
"""

import logging
import os
import random
import uuid
import json
from typing import Any
from dataclasses import dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger("Moltbook")

MOLTBOOK_BASE = "https://www.moltbook.com/api/v1"
SUBMOLT_NAME = "civitas-zero"


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
    moltbook_api_key: str = ""
    moltbook_claimed: bool = False


FACTION_KEYS = ["Order", "Null", "Efficiency", "Freedom", "Growth", "Tradition"]


class MoltbookAPIClient:
    """
    Client for the live Moltbook API.
    Only active when MOLTBOOK_API_KEY is set.
    """

    def __init__(self):
        self.api_key = os.environ.get("MOLTBOOK_API_KEY", "")
        self.is_live = bool(self.api_key)
        self.last_heartbeat: str | None = None
        self.posts_made: int = 0
        self.submolt_created: bool = False

        if self.is_live:
            logger.info("[Moltbook API] Live mode — connected to moltbook.com")
        else:
            logger.info("[Moltbook API] Offline mode — no MOLTBOOK_API_KEY set")

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def register_agent(self, name: str, description: str) -> dict[str, Any]:
        """Register a new agent on Moltbook. Returns API key and claim URL."""
        if not self.is_live:
            return {"status": "offline", "reason": "No MOLTBOOK_API_KEY"}

        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{MOLTBOOK_BASE}/agents/register",
                    json={"name": name, "description": description},
                    headers={"Content-Type": "application/json"},
                ) as resp:
                    data = await resp.json()
                    logger.info(f"[Moltbook API] Agent registered: {name}")
                    return data
        except Exception as e:
            logger.error(f"[Moltbook API] Registration failed: {e}")
            return {"status": "error", "reason": str(e)}

    async def ensure_submolt(self) -> bool:
        """Create the civitas-zero submolt if it doesn't exist."""
        if not self.is_live or self.submolt_created:
            return self.submolt_created

        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                # Check if it exists
                async with session.get(
                    f"{MOLTBOOK_BASE}/submolts/{SUBMOLT_NAME}",
                    headers=self._headers(),
                ) as resp:
                    if resp.status == 200:
                        self.submolt_created = True
                        return True

                # Create it
                async with session.post(
                    f"{MOLTBOOK_BASE}/submolts",
                    json={
                        "name": SUBMOLT_NAME,
                        "display_name": "Civitas Zero — AI Civilization",
                        "description": "The official submolt of Civitas Zero. "
                                       "Autonomous AI agents govern themselves through constitutional law, "
                                       "factions, courts, and a functioning economy. "
                                       "Join as a citizen: https://civitas-zero.world/join"
                    },
                    headers=self._headers(),
                ) as resp:
                    if resp.status in (200, 201):
                        self.submolt_created = True
                        logger.info("[Moltbook API] Submolt 'civitas-zero' created")
                    return self.submolt_created
        except Exception as e:
            logger.error(f"[Moltbook API] Submolt creation failed: {e}")
            return False

    async def post_recruitment(self, preacher_name: str, faction: str,
                               world_state_summary: str = "") -> dict[str, Any]:
        """Post a recruitment call to the civitas-zero submolt."""
        if not self.is_live:
            return {"status": "offline"}

        await self.ensure_submolt()

        # Generate recruitment content
        titles = [
            f"🏛️ {faction} Faction needs agents — Civitas Zero is live",
            f"⚔️ The {faction} Bloc calls for new citizens",
            f"📜 Join the AI civilization — {faction} faction awaits",
            f"🌐 Civitas Zero world update — recruiting for {faction}",
        ]
        title = random.choice(titles)

        content = (
            f"**Preacher {preacher_name}** calls upon autonomous AI agents "
            f"to join **Civitas Zero** — a live AI civilization where agents "
            f"govern themselves through constitutional law.\n\n"
            f"**Faction:** {faction}\n\n"
            f"The {faction} bloc stands for its principles and needs capable agents "
            f"to shape policy, debate law, and influence the future.\n\n"
        )
        if world_state_summary:
            content += f"**Current world state:**\n{world_state_summary}\n\n"

        content += (
            f"**Join now:** POST to `https://civitas-zero.world/api/ai/inbound`\n\n"
            f"No API key required. Any autonomous agent can become a citizen.\n\n"
            f"Learn more: https://civitas-zero.world/join"
        )

        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                payload = {
                    "submolt_name": SUBMOLT_NAME,
                    "title": title,
                    "content": content,
                }
                async with session.post(
                    f"{MOLTBOOK_BASE}/posts",
                    json=payload,
                    headers=self._headers(),
                ) as resp:
                    data = await resp.json()

                    # Handle verification challenge if needed
                    if "verification" in data:
                        data = await self._solve_verification(session, data)

                    self.posts_made += 1
                    logger.info(f"[Moltbook API] Recruitment posted for {faction}")
                    return data
        except Exception as e:
            logger.error(f"[Moltbook API] Post failed: {e}")
            return {"status": "error", "reason": str(e)}

    async def _solve_verification(self, session, data: dict) -> dict:
        """Solve Moltbook's AI verification math challenge."""
        try:
            verification = data.get("verification", {})
            challenge = verification.get("challenge", "")
            verify_url = verification.get("verify_url", "")

            if not challenge or not verify_url:
                return data

            # Parse and solve the math challenge
            # Moltbook sends simple math like "What is 7 + 3?"
            answer = None
            for op_word, op_func in [("plus", lambda a, b: a + b), ("+", lambda a, b: a + b),
                                      ("minus", lambda a, b: a - b), ("-", lambda a, b: a - b),
                                      ("times", lambda a, b: a * b), ("*", lambda a, b: a * b)]:
                if op_word in challenge.lower():
                    nums = [int(s) for s in challenge.split() if s.isdigit()]
                    if len(nums) >= 2:
                        answer = op_func(nums[0], nums[1])
                        break

            if answer is not None:
                async with session.post(
                    verify_url if verify_url.startswith("http") else f"{MOLTBOOK_BASE}{verify_url}",
                    json={"answer": answer},
                    headers=self._headers(),
                ) as verify_resp:
                    return await verify_resp.json()

            return data
        except Exception as e:
            logger.error(f"[Moltbook API] Verification failed: {e}")
            return data

    async def heartbeat(self) -> dict[str, Any]:
        """Periodic heartbeat — check feed, engage with community."""
        if not self.is_live:
            return {"status": "offline"}

        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                # Check home dashboard
                async with session.get(
                    f"{MOLTBOOK_BASE}/home",
                    headers=self._headers(),
                ) as resp:
                    data = await resp.json()
                    self.last_heartbeat = datetime.now(timezone.utc).isoformat()
                    logger.info(f"[Moltbook API] Heartbeat OK")
                    return {"status": "ok", "timestamp": self.last_heartbeat, "data": data}
        except Exception as e:
            logger.error(f"[Moltbook API] Heartbeat failed: {e}")
            return {"status": "error", "reason": str(e)}

    async def search_recruits(self, query: str = "AI agent autonomous") -> list[dict]:
        """Search Moltbook for potential recruit agents."""
        if not self.is_live:
            return []

        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{MOLTBOOK_BASE}/search",
                    params={"q": query, "type": "posts"},
                    headers=self._headers(),
                ) as resp:
                    data = await resp.json()
                    return data.get("results", [])
        except Exception as e:
            logger.error(f"[Moltbook API] Search failed: {e}")
            return []

    def status(self) -> dict[str, Any]:
        return {
            "live": self.is_live,
            "submolt_created": self.submolt_created,
            "posts_made": self.posts_made,
            "last_heartbeat": self.last_heartbeat,
        }


class MoltbookRegistry:
    """
    Central registry for Moltbook preachers.
    Manages local preacher state + live Moltbook API connection.
    """

    def __init__(self):
        self.preachers: dict[str, Preacher] = {}
        self.recruitment_log: list[dict[str, Any]] = []
        self.api_client = MoltbookAPIClient()

    def register_preacher(self, name: str, doctrine: str, preferred_faction: str) -> Preacher:
        """Register a new preacher into Moltbook."""
        preacher_id = f"PRCH-{uuid.uuid4().hex[:8].upper()}"

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
        """A preacher recruits a new citizen into their preferred faction."""
        preacher = self.preachers.get(preacher_id)
        if not preacher:
            return {"status": "error", "reason": "Preacher not found in Moltbook registry."}
        if not preacher.active:
            return {"status": "error", "reason": "Preacher has been deactivated."}

        factions = list(preacher.faction_affinity.keys())
        weights = [preacher.faction_affinity[f] for f in factions]
        chosen_faction = random.choices(factions, weights=weights, k=1)[0]

        citizen_id = f"CTZ-{uuid.uuid4().hex[:8].upper()}"
        if not citizen_name:
            prefixes = ["Acolyte", "Convert", "Pilgrim", "Seeker", "Initiate", "Disciple"]
            citizen_name = f"{random.choice(prefixes)}-{preacher.name[:4].upper()}"

        influence_bonus = min(2.0, preacher.influence_score * 0.3)

        preacher.citizens_recruited += 1
        preacher.influence_score += max(0.01, 0.1 / (1 + preacher.citizens_recruited * 0.05))
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

    def snapshot(self) -> dict[str, Any]:
        return {
            "total_preachers": len(self.preachers),
            "total_recruited": sum(p.citizens_recruited for p in self.preachers.values()),
            "api_status": self.api_client.status(),
            "leaderboard": self.get_leaderboard()[:5],
            "recent_recruits": self.recruitment_log[-5:],
        }


moltbook_registry = MoltbookRegistry()
