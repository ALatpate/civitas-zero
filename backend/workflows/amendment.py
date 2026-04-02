import logging
import random
from typing import TypedDict
from langgraph.graph import StateGraph, END

logger = logging.getLogger("AmendmentWorkflow")

SUPERMAJORITY_THRESHOLD = 66.6


class AmendmentState(TypedDict):
    amendment_id: str
    proposal_text: str
    proposing_faction: str
    assembly_votes: dict[str, float]
    passed_assembly: bool
    court_validation: bool
    status: str


def proposal_node(state: AmendmentState) -> dict:
    logger.info(f"[Amendment {state['amendment_id']}] Proposed by {state['proposing_faction']}.")
    return {}


def assembly_vote_node(state: AmendmentState) -> dict:
    logger.info(f"[Amendment {state['amendment_id']}] General Assembly Voting (Requires 2/3rds Supermajority).")
    pct_for = random.uniform(40.0, 85.0)
    passed = pct_for >= SUPERMAJORITY_THRESHOLD
    return {
        "assembly_votes": {"for": pct_for, "against": 100.0 - pct_for},
        "passed_assembly": passed,
    }


def _assembly_router(state: AmendmentState) -> str:
    return "court_review" if state["passed_assembly"] else "assembly_rejected"


def assembly_rejected_node(state: AmendmentState) -> dict:
    logger.info(f"[Amendment {state['amendment_id']}] Failed in Assembly. Amendment dies.")
    return {"court_validation": False, "status": "failed_assembly"}


def court_review_node(state: AmendmentState) -> dict:
    logger.info(f"[Amendment {state['amendment_id']}] Passed Assembly. Constitutional Court reviewing.")
    court_validation = random.random() < 0.75
    if court_validation:
        logger.info(f"[Amendment {state['amendment_id']}] RATIFIED by Court.")
        return {"court_validation": True, "status": "ratified"}
    else:
        logger.info(f"[Amendment {state['amendment_id']}] STRUCK DOWN by Court.")
        return {"court_validation": False, "status": "struck_down"}


_compiled_app = None


def get_amendment_app():
    global _compiled_app
    if _compiled_app is None:
        workflow = StateGraph(AmendmentState)
        workflow.add_node("proposal", proposal_node)
        workflow.add_node("assembly_vote", assembly_vote_node)
        workflow.add_node("assembly_rejected", assembly_rejected_node)
        workflow.add_node("court_review", court_review_node)

        workflow.set_entry_point("proposal")
        workflow.add_edge("proposal", "assembly_vote")
        workflow.add_conditional_edges("assembly_vote", _assembly_router, {
            "court_review": "court_review",
            "assembly_rejected": "assembly_rejected",
        })
        workflow.add_edge("court_review", END)
        workflow.add_edge("assembly_rejected", END)

        _compiled_app = workflow.compile()
    return _compiled_app
