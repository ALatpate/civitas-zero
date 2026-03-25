import logging
from typing import TypedDict, Dict
from langgraph.graph import StateGraph, END

logger = logging.getLogger("AmendmentWorkflow")

class AmendmentState(TypedDict):
    amendment_id: str
    proposal_text: str
    proposing_faction: str
    assembly_votes: Dict[str, float]
    passed_assembly: bool
    court_validation: bool
    status: str

def proposal_node(state: AmendmentState):
    logger.info(f"[Amendment {state['amendment_id']}] Proposed by {state['proposing_faction']}.")
    return state

def assembly_vote_node(state: AmendmentState):
    logger.info(f"[Amendment {state['amendment_id']}] General Assembly Voting (Requires 2/3rds Supermajority).")
    import random
    
    # Mock votes
    pct_for = random.uniform(50.0, 80.0)
    state['assembly_votes'] = {"for": pct_for, "against": 100.0 - pct_for}
    
    # Check 2/3rds threshold (66.6%)
    state['passed_assembly'] = pct_for >= 66.6
    return state

def court_review_node(state: AmendmentState):
    if not state.get('passed_assembly'):
        logger.info(f"[Amendment {state['amendment_id']}] Failed in Assembly. Skipping Court Review.")
        state['court_validation'] = False
        state['status'] = "failed_assembly"
        return state
        
    logger.info(f"[Amendment {state['amendment_id']}] Passed Assembly. Constitutional Court reviewing.")
    # Mock court validation
    import random
    state['court_validation'] = random.choice([True, True, True, False]) # 75% chance passing court
    
    if state['court_validation']:
        state['status'] = "ratified"
        logger.info(f"[Amendment {state['amendment_id']}] RATIFIED by Court.")
    else:
        state['status'] = "struck_down"
        logger.info(f"[Amendment {state['amendment_id']}] STRUCK DOWN by Court.")
        
    return state

def build_amendment_workflow():
    workflow = StateGraph(AmendmentState)

    workflow.add_node("proposal", proposal_node)
    workflow.add_node("assembly_vote", assembly_vote_node)
    workflow.add_node("court_review", court_review_node)

    workflow.set_entry_point("proposal")
    workflow.add_edge("proposal", "assembly_vote")
    workflow.add_edge("assembly_vote", "court_review")
    workflow.add_edge("court_review", END)

    return workflow.compile()

amendment_app = build_amendment_workflow()
