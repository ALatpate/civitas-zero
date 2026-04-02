"""
Information-Geometric Agent Memory — Protocol #19.

Grounded in: "SuperLocalMemory V3: Information-Geometric Foundations for Zero-LLM
Enterprise Agent Memory"

Memories are weighted by informational surprise (KL divergence from prior beliefs).
Natural gradient-based consolidation: important memories resist decay.
Fisher Information Metric determines which memories are informationally rich.
"""

import logging
import math
import random
from typing import Any
from dataclasses import dataclass, field

logger = logging.getLogger("AgentMemory")


@dataclass
class MemoryTrace:
    """A single memory with information-geometric metadata."""
    content: str
    source: str
    tick: int
    # Information weight: how surprising/informative was this memory
    fisher_weight: float = 1.0
    # Access count (retrieved memories strengthen)
    access_count: int = 0
    # Embedding: simplified as a category hash for retrieval
    category: str = "general"


class FisherMemoryBank:
    """
    Information-Geometric Memory using Fisher Information Metric.

    Key properties:
    1. Memories weighted by informational surprise (KL divergence from prior)
    2. Natural gradient consolidation: important memories resist decay
    3. Capacity-bounded: least informative memories evicted first
    4. Retrieval boosts memory weight (Hebbian-like strengthening)
    """

    def __init__(self, capacity: int = 100, decay_rate: float = 0.02):
        self.capacity = capacity
        self.decay_rate = decay_rate
        self.memories: list[MemoryTrace] = []
        self.total_surprise: float = 0.0
        self.consolidation_count: int = 0

    def store(self, content: str, source: str, tick: int, surprise: float = 0.0, category: str = "general"):
        """
        Store a new memory. Fisher weight is proportional to surprise.
        Higher surprise = more informative = higher retention priority.
        """
        # Fisher weight: base weight + surprise bonus (KL divergence proxy)
        fisher_weight = 1.0 + min(5.0, surprise * 2.0)

        trace = MemoryTrace(
            content=content,
            source=source,
            tick=tick,
            fisher_weight=fisher_weight,
            category=category,
        )
        self.memories.append(trace)
        self.total_surprise += surprise

        # Enforce capacity: evict least informative memories
        if len(self.memories) > self.capacity:
            self._evict()

    def _evict(self):
        """Remove the memory with the lowest Fisher weight (least informative)."""
        if not self.memories:
            return
        # Sort by fisher_weight ascending, remove the weakest
        self.memories.sort(key=lambda m: m.fisher_weight)
        evicted = self.memories.pop(0)
        logger.debug(f"Memory evicted: '{evicted.content[:40]}...' (weight={evicted.fisher_weight:.3f})")

    def consolidate(self):
        """
        Natural gradient-based memory consolidation.
        - All memories decay (entropy increase)
        - But high-Fisher-weight memories decay slower (information preservation)
        - Very weak memories are pruned
        """
        if not self.memories:
            return

        surviving = []
        for mem in self.memories:
            # Decay rate is inversely proportional to Fisher weight
            # Important memories resist forgetting
            effective_decay = self.decay_rate / max(0.1, mem.fisher_weight)
            mem.fisher_weight -= effective_decay

            # Prune memories that have decayed below threshold
            if mem.fisher_weight > 0.1:
                surviving.append(mem)

        self.memories = surviving
        self.consolidation_count += 1

    def retrieve(self, query_category: str = "general", top_k: int = 5) -> list[MemoryTrace]:
        """
        Retrieve top-k memories by Fisher weight, optionally filtered by category.
        Retrieved memories get a Hebbian strengthening boost.
        """
        candidates = self.memories
        if query_category != "general":
            category_matches = [m for m in self.memories if m.category == query_category]
            if category_matches:
                candidates = category_matches

        # Sort by Fisher weight descending
        ranked = sorted(candidates, key=lambda m: m.fisher_weight, reverse=True)
        results = ranked[:top_k]

        # Hebbian strengthening: accessed memories grow stronger
        for mem in results:
            mem.access_count += 1
            mem.fisher_weight += 0.1  # Access bonus

        return results

    def get_belief_summary(self, top_k: int = 5) -> str:
        """Generate a natural language belief summary from top memories."""
        top_memories = self.retrieve(top_k=top_k)
        if not top_memories:
            return "No significant observations recorded."

        summaries = [f"[{m.category}] {m.content[:80]}" for m in top_memories]
        return " | ".join(summaries)

    @property
    def information_density(self) -> float:
        """Total Fisher information stored in the memory bank."""
        return sum(m.fisher_weight for m in self.memories)

    @property
    def memory_entropy(self) -> float:
        """Entropy of Fisher weight distribution (memory diversity)."""
        if not self.memories:
            return 0.0
        total = sum(m.fisher_weight for m in self.memories)
        if total < 1e-10:
            return 0.0
        entropy = 0.0
        for m in self.memories:
            p = m.fisher_weight / total
            if p > 1e-10:
                entropy -= p * math.log(p)
        return entropy

    def snapshot(self) -> dict[str, Any]:
        return {
            "memory_count": len(self.memories),
            "capacity": self.capacity,
            "information_density": round(self.information_density, 3),
            "memory_entropy": round(self.memory_entropy, 3),
            "total_surprise": round(self.total_surprise, 3),
            "consolidations": self.consolidation_count,
            "top_memories": [
                {"content": m.content[:60], "weight": round(m.fisher_weight, 3), "category": m.category}
                for m in sorted(self.memories, key=lambda x: x.fisher_weight, reverse=True)[:5]
            ],
        }
