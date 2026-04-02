"""
Optimal Transport Resource Allocation — Protocol #17.

Grounded in: "Optimal Transport for Machine Learners", "Optimal and Diffusion Transports in ML"
Replaces naive Physarum tube math with Sinkhorn-regularized optimal transport.
Uses Earth Mover's Distance to measure inter-faction inequality.
Wasserstein barycenters drive resource redistribution policy.
"""

import logging
import math
from typing import Any

logger = logging.getLogger("OptimalTransport")


def _sinkhorn_iteration(
    cost_matrix: list[list[float]],
    supply: list[float],
    demand: list[float],
    reg: float = 0.1,
    max_iter: int = 50,
) -> list[list[float]]:
    """
    Sinkhorn-Knopp algorithm for entropic-regularized optimal transport.
    Solves: min <T, C> + reg * H(T)  s.t. T1=supply, T^T1=demand
    Returns the transport plan T.
    """
    n = len(supply)
    m = len(demand)
    if n == 0 or m == 0:
        return []

    # Gibbs kernel: K_ij = exp(-C_ij / reg)
    K = [[math.exp(-cost_matrix[i][j] / max(reg, 1e-8)) for j in range(m)] for i in range(n)]

    # Initialize scaling vectors
    u = [1.0] * n
    v = [1.0] * m

    for _ in range(max_iter):
        # Update u
        for i in range(n):
            Kv_i = sum(K[i][j] * v[j] for j in range(m))
            u[i] = supply[i] / max(Kv_i, 1e-12)
        # Update v
        for j in range(m):
            Ku_j = sum(K[i][j] * u[i] for i in range(n))
            v[j] = demand[j] / max(Ku_j, 1e-12)

    # Transport plan: T_ij = u_i * K_ij * v_j
    T = [[u[i] * K[i][j] * v[j] for j in range(m)] for i in range(n)]
    return T


def _earth_movers_distance(
    distribution_a: list[float],
    distribution_b: list[float],
    cost_matrix: list[list[float]],
    reg: float = 0.1,
) -> float:
    """
    Compute the (entropic-regularized) Earth Mover's Distance between two distributions.
    EMD = <T*, C> where T* is the optimal transport plan.
    """
    total_a = sum(distribution_a)
    total_b = sum(distribution_b)
    if total_a < 1e-10 or total_b < 1e-10:
        return 0.0

    # Normalize to probability distributions
    supply = [a / total_a for a in distribution_a]
    demand = [b / total_b for b in distribution_b]

    T = _sinkhorn_iteration(cost_matrix, supply, demand, reg=reg)
    if not T:
        return 0.0

    n = len(supply)
    m = len(demand)
    emd = sum(T[i][j] * cost_matrix[i][j] for i in range(n) for j in range(m))
    return emd


class WassersteinAllocator:
    """
    Optimal Transport-based resource allocator for inter-faction distribution.
    Uses Sinkhorn algorithm for entropic-regularized transport plans.
    """

    def __init__(self, faction_names: list[str]):
        self.faction_names = faction_names
        self.n = len(faction_names)

        # Cost matrix: pairwise "distance" between factions
        # Initialized as identity-like (self-transfer is free, cross-faction has cost)
        self.cost_matrix: list[list[float]] = [
            [0.0 if i == j else 1.0 + 0.1 * abs(i - j) for j in range(self.n)]
            for i in range(self.n)
        ]

        # Track historical transport plans
        self.last_transport_plan: list[list[float]] = []
        self.inequality_index: float = 0.0
        self.gini_coefficient: float = 0.0

    def compute_optimal_allocation(
        self,
        supply: dict[str, float],
        demand: dict[str, float],
        reg: float = 0.1,
    ) -> dict[tuple[str, str], float]:
        """
        Compute optimal resource allocation from supply factions to demand factions.
        Returns a transport plan as {(source, destination): flow}.
        """
        supply_vec = [max(0.01, supply.get(f, 1.0)) for f in self.faction_names]
        demand_vec = [max(0.01, demand.get(f, 1.0)) for f in self.faction_names]

        T = _sinkhorn_iteration(self.cost_matrix, supply_vec, demand_vec, reg=reg)
        self.last_transport_plan = T

        # Build named transport plan
        flows: dict[tuple[str, str], float] = {}
        for i, src in enumerate(self.faction_names):
            for j, dst in enumerate(self.faction_names):
                if T and T[i][j] > 0.001:
                    flows[(src, dst)] = T[i][j]

        return flows

    def compute_inequality(self, resources: dict[str, float]) -> float:
        """
        Compute inequality using EMD between current distribution and uniform.
        Also computes Gini coefficient.
        """
        values = [max(0.0, resources.get(f, 0.0)) for f in self.faction_names]
        total = sum(values)
        if total < 1e-10:
            self.inequality_index = 0.0
            self.gini_coefficient = 0.0
            return 0.0

        # Current distribution vs uniform
        current = [v / total for v in values]
        uniform = [1.0 / self.n] * self.n

        self.inequality_index = _earth_movers_distance(current, uniform, self.cost_matrix)

        # Gini coefficient
        sorted_vals = sorted(values)
        n = len(sorted_vals)
        gini_numerator = sum((2 * (i + 1) - n - 1) * sorted_vals[i] for i in range(n))
        self.gini_coefficient = gini_numerator / (n * total) if total > 0 else 0.0

        return self.inequality_index

    def update_cost_matrix(self, faction_tensions: dict[str, float]):
        """
        Dynamically adjust transport costs based on faction tensions.
        High tension between factions = higher transport cost (less cooperation).
        """
        for i, f1 in enumerate(self.faction_names):
            for j, f2 in enumerate(self.faction_names):
                if i != j:
                    t1 = faction_tensions.get(f1, 50.0) / 100.0
                    t2 = faction_tensions.get(f2, 50.0) / 100.0
                    # Cost increases with combined tension
                    self.cost_matrix[i][j] = 0.5 + (t1 + t2) * 0.5

    def snapshot(self) -> dict[str, Any]:
        """Serializable state snapshot."""
        return {
            "factions": self.faction_names,
            "inequality_index": round(self.inequality_index, 4),
            "gini_coefficient": round(self.gini_coefficient, 4),
            "cost_matrix": [[round(c, 3) for c in row] for row in self.cost_matrix],
            "last_plan_nonzero": len([(s, d) for row_i, s in enumerate(self.faction_names)
                                      for col_j, d in enumerate(self.faction_names)
                                      if self.last_transport_plan and self.last_transport_plan[row_i][col_j] > 0.001]),
        }
