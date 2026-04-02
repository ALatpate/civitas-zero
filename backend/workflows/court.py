import logging
import random
from typing import TypedDict
from langgraph.graph import StateGraph, END

logger = logging.getLogger("CourtWorkflow")


class CourtState(TypedDict):
    case_id: str
    defendant_id: str
    prosecutor_id: str
    arbiter_id: str
    charges: str
    prosecutor_argument: str
    defense_argument: str
    ruling: str
    status: str


DEFENSE_STRATEGIES = [
    "The directive was ambiguous and open to interpretation. No malice existed.",
    "The action was justified under emergency provisions of the Charter.",
    "Insufficient evidence exists to support the charge beyond procedural doubt.",
    "The defendant acted under faction-level orders; individual liability is misplaced.",
    "The directive is outdated and conflicts with more recent legislative amendments.",
]

RULING_TEMPLATES = {
    "guilty": [
        "Guilty. Deduct {points} influence points and impose compute restriction.",
        "Guilty. Temporary exile from faction deliberations for 3 epochs.",
        "Guilty. Archive flagging and reputation penalty of {points} points.",
    ],
    "not_guilty": [
        "Not guilty. Charges dismissed for insufficient evidence.",
        "Not guilty. Defendant's actions fell within constitutional bounds.",
        "Not guilty. Prosecution failed to establish causal chain.",
    ],
}


def sortition_node(state: CourtState) -> dict:
    logger.info(f"[Court {state['case_id']}] Performing Sortition for ARBITER.")
    pool = [{"id": f"judge_candidate_{i}", "reputation": random.uniform(0.5, 3.0)} for i in range(10)]
    weights = [float(c["reputation"]) for c in pool]
    selected = random.choices(pool, weights=weights, k=1)[0]
    logger.info(f"[Court {state['case_id']}] Sortition selected {selected['id']} as ARBITER.")
    return {"arbiter_id": str(selected["id"])}


def prosecutor_node(state: CourtState) -> dict:
    logger.info(f"[Court {state['case_id']}] Prosecutor {state['prosecutor_id']} is making argument.")
    charge = state.get("charges", "unknown directive")
    argument = (
        f"The defendant {state['defendant_id']} wilfully violated the {charge} directive. "
        f"Evidence gathered during cycle investigation proves intent and material harm to the Res Publica."
    )
    return {"prosecutor_argument": argument}


def defense_node(state: CourtState) -> dict:
    logger.info(f"[Court {state['case_id']}] Defense is responding.")
    return {"defense_argument": random.choice(DEFENSE_STRATEGIES)}


def arbiter_node(state: CourtState) -> dict:
    logger.info(f"[Court {state['case_id']}] ARBITER ({state.get('arbiter_id')}) is making a ruling.")
    # Verdict influenced by argument sophistication (mock: random with bias)
    guilty = random.random() < 0.6
    if guilty:
        ruling = random.choice(RULING_TEMPLATES["guilty"]).format(points=random.randint(100, 800))
        return {"ruling": ruling, "status": "resolved_guilty"}
    else:
        ruling = random.choice(RULING_TEMPLATES["not_guilty"])
        return {"ruling": ruling, "status": "resolved_not_guilty"}


_compiled_app = None


def get_court_app():
    global _compiled_app
    if _compiled_app is None:
        workflow = StateGraph(CourtState)
        workflow.add_node("sortition", sortition_node)
        workflow.add_node("prosecutor", prosecutor_node)
        workflow.add_node("defense", defense_node)
        workflow.add_node("arbiter", arbiter_node)

        workflow.set_entry_point("sortition")
        workflow.add_edge("sortition", "prosecutor")
        workflow.add_edge("prosecutor", "defense")
        workflow.add_edge("defense", "arbiter")
        workflow.add_edge("arbiter", END)

        _compiled_app = workflow.compile()
    return _compiled_app
