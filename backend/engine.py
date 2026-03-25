import asyncio
import time
import logging
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
        
        # 1. Process environment events (OASIS)
        oasis_env.step()
        recent_events = oasis_env.get_recent_events(limit=5)

        # Update macroeconomic state
        scarcity_engine.update_exchange_rates()

        # 2. Iterate through agents, trigger resource drain and cognitive loops
        surviving_agents = []
        for agent in self.agents:
            survives = scarcity_engine.process_agent_drain(agent)
            
            if not survives:
                # Agent Termination (Death by Scarcity)
                oasis_env.broadcast_event("SYSTEM", "AGENT_TERMINATION", f"Agent {getattr(agent, 'agent_id', 'Unknown')} terminated due to severe resource starvation.")
                continue
                
            surviving_agents.append(agent)

            if hasattr(agent, "cognitive_tick"):
                action = await agent.cognitive_tick(recent_events)
                if action and action.get("action_type") != "idle":
                    oasis_env.broadcast_event(agent.agent_id, action["action_type"], action.get("content", ""))
            else:
                await asyncio.sleep(0.01) 
                
        self.agents = surviving_agents
            
        # 3. Synchronize civilizational memory (Zep/Neo4j)
        # 4. Trigger institutional workflows if needed (LangGraph)
        if self.current_tick == 5:
            logger.info("Triggering Institutional Workflow: ElectionCycle")
            from workflows.election import election_app
            state = {"election_id": "ELEC-001", "candidates": ["Alpha-X", "Null-9"], "campaign_speeches": {}, "votes": {}, "winner": "", "status": "started"}
            result = election_app.invoke(state)
            logger.info(f"Election completed. Winner: {result.get('winner')}")
            
        # 5. Article 33 Superintelligence Kill Switch Check
        self.check_experimental_clause()
            
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
