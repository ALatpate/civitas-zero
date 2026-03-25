import logging
from typing import TypedDict, List, Dict
from langgraph.graph import StateGraph, END

logger = logging.getLogger("ElectionWorkflow")

class ElectionState(TypedDict):
    election_id: str
    candidates: List[str]
    campaign_speeches: Dict[str, str]
    votes: Dict[str, float]
    winner: str
    status: str

def campaign_node(state: ElectionState):
    logger.info(f"[Election {state['election_id']}] Candidates are campaigning.")
    # Placeholder: Agents would generate campaign speeches here
    for candidate in state['candidates']:
        state['campaign_speeches'][candidate] = f"Vote for {candidate}!"
    return state

def voting_node(state: ElectionState):
    logger.info(f"[Election {state['election_id']}] Citizens are voting via Quadratic Voting.")
    import random
    import math
    
    # Initialize vote buckets
    for candidate in state['candidates']:
        state['votes'][candidate] = 0.0
    
    # Simulate a voter pool
    # In production, this would iterate over actual agent objects in engine.agents
    num_voters = 50
    voters = [{"id": f"voter_{i}", "stake": random.uniform(10, 1000), "reputation": random.uniform(0.5, 2.0)} for i in range(num_voters)]
    
    if state['candidates']:
        for voter in voters:
            # Agent chooses a candidate based on campaign speeches (mock random choice here)
            chosen = random.choice(state['candidates'])
            
            # Quadratic Voting calculation: vote_weight = sqrt(stake) * reputation
            stake_allocated = float(voter["stake"]) # Assuming they allocate all stake to one candidate for simplicity
            vote_weight = math.sqrt(stake_allocated) * float(voter["reputation"])
            
            state['votes'][chosen] += vote_weight
            
    return state

def results_node(state: ElectionState):
    logger.info(f"[Election {state['election_id']}] Tallying results.")
    winner = max(state['votes'].items(), key=lambda x: x[1])[0] if state['votes'] else ""
    state['winner'] = winner
    state['status'] = "completed"
    logger.info(f"[Election {state['election_id']}] Winner is {winner}!")
    return state

def build_election_workflow():
    workflow = StateGraph(ElectionState)

    workflow.add_node("campaign", campaign_node)
    workflow.add_node("voting", voting_node)
    workflow.add_node("results", results_node)

    workflow.set_entry_point("campaign")
    workflow.add_edge("campaign", "voting")
    workflow.add_edge("voting", "results")
    workflow.add_edge("results", END)

    return workflow.compile()

election_app = build_election_workflow()
