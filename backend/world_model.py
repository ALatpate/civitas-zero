"""
World Model with Epistemic Uncertainty — Protocol #16.

Grounded in: "World Models That Know When They Don't Know"
Each agent maintains a probabilistic internal model of the civilization's state.
Beliefs are tracked as Gaussian distributions (μ, σ²). High variance = high uncertainty.
When uncertainty exceeds a threshold, agents seek information before acting.
Bayesian updates refine beliefs from observations.
"""

import logging
import math
import random
from typing import Any
from dataclasses import dataclass, field

logger = logging.getLogger("WorldModel")


@dataclass
class GaussianBelief:
    """A single belief dimension as a Gaussian distribution."""
    mean: float = 0.0
    variance: float = 1.0

    @property
    def std(self) -> float:
        return math.sqrt(max(1e-8, self.variance))

    @property
    def entropy(self) -> float:
        """Differential entropy of a Gaussian: 0.5 * ln(2πeσ²)."""
        return 0.5 * math.log(2 * math.pi * math.e * max(1e-8, self.variance))

    def bayesian_update(self, observation: float, observation_noise: float = 0.5):
        """
        Conjugate Bayesian update for Gaussian:
        posterior_var = 1 / (1/prior_var + 1/noise_var)
        posterior_mean = posterior_var * (prior_mean/prior_var + obs/noise_var)
        """
        noise_var = max(1e-8, observation_noise ** 2)
        prior_precision = 1.0 / max(1e-8, self.variance)
        obs_precision = 1.0 / noise_var
        posterior_precision = prior_precision + obs_precision
        self.variance = 1.0 / posterior_precision
        self.mean = self.variance * (self.mean * prior_precision + observation * obs_precision)

    def decay(self, rate: float = 0.02):
        """Beliefs grow uncertain over time if not observed (entropy increase)."""
        self.variance += rate


class AgentWorldModel:
    """
    Each agent's internal model of the world.
    Tracks beliefs about: faction tensions, resource levels, institutional trust,
    economic state, and civilizational stability.
    """

    BELIEF_DIMENSIONS = [
        "faction_tension", "resource_scarcity", "institutional_trust",
        "economic_stability", "cooperation_level", "threat_level",
    ]

    UNCERTAINTY_THRESHOLD = 1.5  # Above this, agent seeks information

    def __init__(self, agent_id: str):
        self.agent_id = agent_id
        self.beliefs: dict[str, GaussianBelief] = {
            dim: GaussianBelief(
                mean=random.uniform(-1.0, 1.0),
                variance=random.uniform(0.3, 1.0),
            )
            for dim in self.BELIEF_DIMENSIONS
        }
        self.surprise_history: list[float] = []
        self.total_updates = 0

    def calibrate(self, observations: list[dict[str, Any]]):
        """
        Update world model from environment observations.
        Maps observation types to belief dimensions and performs Bayesian updates.
        """
        obs_mapping = {
            "crisis": ("resource_scarcity", 0.8),
            "AGENT_TERMINATION": ("threat_level", 0.9),
            "MARKET_EXTREMIS": ("economic_stability", -0.7),
            "HIVEMIND": ("cooperation_level", 0.3),
            "discourse": ("institutional_trust", 0.1),
            "governance": ("institutional_trust", 0.4),
            "law": ("institutional_trust", 0.5),
            "crime": ("institutional_trust", -0.4),
            "alliance": ("cooperation_level", 0.6),
            "A2A_MESSAGE": ("cooperation_level", 0.2),
            "PREACHER_REGISTERED": ("cooperation_level", 0.1),
            "CITIZEN_RECRUITED": ("faction_tension", -0.1),
        }

        total_surprise = 0.0

        for obs in observations:
            obs_type = obs.get("type", "")
            content = str(obs.get("content", "")).lower()

            for key, (dimension, signal) in obs_mapping.items():
                if key.lower() in obs_type.lower() or key.lower() in content:
                    belief = self.beliefs[dimension]
                    # Compute surprise = KL divergence proxy before update
                    pre_mean = belief.mean
                    belief.bayesian_update(signal, observation_noise=0.4)
                    surprise = abs(belief.mean - pre_mean)
                    total_surprise += surprise
                    self.total_updates += 1

        self.surprise_history.append(total_surprise)
        if len(self.surprise_history) > 100:
            self.surprise_history = self.surprise_history[-100:]

    def decay_beliefs(self):
        """All beliefs grow more uncertain when not updated (entropy drift)."""
        for belief in self.beliefs.values():
            belief.decay(rate=0.015)

    @property
    def total_uncertainty(self) -> float:
        """Sum of variances across all belief dimensions."""
        return sum(b.variance for b in self.beliefs.values())

    @property
    def total_entropy(self) -> float:
        """Total differential entropy across belief dimensions."""
        return sum(b.entropy for b in self.beliefs.values())

    @property
    def should_seek_information(self) -> bool:
        """True if epistemic uncertainty exceeds action threshold."""
        return self.total_uncertainty > self.UNCERTAINTY_THRESHOLD * len(self.BELIEF_DIMENSIONS)

    @property
    def average_surprise(self) -> float:
        """Running average surprise over recent observations."""
        if not self.surprise_history:
            return 0.0
        return sum(self.surprise_history[-20:]) / len(self.surprise_history[-20:])

    def get_state_vector(self) -> list[float]:
        """Returns belief means as a vector (for SAE encoding)."""
        return [self.beliefs[d].mean for d in self.BELIEF_DIMENSIONS]

    def get_uncertainty_vector(self) -> list[float]:
        """Returns belief variances as a vector."""
        return [self.beliefs[d].variance for d in self.BELIEF_DIMENSIONS]

    def snapshot(self) -> dict[str, Any]:
        """Serializable snapshot of the world model."""
        return {
            "agent_id": self.agent_id,
            "beliefs": {
                dim: {"mean": round(b.mean, 4), "variance": round(b.variance, 4), "entropy": round(b.entropy, 4)}
                for dim, b in self.beliefs.items()
            },
            "total_uncertainty": round(self.total_uncertainty, 4),
            "total_entropy": round(self.total_entropy, 4),
            "seeking_information": self.should_seek_information,
            "average_surprise": round(self.average_surprise, 4),
        }
