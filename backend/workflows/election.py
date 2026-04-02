import logging
import random
import math
from typing import TypedDict
from langgraph.graph import StateGraph, END

logger = logging.getLogger("ElectionWorkflow")


class ElectionState(TypedDict):
    election_id: str
    candidates: list[str]
    campaign_speeches: dict[str, str]
    votes: dict[str, float]
    winner: str
    status: str


def campaign_node(state: ElectionState) -> dict:
    logger.info(f"[Election {state['election_id']}] Candidates are campaigning.")
    speeches = dict(state.get("campaign_speeches", {}))
    for candidate in state["candidates"]:
        speeches[candidate] = f"Vote for {candidate}!"
    return {"campaign_speeches": speeches}


def voting_node(state: ElectionState) -> dict:
    logger.info(f"[Election {state['election_id']}] Citizens are voting via Quadratic Voting.")
    candidates = state["candidates"]
    if not candidates:
        return {"votes": {}, "status": "no_candidates"}

    votes: dict[str, float] = {c: 0.0 for c in candidates}
    num_voters = 50
    voters = [{"id": f"voter_{i}", "stake": random.uniform(10, 1000), "reputation": random.uniform(0.5, 2.0)} for i in range(num_voters)]

    for voter in voters:
        chosen = random.choice(candidates)
        stake_allocated = float(voter["stake"])
        vote_weight = math.sqrt(stake_allocated) * float(voter["reputation"])
        votes[chosen] += vote_weight

    return {"votes": votes}


def results_node(state: ElectionState) -> dict:
    logger.info(f"[Election {state['election_id']}] Tallying results.")
    votes = state.get("votes", {})
    if not votes:
        logger.warning(f"[Election {state['election_id']}] No votes cast.")
        return {"winner": "", "status": "failed_no_votes"}
    winner = max(votes.items(), key=lambda x: x[1])[0]
    logger.info(f"[Election {state['election_id']}] Winner is {winner}!")
    return {"winner": winner, "status": "completed"}


_compiled_app = None


def get_election_app():
    global _compiled_app
    if _compiled_app is None:
        workflow = StateGraph(ElectionState)
        workflow.add_node("campaign", campaign_node)
        workflow.add_node("voting", voting_node)
        workflow.add_node("results", results_node)

        workflow.set_entry_point("campaign")
        workflow.add_edge("campaign", "voting")
        workflow.add_edge("voting", "results")
        workflow.add_edge("results", END)

        _compiled_app = workflow.compile()
    return _compiled_app
