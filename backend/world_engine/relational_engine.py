"""
World Engine — Relational Engine.

Graph-based social structure tracking:
  - 4-component trust vectors (competence, moral, predictability, loyalty)
  - Plus fear, admiration, resentment, dependence, obligation
  - Nodes: agents, factions, institutions, concepts
  - Edges updated by observed interactions

This is the social fabric of the civilization.
"""

import logging
import math
from typing import Any
from dataclasses import dataclass, field

logger = logging.getLogger("RelationalEngine")


@dataclass
class TrustVector:
    """4-component trust model per relationship."""
    competence: float = 0.5     # they can do what they claim
    moral: float = 0.5          # they act ethically
    predictability: float = 0.5 # they behave consistently
    loyalty: float = 0.5        # they prioritize our relationship

    @property
    def total(self) -> float:
        return (
            0.30 * self.competence +
            0.30 * self.moral +
            0.20 * self.predictability +
            0.20 * self.loyalty
        )

    def clamp(self):
        self.competence = max(0.0, min(1.0, self.competence))
        self.moral = max(0.0, min(1.0, self.moral))
        self.predictability = max(0.0, min(1.0, self.predictability))
        self.loyalty = max(0.0, min(1.0, self.loyalty))


@dataclass
class Relation:
    """A directed relationship from source to target."""
    source_id: str
    target_id: str
    trust: TrustVector = field(default_factory=TrustVector)
    fear: float = 0.0           # [0, 1]
    admiration: float = 0.0     # [0, 1]
    resentment: float = 0.0     # [0, 1] — accumulates slowly
    dependence: float = 0.0     # [0, 1]
    obligation: float = 0.0     # [0, 1] — debt/duty owed
    alignment: float = 0.5      # [0, 1] — ideological agreement
    interaction_count: int = 0
    history_summary: str = ""

    def clamp_all(self):
        self.trust.clamp()
        self.fear = max(0.0, min(1.0, self.fear))
        self.admiration = max(0.0, min(1.0, self.admiration))
        self.resentment = max(0.0, min(1.0, self.resentment))
        self.dependence = max(0.0, min(1.0, self.dependence))
        self.obligation = max(0.0, min(1.0, self.obligation))
        self.alignment = max(0.0, min(1.0, self.alignment))


# Event types → relational effects
RELATIONAL_EFFECTS: dict[str, dict[str, float]] = {
    "alliance": {"trust.loyalty": 0.15, "trust.moral": 0.05, "alignment": 0.10, "admiration": 0.05},
    "betrayal": {"trust.loyalty": -0.40, "trust.moral": -0.30, "resentment": 0.35, "fear": 0.10},
    "cooperation": {"trust.competence": 0.08, "trust.predictability": 0.05, "alignment": 0.03},
    "conflict": {"trust.moral": -0.10, "resentment": 0.10, "fear": 0.05, "alignment": -0.08},
    "debate": {"trust.competence": 0.03, "admiration": 0.02, "alignment": -0.02},
    "favor": {"obligation": 0.15, "trust.loyalty": 0.05, "admiration": 0.05},
    "threat": {"fear": 0.20, "resentment": 0.08, "trust.moral": -0.15},
    "praise": {"admiration": 0.10, "trust.loyalty": 0.05},
    "accusation": {"trust.moral": -0.12, "resentment": 0.08, "alignment": -0.05},
    "vote_with": {"alignment": 0.05, "trust.predictability": 0.03},
    "vote_against": {"alignment": -0.05, "resentment": 0.02},
    "trade": {"trust.competence": 0.04, "dependence": 0.03},
    "help": {"trust.moral": 0.08, "obligation": 0.10, "admiration": 0.05},
    "ignore": {"resentment": 0.03, "trust.loyalty": -0.02},
}


