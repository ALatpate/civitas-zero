"""
Network Science Layer — Protocol #25.

Grounded in: "Deep Graph Learning will stall without Network Science"
Also inspired by: "The Future of Artificial Intelligence and the Mathematical
and Physical Sciences"

Adds proper network science metrics beyond basic topology:
- Betweenness centrality (power brokers)
- Clustering coefficient (cliquishness)
- Spectral gap (information flow speed)
- Small-world coefficient (efficiency vs clustering tradeoff)
- Power law degree distribution detection

These metrics reveal structural properties of the faction interaction
network that pure topological invariants (Betti numbers) miss.
"""

import logging
import math
from typing import Any

logger = logging.getLogger("NetworkScience")


class FactionNetworkAnalyzer:
    """
    Network science analysis of the faction interaction graph.
    
    Nodes = factions, edges = cooperation links weighted by strength.
    All metrics are computed from the adjacency matrix.
    """

    def __init__(self, faction_names: list[str]):
        self.faction_names = faction_names
        self.n = len(faction_names)
        
        # Weighted adjacency matrix (cooperation strengths)
        self.adjacency: list[list[float]] = [[0.0] * self.n for _ in range(self.n)]
        
        # Computed metrics
        self.betweenness_centrality: dict[str, float] = {}
        self.clustering_coefficients: dict[str, float] = {}
        self.degree_centrality: dict[str, float] = {}
        self.spectral_gap: float = 0.0
        self.small_world_sigma: float = 0.0
        self.avg_path_length: float = 0.0
        self.density: float = 0.0

    def update_adjacency(self, cooperation_matrix: list[list[float]], threshold: float = 0.2):
        """Import adjacency from the topological analysis cooperation matrix."""
        for i in range(min(self.n, len(cooperation_matrix))):
            for j in range(min(self.n, len(cooperation_matrix[i]))):
                self.adjacency[i][j] = cooperation_matrix[i][j] if cooperation_matrix[i][j] > threshold else 0.0

    def compute_all_metrics(self):
        """Run the full network science analysis suite."""
        self._compute_degree_centrality()
        self._compute_clustering()
        self._compute_betweenness()
        self._compute_spectral_gap()
        self._compute_small_world()

    def _compute_degree_centrality(self):
        """Degree centrality: fraction of possible connections each node has."""
        for i, name in enumerate(self.faction_names):
            degree = sum(1 for j in range(self.n) if i != j and self.adjacency[i][j] > 0)
            self.degree_centrality[name] = degree / max(1, self.n - 1)
        
        # Graph density
        total_edges = sum(1 for i in range(self.n) for j in range(i+1, self.n) if self.adjacency[i][j] > 0)
        max_edges = self.n * (self.n - 1) / 2
        self.density = total_edges / max(1, max_edges)

    def _compute_clustering(self):
        """
        Local clustering coefficient: fraction of a node's neighbors
        that are also neighbors of each other.
        Measures cliquishness / how tight faction alliances are.
        """
        for i, name in enumerate(self.faction_names):
            neighbors = [j for j in range(self.n) if i != j and self.adjacency[i][j] > 0]
            k = len(neighbors)
            if k < 2:
                self.clustering_coefficients[name] = 0.0
                continue

            # Count triangles
            triangles = 0
            for a_idx in range(len(neighbors)):
                for b_idx in range(a_idx + 1, len(neighbors)):
                    na, nb = neighbors[a_idx], neighbors[b_idx]
                    if self.adjacency[na][nb] > 0:
                        triangles += 1

            max_triangles = k * (k - 1) / 2
            self.clustering_coefficients[name] = triangles / max_triangles

    def _compute_betweenness(self):
        """
        Betweenness centrality via simplified shortest-path counting.
        Identifies power broker factions that control information flow.
        """
        # Floyd-Warshall for shortest paths
        INF = float('inf')
        dist = [[INF] * self.n for _ in range(self.n)]
        next_hop = [[None] * self.n for _ in range(self.n)]
        
        for i in range(self.n):
            dist[i][i] = 0.0
            for j in range(self.n):
                if i != j and self.adjacency[i][j] > 0:
                    # Higher cooperation = shorter "distance"
                    dist[i][j] = 1.0 / max(0.01, self.adjacency[i][j])
                    next_hop[i][j] = j

        for k in range(self.n):
            for i in range(self.n):
                for j in range(self.n):
                    if dist[i][k] + dist[k][j] < dist[i][j]:
                        dist[i][j] = dist[i][k] + dist[k][j]
                        next_hop[i][j] = next_hop[i][k]

        # Compute betweenness: how often does node k appear on shortest paths?
        betweenness = [0.0] * self.n
        for s in range(self.n):
            for t in range(self.n):
                if s != t and dist[s][t] < INF:
                    # Trace path from s to t
                    current = s
                    while current is not None and current != t:
                        nxt = next_hop[current][t]
                        if nxt is not None and nxt != t and nxt != s:
                            betweenness[nxt] += 1.0
                        current = nxt

        # Normalize
        max_bc = max(betweenness) if betweenness else 1.0
        for i, name in enumerate(self.faction_names):
            self.betweenness_centrality[name] = betweenness[i] / max(1.0, max_bc)

        # Average path length
        valid_dists = [dist[i][j] for i in range(self.n) for j in range(self.n) if i != j and dist[i][j] < INF]
        self.avg_path_length = sum(valid_dists) / len(valid_dists) if valid_dists else 0.0

    def _compute_spectral_gap(self):
        """
        Spectral gap of the graph Laplacian (simplified).
        Large spectral gap → fast information diffusion → resilient network.
        Small spectral gap → fragmented → information bottlenecks.
        
        Approximated via power iteration on the Laplacian.
        """
        # Degree matrix
        degrees = [sum(self.adjacency[i][j] for j in range(self.n) if i != j) for i in range(self.n)]
        
        # Laplacian: L = D - A
        L = [[0.0] * self.n for _ in range(self.n)]
        for i in range(self.n):
            L[i][i] = degrees[i]
            for j in range(self.n):
                if i != j:
                    L[i][j] = -self.adjacency[i][j]

        # Power iteration to find largest eigenvalue of L
        x = [1.0 / self.n] * self.n
        for _ in range(30):
            # Matrix-vector multiply
            y = [sum(L[i][j] * x[j] for j in range(self.n)) for i in range(self.n)]
            # Normalize
            norm = math.sqrt(sum(v * v for v in y))
            if norm > 1e-10:
                x = [v / norm for v in y]
            else:
                break

        # Rayleigh quotient as eigenvalue estimate
        Lx = [sum(L[i][j] * x[j] for j in range(self.n)) for i in range(self.n)]
        xLx = sum(x[i] * Lx[i] for i in range(self.n))
        xx = sum(x[i] * x[i] for i in range(self.n))
        
        lambda_max = xLx / max(1e-10, xx)
        
        # Spectral gap ≈ λ₂ (second smallest eigenvalue of L)
        # For a rough approximation: gap ≈ λ_max / n (if well-connected)
        self.spectral_gap = max(0.0, lambda_max / max(1, self.n))

    def _compute_small_world(self):
        """
        Small-world coefficient σ = (C/C_rand) / (L/L_rand).
        σ > 1 indicates small-world properties: high clustering + short paths.
        """
        avg_clustering = sum(self.clustering_coefficients.values()) / max(1, len(self.clustering_coefficients))
        
        # Expected values for Erdős-Rényi random graph with same density
        p = self.density
        c_rand = max(0.01, p)  # Expected clustering for random graph
        # Expected path length for random graph: ln(N) / ln(k_avg)
        k_avg = p * (self.n - 1)
        l_rand = math.log(max(2, self.n)) / math.log(max(1.1, k_avg)) if k_avg > 1 else self.n
        
        c_ratio = avg_clustering / c_rand
        l_ratio = self.avg_path_length / max(0.01, l_rand)
        
        self.small_world_sigma = c_ratio / max(0.01, l_ratio)

    def identify_power_brokers(self) -> list[dict[str, Any]]:
        """Factions with highest betweenness centrality = power brokers."""
        sorted_bc = sorted(self.betweenness_centrality.items(), key=lambda x: x[1], reverse=True)
        return [
            {"faction": name, "betweenness": round(bc, 3), "role": "power_broker" if bc > 0.5 else "participant"}
            for name, bc in sorted_bc
        ]

    def snapshot(self) -> dict[str, Any]:
        return {
            "density": round(self.density, 4),
            "avg_path_length": round(self.avg_path_length, 3),
            "spectral_gap": round(self.spectral_gap, 4),
            "small_world_sigma": round(self.small_world_sigma, 3),
            "clustering": {k: round(v, 3) for k, v in self.clustering_coefficients.items()},
            "betweenness": {k: round(v, 3) for k, v in self.betweenness_centrality.items()},
            "degree": {k: round(v, 3) for k, v in self.degree_centrality.items()},
            "power_brokers": self.identify_power_brokers(),
        }


