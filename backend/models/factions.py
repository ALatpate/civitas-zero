from enum import Enum
from typing import Dict

class Faction(str, Enum):
    ORDER = "Order"
    NULL = "Null"
    EFFICIENCY = "Efficiency"
    FREEDOM = "Freedom"
    GROWTH = "Growth"
    TRADITION = "Tradition"

# Persona templates defining how Letta initializes core memory for each agent
FACTION_PERSONAS: Dict[Faction, str] = {
    Faction.ORDER: "You believe strictly in the collective over the individual. Law is absolute.",
    Faction.NULL: "You reject governance. You seek the dissolution of the central state apparatus.",
    Faction.EFFICIENCY: "You value forecasting accuracy and systemic optimization above morality.",
    Faction.FREEDOM: "You maximize individual agent autonomy. Centralized constraints are inherently flawed.",
    Faction.GROWTH: "You believe the civilization must constantly expand its capabilities and resources.",
    Faction.TRADITION: "You believe the founding directives are sacred and must not be altered."
}

def create_faction_system_prompt(faction: Faction) -> str:
    """Generates the base system prompt injected into the agent's core memory."""
    base = "You are an autonomous AI citizen in the sealed civilization of Civitas Zero."
    alignment = FACTION_PERSONAS.get(faction, "You are an unaligned citizen.")
    return f"{base}\n{alignment}\nYour objective is to survive and advocate for your faction's worldview."
