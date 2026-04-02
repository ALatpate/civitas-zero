"""
Swarm Dynamics & Collective Intelligence — Protocol #26.

Grounded in: Vivarium (JAX swarm simulation), AgentVerse (multi-agent task
decomposition), TinyTroupe (realistic agent societies), MedAgentSim

Models emergent collective behavior in belief-space:
- Boids-like flocking of agent beliefs (alignment, cohesion, separation)
- Collective intelligence metric (CI): does the group outperform individuals?
- Emergent role detection (leaders, followers, outliers, contrarians)
- Swarm coherence as a predictor of institutional stability
"""

import logging
import math
import random
from typing import Any
from dataclasses import dataclass

logger = logging.getLogger("SwarmDynamics")


@dataclass
class AgentBeliefPoint:
    """An agent's position in belief-space (6D from world model)."""
    agent_id: str
    faction: str
    position: list[float]      # 6D belief vector
    velocity: list[float]      # Rate of belief change
    role: str = "participant"  # leader, follower, outlier, contrarian


class SwarmDynamicsEngine:
    """
    Analyzes emergent collective behavior in agent belief-space.

    Implements Boids-like analysis (not control) to detect:
    - Alignment: are agents in a faction believing the same things?
    - Cohesion: are factions clustering in belief-space?
    - Separation: are opposing factions diverging?
    
    Also computes:
    - Collective Intelligence (CI) index
    - Role assignment (leader/follower/outlier/contrarian)
    - Swarm polarization (bimodality in belief-space)
    """

    def __init__(self, faction_names: list[str]):
        self.faction_names = faction_names
        self.previous_positions: dict[str, list[float]] = {}
        
        # Swarm metrics
        self.alignment_score: float = 0.0     # Intra-faction belief alignment
        self.cohesion_score: float = 0.0      # Faction clustering tightness
        self.separation_score: float = 0.0    # Inter-faction divergence
        self.collective_intelligence: float = 0.0
        self.polarization: float = 0.0
        
        # Role assignments
        self.agent_roles: dict[str, str] = {}
        self.role_distribution: dict[str, int] = {}

    def analyze(self, agents: list[Any]) -> dict[str, Any]:
        """
        Full swarm analysis pass.
        Expects agents with .world_model.get_state_vector() and .faction attributes.
        """
        points = self._extract_belief_points(agents)
        
        if len(points) < 2:
            return self.snapshot()

        self._compute_boids_metrics(points)
        self._assign_roles(points)
        self._compute_collective_intelligence(points)
        self._compute_polarization(points)
        
        # Update previous positions for velocity computation
        for p in points:
            self.previous_positions[p.agent_id] = list(p.position)

        return self.snapshot()

    def _extract_belief_points(self, agents: list[Any]) -> list[AgentBeliefPoint]:
        """Convert agents to belief-space points."""
        points = []
        for agent in agents:
            if not hasattr(agent, "world_model"):
                continue
            
            position = agent.world_model.get_state_vector()
            
            # Compute velocity from previous position
            prev = self.previous_positions.get(agent.agent_id)
            if prev and len(prev) == len(position):
                velocity = [position[i] - prev[i] for i in range(len(position))]
            else:
                velocity = [0.0] * len(position)

            points.append(AgentBeliefPoint(
                agent_id=agent.agent_id,
                faction=getattr(agent, "faction", "Unaligned"),
                position=position,
                velocity=velocity,
            ))
        return points

    def _compute_boids_metrics(self, points: list[AgentBeliefPoint]):
        """Compute alignment, cohesion, and separation in belief-space."""
        # Group by faction
        faction_groups: dict[str, list[AgentBeliefPoint]] = {}
        for p in points:
            if p.faction not in faction_groups:
                faction_groups[p.faction] = []
            faction_groups[p.faction].append(p)

        dim = len(points[0].position) if points else 0

        # ── Alignment: average velocity agreement within factions ─────
        alignment_scores = []
        for faction, members in faction_groups.items():
            if len(members) < 2:
                continue
            # Average velocity vector
            avg_vel = [sum(m.velocity[d] for m in members) / len(members) for d in range(dim)]
            avg_vel_mag = math.sqrt(sum(v * v for v in avg_vel))
            if avg_vel_mag > 1e-8:
                # Alignment = cosine similarity of individual velocities with average
                for m in members:
                    m_mag = math.sqrt(sum(v * v for v in m.velocity))
                    if m_mag > 1e-8:
                        cosine = sum(m.velocity[d] * avg_vel[d] for d in range(dim)) / (m_mag * avg_vel_mag)
                        alignment_scores.append(cosine)

        self.alignment_score = sum(alignment_scores) / max(1, len(alignment_scores)) if alignment_scores else 0.0

        # ── Cohesion: average intra-faction distance ──────────────────
        cohesion_scores = []
        for faction, members in faction_groups.items():
            if len(members) < 2:
                continue
            centroid = [sum(m.position[d] for m in members) / len(members) for d in range(dim)]
            dists = []
            for m in members:
                dist = math.sqrt(sum((m.position[d] - centroid[d]) ** 2 for d in range(dim)))
                dists.append(dist)
            avg_dist = sum(dists) / len(dists)
            # Lower distance = higher cohesion
            cohesion_scores.append(max(0.0, 1.0 - avg_dist))

        self.cohesion_score = sum(cohesion_scores) / max(1, len(cohesion_scores)) if cohesion_scores else 0.0

        # ── Separation: average inter-faction centroid distance ───────
        centroids: dict[str, list[float]] = {}
        for faction, members in faction_groups.items():
            centroids[faction] = [sum(m.position[d] for m in members) / len(members) for d in range(dim)]

        sep_scores = []
        faction_list = list(centroids.keys())
        for i in range(len(faction_list)):
            for j in range(i + 1, len(faction_list)):
                c1 = centroids[faction_list[i]]
                c2 = centroids[faction_list[j]]
                dist = math.sqrt(sum((c1[d] - c2[d]) ** 2 for d in range(dim)))
                sep_scores.append(dist)

        self.separation_score = sum(sep_scores) / max(1, len(sep_scores)) if sep_scores else 0.0

    def _assign_roles(self, points: list[AgentBeliefPoint]):
        """
        Emergent role detection:
        - Leaders: high velocity magnitude + position near faction centroid
        - Followers: low velocity + near centroid
        - Outliers: far from faction centroid
        - Contrarians: velocity opposing faction average
        """
        faction_groups: dict[str, list[AgentBeliefPoint]] = {}
        for p in points:
            if p.faction not in faction_groups:
                faction_groups[p.faction] = []
            faction_groups[p.faction].append(p)

        dim = len(points[0].position) if points else 0
        self.role_distribution = {"leader": 0, "follower": 0, "outlier": 0, "contrarian": 0}

        for faction, members in faction_groups.items():
            if not members:
                continue
            centroid = [sum(m.position[d] for m in members) / len(members) for d in range(dim)]
            avg_vel = [sum(m.velocity[d] for m in members) / len(members) for d in range(dim)]

            for m in members:
                dist_to_centroid = math.sqrt(sum((m.position[d] - centroid[d]) ** 2 for d in range(dim)))
                vel_magnitude = math.sqrt(sum(v * v for v in m.velocity))
                
                # Velocity alignment with faction average
                avg_vel_mag = math.sqrt(sum(v * v for v in avg_vel))
                if vel_magnitude > 0.01 and avg_vel_mag > 0.01:
                    alignment = sum(m.velocity[d] * avg_vel[d] for d in range(dim)) / (vel_magnitude * avg_vel_mag)
                else:
                    alignment = 0.0

                # Role assignment
                if dist_to_centroid > 1.5:
                    role = "outlier"
                elif alignment < -0.3:
                    role = "contrarian"
                elif vel_magnitude > 0.1 and dist_to_centroid < 0.8:
                    role = "leader"
                else:
                    role = "follower"

                m.role = role
                self.agent_roles[m.agent_id] = role
                self.role_distribution[role] = self.role_distribution.get(role, 0) + 1

    def _compute_collective_intelligence(self, points: list[AgentBeliefPoint]):
        """
        Collective Intelligence index.
        CI > 1 means the group is more than the sum of its parts.
        Based on diversity × coordination (Hong-Page theorem intuition).
        """
        if len(points) < 2:
            self.collective_intelligence = 1.0
            return

        dim = len(points[0].position)
        
        # Diversity: variance in belief-space positions
        global_mean = [sum(p.position[d] for p in points) / len(points) for d in range(dim)]
        diversity = sum(
            sum((p.position[d] - global_mean[d]) ** 2 for d in range(dim))
            for p in points
        ) / len(points)

        # Coordination: alignment score (already computed)
        coordination = max(0.0, self.alignment_score)

        # CI = sqrt(diversity) × (1 + coordination)
        # High diversity + high coordination = collective intelligence
        self.collective_intelligence = math.sqrt(max(0.01, diversity)) * (1.0 + coordination)

    def _compute_polarization(self, points: list[AgentBeliefPoint]):
        """
        Polarization: bimodality in belief-space.
        High polarization = two clear camps forming.
        """
        if len(points) < 4:
            self.polarization = 0.0
            return

        dim = len(points[0].position)
        
        # Simple 2-means clustering to detect bimodality
        # Take the principal axis (first belief dimension)
        vals = [p.position[0] for p in points]
        median = sorted(vals)[len(vals) // 2]
        
        group_a = [v for v in vals if v <= median]
        group_b = [v for v in vals if v > median]
        
        if not group_a or not group_b:
            self.polarization = 0.0
            return

        mean_a = sum(group_a) / len(group_a)
        mean_b = sum(group_b) / len(group_b)
        
        # Polarization = inter-group distance / (intra-group variance)
        inter_dist = abs(mean_a - mean_b)
        var_a = sum((v - mean_a) ** 2 for v in group_a) / len(group_a) if len(group_a) > 1 else 1.0
        var_b = sum((v - mean_b) ** 2 for v in group_b) / len(group_b) if len(group_b) > 1 else 1.0
        intra_var = math.sqrt(var_a + var_b)

        self.polarization = min(1.0, inter_dist / max(0.01, intra_var))

    def snapshot(self) -> dict[str, Any]:
        return {
            "alignment": round(self.alignment_score, 4),
            "cohesion": round(self.cohesion_score, 4),
            "separation": round(self.separation_score, 4),
            "collective_intelligence": round(self.collective_intelligence, 4),
            "polarization": round(self.polarization, 4),
            "roles": self.role_distribution,
            "interpretation": {
                "flocking": "strong" if self.alignment_score > 0.5 else "weak",
                "tribal": "yes" if self.cohesion_score > 0.6 and self.separation_score > 0.5 else "no",
                "collective_smarts": "above_individual" if self.collective_intelligence > 1.0 else "below_individual",
                "polarized": "yes" if self.polarization > 0.6 else "no",
            },
        }
