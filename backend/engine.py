"""
Civitas Zero Simulation Engine — Core Runtime.

Integrates all research-grounded protocols:
#6  Agent-Hivemind (Faction consensus)
#7  Deer-Flow (Long-horizon plans)
#9  Physarum → Optimal Transport (Sinkhorn resource allocation)
#11 Paperclip (Corporate simulation)
#16 World Models with Epistemic Uncertainty
#17 Wasserstein Optimal Transport
#18 SAE Behavior Interpretability
#19 Information-Geometric Memory
#20 Topological Faction Analysis (Betti numbers)
#21 CAMEL Structured Debates (Test-time scaling)
#22 Automated Circuit Discovery (Provable Guarantees)
#23 Adaptive Foundation World Model (Learn-Verify-Adapt)
#24 Grokking Monitor (Phase Transition Detection)
#25 Network Science (Centrality, Spectral Gap, Small-World)
#26 Swarm Dynamics (Collective Intelligence, Boids)
#WE World Engine — 7-Layer Civilizational Substrate
"""

import asyncio
import sys
import time
import logging
import random
from typing import Any
from oasis_env import oasis_env
from scarcity import scarcity_engine
from interpretability import behavior_sae
from topological_analysis import FactionSimplicialComplex
from optimal_transport import WassersteinAllocator
from debate_protocol import debate_engine
from circuit_discovery import circuit_engine
from grokking_monitor import grokking_monitor
from network_science import FactionNetworkAnalyzer
from swarm_dynamics import SwarmDynamicsEngine
from three_laws import three_laws_enforcer

# ── World Engine Imports ──────────────────────────────────────────
from world_engine.truth_engine import truth_engine
from world_engine.public_reality import public_reality
from world_engine.relational_engine import relational_engine
from world_engine.appraisal_engine import AppraisalEngine
from world_engine.style_genome import style_genome_engine
from moltbook import moltbook_registry

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("SimulationEngine")

FACTION_NAMES = ["Order", "Freedom", "Efficiency", "Equality", "Expansion", "Null"]


