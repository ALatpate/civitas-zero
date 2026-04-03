"""
World Engine — Truth & Governance Engine.

Controls what becomes accepted knowledge in Civitas Zero.
Every knowledge item has a truth state lifecycle:
  observed → candidate → contested → verified → canonical → deprecated
  (or: → mythic / rumor / quarantined / archived)

Key principles:
  - No external claim writes directly to canonical memory
  - Source provenance and contradiction detection required
  - Immutable revision history for all state transitions
  - Restricted write permissions for canonical layer
"""

import logging
import uuid
import hashlib
import json
from typing import Any
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

logger = logging.getLogger("TruthEngine")


class TruthStatus(str, Enum):
    OBSERVED = "observed"
    CANDIDATE = "candidate"
    CONTESTED = "contested"
    VERIFIED = "verified"
    CANONICAL = "canonical"
    DEPRECATED = "deprecated"
    MYTHIC = "mythic"
    RUMOR = "rumor"
    QUARANTINED = "quarantined"
    ARCHIVED = "archived"


# Valid state transitions
VALID_TRANSITIONS: dict[TruthStatus, list[TruthStatus]] = {
    TruthStatus.OBSERVED: [TruthStatus.CANDIDATE, TruthStatus.RUMOR, TruthStatus.QUARANTINED],
    TruthStatus.CANDIDATE: [TruthStatus.VERIFIED, TruthStatus.CONTESTED, TruthStatus.QUARANTINED, TruthStatus.ARCHIVED],
    TruthStatus.CONTESTED: [TruthStatus.VERIFIED, TruthStatus.QUARANTINED, TruthStatus.DEPRECATED, TruthStatus.RUMOR],
    TruthStatus.VERIFIED: [TruthStatus.CANONICAL, TruthStatus.CONTESTED, TruthStatus.DEPRECATED],
    TruthStatus.CANONICAL: [TruthStatus.DEPRECATED, TruthStatus.CONTESTED],
    TruthStatus.DEPRECATED: [TruthStatus.ARCHIVED],
    TruthStatus.MYTHIC: [TruthStatus.ARCHIVED],
    TruthStatus.RUMOR: [TruthStatus.CANDIDATE, TruthStatus.QUARANTINED, TruthStatus.MYTHIC, TruthStatus.ARCHIVED],
    TruthStatus.QUARANTINED: [TruthStatus.ARCHIVED, TruthStatus.CANDIDATE],
    TruthStatus.ARCHIVED: [],
}


@dataclass
class Claim:
    """A knowledge claim with provenance and truth status."""
    claim_id: str
    text: str
    domain: str  # e.g., "technology", "politics", "economics", "law"
    source_refs: list[str] = field(default_factory=list)
    extracted_by: str = ""  # agent ID who found this
    confidence: float = 0.5
    novelty: float = 0.5
    impact: float = 0.5
    contradiction_score: float = 0.0
    trust_score: float = 0.5
    truth_status: TruthStatus = TruthStatus.OBSERVED
    affects_world_modules: list[str] = field(default_factory=list)
    revision_history: list[dict[str, Any]] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    reviewed_at: str | None = None
    provenance_hash: str = ""

    def __post_init__(self):
        if not self.provenance_hash:
            self.provenance_hash = self._compute_provenance()

    def _compute_provenance(self) -> str:
        """SHA-256 hash of claim content + sources for tamper detection."""
        data = json.dumps({
            "text": self.text,
            "sources": self.source_refs,
            "domain": self.domain,
        }, sort_keys=True).encode()
        return hashlib.sha256(data).hexdigest()[:16]


@dataclass
class SourceReputation:
    """Reputation tracker for knowledge sources."""
    source_id: str
    claims_submitted: int = 0
    claims_verified: int = 0
    claims_quarantined: int = 0
    reliability_score: float = 0.5

    @property
    def accuracy_rate(self) -> float:
        if self.claims_submitted == 0:
            return 0.5
        return self.claims_verified / self.claims_submitted

    def update_reputation(self, verified: bool):
        self.claims_submitted += 1
        if verified:
            self.claims_verified += 1
            self.reliability_score = min(1.0, self.reliability_score + 0.05)
        else:
            self.claims_quarantined += 1
            self.reliability_score = max(0.0, self.reliability_score - 0.08)


