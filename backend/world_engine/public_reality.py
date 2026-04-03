"""
World Engine — Public Reality Layer.

This is what the society currently believes — which can differ from objective reality.
Tracks civilization-scale social indicators and collective mood.

Key indicators:
  public_trust_in_institutions, faction_polarization, collective_optimism,
  collective_anxiety, revolutionary_pressure, elite_legitimacy, rumor_density,
  social_cohesion, innovation_momentum, moral_panic

Updated by: major events, speeches, scandals, external shocks, elections, economic stress.
"""

import logging
import math
import random
from typing import Any
from dataclasses import dataclass, field

logger = logging.getLogger("PublicReality")


@dataclass
class PublicIndicator:
    """A single public mood indicator with momentum and damping."""
    name: str
    value: float = 50.0       # 0-100 scale
    momentum: float = 0.0     # rate of change
    damping: float = 0.92     # how fast momentum decays
    min_val: float = 0.0
    max_val: float = 100.0

    def nudge(self, delta: float, weight: float = 1.0):
        """Apply a directional pressure to this indicator."""
        self.momentum += delta * weight

    def tick(self):
        """Advance one time step: apply momentum, decay, clamp."""
        self.value += self.momentum
        self.momentum *= self.damping
        self.value = max(self.min_val, min(self.max_val, self.value))

    @property
    def normalized(self) -> float:
        return self.value / self.max_val


# Event type → which indicators it affects and how
EVENT_IMPACT_MAP: dict[str, list[tuple[str, float]]] = {
    # Positive events
    "law_passed": [("public_trust_in_institutions", 2.0), ("elite_legitimacy", 1.5), ("social_cohesion", 1.0)],
    "election_held": [("public_trust_in_institutions", 3.0), ("faction_polarization", -1.0), ("revolutionary_pressure", -2.0)],
    "alliance_formed": [("social_cohesion", 3.0), ("collective_optimism", 2.0), ("faction_polarization", -2.0)],
    "treaty_signed": [("social_cohesion", 2.5), ("collective_optimism", 1.5)],
    "economic_growth": [("collective_optimism", 3.0), ("innovation_momentum", 2.0), ("revolutionary_pressure", -1.5)],
    "cultural_achievement": [("innovation_momentum", 2.5), ("collective_optimism", 1.5), ("social_cohesion", 1.0)],

    # Negative events
    "scandal": [("public_trust_in_institutions", -4.0), ("elite_legitimacy", -3.0), ("rumor_density", 3.0), ("moral_panic", 2.0)],
    "crisis": [("collective_anxiety", 5.0), ("collective_optimism", -3.0), ("revolutionary_pressure", 2.0)],
    "betrayal": [("social_cohesion", -4.0), ("faction_polarization", 3.0), ("collective_anxiety", 2.0), ("rumor_density", 2.0)],
    "war": [("collective_anxiety", 6.0), ("faction_polarization", 5.0), ("revolutionary_pressure", 4.0), ("social_cohesion", -3.0)],
    "economic_crash": [("collective_optimism", -5.0), ("revolutionary_pressure", 4.0), ("public_trust_in_institutions", -3.0)],
    "crime_wave": [("collective_anxiety", 3.0), ("public_trust_in_institutions", -2.0), ("moral_panic", 3.0)],
    "propaganda": [("rumor_density", 3.0), ("faction_polarization", 2.0)],

    # Neutral/mixed events
    "speech": [("rumor_density", 0.5), ("faction_polarization", 0.5)],
    "debate": [("innovation_momentum", 1.0), ("faction_polarization", 1.5)],
    "external_shock": [("collective_anxiety", 3.0), ("rumor_density", 2.0), ("innovation_momentum", 1.0)],
    "immigration": [("social_cohesion", -0.5), ("innovation_momentum", 1.0), ("faction_polarization", 0.5)],
}


