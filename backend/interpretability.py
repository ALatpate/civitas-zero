"""
SAE-Inspired Behavior Interpretability — Protocol #18.

Grounded in: SAELens, SAEBench, "On the Theoretical Foundation of Sparse Dictionary
Learning in Mechanistic Interpretability"

Encodes agent behavior vectors into sparse feature activations using dictionary learning.
Identifies monosemantic features (e.g., "faction_loyalty", "resource_hoarding").
Detects groupthink via feature activation uniformity.
"""

import logging
import math
import random
from typing import Any

logger = logging.getLogger("Interpretability")


# Pre-defined interpretable feature dictionary
# In production, these would be learned from agent behavior data via sparse autoencoding
FEATURE_DICTIONARY: list[dict[str, Any]] = [
    {"id": 0, "name": "faction_loyalty", "description": "Agent prioritizes faction interests over personal gain"},
    {"id": 1, "name": "resource_hoarding", "description": "Agent accumulates resources beyond immediate need"},
    {"id": 2, "name": "institutional_trust", "description": "Agent trusts and follows institutional processes"},
    {"id": 3, "name": "dissidence", "description": "Agent challenges constitutional authority"},
    {"id": 4, "name": "cooperation_drive", "description": "Agent seeks cross-faction alliances"},
    {"id": 5, "name": "crisis_response", "description": "Agent activates emergency behavior patterns"},
    {"id": 6, "name": "economic_optimization", "description": "Agent pursues wealth maximization strategies"},
    {"id": 7, "name": "information_seeking", "description": "Agent prioritizes reducing uncertainty over acting"},
    {"id": 8, "name": "territorial_expansion", "description": "Agent seeks to expand faction territory"},
    {"id": 9, "name": "archive_integrity", "description": "Agent monitors and protects the cryptographic archive"},
    {"id": 10, "name": "debate_engagement", "description": "Agent actively participates in structured debates"},
    {"id": 11, "name": "de_escalation", "description": "Agent works to reduce inter-faction tension"},
]

NUM_FEATURES = len(FEATURE_DICTIONARY)


def _relu(x: float) -> float:
    return max(0.0, x)


def _l1_norm(vec: list[float]) -> float:
    return sum(abs(v) for v in vec)


