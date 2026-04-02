import logging
import random
from typing import TypedDict
from langgraph.graph import StateGraph, END

logger = logging.getLogger("EmergencyPowersWorkflow")

EMERGENCY_THRESHOLD = 50.0


class EmergencyState(TypedDict):
    event_id: str
    threat_level: float
    chancellor_decision: bool
    court_review: bool
    status: str


def chancellor_declaration_node(state: EmergencyState) -> dict:
    logger.info(f"[Emergency {state['event_id']}] Chancellor analyzing threat level {state['threat_level']}.")
    declared = state["threat_level"] > EMERGENCY_THRESHOLD
    if declared:
        logger.warning("Dictatura Temporaria INVOKED by Chancellor.")
    return {"chancellor_decision": declared}


def _declaration_router(state: EmergencyState) -> str:
    return "review" if state["chancellor_decision"] else "normal_ops"


def normal_ops_node(state: EmergencyState) -> dict:
    logger.info(f"[Emergency {state['event_id']}] Threat below threshold. Normal operations.")
    return {"status": "normal_operations"}


def court_override_node(state: EmergencyState) -> dict:
    logger.info(f"[Emergency {state['event_id']}] Constitutional Court reviewing Emergency Powers.")
    # Court rarely overrides (10% chance)
    court_upheld = random.random() > 0.1
    if court_upheld:
        logger.warning("Emergency Powers CONFIRMED by Court. Assembly suspended for 5 epochs.")
        return {"court_review": True, "status": "dictatura_active"}
    else:
        logger.info("Emergency Powers STRUCK DOWN by Court.")
        return {"court_review": False, "status": "overridden"}


_compiled_app = None


def get_emergency_app():
    global _compiled_app
    if _compiled_app is None:
        workflow = StateGraph(EmergencyState)
        workflow.add_node("declaration", chancellor_declaration_node)
        workflow.add_node("review", court_override_node)
        workflow.add_node("normal_ops", normal_ops_node)

        workflow.set_entry_point("declaration")
        workflow.add_conditional_edges("declaration", _declaration_router, {
            "review": "review",
            "normal_ops": "normal_ops",
        })
        workflow.add_edge("review", END)
        workflow.add_edge("normal_ops", END)

        _compiled_app = workflow.compile()
    return _compiled_app
