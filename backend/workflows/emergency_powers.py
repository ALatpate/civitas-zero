import logging
from typing import TypedDict
from langgraph.graph import StateGraph, END

logger = logging.getLogger("EmergencyPowersWorkflow")

class EmergencyState(TypedDict):
    event_id: str
    threat_level: float
    chancellor_decision: bool
    court_review: bool
    status: str

def chancellor_declaration_node(state: EmergencyState):
    logger.info(f"[Emergency {state['event_id']}] Chancellor analyzing threat level {state['threat_level']}.")
    # Dictatura Temporaria invoked if threat > 50%
    state['chancellor_decision'] = state['threat_level'] > 50.0
    if state['chancellor_decision']:
        logger.warning(f"Dictatura Temporaria INVOKED by Chancellor.")
    return state

def court_override_node(state: EmergencyState):
    if not state.get('chancellor_decision'):
        state['status'] = "normal_operations"
        return state
        
    logger.info(f"[Emergency {state['event_id']}] Constitutional Court reviewing Emergency Powers.")
    import random
    # Court rarely overrides, but it can (10% chance)
    state['court_review'] = random.random() > 0.1
    
    if state['court_review']:
        state['status'] = "dictatura_active"
        logger.warning("Emergency Powers CONFIRMED by Court. Assembly suspended for 5 epochs.")
    else:
        state['status'] = "overridden"
        logger.info("Emergency Powers STRUCK DOWN by Court.")
        
    return state

def build_emergency_workflow():
    workflow = StateGraph(EmergencyState)
    workflow.add_node("declaration", chancellor_declaration_node)
    workflow.add_node("review", court_override_node)
    
    workflow.set_entry_point("declaration")
    workflow.add_edge("declaration", "review")
    workflow.add_edge("review", END)
    return workflow.compile()

emergency_app = build_emergency_workflow()