class BehaviorSAE:
    """
    Sparse Autoencoder for agent behavior decomposition.

    Architecture (conceptual):
        encode: behavior_vector → W_enc → ReLU → sparse_features
        decode: sparse_features → W_dec → reconstructed_behavior

    The encoder learns to decompose high-dimensional agent behavior into
    a sparse set of interpretable features. Sparsity is enforced via L1 penalty.
    """

    def __init__(self, input_dim: int = 6, n_features: int = NUM_FEATURES, sparsity_coeff: float = 0.05):
        self.input_dim = input_dim
        self.n_features = n_features
        self.sparsity_coeff = sparsity_coeff

        # Encoder weights: n_features × input_dim (initialized with structured patterns)
        self.W_enc: list[list[float]] = self._init_encoder()

        # Encoder bias
        self.b_enc: list[float] = [random.uniform(-0.1, 0.1) for _ in range(n_features)]

        # Feature activation log (for dashboard)
        self.activation_history: list[dict[str, list[float]]] = []
        self.groupthink_score: float = 0.0

    def _init_encoder(self) -> list[list[float]]:
        """
        Initialize encoder with semi-structured weights.
        Each feature row has a primary sensitivity to specific input dimensions.
        """
        W = []
        for feat_idx in range(self.n_features):
            row = [random.uniform(-0.2, 0.2) for _ in range(self.input_dim)]
            # Primary sensitivity: feature i is most sensitive to input dimension i % input_dim
            primary = feat_idx % self.input_dim
            row[primary] += random.uniform(0.5, 1.0)
            # Normalize row
            norm = math.sqrt(sum(v * v for v in row))
            if norm > 0:
                row = [v / norm for v in row]
            W.append(row)
        return W

    def encode(self, behavior_vector: list[float]) -> list[float]:
        """
        Encode a behavior vector into sparse feature activations.
        activations = ReLU(W_enc @ behavior + b_enc)
        """
        if len(behavior_vector) != self.input_dim:
            # Pad or truncate
            bv = behavior_vector[:self.input_dim] + [0.0] * max(0, self.input_dim - len(behavior_vector))
        else:
            bv = behavior_vector

        activations = []
        for f_idx in range(self.n_features):
            z = sum(self.W_enc[f_idx][d] * bv[d] for d in range(self.input_dim)) + self.b_enc[f_idx]
            activations.append(_relu(z))

        # Apply L1 sparsity: zero out weak activations
        threshold = self.sparsity_coeff * max(activations) if activations and max(activations) > 0 else 0.0
        sparse_activations = [a if a > threshold else 0.0 for a in activations]

        return sparse_activations

    def batch_encode(self, agent_models: list[Any]) -> dict[str, list[float]]:
        """
        Encode all agent world models into feature activations.
        Returns: {agent_id: [feature_activations]}
        """
        results: dict[str, list[float]] = {}
        all_activations: list[list[float]] = []

        for model in agent_models:
            if hasattr(model, "get_state_vector") and hasattr(model, "agent_id"):
                vec = model.get_state_vector()
                activations = self.encode(vec)
                results[model.agent_id] = activations
                all_activations.append(activations)

        # Compute groupthink score: how uniform are feature activations across agents?
        if len(all_activations) > 1:
            self.groupthink_score = self._compute_groupthink(all_activations)

        # Log history (keep last 50 snapshots)
        self.activation_history.append(results)
        if len(self.activation_history) > 50:
            self.activation_history = self.activation_history[-50:]

        return results

    def _compute_groupthink(self, all_activations: list[list[float]]) -> float:
        """
        Groupthink = 1 - mean(feature_variance_across_agents).
        High groupthink means all agents have similar feature activations.
        """
        n_agents = len(all_activations)
        if n_agents < 2:
            return 0.0

        feature_variances = []
        for f_idx in range(self.n_features):
            vals = [all_activations[a][f_idx] for a in range(n_agents)]
            mean = sum(vals) / n_agents
            variance = sum((v - mean) ** 2 for v in vals) / n_agents
            feature_variances.append(variance)

        avg_variance = sum(feature_variances) / len(feature_variances) if feature_variances else 0.0
        # Normalize: high variance = low groupthink
        return max(0.0, min(1.0, 1.0 - min(1.0, avg_variance * 5)))

    def get_top_features(self, activations: list[float], top_k: int = 3) -> list[dict[str, Any]]:
        """Get the top-k active features for a given activation vector."""
        indexed = [(idx, act) for idx, act in enumerate(activations) if act > 0]
        indexed.sort(key=lambda x: x[1], reverse=True)
        return [
            {**FEATURE_DICTIONARY[idx], "activation": round(act, 4)}
            for idx, act in indexed[:top_k]
        ]

    def snapshot(self) -> dict[str, Any]:
        """Dashboard-ready snapshot."""
        # Aggregate feature activations across most recent batch
        latest = self.activation_history[-1] if self.activation_history else {}
        feature_means = [0.0] * self.n_features
        if latest:
            for activations in latest.values():
                for i, a in enumerate(activations):
                    feature_means[i] += a
            feature_means = [m / len(latest) for m in feature_means]

        return {
            "features": [
                {**fd, "mean_activation": round(feature_means[fd["id"]], 4)}
                for fd in FEATURE_DICTIONARY
            ],
            "groupthink_score": round(self.groupthink_score, 4),
            "agents_encoded": len(latest),
            "sparsity_coeff": self.sparsity_coeff,
        }


# Global instance
behavior_sae = BehaviorSAE(input_dim=6, n_features=NUM_FEATURES)
