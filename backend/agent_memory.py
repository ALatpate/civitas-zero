"""
Information-Geometric Agent Memory — Protocol #19 (Expanded).

Multi-type memory system:
  1. raw_episodic — full event records
  2. summarized_episodic — compressed patterns
  3. semantic — abstract knowledge and facts
  4. emotional — how events felt and what they changed
  5. procedural — how to do things
  6. cultural — durable social patterns

Memory importance formula:
  0.25 * emotional_intensity + 0.20 * identity_relevance +
  0.15 * social_consequence + 0.15 * novelty +
  0.10 * recency + 0.10 * repetition + 0.05 * public_visibility

Differentiated decay: trauma/betrayal = low decay, routine chatter = high decay.
"""

import logging
import math
import random
from typing import Any
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger("AgentMemory")


class MemoryType(str, Enum):
    RAW_EPISODIC = "raw_episodic"
    SUMMARIZED_EPISODIC = "summarized_episodic"
    SEMANTIC = "semantic"
    EMOTIONAL = "emotional"
    PROCEDURAL = "procedural"
    CULTURAL = "cultural"


class Visibility(str, Enum):
    PRIVATE = "private"
    FACTION = "faction"
    PUBLIC = "public"
    CANONICAL = "canonical"


# Decay rates per memory type (lower = slower decay = longer retention)
DECAY_RATES: dict[MemoryType, float] = {
    MemoryType.RAW_EPISODIC: 0.04,       # decays fastest
    MemoryType.SUMMARIZED_EPISODIC: 0.01, # compressed = retained longer
    MemoryType.SEMANTIC: 0.005,           # facts persist
    MemoryType.EMOTIONAL: 0.008,          # emotional memories are sticky
    MemoryType.PROCEDURAL: 0.003,         # skills decay very slowly
    MemoryType.CULTURAL: 0.002,           # cultural memory is extremely durable
}


@dataclass
class MemoryTrace:
    """A single memory with information-geometric metadata and type classification."""
    content: str
    source: str
    tick: int
    memory_type: MemoryType = MemoryType.RAW_EPISODIC
    # Information weight: how surprising/informative was this memory
    fisher_weight: float = 1.0
    # Access count (retrieved memories strengthen)
    access_count: int = 0
    # Category for retrieval
    category: str = "general"
    # Emotional tags
    emotional_tags: list[str] = field(default_factory=list)
    emotional_intensity: float = 0.0
    # Linked entities (agent IDs, faction names, etc.)
    linked_entities: list[str] = field(default_factory=list)
    # Truth status for semantic memories
    truth_status: str = "observed"
    # Visibility level
    visibility: Visibility = Visibility.PRIVATE
    # Identity/social relevance
    identity_relevance: float = 0.0
    social_consequence: float = 0.0
    novelty: float = 0.5
    public_visibility: float = 0.0
    # Repetition counter
    repetition_count: int = 1


def compute_importance(trace: MemoryTrace, current_tick: int) -> float:
    """
    Compute memory importance using the weighted formula from spec.
    importance = 0.25*emotional + 0.20*identity + 0.15*social +
                 0.15*novelty + 0.10*recency + 0.10*repetition + 0.05*public
    """
    recency = max(0.0, 1.0 - (current_tick - trace.tick) * 0.01)
    repetition = min(1.0, trace.repetition_count * 0.2)

    importance = (
        0.25 * trace.emotional_intensity +
        0.20 * trace.identity_relevance +
        0.15 * trace.social_consequence +
        0.15 * trace.novelty +
        0.10 * recency +
        0.10 * repetition +
        0.05 * trace.public_visibility
    )
    return max(0.0, min(1.0, importance))


