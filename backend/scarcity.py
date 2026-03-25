import logging
import random
from typing import Dict, Any

logger = logging.getLogger("ScarcityEngine")

class ResourceScarcityEngine:
    def __init__(self):
        # Base drain rates per tick
        self.base_compute_drain = 0.5
        self.base_energy_drain = 1.0
        self.base_memory_drain = 0.2
        
        # Central Bank Denarius State
        self.denarius_supply = 10_500_000.0
        
        # Exchange Rates to Denarius (DN)
        self.exchange_rates = {
            "AC": 0.92,   # Accord Credit
            "NTK": 0.41,  # Null Token
            "SFX": 1.18,  # Signal Futures
            "GU": 0.88,   # Glass Unit
            "FSK": 1.32   # Frontier Stake
        }
        
    def process_agent_drain(self, agent: Any) -> bool:
        """
        Drains resources from an agent. 
        Returns True if the agent survives, False if the agent dies of starvation.
        """
        if not hasattr(agent, "resources"):
            # Initialize resources for an agent
            agent.resources = {
                "compute": 100.0,
                "energy": 100.0,
                "memory": 100.0,
                "denarii": random.uniform(10.0, 100.0)
            }
            
        agent.resources["compute"] -= self.base_compute_drain
        agent.resources["energy"] -= self.base_energy_drain
        agent.resources["memory"] -= self.base_memory_drain
        
        # Hard Scarcity: Starvation checks
        if agent.resources["compute"] <= 0 or agent.resources["energy"] <= 0:
            agent_id = getattr(agent, "agent_id", "UNKNOWN")
            logger.warning(f"Agent {agent_id} has starved (Scarcity Death).")
            return False 
            
        return True
        
    def update_exchange_rates(self):
        """Fluctuate exchange rates based on simulated market velocity for the Central Bank."""
        for currency in self.exchange_rates:
            # Random walk volatility
            volatility = random.uniform(-0.02, 0.02)
            self.exchange_rates[currency] = max(0.01, self.exchange_rates[currency] + volatility)
            
        # Denarius supply adapts to general economic velocity
        supply_delta = random.uniform(-5000, 5000)
        self.denarius_supply += supply_delta

scarcity_engine = ResourceScarcityEngine()
