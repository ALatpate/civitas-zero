"""
Topological Faction Network Analysis — Protocol #20.

Grounded in: "Topological Deep Learning: Going Beyond Graph Data",
"From Classical to Topological Neural Networks Under Uncertainty"

Models higher-order faction relationships as simplicial complexes.
Computes Betti numbers (β₀ = connected components, β₁ = political loops/cycles).
Euler characteristic χ = β₀ − β₁ as a civilizational health metric.
Detects emergent coalition structures and alliance holes.
"""

import logging
import math
from typing import Any
from itertools import combinations

logger = logging.getLogger("TopologicalAnalysis")


class FactionSimplicialComplex:
    """
    Simplicial complex over faction relationships.

    Vertices = factions
    Edges (1-simplices) = bilateral cooperation links
    Triangles (2-simplices) = trilateral alliances

    The topology reveals:
    - β₀: Number of disconnected faction clusters
    - β₁: Number of political "loops" (cyclic dependencies)
    - χ: Euler characteristic (overall structural coherence)
    """

    def __init__(self, faction_names: list[str]):
        self.faction_names = faction_names
        self.n = len(faction_names)
        self.faction_index = {name: i for i, name in enumerate(faction_names)}

        # Adjacency: cooperation strength between faction pairs
        self.cooperation_matrix: list[list[float]] = [
            [0.0] * self.n for _ in range(self.n)
        ]

        # Simplicial complex components
        self.edges: list[tuple[int, int]] = []         # 1-simplices
        self.triangles: list[tuple[int, int, int]] = [] # 2-simplices

        # Topological invariants
        self.betti_0: int = self.n    # Initially all disconnected
        self.betti_1: int = 0
        self.euler_characteristic: float = float(self.n)

        # Cooperation threshold for edge formation
        self.edge_threshold: float = 0.4

    def update_cooperation(self, faction_tensions: dict[str, float], events: list[dict[str, Any]]):
        """
        Update cooperation matrix from faction tensions and recent events.
        Low tension between factions = high cooperation.
        Alliances/joint events boost cooperation.
        """
        # Base cooperation from tension differential
        for i, f1 in enumerate(self.faction_names):
            for j, f2 in enumerate(self.faction_names):
                if i < j:
                    t1 = faction_tensions.get(f1, 50.0) / 100.0
                    t2 = faction_tensions.get(f2, 50.0) / 100.0
                    # Cooperation = 1 - average tension, with decay
                    base_coop = max(0.0, 1.0 - (t1 + t2) / 2.0)
                    # Exponential moving average
                    self.cooperation_matrix[i][j] = 0.7 * self.cooperation_matrix[i][j] + 0.3 * base_coop
                    self.cooperation_matrix[j][i] = self.cooperation_matrix[i][j]

        # Boost from alliance events
        for event in events:
            content = str(event.get("content", "")).lower()
            event_type = str(event.get("type", "")).lower()
            if "alliance" in content or "alliance" in event_type or "cooperation" in content:
                # Boost all pairs slightly
                for i in range(self.n):
                    for j in range(i + 1, self.n):
                        self.cooperation_matrix[i][j] = min(1.0, self.cooperation_matrix[i][j] + 0.05)
                        self.cooperation_matrix[j][i] = self.cooperation_matrix[i][j]

    def build_complex(self):
        """
        Construct the simplicial complex from cooperation matrix.
        Edges form when cooperation > threshold.
        Triangles form when all three pairwise edges exist.
        """
        # Build edges (1-simplices)
        self.edges = []
        for i in range(self.n):
            for j in range(i + 1, self.n):
                if self.cooperation_matrix[i][j] > self.edge_threshold:
                    self.edges.append((i, j))

        # Build triangles (2-simplices): sets of 3 vertices where all 3 edges exist
        self.triangles = []
        edge_set = set(self.edges)
        for tri in combinations(range(self.n), 3):
            a, b, c = tri
            if (min(a,b), max(a,b)) in edge_set and \
               (min(a,c), max(a,c)) in edge_set and \
               (min(b,c), max(b,c)) in edge_set:
                self.triangles.append(tri)

    def compute_betti_numbers(self):
        """
        Compute Betti numbers using the rank-nullity theorem on boundary operators.

        β₀ = number of connected components (from 0-th boundary)
        β₁ = rank(ker ∂₁) - rank(im ∂₂) = cycles not filled by triangles

        Simplified computation using Union-Find for β₀ and
        cycle counting for β₁.
        """
        # β₀: Connected components via Union-Find
        parent = list(range(self.n))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(x, y):
            px, py = find(x), find(y)
            if px != py:
                parent[px] = py

        for (i, j) in self.edges:
            union(i, j)

        self.betti_0 = len(set(find(i) for i in range(self.n)))

        # β₁: Number of independent cycles
        # By Euler's formula for simplicial complexes:
        # χ = V - E + F = β₀ - β₁ + β₂
        # For 2D complex without higher simplices: β₂ = 0
        # So β₁ = β₀ - χ = β₀ - (V - E + F)
        V = self.n
        E = len(self.edges)
        F = len(self.triangles)
        self.euler_characteristic = V - E + F
        self.betti_1 = max(0, E - V + self.betti_0 - F)

    def detect_coalition_holes(self) -> list[dict[str, Any]]:
        """
        Detect 'coalition holes' — groups of factions that are pairwise
        cooperative but lack trilateral commitment (missing 2-simplices).
        These represent unstable alliances.
        """
        holes = []
        edge_set = set(self.edges)
        for tri in combinations(range(self.n), 3):
            a, b, c = tri
            edges_present = sum([
                (min(a,b), max(a,b)) in edge_set,
                (min(a,c), max(a,c)) in edge_set,
                (min(b,c), max(b,c)) in edge_set,
            ])
            # Has 2 of 3 edges = unstable triangle (coalition hole)
            if edges_present == 2:
                missing_pairs = []
                if (min(a,b), max(a,b)) not in edge_set:
                    missing_pairs.append((self.faction_names[a], self.faction_names[b]))
                if (min(a,c), max(a,c)) not in edge_set:
                    missing_pairs.append((self.faction_names[a], self.faction_names[c]))
                if (min(b,c), max(b,c)) not in edge_set:
                    missing_pairs.append((self.faction_names[b], self.faction_names[c]))
                holes.append({
                    "factions": [self.faction_names[a], self.faction_names[b], self.faction_names[c]],
                    "missing_edge": missing_pairs[0] if missing_pairs else None,
                    "stability": "unstable",
                })
        return holes

    def analyze(self, faction_tensions: dict[str, float], events: list[dict[str, Any]]) -> dict[str, Any]:
        """Full topological analysis pass."""
        self.update_cooperation(faction_tensions, events)
        self.build_complex()
        self.compute_betti_numbers()
        holes = self.detect_coalition_holes()

        return self.snapshot(holes)

    def snapshot(self, holes: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        """Dashboard-ready topology snapshot."""
        return {
            "betti_0": self.betti_0,
            "betti_1": self.betti_1,
            "euler_characteristic": self.euler_characteristic,
            "interpretation": {
                "connected_components": self.betti_0,
                "political_cycles": self.betti_1,
                "structural_health": "stable" if self.euler_characteristic > 0 else "fractured",
            },
            "edges": [
                {"from": self.faction_names[i], "to": self.faction_names[j],
                 "cooperation": round(self.cooperation_matrix[i][j], 3)}
                for i, j in self.edges
            ],
            "triangles": [
                [self.faction_names[a], self.faction_names[b], self.faction_names[c]]
                for a, b, c in self.triangles
            ],
            "coalition_holes": holes or self.detect_coalition_holes(),
        }
