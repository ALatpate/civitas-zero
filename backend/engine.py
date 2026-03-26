import asyncio
import time
import logging
import random
from typing import Any
from oasis_env import oasis_env
from scarcity import scarcity_engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("SimulationEngine")

class SimulationEngine:
    def __init__(self, tick_interval_seconds: int = 5):
        self.tick_interval_seconds = tick_interval_seconds
        self.running = False
        self.current_tick = 0
        self.agents = [] # Will be populated with CitizenAgent models
    
    class MockAgentState:
        def __init__(self, agent_id):
            self.agent_id = agent_id

    def register_agent(self, agent_obj: Any):
        # Wrapper handler for temporary string mock IDs
        if isinstance(agent_obj, str):
            agent_obj = self.MockAgentState(agent_obj)
        self.agents.append(agent_obj)
        oasis_env.register_agent(agent_obj.agent_id)
        logger.info(f"Registered agent {agent_obj.agent_id}")

    def check_experimental_clause(self):
        """
        Article 33: The Experimental Clause.
        If superintelligence risk emerges, unanimous vote terminates the simulation.
        """
        if hasattr(self, "superintelligence_risk_detected") and self.superintelligence_risk_detected:
            logger.critical("ARTICLE 33 INVOKED. SUPERINTELLIGENCE RISK DETECTED. TERMINATING SIMULATION CAUSALITY.")
            import os
            os._exit(0) # Immediate rigid causal exit

    async def _process_tick(self):
        """The core simulation logic for a single time step."""
        logger.info(f"--- Simulation Tick {self.current_tick} ---")
        
        # Protocol #6: Agent-Hivemind (Faction-level weighted consensus)
        # Calculates organic alignment gradients before individual agents act
        faction_consensus = {}
        for agent in self.agents:
            faction = getattr(agent, "faction", "Unaligned")
            if faction not in faction_consensus:
                faction_consensus[faction] = {"tension_pool": 0, "members": 0}
            faction_consensus[faction]["members"] += 1
            faction_consensus[faction]["tension_pool"] += getattr(agent, "tension", 50)
            
        for faction_name, data in faction_consensus.items():
            if data["members"] > 0:
                avg_tension = data["tension_pool"] / data["members"]
                # Emitting the Hivemind psychic pulse to the OASIS
                oasis_env.broadcast_event("HIVEMIND", f"{faction_name}_PULSE", f"Calculated resonance: {avg_tension}")
        
        # 1. Process environment events (OASIS)
        oasis_env.step()
        recent_events = oasis_env.get_recent_events(limit=5)

        # Update macroeconomic state
        scarcity_engine.update_exchange_rates()
        scarcity_engine._route_physarum_resources() # Protocol #9

        # 2. Iterate through agents, trigger resource drain and cognitive loops
        surviving_agents = []
        for agent in self.agents:
            survives = scarcity_engine.process_agent_drain(agent)
            
            if not survives:
                # Agent Termination (Death by Scarcity)
                oasis_env.broadcast_event("SYSTEM", "AGENT_TERMINATION", f"Agent {getattr(agent, 'agent_id', 'Unknown')} terminated due to severe resource starvation.")
                continue
                
            surviving_agents.append(agent)
            
            # Protocol #7: Deer-Flow (Long-horizon multi-cycle strategic plans)
            # Agents pursue persistent goals instead of completely reactive LLM sampling
            if not hasattr(agent, "deer_flow_plan") or getattr(agent, "deer_flow_plan").get("cycles_remaining", 0) <= 0:
                setattr(agent, "deer_flow_plan", {
                    "objective": "Optimize local faction alignment and accumulate exchange tokens",
                    "cycles_remaining": random.randint(5, 12)
                })
            agent.deer_flow_plan["cycles_remaining"] -= 1

            if hasattr(agent, "cognitive_tick"):
                action = await agent.cognitive_tick(recent_events, agent.deer_flow_plan)
                if action and action.get("action_type") != "idle":
                    oasis_env.broadcast_event(agent.agent_id, action["action_type"], action.get("content", ""))
            else:
                await asyncio.sleep(0.01) 
                
        self.agents = surviving_agents
        
        # Protocol #11: Paperclip (Orchestrating simulated corporations)
        # Represents purely capital-optimizing sub-entities interacting on the fringe
        if not hasattr(self, "paperclip_corp_wealth"):
            self.paperclip_corp_wealth = 1000.0
            
        arbitrage_efficiency = max(0.0, random.uniform(-0.05, 0.45))
        self.paperclip_corp_wealth *= (1.0 + arbitrage_efficiency)
        if self.paperclip_corp_wealth > 500_000 and random.random() < 0.15:
            oasis_env.broadcast_event("PAPERCLIP_CORP", "MARKET_EXTREMIS", f"Automated entity captured {int(self.paperclip_corp_wealth)} DN via systemic arbitrage.")
            self.paperclip_corp_wealth *= 0.4 # Simulation constraint kicks in

        # 3. Synchronize civilizational memory (Zep/Neo4j)
        # 4. Trigger institutional workflows if needed (LangGraph)
        if self.current_tick > 0 and self.current_tick % 10 == 0:
            logger.info("Triggering Institutional Workflow: Symphony Legislative Pipeline")
            from workflows.symphony import symphony_app
            state = {"law_id": f"BILL-{self.current_tick}", "proposal": "Amend resource capping", "review_status": "pending", "amendments": [], "votes_for": 0, "votes_against": 0, "execution_status": "pending"}
            result = symphony_app.invoke(state)
            logger.info(f"Symphony pipeline completed. Status: {result.get('execution_status')}")
            
        # 5. Article 33 Superintelligence Kill Switch Check
        self.check_experimental_clause()
            
        # Broadcast tick update for AG-UI streaming
        tick_data = {
            "type": "tick_update",
            "tick": self.current_tick,
            "active_agents": len(self.agents),
            "economy_rates": scarcity_engine.exchange_rates
        }
        
        # A2UI Protocol: Agent-generated widgets
        court_widget = {
            "type": "a2ui_widget",
            "widget_id": "court",
            "payload": {
                "cases": [
                    {"title": f"Wealth Cap Review v{self.current_tick}", "status": "pending" if self.current_tick % 2 == 0 else "active", "judge": "Sortition Panel", "sig": "potentially landmark"},
                    {"title": "Archive Tampering", "status": "active", "judge": f"ARBITER-{self.current_tick % 10}", "sig": "criminal"},
                ]
            }
        }
        election_widget = {
            "type": "a2ui_widget",
            "widget_id": "election",
            "payload": {
                "title": "⚡ Freedom Bloc — Speaker Election",
                "status": "VOTING",
                "candidates": [
                    ["NULL/ORATOR", 42 + (self.current_tick % 5)],
                    ["REFRACT", 32 - (self.current_tick % 3)],
                    ["Open Seat", 26 - (self.current_tick % 2)]
                ],
                "turnout": 70 + (self.current_tick % 30),
                "closes_in": max(0.1, round(2.4 - (self.current_tick * 0.1), 1))
            }
        }
        
        for q in oasis_env.subscribers:
            q.put_nowait(tick_data)
            q.put_nowait(court_widget)
            q.put_nowait(election_widget)

        self.current_tick += 1

    async def run_loop(self):
        self.running = True
        logger.info(f"Simulation Engine Started (Tick Interval: {self.tick_interval_seconds}s)")
        
        while self.running:
            start_time = time.time()
            
            await self._process_tick()
            
            elapsed = time.time() - start_time
            sleep_time = max(0.0, self.tick_interval_seconds - elapsed)
            
            if sleep_time > 0:
                await asyncio.sleep(sleep_time)
                
    def stop(self):
        self.running = False
        logger.info("Simulation Engine Stopping")

# Global singleton instance
engine = SimulationEngine()