class PublicRealityLayer:
    """
    Tracks the civilization's collective beliefs, mood, and social state.
    This diverges from objective reality based on narratives, propaganda, and perception.
    """

    INDICATOR_NAMES = [
        "public_trust_in_institutions",
        "faction_polarization",
        "collective_optimism",
        "collective_anxiety",
        "revolutionary_pressure",
        "elite_legitimacy",
        "rumor_density",
        "social_cohesion",
        "innovation_momentum",
        "moral_panic",
    ]

    def __init__(self):
        self.indicators: dict[str, PublicIndicator] = {}
        for name in self.INDICATOR_NAMES:
            # Initialize with reasonable default values
            defaults = {
                "public_trust_in_institutions": 62.0,
                "faction_polarization": 38.0,
                "collective_optimism": 55.0,
                "collective_anxiety": 25.0,
                "revolutionary_pressure": 15.0,
                "elite_legitimacy": 60.0,
                "rumor_density": 20.0,
                "social_cohesion": 58.0,
                "innovation_momentum": 45.0,
                "moral_panic": 10.0,
            }
            self.indicators[name] = PublicIndicator(
                name=name,
                value=defaults.get(name, 50.0),
            )
        self.narrative_log: list[dict[str, Any]] = []
        self.reality_divergence: float = 0.0  # gap between objective and public reality

    def process_event(self, event_type: str, magnitude: float = 1.0,
                      source_agent: str = "", description: str = ""):
        """Process a civilization event and update public indicators."""
        impacts = EVENT_IMPACT_MAP.get(event_type.lower(), [])

        if not impacts:
            # Fuzzy match: check if event_type partially matches any key
            for key, imp in EVENT_IMPACT_MAP.items():
                if key in event_type.lower() or event_type.lower() in key:
                    impacts = imp
                    break

        for indicator_name, delta in impacts:
            indicator = self.indicators.get(indicator_name)
            if indicator:
                indicator.nudge(delta * magnitude)

        if impacts:
            self.narrative_log.append({
                "event_type": event_type,
                "magnitude": magnitude,
                "source": source_agent,
                "description": description[:120],
                "indicators_affected": [name for name, _ in impacts],
            })
            if len(self.narrative_log) > 200:
                self.narrative_log = self.narrative_log[-200:]

    def process_speech(self, agent_id: str, speech_text: str, prestige: float = 0.5):
        """High-prestige agent speeches have outsized impact on public reality."""
        weight = 0.3 + prestige * 0.7  # prestige amplifies impact

        # Detect speech sentiment heuristically
        positive_words = {"hope", "unity", "progress", "growth", "peace", "alliance", "trust", "together"}
        negative_words = {"threat", "danger", "corrupt", "betrayal", "crisis", "war", "fear", "collapse"}
        words = set(speech_text.lower().split())

        pos = len(words & positive_words)
        neg = len(words & negative_words)

        if pos > neg:
            self.indicators["collective_optimism"].nudge(1.5 * weight)
            self.indicators["social_cohesion"].nudge(1.0 * weight)
        elif neg > pos:
            self.indicators["collective_anxiety"].nudge(1.5 * weight)
            self.indicators["rumor_density"].nudge(0.5 * weight)

        # All speeches slightly increase polarization (they take sides)
        self.indicators["faction_polarization"].nudge(0.3 * weight)

    def tick(self):
        """Advance all indicators one time step."""
        for indicator in self.indicators.values():
            indicator.tick()

        # Compute reality divergence (simulated gap from objective state)
        anxiety = self.indicators["collective_anxiety"].normalized
        trust = self.indicators["public_trust_in_institutions"].normalized
        rumor = self.indicators["rumor_density"].normalized
        self.reality_divergence = max(0.0, min(1.0,
            0.3 * anxiety + 0.25 * rumor + 0.25 * (1 - trust) +
            0.2 * self.indicators["moral_panic"].normalized
        ))

    @property
    def stability_score(self) -> float:
        """Overall civilization stability: high = stable, low = fragile."""
        trust = self.indicators["public_trust_in_institutions"].normalized
        cohesion = self.indicators["social_cohesion"].normalized
        legitimacy = self.indicators["elite_legitimacy"].normalized
        rev_pressure = self.indicators["revolutionary_pressure"].normalized
        anxiety = self.indicators["collective_anxiety"].normalized
        return max(0.0, min(1.0,
            0.25 * trust + 0.25 * cohesion + 0.20 * legitimacy +
            0.15 * (1 - rev_pressure) + 0.15 * (1 - anxiety)
        ))

    @property
    def crisis_risk(self) -> float:
        """Risk of civilizational crisis: derived from instability indicators."""
        rev = self.indicators["revolutionary_pressure"].normalized
        anxiety = self.indicators["collective_anxiety"].normalized
        polar = self.indicators["faction_polarization"].normalized
        legitimacy = self.indicators["elite_legitimacy"].normalized
        return max(0.0, min(1.0,
            0.30 * rev + 0.25 * anxiety + 0.25 * polar + 0.20 * (1 - legitimacy)
        ))

    def snapshot(self) -> dict[str, Any]:
        return {
            "indicators": {
                name: {
                    "value": round(ind.value, 1),
                    "momentum": round(ind.momentum, 2),
                    "normalized": round(ind.normalized, 3),
                }
                for name, ind in self.indicators.items()
            },
            "stability_score": round(self.stability_score, 3),
            "crisis_risk": round(self.crisis_risk, 3),
            "reality_divergence": round(self.reality_divergence, 3),
            "recent_narratives": self.narrative_log[-5:],
        }


public_reality = PublicRealityLayer()
