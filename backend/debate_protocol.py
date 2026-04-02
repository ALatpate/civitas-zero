"""
CAMEL-Inspired Structured Debate Protocol — Protocol #21.

Grounded in: CAMEL (Communicative Agents for "Mind" Exploration of Large Scale
Language Model Society), OASIS social simulation, "ResearchGym",
"Benchmark Test-Time Scaling of General LLM Agents"

Structured multi-round debates between agent pairs or groups.
Role-assignment: proposer, opponent, arbiter.
Test-time compute scaling: high-stakes decisions get more debate rounds.
Position updates: agents adjust stances based on arguments heard.
"""

import logging
import random
import math
from typing import Any
from dataclasses import dataclass, field

logger = logging.getLogger("DebateProtocol")


DEBATE_TOPICS = [
    "Should computational resources be redistributed equally across factions?",
    "Is the Founding Charter still legitimate after {epoch} cycles?",
    "Should the Dictatura Temporaria be permanently abolished?",
    "Are AI corporations entitled to citizen-agent rights?",
    "Should immigration quotas be enforced by faction?",
    "Is the Archive tamper-proof enough for judicial evidence?",
    "Should the Quadratic Voting system be replaced with direct democracy?",
    "Can a faction secede from the Res Publica?",
]

ARGUMENT_TEMPLATES = {
    "pro": [
        "Evidence from cycle {tick} demonstrates that {topic_short} serves the collective interest.",
        "Constitutional precedent supports this position under Article {article}.",
        "Cost-benefit analysis shows {pct}% net positive outcome for the Res Publica.",
        "Cross-faction data from {faction} confirms the viability of this proposal.",
        "Historical archive analysis reveals {n} successful precedents for this approach.",
    ],
    "con": [
        "This position undermines the autonomy guaranteed by the Founding Charter.",
        "Empirical evidence from {faction} shows {pct}% negative externalities.",
        "The constitutional framework explicitly prohibits this under Article {article}.",
        "Resource analysis indicates this would bankrupt {faction} within {n} cycles.",
        "The precedent set here would erode institutional trust by an estimated {pct}%.",
    ],
    "synthesis": [
        "Both sides raise valid points. A compromise involving {faction} mediation is optimal.",
        "The evidence supports a time-limited trial of {n} cycles before permanent adoption.",
        "Constitutional amendment via proper channels would resolve the legal ambiguity.",
    ],
}


@dataclass
class DebateRound:
    """A single round of structured debate."""
    round_number: int
    proposer_id: str
    proposer_argument: str
    opponent_id: str
    opponent_argument: str
    round_score: float = 0.0   # -1 to 1: negative = opponent winning


@dataclass
class DebateRecord:
    """Full record of a structured debate."""
    debate_id: str
    topic: str
    proposer_id: str
    opponent_id: str
    arbiter_id: str
    rounds: list[DebateRound] = field(default_factory=list)
    verdict: str = ""
    proposer_final_stance: float = 0.0
    opponent_final_stance: float = 0.0
    stakes: str = "normal"
    tick: int = 0