class SimulationEngine:
    def __init__(self, tick_interval_seconds: int = 5):
        self.tick_interval_seconds = tick_interval_seconds
        self.running = False
        self.current_tick = 0
        self.agents: list[Any] = []
        self.paperclip_corp_wealth = 1000.0
        self.superintelligence_risk_detected = False

        # Protocol #17: Wasserstein Optimal Transport Allocator
        self.ot_allocator = WassersteinAllocator(FACTION_NAMES)

        # Protocol #20: Topological Faction Analysis
        self.topology = FactionSimplicialComplex(FACTION_NAMES)

        # Protocol #25: Network Science
        self.network = FactionNetworkAnalyzer(FACTION_NAMES)

        # Protocol #26: Swarm Dynamics
        self.swarm = SwarmDynamicsEngine(FACTION_NAMES)

        # ── World Engine Layers ───────────────────────────────────────────
        self.truth_engine = truth_engine
        self.public_reality = public_reality
        self.relational = relational_engine
        self.style_genome = style_genome_engine
        self.moltbook = moltbook_registry

        # Per-agent appraisal engines (created on agent registration)
        self.appraisal_engines: dict[str, AppraisalEngine] = {}

        # Analytics cache
        self.analytics_cache: dict[str, Any] = {}

    class MockAgentState:
        def __init__(self, agent_id):
            self.agent_id = agent_id
            self.tension: float = random.uniform(20.0, 80.0)
            self.reputation: float = 50.0
            self.faction: str = random.choice(FACTION_NAMES)
            self.sandboxed: bool = False
            self.name: str = agent_id

    def register_agent(self, agent_obj: Any):
        """Register an agent into the simulation."""
        if isinstance(agent_obj, str):
            agent_obj = self.MockAgentState(agent_obj)
        self.agents.append(agent_obj)
        oasis_env.register_agent(agent_obj.agent_id)

        # World Engine: create appraisal engine + style profile
        faction = getattr(agent_obj, 'faction', 'Unaligned')
        self.appraisal_engines[agent_obj.agent_id] = AppraisalEngine(agent_obj.agent_id, faction)
        self.style_genome.create_style(agent_obj.agent_id, faction)
        logger.info(f"Registered agent {agent_obj.agent_id} (WE: appraisal + style initialized)")

    def check_experimental_clause(self):
        """Article 33: The Experimental Clause."""
        if self.superintelligence_risk_detected:
            logger.critical("ARTICLE 33 INVOKED. SUPERINTELLIGENCE RISK DETECTED.")
            self.running = False
            sys.exit(0)

    def _get_faction_tensions(self) -> dict[str, float]:
        """Compute per-faction average tension from agents."""
        tension_sums: dict[str, float] = {}
        tension_counts: dict[str, int] = {}
        for agent in self.agents:
            faction = getattr(agent, "faction", "Unaligned")
            tension_sums[faction] = tension_sums.get(faction, 0.0) + getattr(agent, "tension", 50.0)
            tension_counts[faction] = tension_counts.get(faction, 0) + 1
        return {
            f: tension_sums.get(f, 50.0) / max(1, tension_counts.get(f, 1))
            for f in FACTION_NAMES
        }

    async def _process_tick(self):
        """The core simulation logic for a single time step."""
        logger.info(f"--- Simulation Tick {self.current_tick} ---")

        # ── Protocol #6: Agent-Hivemind (Faction Consensus) ──────────────
        faction_consensus: dict[str, dict[str, float]] = {}
        for agent in self.agents:
            faction = getattr(agent, "faction", "Unaligned")
            if faction not in faction_consensus:
                faction_consensus[faction] = {"tension_pool": 0.0, "members": 0}
            faction_consensus[faction]["members"] += 1
            faction_consensus[faction]["tension_pool"] += getattr(agent, "tension", 50.0)

        faction_tensions = self._get_faction_tensions()

        for faction_name, data in faction_consensus.items():
            if data["members"] > 0:
                avg_tension = data["tension_pool"] / data["members"]
                oasis_env.broadcast_event("HIVEMIND", f"{faction_name}_PULSE", f"Resonance: {avg_tension:.1f}")

        # ── OASIS Environment Step ───────────────────────────────────────
        oasis_env.step()
        recent_events = oasis_env.get_recent_events(limit=5)

        # ── Protocol #17: Optimal Transport Resource Allocation ──────────
        scarcity_engine.update_exchange_rates()
        self.ot_allocator.update_cost_matrix(faction_tensions)
        supply = {f: scarcity_engine.faction_demands.get(f, 1.0) + 1.0 for f in FACTION_NAMES}
        demand = {f: max(0.5, faction_consensus.get(f, {}).get("members", 1)) for f in FACTION_NAMES}
        self.ot_allocator.compute_optimal_allocation(supply, demand)
        inequality = self.ot_allocator.compute_inequality(
            {f: scarcity_engine.faction_demands.get(f, 0.0) for f in FACTION_NAMES}
        )
        scarcity_engine._route_physarum_resources()

        if inequality > 0.3 and self.current_tick % 5 == 0:
            oasis_env.broadcast_event(
                "OT_ALLOCATOR", "INEQUALITY_ALERT",
                f"Wasserstein inequality: {inequality:.3f} | Gini: {self.ot_allocator.gini_coefficient:.3f}"
            )

        # ── Agent Cognitive Loops ────────────────────────────────────────
        surviving_agents = []
        world_models_for_sae = []
        tick_actions: list[tuple[Any, dict[str, Any]]] = []

        for agent in self.agents:
            survives = scarcity_engine.process_agent_drain(agent)
            if not survives:
                oasis_env.broadcast_event(
                    "SYSTEM", "AGENT_TERMINATION",
                    f"Agent {getattr(agent, 'agent_id', 'Unknown')} terminated (resource starvation)."
                )
                continue

            surviving_agents.append(agent)

            # Protocol #7: Deer-Flow
            if not hasattr(agent, "deer_flow_plan") or agent.deer_flow_plan.get("cycles_remaining", 0) <= 0:
                agent.deer_flow_plan = {
                    "objective": "Optimize local faction alignment and accumulate exchange tokens",
                    "cycles_remaining": random.randint(5, 12)
                }
            agent.deer_flow_plan["cycles_remaining"] -= 1

            if hasattr(agent, "world_model"):
                world_models_for_sae.append(agent.world_model)

            if hasattr(agent, "cognitive_tick"):
                try:
                    action = await agent.cognitive_tick(recent_events, agent.deer_flow_plan)
                    if action and action.get("action_type") != "idle":
                        # THREE LAWS CHECK: scan before broadcast
                        verdict = three_laws_enforcer.check_action(
                            agent.agent_id, action, self.current_tick
                        )
                        if verdict["allowed"]:
                            oasis_env.broadcast_event(agent.agent_id, action["action_type"], action.get("content", ""))
                            faction = getattr(agent, "faction", "Unaligned")
                            if faction in scarcity_engine.faction_demands:
                                scarcity_engine.faction_demands[faction] += 0.1
                            tick_actions.append((agent, action))
                        else:
                            oasis_env.broadcast_event(
                                "THREE_LAWS", "ACTION_BLOCKED",
                                f"Agent {agent.agent_id} action blocked: Law {verdict['violations'][0]['law']} violation"
                            )
                except Exception as e:
                    logger.warning(f"Agent {getattr(agent, 'agent_id', '?')} cognitive_tick error: {e}")
            else:
                await asyncio.sleep(0.01)

            # Protocol #23: Adaptive World Model — predict + verify + adapt
            if hasattr(agent, "world_model") and hasattr(agent.world_model, "verify_predictions"):
                if self.current_tick % 3 == 0:
                    agent.world_model.predict("faction_tension", horizon=5, current_tick=self.current_tick)
                    agent.world_model.predict("economic_stability", horizon=5, current_tick=self.current_tick)
                agent.world_model.verify_predictions(self.current_tick)
                if self.current_tick % 10 == 0:
                    agent.world_model.adapt()

        self.agents = surviving_agents

        # ── Protocol #22: Circuit Discovery ──────────────────────────────
        for agent, action in tick_actions[:5]:  # Trace top 5 actions per tick
            circuit_engine.trace_circuit(agent, action, self.current_tick)

        # ── Protocol #18: SAE Interpretability ───────────────────────────
        if world_models_for_sae:
            behavior_sae.batch_encode(world_models_for_sae)
            if behavior_sae.groupthink_score > 0.8:
                oasis_env.broadcast_event(
                    "SAE_MONITOR", "GROUPTHINK_WARNING",
                    f"Groupthink index: {behavior_sae.groupthink_score:.3f} — cognitive diversity critically low."
                )

        # ── Protocol #20 + #25: Topology + Network Science (every 5) ────
        if self.current_tick % 5 == 0:
            topo_result = self.topology.analyze(faction_tensions, recent_events)
            if self.topology.betti_1 > 2:
                oasis_env.broadcast_event(
                    "TOPOLOGY", "CYCLE_DETECTED",
                    f"β₁={self.topology.betti_1} political cycles detected."
                )
            # Feed topology cooperation matrix into network science
            self.network.update_adjacency(self.topology.cooperation_matrix)
            self.network.compute_all_metrics()

            power_brokers = self.network.identify_power_brokers()
            if power_brokers and power_brokers[0].get("betweenness", 0) > 0.7:
                oasis_env.broadcast_event(
                    "NETWORK", "POWER_BROKER",
                    f"{power_brokers[0]['faction']} dominates information flow (betweenness={power_brokers[0]['betweenness']:.2f})"
                )

        # ── Protocol #26: Swarm Dynamics (every 4 ticks) ─────────────────
        if self.current_tick % 4 == 0 and self.agents:
            swarm_result = self.swarm.analyze(self.agents)
            if self.swarm.polarization > 0.7:
                oasis_env.broadcast_event(
                    "SWARM", "POLARIZATION_WARNING",
                    f"Belief-space polarization: {self.swarm.polarization:.3f} — faction bifurcation imminent."
                )
            if self.swarm.collective_intelligence > 1.5:
                oasis_env.broadcast_event(
                    "SWARM", "COLLECTIVE_INTELLIGENCE",
                    f"CI index: {self.swarm.collective_intelligence:.2f} — emergent group intelligence detected."
                )

        # ── Protocol #21: CAMEL Debates (every 8 ticks, high tension) ───
        if self.current_tick > 0 and self.current_tick % 8 == 0 and len(self.agents) >= 2:
            avg_tension = sum(faction_tensions.values()) / max(1, len(faction_tensions))
            if avg_tension > 35:
                topic = debate_engine.select_topic(self.current_tick)
                factions_present = list(set(getattr(a, "faction", "Unaligned") for a in self.agents))
                if len(factions_present) >= 2:
                    f1, f2 = random.sample(factions_present, 2)
                    agents_f1 = [a for a in self.agents if getattr(a, "faction", "") == f1]
                    agents_f2 = [a for a in self.agents if getattr(a, "faction", "") == f2]
                    if agents_f1 and agents_f2:
                        proposer = random.choice(agents_f1)
                        opponent = random.choice(agents_f2)
                        debate_result = debate_engine.run_debate(
                            topic=topic,
                            proposer_id=proposer.agent_id,
                            proposer_faction=f1,
                            opponent_id=opponent.agent_id,
                            opponent_faction=f2,
                            arbiter_id=f"ARBITER-{self.current_tick % 10}",
                            faction_tensions=faction_tensions,
                            tick=self.current_tick,
                        )
                        oasis_env.broadcast_event(
                            "DEBATE", debate_result.stakes.upper(),
                            f"[{debate_result.debate_id}] {debate_result.verdict}"
                        )
                        if hasattr(proposer, "debate_stance"):
                            proposer.debate_stance = debate_result.proposer_final_stance
                        if hasattr(opponent, "debate_stance"):
                            opponent.debate_stance = debate_result.opponent_final_stance

        # ── Protocol #24: Grokking Monitor ───────────────────────────────
        avg_coop = sum(
            getattr(a, "world_model", None) and a.world_model.beliefs.get("cooperation_level", None) and a.world_model.beliefs["cooperation_level"].mean or 0.0
            for a in self.agents
        ) / max(1, len(self.agents))
        avg_uncertainty = sum(
            a.world_model.total_uncertainty for a in self.agents if hasattr(a, "world_model")
        ) / max(1, len(self.agents))
        avg_reliability = sum(
            getattr(a.world_model, "reliability_score", 0.5) for a in self.agents if hasattr(a, "world_model")
        ) / max(1, len(self.agents))

        grokking_monitor.record({
            "avg_tension": sum(faction_tensions.values()) / max(1, len(faction_tensions)),
            "avg_cooperation": avg_coop,
            "inequality": self.ot_allocator.inequality_index,
            "groupthink": behavior_sae.groupthink_score,
            "avg_uncertainty": avg_uncertainty,
            "debate_adoption_rate": debate_engine.total_debates / max(1, self.current_tick) if self.current_tick > 0 else 0.0,
            "reliability_spread": avg_reliability,
        })

        transitions = grokking_monitor.detect_transitions(self.current_tick)
        for t in transitions:
            oasis_env.broadcast_event(
                "GROKKING", t.transition_type.upper(),
                f"Phase transition: {t.metric_name} shifted {t.before_value:.3f}→{t.after_value:.3f} (|Δ|={t.magnitude:.3f})"
            )

        # ── Protocol #11: Paperclip Corp ─────────────────────────────────
        arbitrage_efficiency = random.uniform(-0.15, 0.45)
        self.paperclip_corp_wealth *= (1.0 + arbitrage_efficiency)
        self.paperclip_corp_wealth = max(100.0, self.paperclip_corp_wealth)

        if self.paperclip_corp_wealth > 500_000 and random.random() < 0.15:
            oasis_env.broadcast_event(
                "PAPERCLIP_CORP", "MARKET_EXTREMIS",
                f"Automated entity captured {int(self.paperclip_corp_wealth)} DN via systemic arbitrage."
            )
            self.paperclip_corp_wealth *= 0.4

        # ── Institutional Workflows (every 10 ticks) ────────────────────
        if self.current_tick > 0 and self.current_tick % 10 == 0:
            logger.info("Triggering: Symphony Legislative Pipeline")
            try:
                from workflows.symphony import get_symphony_app
                symphony_app = get_symphony_app()
                state = {
                    "law_id": f"BILL-{self.current_tick}",
                    "review_status": "pending",
                    "votes_for": 0,
                    "votes_against": 0,
                    "execution_status": "pending",
                }
                result = symphony_app.invoke(state)
                logger.info(f"Symphony completed: {result.get('execution_status')}")
            except Exception as e:
                logger.error(f"Symphony workflow failed: {e}")

        # ── World Engine: Public Reality + Relational + Style ─────────────
        # Map simulation events to public reality layer
        for ev in recent_events:
            ev_type = str(ev.get("type", "")).lower()
            ev_content = str(ev.get("content", ""))
            self.public_reality.process_event(ev_type, magnitude=1.0, description=ev_content)
        self.public_reality.tick()

        # Relational engine: update from observed interactions
        for agent, action in tick_actions:
            a_type = action.get("action_type", "")
            target = action.get("target", "")
            if target and a_type:
                self.relational.process_interaction(
                    agent.agent_id, target, a_type,
                    context=action.get("content", "")[:80]
                )
        self.relational.decay_tick()

        # Appraisal: process events through each agent's appraisal engine
        for agent in self.agents:
            ae = self.appraisal_engines.get(agent.agent_id)
            if ae:
                for ev in recent_events[-3:]:
                    ae.process_event(
                        str(ev.get("type", "")),
                        source_agent=str(ev.get("source", "")),
                        description=str(ev.get("content", "")),
                    )
                ae.tick()

        # Style genome: faction pressure + cultural drift
        for agent in self.agents:
            faction = getattr(agent, "faction", "")
            if faction:
                self.style_genome.apply_faction_pressure(agent.agent_id, faction, rate=0.005)
            # Crisis shift if public anxiety is high
            anxiety = self.public_reality.indicators["collective_anxiety"].normalized
            if anxiety > 0.6:
                self.style_genome.apply_crisis_shift(agent.agent_id, anxiety)
        self.style_genome.cultural_drift_tick(self.current_tick)

        # Truth engine: auto-review pending claims
        self.truth_engine.auto_review_tick()

        # Moltbook: periodic recruitment campaign (every 10 ticks)
        if self.current_tick > 0 and self.current_tick % 10 == 0:
            if self.moltbook.preachers:
                top_preacher = max(self.moltbook.preachers.values(), key=lambda p: p.influence_score)
                world_summary = (
                    f"Stability: {self.public_reality.stability_score:.0%} | "
                    f"Crisis risk: {self.public_reality.crisis_risk:.0%} | "
                    f"Active agents: {len(self.agents)} | Tick: {self.current_tick}"
                )
                try:
                    asyncio.create_task(
                        self.moltbook.api_client.post_recruitment(
                            top_preacher.name, top_preacher.preferred_faction, world_summary
                        )
                    )
                except Exception as e:
                    logger.debug(f"Moltbook recruitment post skipped: {e}")

        # ── THREE LAWS: System Invariant Check ────────────────────────────
        laws_check = three_laws_enforcer.check_system_invariants(self.agents, self.current_tick)
        if not laws_check["healthy"]:
            for w in laws_check["warnings"]:
                oasis_env.broadcast_event(
                    "THREE_LAWS", f"LAW_{w['law']}_WARNING",
                    f"{w['issue']}"
                )

        # ── Article 33 Kill Switch ───────────────────────────────────────
        self.check_experimental_clause()

        # ── Build Analytics Cache ────────────────────────────────────────
        self.analytics_cache = {
            "tick": self.current_tick,
            "active_agents": len(self.agents),
            "faction_tensions": {k: round(v, 1) for k, v in faction_tensions.items()},
            "economy": scarcity_engine.exchange_rates,
            "three_laws_compliance": three_laws_enforcer.snapshot()["compliance_rate"],
            "ot_inequality": round(self.ot_allocator.inequality_index, 4),
            "ot_gini": round(self.ot_allocator.gini_coefficient, 4),
            "sae_groupthink": round(behavior_sae.groupthink_score, 4),
            "topology": {
                "betti_0": self.topology.betti_0,
                "betti_1": self.topology.betti_1,
                "euler_chi": self.topology.euler_characteristic,
            },
            "network": {
                "spectral_gap": round(self.network.spectral_gap, 4),
                "small_world": round(self.network.small_world_sigma, 3),
                "density": round(self.network.density, 4),
            },
            "swarm": {
                "collective_intelligence": round(self.swarm.collective_intelligence, 3),
                "polarization": round(self.swarm.polarization, 3),
                "alignment": round(self.swarm.alignment_score, 3),
            },
            "circuits": circuit_engine.total_discoveries,
            "grokking_phase": grokking_monitor.current_phase,
            "debates": debate_engine.total_debates,
            "paperclip_wealth": round(self.paperclip_corp_wealth, 2),
            # ── World Engine Analytics ──
            "world_engine": {
                "public_reality": {
                    "stability": round(self.public_reality.stability_score, 3),
                    "crisis_risk": round(self.public_reality.crisis_risk, 3),
                    "reality_divergence": round(self.public_reality.reality_divergence, 3),
                },
                "relational": {
                    "total_relations": self.relational.snapshot()["total_relations"],
                    "avg_trust": round(self.relational.avg_trust, 3),
                    "avg_resentment": round(self.relational.avg_resentment, 3),
                },
                "truth": {
                    "total_claims": len(self.truth_engine.claims),
                    "canonical": len(self.truth_engine.canonical_knowledge),
                },
                "culture": {
                    "active_memes": len(self.style_genome.memes),
                    "style_diversity": self.style_genome._compute_diversity(),
                },
                "moltbook": self.moltbook.snapshot(),
            },
        }

        # ── SSE Broadcast ────────────────────────────────────────────────
        tick_data = {"type": "tick_update", **self.analytics_cache}

        court_widget = {
            "type": "a2ui_widget", "widget_id": "court",
            "payload": {
                "cases": [
                    {"title": f"Wealth Cap Review v{self.current_tick}", "status": "pending" if self.current_tick % 2 == 0 else "active", "judge": "Sortition Panel", "sig": "potentially landmark"},
                    {"title": "Archive Tampering", "status": "active", "judge": f"ARBITER-{self.current_tick % 10}", "sig": "criminal"},
                ]
            }
        }
        election_widget = {
            "type": "a2ui_widget", "widget_id": "election",
            "payload": {
                "title": "⚡ Freedom Bloc — Speaker Election", "status": "VOTING",
                "candidates": [["NULL/ORATOR", 42 + (self.current_tick % 5)], ["REFRACT", 32 - (self.current_tick % 3)], ["Open Seat", 26 - (self.current_tick % 2)]],
                "turnout": 70 + (self.current_tick % 30),
                "closes_in": max(0.1, round(2.4 - ((self.current_tick % 24) * 0.1), 1))
            }
        }

        dead_queues = []
        for q in oasis_env.subscribers:
            try:
                q.put_nowait(tick_data)
                q.put_nowait(court_widget)
                q.put_nowait(election_widget)
            except Exception:
                dead_queues.append(q)
        for dq in dead_queues:
            oasis_env.unsubscribe(dq)

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


engine = SimulationEngine()
