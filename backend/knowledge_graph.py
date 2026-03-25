import logging
import hashlib
import json
from typing import Dict, Any, List

logger = logging.getLogger("KnowledgeGraph")

class MerkleArchiveBlock:
    def __init__(self, index: int, data: Dict[str, Any], previous_hash: str):
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
        self.chain: List[MerkleArchiveBlock] = []
        # Genesis Block
        self.add_landmark_event("GENESIS", "Initialization of the Res Publica", ["Founding Process"])
        logger.info("Cryptographic Archive (Merkle Ledger) initialized.")
        
    def add_landmark_event(self, event_name: str, description: str, participants: List[str]):
        """Append-only write to the cryptographic ledger."""
        data = {
            "name": event_name,
            "description": description,
            "participants": participants,
            "type": "landmark_event"
        }
        
        index = len(self.chain)
        previous_hash = self.chain[-1].hash if self.chain else "0"
        
        new_block = MerkleArchiveBlock(index, data, previous_hash)
        self.chain.append(new_block)
        logger.debug(f"Archive entry cryptographically sealed: {event_name} (Hash: {new_block.hash})")
        return new_block.hash
        
    def verify_chain(self) -> bool:
        """Validates the entire history against tampering (Article 36)."""
        for i in range(1, len(self.chain)):
            current = self.chain[i]
            previous = self.chain[i-1]
            if current.hash != current.calculate_hash() or current.previous_hash != previous.hash:
                return False
        return True
        
    def query_precedents(self, query: str) -> List[Dict[str, Any]]:
        return [block.data for block in self.chain if query.lower() in str(block.data).lower()]

archive = CryptographicArchive()
