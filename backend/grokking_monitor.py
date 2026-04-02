"""
Grokking Monitor — Protocol #24.

Grounded in: "Grokking: From Abstraction to Intelligence"

Monitors for phase transitions in collective agent behavior:
delayed generalization (grokking), sudden capability emergence,
and critical transitions in factional dynamics.

In the original paper, grokking is when a model suddenly generalizes long after
achieving perfect training accuracy. Here we apply this to agent civilizations:
agents may exhibit sudden collective behavioral shifts after extended periods
of apparent stasis.
"""

import logging
import math
from typing import Any
from dataclasses import dataclass, field

logger = logging.getLogger("GrokkingMonitor")


@dataclass
class PhaseTransitionEvent:
    """A detected phase transition in collective behavior."""
    event_id: str
    tick: int
    metric_name: str
    before_value: float
    after_value: float
    magnitude: float
    transition_type: str  # "grokking", "collapse", "emergence", "bifurcation"


class GrokkingMonitor:
    """
    Monitors collective agent metrics for phase transitions.

    Tracks rolling statistics of key civilization metrics.
    When a metric's rate of change exceeds a threshold relative to
    its historical variance, a phase transition is flagged.

    Types of transitions detected:
    - Grokking: sudden improvement after extended plateau
    - Collapse: sudden degradation after stability
    - Emergence: new capability appearing (cooperation, dissent)
    - Bifurcation: system splitting into distinct modes
    """

    WINDOW_SIZE = 30           # Rolling window for statistics
    TRANSITION_Z_SCORE = 2.5   # Z-score threshold for phase transition
    PLATEAU_MIN_LENGTH = 10    # Minimum plateau length before grokking is possible

    TRACKED_METRICS = [
        "avg_tension", "avg_cooperation", "inequality", "groupthink",
        "avg_uncertainty", "debate_adoption_rate", "reliability_spread",
    ]

    def __init__(self):
        self.history: dict[str, list[float]] = {m: [] for m in self.TRACKED_METRICS}
        self.detected_transitions: list[PhaseTransitionEvent] = []
        self.total_detections: int = 0
        self.current_phase: str = "pre-grokking"  # Civilization phase label

    def record(self, metrics: dict[str, float]):
        """Record a new data point for all tracked metrics."""
        for metric_name in self.TRACKED_METRICS:
            value = metrics.get(metric_name, 0.0)
            self.history[metric_name].append(value)
            # Keep bounded
            if len(self.history[metric_name]) > 500:
                self.history[metric_name] = self.history[metric_name][-500:]

    def detect_transitions(self, tick: int) -> list[PhaseTransitionEvent]:
        """
        Analyze all tracked metrics for phase transitions.
        Returns list of newly detected transitions.
        """
        new_transitions = []

        for metric_name, values in self.history.items():
            if len(values) < self.WINDOW_SIZE + 5:
                continue

            transition = self._check_metric(metric_name, values, tick)
            if transition:
                new_transitions.append(transition)
                self.detected_transitions.append(transition)
                self.total_detections += 1
                logger.warning(
                    f"[Grokking] Phase transition detected! {transition.transition_type.upper()}: "
                    f"{metric_name} shifted {transition.before_value:.3f} → {transition.after_value:.3f} "
                    f"(magnitude: {transition.magnitude:.3f})"
                )

        # Update phase label
        if new_transitions:
            self._update_phase(new_transitions)

        # Keep transitions bounded
        if len(self.detected_transitions) > 100:
            self.detected_transitions = self.detected_transitions[-100:]

        return new_transitions

    def _check_metric(self, metric_name: str, values: list[float], tick: int) -> PhaseTransitionEvent | None:
        """
        Check if a single metric is undergoing a phase transition.
        Uses z-score of rate-of-change vs historical rate-of-change variance.
        """
        window = self.WINDOW_SIZE
        recent = values[-window:]
        older = values[-(window * 2):-window] if len(values) >= window * 2 else values[:window]

        if len(recent) < window or len(older) < 3:
            return None

        # Compute rate of change (first derivative)
        recent_mean = sum(recent) / len(recent)
        older_mean = sum(older) / len(older)
        delta = recent_mean - older_mean

        # Historical variance of deltas
        all_deltas = []
        for i in range(5, len(values)):
            small_delta = values[i] - values[i - 5]
            all_deltas.append(small_delta)

        if len(all_deltas) < 3:
            return None

        hist_mean = sum(all_deltas) / len(all_deltas)
        hist_var = sum((d - hist_mean) ** 2 for d in all_deltas) / len(all_deltas)
        hist_std = math.sqrt(max(1e-8, hist_var))

        z_score = abs(delta) / hist_std

        if z_score < self.TRANSITION_Z_SCORE:
            return None

        # Check for plateau before the transition (grokking signature)
        pre_plateau = values[-(window * 2):-window] if len(values) >= window * 2 else None
        is_grokking = False
        if pre_plateau and len(pre_plateau) >= self.PLATEAU_MIN_LENGTH:
            plateau_var = sum((v - sum(pre_plateau)/len(pre_plateau)) ** 2 for v in pre_plateau) / len(pre_plateau)
            is_grokking = plateau_var < 0.01  # Very flat before sudden change

        # Classify transition type
        if is_grokking and delta > 0:
            transition_type = "grokking"
        elif is_grokking and delta < 0:
            transition_type = "collapse"
        elif delta > 0:
            transition_type = "emergence"
        else:
            transition_type = "bifurcation"

        return PhaseTransitionEvent(
            event_id=f"PT-{self.total_detections + 1:04d}",
            tick=tick,
            metric_name=metric_name,
            before_value=round(older_mean, 4),
            after_value=round(recent_mean, 4),
            magnitude=round(abs(delta), 4),
            transition_type=transition_type,
        )

    def _update_phase(self, transitions: list[PhaseTransitionEvent]):
        """Update civilization phase label based on detected transitions."""
        types = [t.transition_type for t in transitions]
        if "grokking" in types:
            self.current_phase = "post-grokking"
        elif "collapse" in types:
            self.current_phase = "collapse"
        elif "emergence" in types:
            self.current_phase = "emergence"
        elif "bifurcation" in types:
            self.current_phase = "bifurcation"

    def snapshot(self) -> dict[str, Any]:
        recent = self.detected_transitions[-5:]
        return {
            "current_phase": self.current_phase,
            "total_detections": self.total_detections,
            "recent_transitions": [
                {
                    "id": t.event_id,
                    "tick": t.tick,
                    "metric": t.metric_name,
                    "type": t.transition_type,
                    "magnitude": t.magnitude,
                    "before": t.before_value,
                    "after": t.after_value,
                }
                for t in reversed(recent)
            ],
            "history_lengths": {m: len(v) for m, v in self.history.items()},
        }


grokking_monitor = GrokkingMonitor()
