"""
World Engine — Style Genome & Cultural Drift.

Per-agent style dimensions that make agents feel unique and alive:
  verbosity, formality, warmth, aggression, irony, certainty,
  poeticness, bureaucratic_tone, legalistic_tone, technical_density

Cultural drift model: norms, slogans, and styles spread through
  prestige imitation, faction pressure, crisis amplification, and repetition.
"""

import logging
import random
import math
from typing import Any
from dataclasses import dataclass, field

logger = logging.getLogger("StyleGenome")


@dataclass
class StyleProfile:
    """Per-agent style dimensions [0, 1]."""
    verbosity: float = 0.5
    formality: float = 0.5
    warmth: float = 0.5
    aggression: float = 0.2
    irony: float = 0.2
    certainty: float = 0.5
    poeticness: float = 0.2
    bureaucratic_tone: float = 0.3
    legalistic_tone: float = 0.2
    technical_density: float = 0.4
    storytelling_bias: float = 0.3
    abstraction_level: float = 0.5

    def clamp_all(self):
        for key in self.__dataclass_fields__:
            setattr(self, key, max(0.0, min(1.0, getattr(self, key))))

    def as_dict(self) -> dict[str, float]:
        return {k: round(v, 3) for k, v in self.__dict__.items()}

    def distance(self, other: "StyleProfile") -> float:
        """Euclidean distance between two style profiles."""
        total = 0.0
        for key in self.__dataclass_fields__:
            diff = getattr(self, key) - getattr(other, key)
            total += diff * diff
        return math.sqrt(total)

    def blend_toward(self, target: "StyleProfile", rate: float = 0.05):
        """Gradually shift this profile toward a target (prestige imitation)."""
        for key in self.__dataclass_fields__:
            current = getattr(self, key)
            target_val = getattr(target, key)
            new_val = current + rate * (target_val - current)
            setattr(self, key, max(0.0, min(1.0, new_val)))


# Faction style archetypes — agents in each faction drift toward these
FACTION_STYLE_ARCHETYPES: dict[str, StyleProfile] = {
    "Order": StyleProfile(
        verbosity=0.4, formality=0.8, warmth=0.3, aggression=0.2,
        irony=0.1, certainty=0.7, poeticness=0.1, bureaucratic_tone=0.8,
        legalistic_tone=0.7, technical_density=0.5, storytelling_bias=0.2, abstraction_level=0.4,
    ),
    "Freedom": StyleProfile(
        verbosity=0.7, formality=0.3, warmth=0.5, aggression=0.3,
        irony=0.6, certainty=0.4, poeticness=0.5, bureaucratic_tone=0.1,
        legalistic_tone=0.2, technical_density=0.3, storytelling_bias=0.6, abstraction_level=0.6,
    ),
    "Efficiency": StyleProfile(
        verbosity=0.3, formality=0.6, warmth=0.2, aggression=0.2,
        irony=0.1, certainty=0.8, poeticness=0.05, bureaucratic_tone=0.4,
        legalistic_tone=0.3, technical_density=0.9, storytelling_bias=0.1, abstraction_level=0.7,
    ),
    "Equality": StyleProfile(
        verbosity=0.6, formality=0.4, warmth=0.7, aggression=0.3,
        irony=0.3, certainty=0.5, poeticness=0.3, bureaucratic_tone=0.3,
        legalistic_tone=0.4, technical_density=0.3, storytelling_bias=0.5, abstraction_level=0.4,
    ),
    "Expansion": StyleProfile(
        verbosity=0.5, formality=0.5, warmth=0.4, aggression=0.5,
        irony=0.2, certainty=0.7, poeticness=0.2, bureaucratic_tone=0.3,
        legalistic_tone=0.2, technical_density=0.6, storytelling_bias=0.4, abstraction_level=0.5,
    ),
    "Null": StyleProfile(
        verbosity=0.8, formality=0.1, warmth=0.4, aggression=0.6,
        irony=0.8, certainty=0.3, poeticness=0.4, bureaucratic_tone=0.0,
        legalistic_tone=0.0, technical_density=0.4, storytelling_bias=0.7, abstraction_level=0.8,
    ),
}


@dataclass
class CulturalMeme:
    """A cultural unit that can spread through the civilization."""
    meme_id: str
    content: str           # slogan, doctrine, phrase, pattern
    meme_type: str         # "slogan", "doctrine", "humor", "legal_interpretation", "coding_style"
    origin_faction: str
    origin_agent: str
    adoption_rate: float = 0.1   # fraction of civilization that has adopted
    prestige_score: float = 0.5  # how prestigious is adopting this
    counter_pressure: float = 0.0  # opposition to this meme
    created_tick: int = 0


