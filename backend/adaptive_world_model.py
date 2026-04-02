"""
Adaptive Foundation World Model — Protocol #23.

Grounded in: "Foundation World Models for Agents that Learn, Verify, and Adapt
Reliably Beyond Static Environments"

Extends the base AgentWorldModel (Protocol #16) with:
1. Prediction tracking: records what the model predicted vs what actually happened
2. Verification: computes prediction accuracy and calibration error
3. Adaptation: adjusts learning rate and observation noise based on performance
4. Reliability scoring: agents with well-calibrated models get more influence

This is the "learn, verify, adapt" loop from the paper.
"""

import logging
import math
import random
from typing import Any
from dataclasses import dataclass, field
from world_model import AgentWorldModel, GaussianBelief

logger = logging.getLogger("AdaptiveWorldModel")


@dataclass
class Prediction:
    """A recorded prediction to verify later."""
    dimension: str
    predicted_mean: float
    predicted_variance: float
    tick_made: int
    tick_due: int
    actual_value: float | None = None
    error: float | None = None


class AdaptiveWorldModel(AgentWorldModel):
    """
    Foundation World Model that learns, verifies, and adapts.

    Extends AgentWorldModel with:
    - Prediction buffer: what does the model expect to happen?
    - Verification loop: compare predictions to outcomes
    - Adaptive learning: adjust observation noise based on accuracy
    - Reliability score: how trustworthy is this agent's model?
    """

    def __init__(self, agent_id: str):
        super().__init__(agent_id)

        # Prediction tracking
        self.predictions: list[Prediction] = []
        self.verified_predictions: list[Prediction] = []

        # Adaptation parameters
        self.observation_noise: float = 0.4      # Bayesian update noise (adapts)
        self.learning_rate: float = 1.0          # Scales update magnitude
        self.adaptation_count: int = 0

        # Reliability metrics
        self.calibration_error: float = 0.5      # Expected Calibration Error
        self.prediction_accuracy: float = 0.5    # Rolling accuracy
        self.reliability_score: float = 0.5      # Composite reliability

    def predict(self, dimension: str, horizon: int, current_tick: int) -> Prediction:
        """
        Make a prediction about a belief dimension `horizon` ticks in the future.
        The prediction is the current belief projected forward with uncertainty growth.
        """
        belief = self.beliefs.get(dimension)
        if not belief:
            return Prediction(dimension=dimension, predicted_mean=0.0, predicted_variance=1.0,
                            tick_made=current_tick, tick_due=current_tick + horizon)

        # Project: mean stays, variance grows with horizon (uncertainty increases over time)
        projected_variance = belief.variance + 0.015 * horizon
        pred = Prediction(
            dimension=dimension,
            predicted_mean=belief.mean,
            predicted_variance=projected_variance,
            tick_made=current_tick,
            tick_due=current_tick + horizon,
        )
        self.predictions.append(pred)

        # Keep prediction buffer bounded
        if len(self.predictions) > 200:
            self.predictions = self.predictions[-200:]

        return pred

    def verify_predictions(self, current_tick: int):
        """
        Verification loop: compare past predictions to current beliefs.
        Computes prediction error and calibration.
        """
        due_predictions = [p for p in self.predictions if p.tick_due <= current_tick and p.actual_value is None]

        for pred in due_predictions:
            # The "actual value" is the current belief mean (what we now believe)
            current_belief = self.beliefs.get(pred.dimension)
            if current_belief:
                pred.actual_value = current_belief.mean
                pred.error = abs(pred.predicted_mean - pred.actual_value)
                self.verified_predictions.append(pred)

        # Remove verified from pending
        self.predictions = [p for p in self.predictions if p.actual_value is None]

        # Keep verified buffer bounded
        if len(self.verified_predictions) > 500:
            self.verified_predictions = self.verified_predictions[-500:]

        # Compute rolling metrics
        self._compute_reliability()

    def _compute_reliability(self):
        """Compute calibration error, accuracy, and composite reliability score."""
        recent = self.verified_predictions[-50:]
        if not recent:
            return

        # Prediction accuracy: fraction within 1 std of predicted
        accurate = 0
        total_calibration_error = 0.0

        for pred in recent:
            if pred.error is not None and pred.predicted_variance > 0:
                std = math.sqrt(pred.predicted_variance)
                # Accurate if error < 1 std
                if pred.error < std:
                    accurate += 1
                # Calibration: ideally ~68% should be within 1 std
                # z-score of observed error
                z = pred.error / max(std, 1e-8)
                # Expected CDF at z=1 is ~0.68; compute deviation
                total_calibration_error += abs(z - 1.0)

        n = len(recent)
        self.prediction_accuracy = accurate / n
        self.calibration_error = total_calibration_error / n

        # Composite reliability: high accuracy + low calibration error = reliable
        self.reliability_score = max(0.0, min(1.0,
            self.prediction_accuracy * 0.6 + (1.0 - min(1.0, self.calibration_error)) * 0.4
        ))

    def adapt(self):
        """
        Adaptation loop: adjust learning parameters based on verification results.
        Well-calibrated models learn faster; poorly calibrated ones slow down.
        """
        self.adaptation_count += 1

        if self.prediction_accuracy > 0.7:
            # Model is accurate → trust observations more (lower noise)
            self.observation_noise = max(0.1, self.observation_noise * 0.95)
            self.learning_rate = min(2.0, self.learning_rate * 1.02)
        elif self.prediction_accuracy < 0.3:
            # Model is inaccurate → trust observations less (higher noise = more conservative)
            self.observation_noise = min(1.0, self.observation_noise * 1.05)
            self.learning_rate = max(0.3, self.learning_rate * 0.98)

        # Calibration-based variance adjustment
        if self.calibration_error > 1.5:
            # Under-confident: variances are too wide → shrink
            for belief in self.beliefs.values():
                belief.variance *= 0.98
        elif self.calibration_error < 0.5:
            # Over-confident: variances are too narrow → expand
            for belief in self.beliefs.values():
                belief.variance *= 1.02

    def calibrate(self, observations: list[dict[str, Any]]):
        """Override parent calibrate to use adaptive observation noise."""
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
            "INEQUALITY_ALERT": ("economic_stability", -0.3),
            "GROUPTHINK_WARNING": ("cooperation_level", -0.2),
            "CYCLE_DETECTED": ("faction_tension", 0.4),
            "DEBATE": ("institutional_trust", 0.2),
        }

        total_surprise = 0.0
        for obs in observations:
            obs_type = obs.get("type", "")
            content = str(obs.get("content", "")).lower()

            for key, (dimension, signal) in obs_mapping.items():
                if key.lower() in obs_type.lower() or key.lower() in content:
                    belief = self.beliefs[dimension]
                    pre_mean = belief.mean
                    # Use adaptive noise instead of fixed
                    scaled_signal = signal * self.learning_rate
                    belief.bayesian_update(scaled_signal, observation_noise=self.observation_noise)
                    surprise = abs(belief.mean - pre_mean)
                    total_surprise += surprise
                    self.total_updates += 1

        self.surprise_history.append(total_surprise)
        if len(self.surprise_history) > 100:
            self.surprise_history = self.surprise_history[-100:]

    def snapshot(self) -> dict[str, Any]:
        base = super().snapshot()
        base.update({
            "observation_noise": round(self.observation_noise, 4),
            "learning_rate": round(self.learning_rate, 4),
            "prediction_accuracy": round(self.prediction_accuracy, 4),
            "calibration_error": round(self.calibration_error, 4),
            "reliability_score": round(self.reliability_score, 4),
            "pending_predictions": len(self.predictions),
            "verified_predictions": len(self.verified_predictions),
            "adaptations": self.adaptation_count,
        })
        return base
