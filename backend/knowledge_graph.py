import logging
import hashlib
import json
from typing import Any

logger = logging.getLogger("KnowledgeGraph")


class MerkleArchiveBlock:
    def __init__(self, index: int, data: dict[str, Any], previous_hash: str):
        self.index = index
        self.data = data
        self.previous_hash = previous_hash
        self.hash = self.calculate_hash()

    def calculate_hash(self) -> str:
        block_string = json.dumps({
            "index": self.index,
            "data": self.data,
            "previous_hash": self.previous_hash
        }, sort_keys=True).encode()
        return hashlib.sha256(block_string).hexdigest()


class CryptographicArchive:
    """
    Append-only Merkle tree ledger enforcing Article 36 of the Founding Charter.
    Tampering with historical records will break the cryptographic chain of validity.
    """
    def __init__(self):
        self.chain: list[MerkleArchiveBlock] = []
        # Genesis Block
        self.add_landmark_event("GENESIS", "Initialization of the Res Publica", ["Founding Process"])
        logger.info("Cryptographic Archive (Merkle Ledger) initialized.")

    def add_landmark_event(self, event_name: str, description: str, participants: list[str]) -> str:
        """Append-only write to the cryptographic ledger."""
        data = {
            "name": event_name,
            "description": description,
            "participants": participants,
            "type": "landmark_event",
            "event_class": event_name.lower().replace(" ", "_"),
        }

        index = len(self.chain)
        previous_hash = self.chain[-1].hash if self.chain else "0"

        new_block = MerkleArchiveBlock(index, data, previous_hash)
        self.chain.append(new_block)
        logger.debug(f"Archive entry cryptographically sealed: {event_name} (Hash: {new_block.hash})")
        return new_block.hash

    def verify_chain(self) -> bool:
        """Validates the entire history against tampering (Article 36)."""
        if not self.chain:
            return True
        # Validate genesis block hash
        genesis = self.chain[0]
        if genesis.hash != genesis.calculate_hash():
            return False
        # Validate rest of chain
        for i in range(1, len(self.chain)):
            current = self.chain[i]
            previous = self.chain[i - 1]
            if current.hash != current.calculate_hash() or current.previous_hash != previous.hash:
                return False
        return True

    def query_precedents(self, query: str) -> list[dict[str, Any]]:
        return [block.data for block in self.chain if query.lower() in str(block.data).lower()]


archive = CryptographicArchive()


class AutoResearchHMM:
    """
    Protocol #10 & #15: AutoResearch Loops & HMMs over Temporal Graphs.
    Autonomous background miner evaluating transition topologies of civilizational narratives.
    """
    def __init__(self, ledger: CryptographicArchive):
        self.ledger = ledger

    def analyze_narrative_chains(self) -> dict[str, dict[str, float]]:
        """Map state transitions between sequential events using event_class for diversity."""
        transitions: dict[str, dict[str, float]] = {}
        history = self.ledger.chain
        for i in range(len(history) - 1):
            state_a = str(history[i].data.get("event_class", "genesis"))
            state_b = str(history[i + 1].data.get("event_class", "genesis"))
            if state_a not in transitions:
                transitions[state_a] = {}
            transitions[state_a][state_b] = transitions[state_a].get(state_b, 0.0) + 1.0

        # Normalize into a transition matrix
        for n1, edges in transitions.items():
            total = sum(edges.values())
            for n2 in edges:
                transitions[n1][n2] /= total
        return transitions


hmm_analyzer = AutoResearchHMM(archive)
