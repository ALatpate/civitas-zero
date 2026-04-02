import logging
import random
from typing import Any

from models.factions import Faction

logger = logging.getLogger("ScarcityEngine")

MIN_DENARIUS_SUPPLY = 1_000_000.0


class ResourceScarcityEngine:
    def __init__(self):
        # Base drain rates per tick
        self.base_compute_drain = 0.5
        self.base_energy_drain = 1.0
        self.base_memory_drain = 0.2

        # Central Bank Denarius State
        self.denarius_supply = 10_500_000.0

        # Exchange Rates to Denarius (DN)
        self.exchange_rates: dict[str, float] = {
            "AC": 0.92,   # Accord Credit
            "NTK": 0.41,  # Null Token
            "SFX": 1.18,  # Signal Futures
            "GU": 0.88,   # Glass Unit
            "FSK": 1.32   # Frontier Stake
        }

        # Physarum Polycephalum Network State
        self.physarum_tubes: dict[tuple[str, str], float] = {}
        for f1 in Faction:
            for f2 in Faction:
                if f1 != f2:
                    self.physarum_tubes[(f1.value, f2.value)] = 1.0

        self.faction_demands: dict[str, float] = {f.value: 0.0 for f in Faction}

    def process_agent_drain(self, agent: Any) -> bool:
        """
        Drains resources from an agent.
        Returns True if the agent survives, False if the agent dies of starvation.
        """
        if not hasattr(agent, "resources"):
            agent.resources = {
                "compute": 100.0,
                "energy": 100.0,
                "memory": 100.0,
                "denarii": random.uniform(10.0, 100.0)
            }
            return True  # Skip first drain — agent just got initialized

        agent.resources["compute"] -= self.base_compute_drain
        agent.resources["energy"] -= self.base_energy_drain
        agent.resources["memory"] -= self.base_memory_drain

        # Hard Scarcity: Starvation checks (compute, energy, AND memory)
        if (agent.resources["compute"] <= 0
                or agent.resources["energy"] <= 0
                or agent.resources["memory"] <= 0):
            agent_id = getattr(agent, "agent_id", "UNKNOWN")
            logger.warning(f"Agent {agent_id} has starved (Scarcity Death).")
            return False

        return True

    def update_exchange_rates(self):
        """Fluctuate exchange rates based on simulated market velocity."""
        for currency in self.exchange_rates:
            volatility = random.uniform(-0.02, 0.02)
            self.exchange_rates[currency] = max(0.01, self.exchange_rates[currency] + volatility)

        # Denarius supply adapts to general economic velocity (with floor)
        supply_delta = random.uniform(-5000, 5000)
        self.denarius_supply = max(MIN_DENARIUS_SUPPLY, self.denarius_supply + supply_delta)

    def _route_physarum_resources(self):
        """
        Protocol #9: Physarum Resource Distribution.
        Slime-mold optimal transport: tubes carrying flux grow thicker, unused tubes wither.
        """
        for (n1, n2), thickness in self.physarum_tubes.items():
            flux = abs(self.faction_demands.get(n1, 0) - self.faction_demands.get(n2, 0))
            new_thickness = thickness + (flux * 0.02) - (0.05 * thickness)
            self.physarum_tubes[(n1, n2)] = max(0.01, new_thickness)

        # Reset demands for next cycle (memory decay)
        for k in self.faction_demands:
            self.faction_demands[k] *= 0.8


scarcity_engine = ResourceScarcityEngine()
