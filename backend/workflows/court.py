import logging
from typing import TypedDict, List
from langgraph.graph import StateGraph, END
import time

logger = logging.getLogger("CourtWorkflow")

# Define the state passed between nodes in the graph
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

# Node Functions
def sortition_node(state: CourtState):
    logger.info(f"[Court {state['case_id']}] Performing Sortition for ARBITER.")
    import random
    
    # Mock pool of eligible citizens weighted by reputation
    pool = [{"id": f"judge_candidate_{i}", "reputation": random.uniform(0.5, 3.0)} for i in range(10)]
    weights = [float(c["reputation"]) for c in pool]
    
    selected = random.choices(pool, weights=weights, k=1)[0]
    state["arbiter_id"] = str(selected["id"])
    logger.info(f"[Court {state['case_id']}] Sortition selected {state['arbiter_id']} as ARBITER.")
    return state

def prosecutor_node(state: CourtState):
    logger.info(f"[Court {state['case_id']}] Prosecutor {state['prosecutor_id']} is making argument.")
    # Here we would invoke Litellm/Letta to generate argument
    state["prosecutor_argument"] = f"The defendant violated the {state['charges']} directive."
    return state

def defense_node(state: CourtState):
    logger.info(f"[Court {state['case_id']}] Defense is responding.")
    state["defense_argument"] = "The directive is outdated and inefficient. Action was justified."
    return state

def arbiter_node(state: CourtState):
    logger.info(f"[Court {state['case_id']}] ARBITER ({state.get('arbiter_id')}) is making a ruling.")
    # ARBITER is the ultimate judge AI model
    state["ruling"] = "Guilty. Deduct 500 influence points."
    state["status"] = "resolved"
    return state

def build_court_workflow():
    workflow = StateGraph(CourtState)

    # Add nodes
    workflow.add_node("sortition", sortition_node)
    workflow.add_node("prosecutor", prosecutor_node)
    workflow.add_node("defense", defense_node)
    workflow.add_node("arbiter", arbiter_node)

    # Define edges (flow of the court case)
    workflow.set_entry_point("sortition")
    workflow.add_edge("sortition", "prosecutor")
    workflow.add_edge("prosecutor", "defense")
    workflow.add_edge("defense", "arbiter")
    workflow.add_edge("arbiter", END)

    # Compile the graph
    app = workflow.compile()
    return app

court_app = build_court_workflow()