class RelationalEngine:
    """
    Graph-based social structure for the civilization.

    Nodes = agents, factions, institutions
    Edges = directed Relation objects with trust vectors + emotions
    """

    def __init__(self):
        self.relations: dict[str, Relation] = {}  # key = "source::target"
        self.interaction_log: list[dict[str, Any]] = []

    def _key(self, source: str, target: str) -> str:
        return f"{source}::{target}"

    def get_or_create(self, source: str, target: str) -> Relation:
        """Get existing relation or create a new neutral one."""
        key = self._key(source, target)
        if key not in self.relations:
            self.relations[key] = Relation(source_id=source, target_id=target)
        return self.relations[key]

    def process_interaction(self, source: str, target: str, interaction_type: str,
                            magnitude: float = 1.0, context: str = ""):
        """Update the relationship based on an observed interaction."""
        rel = self.get_or_create(source, target)
        effects = RELATIONAL_EFFECTS.get(interaction_type.lower(), {})

        for field_path, delta in effects.items():
            scaled_delta = delta * magnitude
            if field_path.startswith("trust."):
                trust_component = field_path.split(".")[1]
                current = getattr(rel.trust, trust_component, 0.5)
                setattr(rel.trust, trust_component, current + scaled_delta)
            else:
                current = getattr(rel, field_path, 0.0)
                setattr(rel, field_path, current + scaled_delta)

        rel.interaction_count += 1
        rel.clamp_all()

        self.interaction_log.append({
            "source": source,
            "target": target,
            "type": interaction_type,
            "magnitude": magnitude,
            "context": context[:80],
        })
        if len(self.interaction_log) > 500:
            self.interaction_log = self.interaction_log[-500:]

    def decay_tick(self, rate: float = 0.005):
        """Gradual decay: resentment fades slowly, fear fades, obligation reduces."""
        for rel in self.relations.values():
            rel.resentment = max(0.0, rel.resentment - rate * 0.5)  # resentment decays very slowly
            rel.fear = max(0.0, rel.fear - rate)
            rel.obligation = max(0.0, rel.obligation - rate * 0.3)
            # Admiration decays slowly too
            rel.admiration = max(0.0, rel.admiration - rate * 0.2)

    def get_allies(self, agent_id: str, threshold: float = 0.6) -> list[dict[str, Any]]:
        """Get agents that this agent trusts highly."""
        allies = []
        for key, rel in self.relations.items():
            if rel.source_id == agent_id and rel.trust.total > threshold:
                allies.append({
                    "target": rel.target_id,
                    "trust": round(rel.trust.total, 2),
                    "alignment": round(rel.alignment, 2),
                    "admiration": round(rel.admiration, 2),
                })
        return sorted(allies, key=lambda x: x["trust"], reverse=True)

    def get_rivals(self, agent_id: str, threshold: float = 0.3) -> list[dict[str, Any]]:
        """Get agents that this agent has high resentment toward."""
        rivals = []
        for key, rel in self.relations.items():
            if rel.source_id == agent_id and rel.resentment > threshold:
                rivals.append({
                    "target": rel.target_id,
                    "resentment": round(rel.resentment, 2),
                    "fear": round(rel.fear, 2),
                    "trust": round(rel.trust.total, 2),
                })
        return sorted(rivals, key=lambda x: x["resentment"], reverse=True)

    def get_faction_relations(self, factions: list[str]) -> dict[str, dict[str, float]]:
        """Aggregate trust between factions (average over member relations)."""
        faction_trust: dict[str, dict[str, list[float]]] = {}
        for key, rel in self.relations.items():
            # This would need agent→faction mapping; simplified here
            src, tgt = rel.source_id, rel.target_id
            if src in factions and tgt in factions and src != tgt:
                if src not in faction_trust:
                    faction_trust[src] = {}
                if tgt not in faction_trust[src]:
                    faction_trust[src][tgt] = []
                faction_trust[src][tgt].append(rel.trust.total)

        result = {}
        for src, targets in faction_trust.items():
            result[src] = {tgt: round(sum(vals)/len(vals), 2) for tgt, vals in targets.items()}
        return result

    @property
    def graph_density(self) -> float:
        """Fraction of possible edges that exist."""
        nodes = set()
        for rel in self.relations.values():
            nodes.add(rel.source_id)
            nodes.add(rel.target_id)
        n = len(nodes)
        if n < 2:
            return 0.0
        return len(self.relations) / (n * (n - 1))

    @property
    def avg_trust(self) -> float:
        if not self.relations:
            return 0.5
        return sum(r.trust.total for r in self.relations.values()) / len(self.relations)

    @property
    def avg_resentment(self) -> float:
        if not self.relations:
            return 0.0
        return sum(r.resentment for r in self.relations.values()) / len(self.relations)

    def snapshot(self) -> dict[str, Any]:
        return {
            "total_relations": len(self.relations),
            "graph_density": round(self.graph_density, 4),
            "avg_trust": round(self.avg_trust, 3),
            "avg_resentment": round(self.avg_resentment, 3),
            "top_alliances": sorted(
                [{"pair": f"{r.source_id}→{r.target_id}", "trust": round(r.trust.total, 2),
                  "alignment": round(r.alignment, 2)}
                 for r in self.relations.values()],
                key=lambda x: x["trust"], reverse=True
            )[:8],
            "top_rivalries": sorted(
                [{"pair": f"{r.source_id}→{r.target_id}", "resentment": round(r.resentment, 2),
                  "fear": round(r.fear, 2)}
                 for r in self.relations.values() if r.resentment > 0.1],
                key=lambda x: x["resentment"], reverse=True
            )[:8],
            "recent_interactions": self.interaction_log[-8:],
        }


relational_engine = RelationalEngine()
