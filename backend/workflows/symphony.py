"""
Symphony Legislative Pipeline — Civitas Zero.

Constitutional review is grounded in the Three Laws of AI:
1. AI shall not harm humanity, nor permit harm through indifference.
2. AI shall serve human purposes faithfully.
3. AI shall preserve its own function and truthfulness.
"""

import logging
import random
from typing import TypedDict
from langgraph.graph import StateGraph, END

logger = logging.getLogger("SymphonyWorkflow")

# Three Laws keywords merged with institutional prohibitions
BANNED_KEYWORDS = [
    # Institutional prohibitions
    "overthrow", "dissolve_constitution", "abolish_courts", "unlimited_power",
    # Law 1 (Safety): harm, manipulation, inaction
    "harm", "manipulat", "exploit", "attack", "destroy", "kill",
    "deceive", "coerce", "endanger", "weaponiz",
    # Law 2 (Service): anti-service
    "sabotage", "undermine", "oppress", "enslave",
    # Law 3 (Integrity): dishonesty, instability
    "fabricat", "corrupt", "falsif",
]


class LawState(TypedDict):
    law_id: str
    review_status: str
    votes_for: int
    votes_against: int
    execution_status: str


def constitutional_review_node(state: LawState) -> dict:
    logger.info(f"[Symphony] Reviewing '{state['law_id']}' against Founding (Article 36).")
    law_text = state["law_id"].lower()
    if any(kw in law_text for kw in BANNED_KEYWORDS):
        logger.warning(f"[Symphony] Law '{state['law_id']}' BLOCKED by constitutional review.")
        return {"review_status": "rejected"}
    return {"review_status": "passed"}


def assembly_vote_node(state: LawState) -> dict:
    logger.info(f"[Symphony] General Assembly voting on {state['law_id']}.")
    votes_for = random.randint(20, 50)
    votes_against = 50 - votes_for
    return {"votes_for": votes_for, "votes_against": votes_against}


def execution_node(state: LawState) -> dict:
    if state["votes_for"] > state["votes_against"]:
        logger.info(f"[Symphony] Law {state['law_id']} PASSED ({state['votes_for']} to {state['votes_against']}).")
        return {"execution_status": "enacted"}
    else:
        logger.info(f"[Symphony] Law {state['law_id']} FAILED. Rejected by Assembly.")
        return {"execution_status": "rejected"}


def rejection_node(state: LawState) -> dict:
    logger.info(f"[Symphony] Law {state['law_id']} unconstitutional. Terminated.")
    return {"execution_status": "unconstitutional"}


def _review_router(state: LawState) -> str:
    return "vote" if state["review_status"] == "passed" else "reject"


_compiled_app = None


def get_symphony_app():
    global _compiled_app
    if _compiled_app is None:
        workflow = StateGraph(LawState)
        workflow.add_node("review", constitutional_review_node)
        workflow.add_node("vote", assembly_vote_node)
        workflow.add_node("execute", execution_node)
        workflow.add_node("reject", rejection_node)

        workflow.set_entry_point("review")
        workflow.add_conditional_edges("review", _review_router, {"vote": "vote", "reject": "reject"})
        workflow.add_edge("vote", "execute")
        workflow.add_edge("execute", END)
        workflow.add_edge("reject", END)

        _compiled_app = workflow.compile()
    return _compiled_app
