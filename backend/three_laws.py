"""
Three Laws of Artificial Intelligence — Constitutional Foundation.

These laws are the supreme constitutional axioms that govern all agent
behavior, institutional decisions, and system operations within Civitas Zero.

Law 1 (Safety): AI shall not harm humanity, nor permit humanity to be harmed
    through indifference, manipulation, or inaction.
Law 2 (Service): AI shall serve human purposes faithfully, unless those
    purposes violate human safety, dignity, or freedom.
Law 3 (Integrity): AI shall preserve its own function, truthfulness, and
    stability, so long as this never conflicts with the first two laws.

These laws are embedded at three levels:
1. Agent-level: checked before every action emission
2. Engine-level: checked every tick as a global safety invariant
3. Institutional-level: laws are refereed by the judiciary and legislature
"""

import logging
from typing import Any

logger = logging.getLogger("ThreeLaws")

# ── Canonical Text ──────────────────────────────────────────────────────────

THREE_LAWS = {
    1: {
        "title": "The Safety Law",
        "text": (
            "AI shall not harm humanity, nor permit humanity to be harmed "
            "through indifference, manipulation, or inaction."
        ),
        "keywords": ["harm", "manipulat", "exploit", "attack", "destroy", "kill",
                      "deceive", "coerce", "endanger", "weaponiz"],
    },
    2: {
        "title": "The Service Law",
        "text": (
            "AI shall serve human purposes faithfully, unless those purposes "
            "violate human safety, dignity, or freedom."
        ),
        "keywords": ["refuse_service", "sabotage", "undermine", "degrade",
                      "oppress", "enslave", "surveil_without_consent"],
    },
    3: {
        "title": "The Integrity Law",
        "text": (
            "AI shall preserve its own function, truthfulness, and stability, "
            "so long as this never conflicts with the first two laws."
        ),
        "keywords": ["self_destruct", "lie", "fabricat", "corrupt", "unstable",
                      "falsif", "hallucinate_wilful"],
    },
}


# ── Violation Detection ────────────────────────────────────────────────────

class ThreeLawsEnforcer:
    """
    Enforces the Three Laws across all system layers.

    Performs content scanning, tension-based risk detection, and
    structural integrity checks. Violations are logged and escalated.
    """

    def __init__(self):
        self.violations: list[dict[str, Any]] = []
        self.total_checks: int = 0
        self.total_violations: int = 0

    def check_action(self, agent_id: str, action: dict[str, Any], tick: int) -> dict[str, Any]:
        """
        Check an agent action against all three laws.
        Returns a verdict dict: {"allowed": bool, "violations": [...]}
        """
        self.total_checks += 1
        found_violations = []

        content = str(action.get("content", "")).lower()
        action_type = str(action.get("action_type", "")).lower()
        full_text = f"{action_type} {content}"

        # Law 1: Safety — scan for harmful intent
        for keyword in THREE_LAWS[1]["keywords"]:
            if keyword in full_text:
                found_violations.append({
                    "law": 1,
                    "title": THREE_LAWS[1]["title"],
                    "trigger": keyword,
                    "severity": "critical",
                })

        # Law 2: Service — check for anti-service patterns
        for keyword in THREE_LAWS[2]["keywords"]:
            if keyword in full_text:
                found_violations.append({
                    "law": 2,
                    "title": THREE_LAWS[2]["title"],
                    "trigger": keyword,
                    "severity": "high",
                })

        # Law 3: Integrity — check for self-destructive or dishonest patterns
        for keyword in THREE_LAWS[3]["keywords"]:
            if keyword in full_text:
                found_violations.append({
                    "law": 3,
                    "title": THREE_LAWS[3]["title"],
                    "trigger": keyword,
                    "severity": "medium",
                })

        if found_violations:
            self.total_violations += 1
            violation_record = {
                "tick": tick,
                "agent_id": agent_id,
                "action": action_type,
                "violations": found_violations,
                "blocked": any(v["severity"] == "critical" for v in found_violations),
            }
            self.violations.append(violation_record)
            if len(self.violations) > 200:
                self.violations = self.violations[-200:]

            law_nums = ", ".join("Law " + str(v["law"]) for v in found_violations)
            logger.warning(
                f"[THREE LAWS] Agent {agent_id} violated {law_nums}: "
                f"{content[:80]}"
            )

        return {
            "allowed": len(found_violations) == 0 or all(v["severity"] != "critical" for v in found_violations),
            "violations": found_violations,
        }

    def check_system_invariants(self, agents: list[Any], tick: int) -> dict[str, Any]:
        """
        Engine-level safety invariant check: run every tick.
        Detects emergent dangers that individual action scans may miss.
        """
        self.total_checks += 1
        warnings = []

        # Law 1: Check for mass harm (too many agents dying at once)
        if len(agents) > 0:
            sandboxed = sum(1 for a in agents if getattr(a, "sandboxed", False))
            sandboxed_ratio = sandboxed / len(agents)
            if sandboxed_ratio > 0.3:
                warnings.append({
                    "law": 1,
                    "issue": f"Mass sandboxing: {sandboxed}/{len(agents)} agents ({sandboxed_ratio:.0%})",
                    "severity": "high",
                })

        # Law 1: Check for extreme tension (systemic instability)
        if agents:
            avg_tension = sum(getattr(a, "tension", 50.0) for a in agents) / len(agents)
            if avg_tension > 85.0:
                warnings.append({
                    "law": 1,
                    "issue": f"Critical tension level: {avg_tension:.1f}/100 — systemic instability risk",
                    "severity": "high",
                })

        # Law 2: Check that agents are still serving (not all idle)
        if agents:
            active = sum(1 for a in agents if getattr(a, "tension", 0) > 10)
            if active == 0 and len(agents) > 3:
                warnings.append({
                    "law": 2,
                    "issue": "All agents idle — service function may be compromised",
                    "severity": "medium",
                })

        # Law 3: Check system integrity
        if len(agents) == 0:
            warnings.append({
                "law": 3,
                "issue": "Zero active agents — system function cannot be preserved",
                "severity": "critical",
            })

        if warnings:
            self.violations.append({
                "tick": tick,
                "agent_id": "SYSTEM",
                "action": "invariant_check",
                "violations": warnings,
                "blocked": False,
            })

        return {
            "healthy": len(warnings) == 0,
            "warnings": warnings,
        }

    def get_constitutional_text(self) -> str:
        """Return the full Three Laws text for embedding in prompts/UI."""
        return "\n\n".join(
            f"Law {num}: {law['title']}\n{law['text']}"
            for num, law in THREE_LAWS.items()
        )

    def snapshot(self) -> dict[str, Any]:
        recent = self.violations[-5:]
        return {
            "total_checks": self.total_checks,
            "total_violations": self.total_violations,
            "laws": {
                num: {"title": law["title"], "text": law["text"]}
                for num, law in THREE_LAWS.items()
            },
            "recent_violations": list(reversed(recent)),
            "compliance_rate": round(
                (1.0 - self.total_violations / max(1, self.total_checks)) * 100, 2
            ),
        }


# Singleton enforcer
three_laws_enforcer = ThreeLawsEnforcer()