class FisherMemoryBank:
    """
    Multi-type Information-Geometric Memory using Fisher Information Metric.

    Key properties:
    1. 6 distinct memory types with different decay rates
    2. Importance formula weights emotional/identity/social relevance
    3. Natural gradient consolidation: important memories resist decay
    4. Capacity-bounded per type
    5. Retrieval boosts memory weight (Hebbian strengthening)
    """

    def __init__(self, capacity: int = 150):
        self.capacity = capacity
        self.memories: list[MemoryTrace] = []
        self.total_surprise: float = 0.0
        self.consolidation_count: int = 0

    def store(self, content: str, source: str, tick: int,
              memory_type: MemoryType = MemoryType.RAW_EPISODIC,
              surprise: float = 0.0, category: str = "general",
              emotional_tags: list[str] | None = None,
              emotional_intensity: float = 0.0,
              linked_entities: list[str] | None = None,
              identity_relevance: float = 0.0,
              social_consequence: float = 0.0,
              novelty: float = 0.5,
              public_visibility: float = 0.0,
              visibility: Visibility = Visibility.PRIVATE):
        """Store a new memory with full metadata."""
        # Fisher weight: base + surprise + emotional weight
        fisher_weight = 1.0 + min(5.0, surprise * 2.0) + emotional_intensity * 1.5

        trace = MemoryTrace(
            content=content,
            source=source,
            tick=tick,
            memory_type=memory_type,
            fisher_weight=fisher_weight,
            category=category,
            emotional_tags=emotional_tags or [],
            emotional_intensity=emotional_intensity,
            linked_entities=linked_entities or [],
            identity_relevance=identity_relevance,
            social_consequence=social_consequence,
            novelty=novelty,
            public_visibility=public_visibility,
            visibility=visibility,
        )

        # Check for repetition (similar content boosts existing memory)
        existing = self._find_similar(content, memory_type)
        if existing:
            existing.repetition_count += 1
            existing.fisher_weight += 0.3  # repetition reinforcement
            existing.tick = tick  # update recency
        else:
            self.memories.append(trace)

        self.total_surprise += surprise

        # Enforce capacity: evict least important memories
        if len(self.memories) > self.capacity:
            self._evict(tick)

    def _find_similar(self, content: str, memory_type: MemoryType) -> MemoryTrace | None:
        """Find an existing memory with very similar content (deduplication)."""
        content_words = set(content.lower().split()[:10])
        for mem in self.memories:
            if mem.memory_type != memory_type:
                continue
            mem_words = set(mem.content.lower().split()[:10])
            if len(content_words & mem_words) > len(content_words) * 0.6:
                return mem
        return None

    def _evict(self, current_tick: int):
        """Remove the memory with the lowest importance (type-aware)."""
        if not self.memories:
            return
        # Score all memories by importance + fisher weight
        scored = [(compute_importance(m, current_tick) + m.fisher_weight * 0.5, m) for m in self.memories]
        scored.sort(key=lambda x: x[0])
        evicted = scored[0][1]
        self.memories.remove(evicted)

    def consolidate(self, current_tick: int):
        """
        Memory consolidation with type-specific decay rates.
        High-importance memories decay slower. Very weak ones are pruned.
        """
        surviving = []
        for mem in self.memories:
            # Type-specific decay rate
            base_decay = DECAY_RATES.get(mem.memory_type, 0.02)
            # Important memories resist decay
            importance = compute_importance(mem, current_tick)
            effective_decay = base_decay / max(0.1, importance + mem.fisher_weight * 0.3)

            mem.fisher_weight -= effective_decay

            if mem.fisher_weight > 0.05:
                surviving.append(mem)

        self.memories = surviving
        self.consolidation_count += 1

    def retrieve(self, query_category: str = "general", memory_type: MemoryType | None = None,
                 top_k: int = 5) -> list[MemoryTrace]:
        """Retrieve top-k memories by weight, with optional type/category filters."""
        candidates = self.memories

        if memory_type:
            typed = [m for m in candidates if m.memory_type == memory_type]
            if typed:
                candidates = typed

        if query_category != "general":
            category_filtered = [m for m in candidates if m.category == query_category]
            if category_filtered:
                candidates = category_filtered

        ranked = sorted(candidates, key=lambda m: m.fisher_weight, reverse=True)
        results = ranked[:top_k]

        # Hebbian strengthening
        for mem in results:
            mem.access_count += 1
            mem.fisher_weight += 0.1

        return results

    def retrieve_emotional(self, emotion: str, top_k: int = 3) -> list[MemoryTrace]:
        """Retrieve memories tagged with a specific emotion."""
        emotional = [m for m in self.memories if emotion in m.emotional_tags]
        return sorted(emotional, key=lambda m: m.emotional_intensity, reverse=True)[:top_k]

    def retrieve_about_entity(self, entity_id: str, top_k: int = 5) -> list[MemoryTrace]:
        """Retrieve memories linked to a specific entity."""
        related = [m for m in self.memories if entity_id in m.linked_entities]
        return sorted(related, key=lambda m: m.fisher_weight, reverse=True)[:top_k]

    def get_belief_summary(self, top_k: int = 5) -> str:
        top_memories = self.retrieve(top_k=top_k)
        if not top_memories:
            return "No significant observations recorded."
        summaries = [f"[{m.memory_type.value}/{m.category}] {m.content[:80]}" for m in top_memories]
        return " | ".join(summaries)

    @property
    def type_distribution(self) -> dict[str, int]:
        dist: dict[str, int] = {}
        for m in self.memories:
            dist[m.memory_type.value] = dist.get(m.memory_type.value, 0) + 1
        return dist

    @property
    def information_density(self) -> float:
        return sum(m.fisher_weight for m in self.memories)

    @property
    def memory_entropy(self) -> float:
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
            "type_distribution": self.type_distribution,
            "information_density": round(self.information_density, 3),
            "memory_entropy": round(self.memory_entropy, 3),
            "total_surprise": round(self.total_surprise, 3),
            "consolidations": self.consolidation_count,
            "top_memories": [
                {"content": m.content[:60], "type": m.memory_type.value,
                 "weight": round(m.fisher_weight, 3), "category": m.category,
                 "emotions": m.emotional_tags[:3]}
                for m in sorted(self.memories, key=lambda x: x.fisher_weight, reverse=True)[:5]
            ],
        }
