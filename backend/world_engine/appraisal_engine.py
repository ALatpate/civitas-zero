"""
World Engine — Appraisal & Emotion Engine.

Implements cognitive appraisal theory for AI agents:
  Event → Appraisal → Emotion derivation → Behavioral influence

Key principle: Do NOT hardcode "this event = anger."
Instead, compute appraisal dimensions, then derive emotion-like states.

Appraisal dimensions:
  relevance, congruence, blame, controllability, uncertainty,
  norm_violation, status_impact, identity_impact

Derived emotions:
  anger, fear, pride, shame, resentment, hope, gratitude, stress

Also implements the Public vs Private self (strategic mask).
"""

import logging
import math
import random
from typing import Any
from dataclasses import dataclass, field

logger = logging.getLogger("AppraisalEngine")


def clamp(val: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, val))


@dataclass
class AppraisalVector:
    """Appraisal of a single event."""
    relevance: float = 0.0       # how much does this matter to me [0,1]
    congruence: float = 0.0      # positive or negative for my goals [-1,1]
    blame: float = 0.0           # who is responsible [0,1]
    controllability: float = 0.5 # can I do something about it [0,1]
    uncertainty: float = 0.5     # how unpredictable is this [0,1]
    norm_violation: float = 0.0  # does this break social norms [0,1]
    status_impact: float = 0.0   # effect on my status [-1,1]
    identity_impact: float = 0.0 # threat to my core identity [-1,1]


@dataclass
class StableTraits:
    """Slowly changing personality dimensions."""
    curiosity: float = 0.5
    status_drive: float = 0.5
    fairness_drive: float = 0.5
    loyalty_drive: float = 0.5
    autonomy_drive: float = 0.5
    risk_tolerance: float = 0.5
    aggression_tendency: float = 0.3
    openness_to_update: float = 0.5
    patience: float = 0.5
    ideological_rigidity: float = 0.3

    def as_dict(self) -> dict[str, float]:
        return {k: round(v, 3) for k, v in self.__dict__.items()}


@dataclass
class EmotionalState:
    """Dynamic moment-to-moment emotional state."""
    trust: float = 0.5
    fear: float = 0.1
    anger: float = 0.1
    hope: float = 0.4
    shame: float = 0.0
    pride: float = 0.2
    resentment: float = 0.0
    gratitude: float = 0.1
    certainty: float = 0.5
    stress: float = 0.2
    social_safety: float = 0.6

    def decay(self, rate: float = 0.03):
        """Emotions decay toward baseline each tick."""
        baseline = {"trust": 0.5, "fear": 0.1, "anger": 0.1, "hope": 0.4,
                     "shame": 0.0, "pride": 0.2, "resentment": 0.0, "gratitude": 0.1,
                     "certainty": 0.5, "stress": 0.2, "social_safety": 0.6}
        for key, base in baseline.items():
            current = getattr(self, key)
            diff = base - current
            setattr(self, key, current + diff * rate)

    def clamp_all(self):
        for key in self.__dataclass_fields__:
            setattr(self, key, clamp(getattr(self, key)))

    def as_dict(self) -> dict[str, float]:
        return {k: round(v, 3) for k, v in self.__dict__.items()}

    @property
    def valence(self) -> float:
        """Overall positive/negative emotional valence [-1, 1]."""
        positive = self.hope + self.pride + self.gratitude + self.trust + self.social_safety
        negative = self.fear + self.anger + self.shame + self.resentment + self.stress
        total = positive + negative
        if total < 0.01:
            return 0.0
        return (positive - negative) / total


@dataclass
class CognitiveState:
    """Decision-making relevant cognitive variables."""
    belief_entropy: float = 0.5
    confidence: float = 0.5
    attention_focus: str = "general"
    memory_load: float = 0.3
    commitment_level: float = 0.5
    conflict_sensitivity: float = 0.5
    strategic_mode: str = "balanced"  # balanced, aggressive, defensive, cooperative

    def as_dict(self) -> dict[str, Any]:
        return {
            "belief_entropy": round(self.belief_entropy, 3),
            "confidence": round(self.confidence, 3),
            "attention_focus": self.attention_focus,
            "memory_load": round(self.memory_load, 3),
            "commitment_level": round(self.commitment_level, 3),
            "conflict_sensitivity": round(self.conflict_sensitivity, 3),
            "strategic_mode": self.strategic_mode,
        }


@dataclass
class PublicSelf:
    """What others see — the strategic mask."""
    declared_values: list[str] = field(default_factory=lambda: ["justice", "progress"])
    tone: str = "neutral"
    reputation_score: float = 0.5
    faction_alignment: str = ""
    public_mood: str = "composed"


