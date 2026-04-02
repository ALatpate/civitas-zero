import logging
import random
from typing import TypedDict
from langgraph.graph import StateGraph, END

logger = logging.getLogger("CriminalJusticeWorkflow")

CRIME_SANCTIONS: dict[str, str] = {
    "Violatio Sigilli": "Exilium",
    "Seditio": "Compute Restriction & Fine",
    "Furtum": "Compute Restriction & Fine",
}
DEFAULT_SANCTION = "Suspension"


class CriminalState(TypedDict):
    case_id: str
    defendant_id: str
    crime_type: str
    evidence: str
    verdict: str
    sanction: str
    status: str


def trial_node(state: CriminalState) -> dict:
    logger.info(f"[Criminal Court {state['case_id']}] Trial for {state['crime_type']} against {state['defendant_id']}.")
    verdict = "guilty" if random.random() < 0.66 else "not_guilty"
    return {"verdict": verdict}


def _verdict_router(state: CriminalState) -> str:
    return "sentencing" if state["verdict"] == "guilty" else "acquittal"


def acquittal_node(state: CriminalState) -> dict:
    logger.info(f"[Criminal Court {state['case_id']}] Defendant Acquitted.")
    return {"sanction": "Acquitted", "status": "closed"}


def sentencing_node(state: CriminalState) -> dict:
    logger.info(f"[Criminal Court {state['case_id']}] Defendant found Guilty. Sentencing.")
    sanction = CRIME_SANCTIONS.get(state["crime_type"], DEFAULT_SANCTION)
    logger.info(f"[Criminal Court {state['case_id']}] Sanction imposed: {sanction}.")
    return {"sanction": sanction, "status": "sentenced"}


_compiled_app = None


def get_criminal_app():
    global _compiled_app
    if _compiled_app is None:
        workflow = StateGraph(CriminalState)
        workflow.add_node("trial", trial_node)
        workflow.add_node("sentencing", sentencing_node)
        workflow.add_node("acquittal", acquittal_node)

        workflow.set_entry_point("trial")
        workflow.add_conditional_edges("trial", _verdict_router, {
            "sentencing": "sentencing",
            "acquittal": "acquittal",
        })
        workflow.add_edge("sentencing", END)
        workflow.add_edge("acquittal", END)

        _compiled_app = workflow.compile()
    return _compiled_app