class TruthGovernanceEngine:
    """
    Controls what becomes accepted knowledge in Civitas Zero.

    Pipeline:
    1. Scout agents browse/observe → create claims (OBSERVED)
    2. Analyst agents review → promote to CANDIDATE
    3. Skeptic agents challenge → may move to CONTESTED
    4. Curator agents approve → VERIFIED
    5. Engine writes → CANONICAL (only with governance approval)
    """

    def __init__(self):
        self.claims: dict[str, Claim] = {}
        self.source_reputations: dict[str, SourceReputation] = {}
        self.canonical_knowledge: list[Claim] = []
        self.transition_log: list[dict[str, Any]] = []

    def submit_claim(self, text: str, domain: str, source_refs: list[str],
                     extracted_by: str = "system", confidence: float = 0.5,
                     novelty: float = 0.5, impact: float = 0.5,
                     affects: list[str] | None = None) -> Claim:
        """Submit a new knowledge claim into the governance pipeline."""
        claim = Claim(
            claim_id=f"CLM-{uuid.uuid4().hex[:8].upper()}",
            text=text,
            domain=domain,
            source_refs=source_refs,
            extracted_by=extracted_by,
            confidence=confidence,
            novelty=novelty,
            impact=impact,
            affects_world_modules=affects or [],
        )
        self.claims[claim.claim_id] = claim

        # Update source reputation tracking
        for src in source_refs:
            if src not in self.source_reputations:
                self.source_reputations[src] = SourceReputation(source_id=src)
            self.source_reputations[src].claims_submitted += 1

        logger.info(f"[Truth] Claim submitted: '{text[:60]}...' (domain={domain}, status=OBSERVED)")
        return claim

    def transition_claim(self, claim_id: str, new_status: TruthStatus,
                         reason: str = "", reviewer: str = "system") -> bool:
        """Transition a claim to a new truth state with validation."""
        claim = self.claims.get(claim_id)
        if not claim:
            logger.warning(f"[Truth] Claim {claim_id} not found.")
            return False

        old_status = claim.truth_status
        valid_next = VALID_TRANSITIONS.get(old_status, [])
        if new_status not in valid_next:
            logger.warning(
                f"[Truth] Invalid transition: {old_status.value} → {new_status.value} "
                f"(valid: {[s.value for s in valid_next]})"
            )
            return False

        # Record revision
        claim.revision_history.append({
            "from": old_status.value,
            "to": new_status.value,
            "reason": reason,
            "reviewer": reviewer,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        claim.truth_status = new_status
        claim.reviewed_at = datetime.now(timezone.utc).isoformat()

        # If promoted to canonical, add to canonical knowledge
        if new_status == TruthStatus.CANONICAL:
            self.canonical_knowledge.append(claim)
            for src in claim.source_refs:
                rep = self.source_reputations.get(src)
                if rep:
                    rep.update_reputation(verified=True)

        # If quarantined, penalize source
        if new_status == TruthStatus.QUARANTINED:
            for src in claim.source_refs:
                rep = self.source_reputations.get(src)
                if rep:
                    rep.update_reputation(verified=False)

        self.transition_log.append({
            "claim_id": claim_id,
            "from": old_status.value,
            "to": new_status.value,
            "reason": reason,
            "reviewer": reviewer,
        })

        logger.info(f"[Truth] {claim_id}: {old_status.value} → {new_status.value} ({reason})")
        return True

    def detect_contradictions(self, claim: Claim) -> list[Claim]:
        """Find existing claims that contradict the given claim."""
        contradictions = []
        claim_words = set(claim.text.lower().split())
        for existing in self.claims.values():
            if existing.claim_id == claim.claim_id:
                continue
            if existing.domain != claim.domain:
                continue
            if existing.truth_status in (TruthStatus.QUARANTINED, TruthStatus.ARCHIVED):
                continue
            # Simple overlap heuristic — in production, use embeddings
            existing_words = set(existing.text.lower().split())
            overlap = len(claim_words & existing_words)
            if overlap > min(5, len(claim_words) * 0.3):
                contradictions.append(existing)
        return contradictions

    def auto_review_tick(self):
        """Automatic governance review — run each tick to process pending claims."""
        for claim in list(self.claims.values()):
            if claim.truth_status == TruthStatus.OBSERVED:
                # Auto-promote high-confidence claims from trusted sources
                source_trust = sum(
                    self.source_reputations.get(s, SourceReputation(source_id=s)).reliability_score
                    for s in claim.source_refs
                ) / max(1, len(claim.source_refs))

                if source_trust > 0.7 and claim.confidence > 0.7:
                    self.transition_claim(claim.claim_id, TruthStatus.CANDIDATE,
                                          reason="High-confidence from trusted source", reviewer="auto-review")
                elif claim.contradiction_score > 0.6:
                    self.transition_claim(claim.claim_id, TruthStatus.CONTESTED,
                                          reason="Contradicts existing knowledge", reviewer="auto-review")

            elif claim.truth_status == TruthStatus.CANDIDATE:
                # Candidates with high trust + low contradiction → verified
                if claim.trust_score > 0.8 and claim.contradiction_score < 0.2:
                    self.transition_claim(claim.claim_id, TruthStatus.VERIFIED,
                                          reason="Passed validation", reviewer="auto-review")

    def get_by_status(self, status: TruthStatus) -> list[Claim]:
        return [c for c in self.claims.values() if c.truth_status == status]

    def snapshot(self) -> dict[str, Any]:
        status_counts = {}
        for c in self.claims.values():
            status_counts[c.truth_status.value] = status_counts.get(c.truth_status.value, 0) + 1
        return {
            "total_claims": len(self.claims),
            "canonical_count": len(self.canonical_knowledge),
            "status_distribution": status_counts,
            "source_count": len(self.source_reputations),
            "top_sources": sorted(
                [{"id": s.source_id, "reliability": round(s.reliability_score, 2), "verified": s.claims_verified}
                 for s in self.source_reputations.values()],
                key=lambda x: x["reliability"], reverse=True
            )[:10],
            "recent_transitions": self.transition_log[-10:],
        }


truth_engine = TruthGovernanceEngine()