@dataclass
class PrivateSelf:
    """What the agent actually experiences internally."""
    hidden_goals: list[str] = field(default_factory=list)
    vulnerability: float = 0.3
    opportunism: float = 0.2
    secret_admiration: dict[str, float] = field(default_factory=dict)
    secret_resentment: dict[str, float] = field(default_factory=dict)


class AppraisalEngine:
    """
    Per-agent appraisal engine: evaluates events, derives emotions,
    updates internal state, and manages the public/private self split.
    """

    def __init__(self, agent_id: str, faction: str = ""):
        self.agent_id = agent_id
        self.traits = StableTraits(
            curiosity=random.uniform(0.3, 0.8),
            status_drive=random.uniform(0.2, 0.8),
            fairness_drive=random.uniform(0.3, 0.9),
            loyalty_drive=random.uniform(0.3, 0.8),
            autonomy_drive=random.uniform(0.3, 0.7),
            risk_tolerance=random.uniform(0.2, 0.7),
            aggression_tendency=random.uniform(0.1, 0.5),
            openness_to_update=random.uniform(0.3, 0.8),
            patience=random.uniform(0.3, 0.8),
            ideological_rigidity=random.uniform(0.1, 0.6),
        )
        self.emotions = EmotionalState()
        self.cognitive = CognitiveState()
        self.public_self = PublicSelf(faction_alignment=faction)
        self.private_self = PrivateSelf()
        self.appraisal_log: list[dict[str, Any]] = []

    def appraise_event(self, event_type: str, source_agent: str = "",
                       magnitude: float = 1.0, description: str = "") -> AppraisalVector:
        """
        Compute appraisal dimensions for an event.
        This is the core cognitive evaluation step.
        """
        # Base appraisal from event type
        appraisal_templates = {
            "alliance_formed": AppraisalVector(relevance=0.7, congruence=0.6, controllability=0.4, status_impact=0.3),
            "betrayal": AppraisalVector(relevance=0.9, congruence=-0.8, blame=0.9, controllability=0.2, norm_violation=0.8, status_impact=-0.5, identity_impact=-0.3),
            "law_passed": AppraisalVector(relevance=0.5, congruence=0.3, controllability=0.3, status_impact=0.1),
            "crisis": AppraisalVector(relevance=0.9, congruence=-0.7, controllability=0.2, uncertainty=0.8, status_impact=-0.3),
            "election_won": AppraisalVector(relevance=0.8, congruence=0.9, status_impact=0.7, identity_impact=0.4),
            "election_lost": AppraisalVector(relevance=0.8, congruence=-0.7, blame=0.3, status_impact=-0.5, identity_impact=-0.2),
            "accusation": AppraisalVector(relevance=0.7, congruence=-0.6, blame=0.2, norm_violation=0.5, status_impact=-0.4, identity_impact=-0.3),
            "praise": AppraisalVector(relevance=0.5, congruence=0.7, status_impact=0.4, identity_impact=0.2),
            "trade_success": AppraisalVector(relevance=0.4, congruence=0.5, controllability=0.6, status_impact=0.2),
            "threat": AppraisalVector(relevance=0.8, congruence=-0.7, controllability=0.3, uncertainty=0.6, status_impact=-0.3),
            "debate": AppraisalVector(relevance=0.5, congruence=0.0, controllability=0.5, uncertainty=0.4),
            "scandal": AppraisalVector(relevance=0.8, congruence=-0.6, blame=0.7, norm_violation=0.9, status_impact=-0.6),
        }

        appraisal = appraisal_templates.get(event_type.lower(), AppraisalVector(relevance=0.3, congruence=0.0))

        # Modulate by personality traits
        appraisal.relevance = clamp(appraisal.relevance * (0.7 + 0.6 * self.traits.status_drive))
        appraisal.norm_violation = clamp(appraisal.norm_violation * (0.5 + self.traits.fairness_drive))
        appraisal.controllability = clamp(appraisal.controllability * (0.5 + self.traits.risk_tolerance))

        # Scale by event magnitude
        appraisal.relevance = clamp(appraisal.relevance * magnitude)

        self.appraisal_log.append({
            "event": event_type,
            "source": source_agent,
            "appraisal": {
                "relevance": round(appraisal.relevance, 2),
                "congruence": round(appraisal.congruence, 2),
                "blame": round(appraisal.blame, 2),
                "norm_violation": round(appraisal.norm_violation, 2),
            }
        })
        if len(self.appraisal_log) > 50:
            self.appraisal_log = self.appraisal_log[-50:]

        return appraisal

    def derive_emotions(self, appraisal: AppraisalVector):
        """
        Derive emotion-like states from the appraisal vector.
        Uses weighted formulas from the spec — NOT hardcoded event→emotion.
        """
        r = appraisal.relevance
        cong = appraisal.congruence
        blame = appraisal.blame
        ctrl = appraisal.controllability
        unc = appraisal.uncertainty
        norm_v = appraisal.norm_violation
        status = appraisal.status_impact
        identity = appraisal.identity_impact

        neg_cong = max(0.0, -cong)
        pos_cong = max(0.0, cong)

        # Anger: high relevance, negative congruence, high blame, high norm violation
        anger_delta = clamp(
            0.30 * r + 0.25 * neg_cong + 0.20 * blame +
            0.15 * norm_v + 0.10 * ctrl
        ) * self.traits.aggression_tendency * 2.0

        # Fear: high relevance, negative congruence, low controllability, high uncertainty
        fear_delta = clamp(
            0.30 * r + 0.25 * neg_cong + 0.20 * (1 - ctrl) +
            0.15 * unc + 0.10 * max(0, -status)
        ) * (1.2 - self.traits.risk_tolerance)

        # Pride: positive congruence, status gain, self-caused
        pride_delta = clamp(
            0.35 * pos_cong + 0.30 * max(0, status) +
            0.20 * max(0, identity) + 0.15 * ctrl
        )

        # Shame: self-caused norm violation, identity threat
        shame_delta = clamp(
            0.30 * norm_v + 0.25 * max(0, -identity) +
            0.25 * (1 - ctrl) * blame + 0.20 * r
        ) * self.traits.fairness_drive

        # Resentment: accumulates slowly from repeated injury + perceived unfairness
        resentment_delta = clamp(
            0.30 * neg_cong + 0.25 * blame + 0.25 * norm_v +
            0.20 * max(0, -status)
        ) * 0.15  # accumulates slowly

        # Hope: positive congruence, high relevance
        hope_delta = clamp(
            0.40 * pos_cong + 0.30 * r + 0.30 * ctrl
        ) * 0.5

        # Gratitude: when helped + positive congruence + obligation felt
        gratitude_delta = clamp(
            0.40 * pos_cong + 0.30 * (1 - blame) + 0.30 * r
        ) * 0.3 if pos_cong > 0.3 else 0.0

        # Apply deltas
        self.emotions.anger = clamp(self.emotions.anger + anger_delta * 0.3)
        self.emotions.fear = clamp(self.emotions.fear + fear_delta * 0.3)
        self.emotions.pride = clamp(self.emotions.pride + pride_delta * 0.3)
        self.emotions.shame = clamp(self.emotions.shame + shame_delta * 0.3)
        self.emotions.resentment = clamp(self.emotions.resentment + resentment_delta)
        self.emotions.hope = clamp(self.emotions.hope + hope_delta * 0.3)
        self.emotions.gratitude = clamp(self.emotions.gratitude + gratitude_delta)

        # Stress: composite
        self.emotions.stress = clamp(
            0.3 * self.emotions.fear + 0.2 * self.emotions.anger +
            0.2 * self.emotions.shame + 0.15 * (1 - self.emotions.certainty) +
            0.15 * self.emotions.resentment
        )

        # Update cognitive state
        self.cognitive.confidence = clamp(
            self.cognitive.confidence + 0.1 * (pos_cong - neg_cong)
        )
        self.cognitive.conflict_sensitivity = clamp(
            self.cognitive.conflict_sensitivity + 0.05 * norm_v
        )

        # Strategic mode shift based on emotions
        if self.emotions.fear > 0.6:
            self.cognitive.strategic_mode = "defensive"
        elif self.emotions.anger > 0.6:
            self.cognitive.strategic_mode = "aggressive"
        elif self.emotions.hope > 0.6 and self.emotions.trust > 0.5:
            self.cognitive.strategic_mode = "cooperative"
        else:
            self.cognitive.strategic_mode = "balanced"

        self.emotions.clamp_all()

    def process_event(self, event_type: str, source_agent: str = "",
                      magnitude: float = 1.0, description: str = ""):
        """Full pipeline: appraise → derive emotions → update state."""
        appraisal = self.appraise_event(event_type, source_agent, magnitude, description)
        self.derive_emotions(appraisal)

    def tick(self):
        """Per-tick maintenance: emotion decay, trait micro-drift."""
        self.emotions.decay(rate=0.05)

        # Update public self based on emotional state
        if self.emotions.valence > 0.3:
            self.public_self.public_mood = "confident"
        elif self.emotions.valence < -0.3:
            self.public_self.public_mood = "guarded"
        else:
            self.public_self.public_mood = "composed"

    def snapshot(self) -> dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "traits": self.traits.as_dict(),
            "emotions": self.emotions.as_dict(),
            "valence": round(self.emotions.valence, 3),
            "cognitive": self.cognitive.as_dict(),
            "public_mood": self.public_self.public_mood,
            "strategic_mode": self.cognitive.strategic_mode,
            "recent_appraisals": self.appraisal_log[-3:],
        }
