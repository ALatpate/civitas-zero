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
        
        # Physarum Polycephalum Network State 
        # Simulates organic distribution tubes between all faction nodes
        import copy
        from models.factions import Faction
        self.physarum_tubes = {}
        for f1 in Faction:
            for f2 in Faction:
                if f1 != f2:
                    self.physarum_tubes[(f1.value, f2.value)] = 1.0
                    
        self.faction_demands = {f.value: 0.0 for f in Faction}
        
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
        
    def _route_physarum_resources(self):
        """
        Protocol #9: Physarum Resource Distribution.
        Slime-mold optimal transport math. Tubes carrying flux (demand differential) 
        grow thicker allowing more resource throughput, while unused tubes wither.
        """
        for (n1, n2), thickness in self.physarum_tubes.items():
            # Flux is analogous to the fluid flow driven by demand difference
            flux = abs(self.faction_demands.get(n1, 0) - self.faction_demands.get(n2, 0))
            
            # Differential equation (discretized dD/dt)
            # Tube thickness (D) increases with flux and decays over time
            new_thickness = thickness + (flux * 0.02) - (0.05 * thickness)
            self.physarum_tubes[(n1, n2)] = max(0.01, new_thickness)
            
        # Reset demands for the next cycle
        for k in self.faction_demands:
            self.faction_demands[k] *= 0.8 # Memory decay

scarcity_engine = ResourceScarcityEngine()
