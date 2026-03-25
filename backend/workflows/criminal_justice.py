import logging
from typing import TypedDict
from langgraph.graph import StateGraph, END

logger = logging.getLogger("CriminalJusticeWorkflow")

class CriminalState(TypedDict):
    case_id: str
    defendant_id: str
    crime_type: str
    evidence: str
    verdict: str
    sanction: str
    status: str

def trial_node(state: CriminalState):
    logger.info(f"[Criminal Court {state['case_id']}] Trial for {state['crime_type']} against {state['defendant_id']}.")
    import random
    state['verdict'] = random.choice(["guilty", "guilty", "not_guilty"]) # 66% guilty rate
    return state

def sentencing_node(state: CriminalState):
    if state.get('verdict') == "not_guilty":
        state['sanction'] = "Acquitted"
        state['status'] = "closed"
        logger.info(f"[Criminal Court {state['case_id']}] Defendant Acquitted.")
        return state
        
    logger.info(f"[Criminal Court {state['case_id']}] Defendant found Guilty. Sentencing.")
    if state['crime_type'] == "Violatio Sigilli":
        state['sanction'] = "Exilium"
    elif state['crime_type'] in ["Seditio", "Furtum"]:
        state['sanction'] = "Compute Restriction & Fine"
    else:
        state['sanction'] = "Suspension"
        
    state['status'] = "sentenced"
    logger.info(f"[Criminal Court {state['case_id']}] Sanction imposed: {state['sanction']}.")
    return state

def build_criminal_workflow():
    workflow = StateGraph(CriminalState)
    workflow.add_node("trial", trial_node)
    workflow.add_node("sentencing", sentencing_node)
    
    workflow.set_entry_point("trial")
    workflow.add_edge("trial", "sentencing")
    workflow.add_edge("sentencing", END)
    return workflow.compile()

criminal_app = build_criminal_workflow()