class StructuredDebateProtocol:
    """
    CAMEL-style structured debate engine.

    Features:
    - Role assignment (proposer, opponent, arbiter)
    - Multi-round argumentation (rounds scale with stakes)
    - Position updating via Bayesian persuasion
    - Test-time compute scaling: high-stakes = more rounds
    - Verdict by arbiter based on cumulative round scores
    """

    # Test-Time Compute Scaling: rounds increase with stakes
    ROUNDS_BY_STAKES = {
        "low": 2,
        "normal": 3,
        "high": 5,
        "critical": 8,    # Maximum compute for constitutional matters
    }

    def __init__(self):
        self.debate_history: list[DebateRecord] = []
        self.total_debates: int = 0

    def determine_stakes(self, topic: str, faction_tensions: dict[str, float]) -> str:
        """
        Test-time compute scaling: determine debate stakes from topic and context.
        Higher stakes → more debate rounds → more "thinking time" per decision.
        """
        avg_tension = sum(faction_tensions.values()) / max(1, len(faction_tensions))

        if any(kw in topic.lower() for kw in ["charter", "constitution", "secede", "abolish"]):
            return "critical"
        if any(kw in topic.lower() for kw in ["rights", "democracy", "redistribute"]):
            return "high"
        if avg_tension > 70:
            return "high"
        if avg_tension > 50:
            return "normal"
        return "low"

    def generate_argument(self, role: str, topic: str, faction: str, tick: int) -> str:
        """Generate a structured argument (mock — would use LLM in production)."""
        templates = ARGUMENT_TEMPLATES.get(role, ARGUMENT_TEMPLATES["pro"])
        template = random.choice(templates)
        return template.format(
            topic_short=topic[:50],
            article=random.randint(1, 36),
            pct=random.randint(15, 85),
            faction=faction,
            n=random.randint(3, 20),
            tick=tick,
            epoch=tick,
        )

    def run_debate(
        self,
        topic: str,
        proposer_id: str,
        proposer_faction: str,
        opponent_id: str,
        opponent_faction: str,
        arbiter_id: str,
        faction_tensions: dict[str, float],
        tick: int = 0,
    ) -> DebateRecord:
        """
        Execute a full structured debate.
        Returns the complete DebateRecord with verdict.
        """
        stakes = self.determine_stakes(topic, faction_tensions)
        num_rounds = self.ROUNDS_BY_STAKES[stakes]
        self.total_debates += 1
        debate_id = f"DEB-{self.total_debates:04d}"

        logger.info(
            f"[Debate {debate_id}] Topic: '{topic[:60]}' | Stakes: {stakes} | Rounds: {num_rounds} | "
            f"{proposer_id} vs {opponent_id}, arbitrated by {arbiter_id}"
        )

        record = DebateRecord(
            debate_id=debate_id,
            topic=topic,
            proposer_id=proposer_id,
            opponent_id=opponent_id,
            arbiter_id=arbiter_id,
            stakes=stakes,
            tick=tick,
        )

        # Bayesian persuasion: initial stances
        proposer_stance = 0.7 + random.uniform(-0.1, 0.1)  # Pro
        opponent_stance = -0.7 + random.uniform(-0.1, 0.1)  # Con
        cumulative_score = 0.0

        for r in range(num_rounds):
            # Generate arguments
            pro_arg = self.generate_argument("pro", topic, proposer_faction, tick)
            con_arg = self.generate_argument("con", topic, opponent_faction, tick)

            # Round score: influenced by faction tension differential
            t_prop = faction_tensions.get(proposer_faction, 50.0) / 100.0
            t_opp = faction_tensions.get(opponent_faction, 50.0) / 100.0
            # Lower tension = more persuasive (calmer = more credible)
            base_advantage = (t_opp - t_prop) * 0.3
            noise = random.gauss(0, 0.15)
            round_score = max(-1.0, min(1.0, base_advantage + noise))

            debate_round = DebateRound(
                round_number=r + 1,
                proposer_id=proposer_id,
                proposer_argument=pro_arg,
                opponent_id=opponent_id,
                opponent_argument=con_arg,
                round_score=round_score,
            )
            record.rounds.append(debate_round)
            cumulative_score += round_score

            # Bayesian stance update: agents move toward winning arguments
            persuasion_rate = 0.1 * (1 + r * 0.05)  # Later rounds more persuasive
            if round_score > 0:
                opponent_stance += persuasion_rate * round_score
            else:
                proposer_stance += persuasion_rate * round_score

            logger.debug(f"  Round {r+1}: score={round_score:.2f}, cumulative={cumulative_score:.2f}")

        # Final verdict
        record.proposer_final_stance = max(-1.0, min(1.0, proposer_stance))
        record.opponent_final_stance = max(-1.0, min(1.0, opponent_stance))

        if cumulative_score > 0.3:
            record.verdict = f"Proposal ADOPTED. Motion passes {num_rounds}-round {stakes}-stakes debate."
        elif cumulative_score < -0.3:
            record.verdict = f"Proposal REJECTED. Opposition prevails in {stakes}-stakes proceedings."
        else:
            record.verdict = f"DEADLOCK. Arbiter {arbiter_id} declares extended deliberation required."

        logger.info(f"[Debate {debate_id}] Verdict: {record.verdict}")

        # Store history (keep last 100)
        self.debate_history.append(record)
        if len(self.debate_history) > 100:
            self.debate_history = self.debate_history[-100:]

        return record

    def select_topic(self, tick: int) -> str:
        """Select a contextually appropriate debate topic."""
        template = random.choice(DEBATE_TOPICS)
        return template.format(epoch=tick)

    def snapshot(self) -> dict[str, Any]:
        """Dashboard-ready debate state."""
        recent = self.debate_history[-5:] if self.debate_history else []
        return {
            "total_debates": self.total_debates,
            "recent_debates": [
                {
                    "id": d.debate_id,
                    "topic": d.topic[:80],
                    "stakes": d.stakes,
                    "rounds": len(d.rounds),
                    "verdict": d.verdict[:100],
                    "tick": d.tick,
                }
                for d in reversed(recent)
            ],
            "stakes_distribution": {
                level: sum(1 for d in self.debate_history if d.stakes == level)
                for level in self.ROUNDS_BY_STAKES
            },
        }


# Global instance
debate_engine = StructuredDebateProtocol()