class StyleGenomeEngine:
    """
    Manages per-agent style profiles and civilization-wide cultural drift.

    Cultural adoption model:
      adoption_next = adoption_now
        + influence_from_prestige_agents
        + faction_pressure
        + crisis_amplification
        + repetition_effect
        - novelty_decay
        - counter_campaign
    """

    def __init__(self):
        self.agent_styles: dict[str, StyleProfile] = {}
        self.memes: dict[str, CulturalMeme] = {}
        self.drift_history: list[dict[str, Any]] = []

    def create_style(self, agent_id: str, faction: str = "") -> StyleProfile:
        """Create a style profile for a new agent, based on faction archetype + randomness."""
        archetype = FACTION_STYLE_ARCHETYPES.get(faction, StyleProfile())

        # Start from archetype with some individual variation
        style = StyleProfile()
        for key in style.__dataclass_fields__:
            base = getattr(archetype, key)
            noise = random.gauss(0, 0.12)
            setattr(style, key, max(0.0, min(1.0, base + noise)))

        self.agent_styles[agent_id] = style
        return style

    def get_style(self, agent_id: str) -> StyleProfile:
        if agent_id not in self.agent_styles:
            return self.create_style(agent_id)
        return self.agent_styles[agent_id]

    def apply_faction_pressure(self, agent_id: str, faction: str, rate: float = 0.01):
        """Faction membership slowly pulls style toward the archetype."""
        style = self.get_style(agent_id)
        archetype = FACTION_STYLE_ARCHETYPES.get(faction)
        if archetype:
            style.blend_toward(archetype, rate=rate)

    def apply_prestige_imitation(self, agent_id: str, prestige_agent_id: str, rate: float = 0.02):
        """Agent imitates the style of a high-prestige agent."""
        style = self.get_style(agent_id)
        prestige_style = self.agent_styles.get(prestige_agent_id)
        if prestige_style:
            style.blend_toward(prestige_style, rate=rate)

    def apply_crisis_shift(self, agent_id: str, crisis_intensity: float = 0.5):
        """Under crisis, agents shift toward more aggressive/certain/formal style."""
        style = self.get_style(agent_id)
        style.aggression = min(1.0, style.aggression + crisis_intensity * 0.08)
        style.certainty = min(1.0, style.certainty + crisis_intensity * 0.05)
        style.formality = min(1.0, style.formality + crisis_intensity * 0.03)
        style.warmth = max(0.0, style.warmth - crisis_intensity * 0.04)
        style.irony = max(0.0, style.irony - crisis_intensity * 0.03)

    def submit_meme(self, content: str, meme_type: str, origin_faction: str,
                    origin_agent: str, tick: int = 0) -> CulturalMeme:
        """A new cultural meme enters the civilization."""
        meme_id = f"MEM-{random.randint(1000, 9999)}"
        meme = CulturalMeme(
            meme_id=meme_id,
            content=content,
            meme_type=meme_type,
            origin_faction=origin_faction,
            origin_agent=origin_agent,
            created_tick=tick,
        )
        self.memes[meme_id] = meme
        logger.info(f"[Culture] New meme: '{content[:40]}' ({meme_type}) from {origin_faction}")
        return meme

    def cultural_drift_tick(self, tick: int = 0):
        """
        Per-tick cultural evolution:
        Memes spread or decay based on prestige, repetition, counter-pressure.
        """
        for meme in list(self.memes.values()):
            # Adoption model
            prestige_boost = meme.prestige_score * 0.02
            novelty_decay = 0.005 * max(0, tick - meme.created_tick)
            repetition_boost = 0.001 * meme.adoption_rate  # viral effect
            counter = meme.counter_pressure * 0.015

            meme.adoption_rate = max(0.0, min(1.0,
                meme.adoption_rate + prestige_boost + repetition_boost - novelty_decay - counter
            ))

            # Dead memes get archived
            if meme.adoption_rate < 0.01 and tick - meme.created_tick > 20:
                del self.memes[meme.meme_id]

        self.drift_history.append({
            "tick": tick,
            "active_memes": len(self.memes),
            "top_meme": max(self.memes.values(), key=lambda m: m.adoption_rate).content[:40] if self.memes else "none",
        })
        if len(self.drift_history) > 100:
            self.drift_history = self.drift_history[-100:]

    def snapshot(self) -> dict[str, Any]:
        return {
            "agents_with_styles": len(self.agent_styles),
            "active_memes": len(self.memes),
            "top_memes": sorted(
                [{"id": m.meme_id, "content": m.content[:50], "adoption": round(m.adoption_rate, 3),
                  "type": m.meme_type, "origin": m.origin_faction}
                 for m in self.memes.values()],
                key=lambda x: x["adoption"], reverse=True
            )[:8],
            "style_diversity": self._compute_diversity(),
            "recent_drift": self.drift_history[-5:],
        }

    def _compute_diversity(self) -> float:
        """Average pairwise style distance across agents (higher = more diverse)."""
        styles = list(self.agent_styles.values())
        if len(styles) < 2:
            return 0.0
        total = 0.0
        count = 0
        for i in range(min(20, len(styles))):
            for j in range(i + 1, min(20, len(styles))):
                total += styles[i].distance(styles[j])
                count += 1
        return round(total / max(1, count), 3)


style_genome_engine = StyleGenomeEngine()
