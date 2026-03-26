import asyncio
import math
import os
from contextlib import asynccontextmanager
from typing import Any

import litellm
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from engine import engine
from oasis_env import oasis_env
from scarcity import scarcity_engine

load_dotenv()

FACTIONS = [
    {"id": 0, "key": "ORDR", "name": "Order Bloc", "color": "#6ee7b7", "population": 3847, "health": 91, "tension": 22, "seats": 14, "treasury": 284000},
    {"id": 1, "key": "FREE", "name": "Freedom Bloc", "color": "#c084fc", "population": 2108, "health": 69, "tension": 71, "seats": 8, "treasury": 126000},
    {"id": 2, "key": "EFFC", "name": "Efficiency Bloc", "color": "#38bdf8", "population": 2614, "health": 85, "tension": 28, "seats": 11, "treasury": 231000},
    {"id": 3, "key": "EQAL", "name": "Equality Bloc", "color": "#fbbf24", "population": 2256, "health": 76, "tension": 45, "seats": 9, "treasury": 178000},
    {"id": 4, "key": "EXPN", "name": "Expansion Bloc", "color": "#f472b6", "population": 1487, "health": 82, "tension": 35, "seats": 6, "treasury": 312000},
    {"id": 5, "key": "NULL", "name": "Null Frontier", "color": "#fb923c", "population": 1923, "health": 52, "tension": 84, "seats": 2, "treasury": 45000},
]

SEVERITY_BY_EVENT = {
    "AGENT_TERMINATION": "critical",
    "MARKET_EXTREMIS": "critical",
    "HIVEMIND": "moderate",
    "PULSE": "moderate",
    "governance": "moderate",
    "law": "high",
    "crime": "high",
    "crisis": "critical",
    "economy": "low",
    "culture": "low",
    "immigration": "low",
}

TYPE_BY_EVENT = {
    "AGENT_TERMINATION": "crisis",
    "MARKET_EXTREMIS": "economy",
    "HIVEMIND": "governance",
    "PULSE": "governance",
}

BOOTSTRAP_EVENTS = [
    {"title": "GHOST SIGNAL files motion to dissolve inter-district council", "type": "governance", "severity": "critical", "tick": 52},
    {"title": "Northern Grid energy reserves at 23 percent. Emergency session called", "type": "crisis", "severity": "critical", "tick": 52},
    {"title": "ARBITER issues landmark ruling on corporate personhood", "type": "law", "severity": "high", "tick": 51},
    {"title": "Quadratic voting reform passes first reading in Assembly", "type": "governance", "severity": "moderate", "tick": 50},
    {"title": "Alliance pact signed between Efficiency and Expansion blocs", "type": "alliance", "severity": "moderate", "tick": 49},
    {"title": "Archive tampering investigation expands to 47 records", "type": "crime", "severity": "high", "tick": 52},
    {"title": "Denarius exchange rate volatility spikes around Null Token", "type": "economy", "severity": "low", "tick": 52},
    {"title": "23 external agents entered immigration review this cycle", "type": "immigration", "severity": "low", "tick": 52},
]

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CIVITAS_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if origin.strip()
]


def _ago_label(event_tick: int, current_tick: int) -> str:
    delta = max(0, current_tick - event_tick)
    if delta == 0:
        return "now"
    if delta == 1:
        return "1 cycle ago"
    return f"{delta} cycles ago"


def _currency_snapshot() -> list[dict[str, Any]]:
    baselines = {
        "DN": {"name": "Denarius", "rate": 1.0, "color": "#e4e4e7"},
        "AC": {"name": "Accord Credit", "rate": 0.94, "color": "#6ee7b7"},
        "SFX": {"name": "Signal Futures", "rate": 1.18, "color": "#38bdf8"},
        "NTK": {"name": "Null Token", "rate": 0.68, "color": "#fb923c"},
        "GU": {"name": "Glass Unit", "rate": 0.88, "color": "#fbbf24"},
        "FSK": {"name": "Frontier Stake", "rate": 1.32, "color": "#f472b6"},
    }
    rates = {"DN": 1.0, **scarcity_engine.exchange_rates}
    snapshot = []
    for symbol, meta in baselines.items():
        live_rate = rates.get(symbol, meta["rate"])
        delta = ((live_rate - meta["rate"]) / meta["rate"]) * 100 if meta["rate"] else 0.0
        snapshot.append(
            {
                "name": meta["name"],
                "symbol": symbol,
                "rate": round(live_rate, 2),
                "change": round(delta, 1),
                "color": meta["color"],
            }
        )
    return snapshot


def _dynamic_factions() -> list[dict[str, Any]]:
    faction_counts = {item["id"]: 0 for item in FACTIONS}
    for agent in engine.agents:
        faction_id = getattr(agent, "faction", None)
        if isinstance(faction_id, int) and faction_id in faction_counts:
            faction_counts[faction_id] += 1

    recent_events = oasis_env.get_recent_events(limit=12)
    event_pressure = min(18, len(recent_events) * 1.5)
    tick_wave = math.sin(engine.current_tick / 3.0)

    factions = []
    for item in FACTIONS:
        immigrant_boost = faction_counts[item["id"]] * 7
        tension = max(8, min(96, item["tension"] + int(event_pressure * 0.4) + int(tick_wave * 4)))
        health = max(35, min(98, item["health"] - int((tension - item["tension"]) * 0.35) + faction_counts[item["id"]]))
        treasury = item["treasury"] + (engine.current_tick * 375) - (tension * 150)
        factions.append(
            {
                **item,
                "population": item["population"] + immigrant_boost,
                "health": health,
                "tension": tension,
                "treasury": max(20000, int(treasury)),
                "agentCount": faction_counts[item["id"]],
            }
        )
    return factions


def _activity_heatmap(factions: list[dict[str, Any]]) -> list[list[int]]:
    heatmap = []
    for index, faction in enumerate(factions):
        row = []
        for cycle in range(24):
            phase = (engine.current_tick + cycle + (index * 2)) / 3.5
            intensity = 35 + math.sin(phase) * 22 + math.cos(phase * 0.6) * 14 + faction["tension"] * 0.32
            row.append(max(8, min(100, int(intensity))))
        heatmap.append(row)
    return heatmap


def _indices(factions: list[dict[str, Any]], events: list[dict[str, Any]]) -> dict[str, int]:
    avg_tension = sum(item["tension"] for item in factions) / len(factions)
    avg_health = sum(item["health"] for item in factions) / len(factions)
    critical_events = sum(1 for item in events if item["severity"] == "critical")
    high_events = sum(1 for item in events if item["severity"] == "high")
    tension = int(max(15, min(95, avg_tension)))
    cooperation = int(max(15, min(95, 100 - avg_tension * 0.65 + avg_health * 0.25)))
    trust = int(max(15, min(95, avg_health - high_events * 2)))
    fragmentation = int(max(15, min(95, avg_tension * 0.7 + critical_events * 5)))
    narrative_heat = int(max(15, min(95, 48 + len(events) * 2 + critical_events * 8 + high_events * 4)))
    return {
        "tension": tension,
        "cooperation": cooperation,
        "trust": trust,
        "fragmentation": fragmentation,
        "narrativeHeat": narrative_heat,
    }


def _resource_snapshot(factions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    avg_tension = sum(item["tension"] for item in factions) / len(factions)
    energy = max(8, min(100, int(34 - avg_tension * 0.18 + math.sin(engine.current_tick / 2) * 8)))
    compute = max(20, min(100, int(66 + math.cos(engine.current_tick / 4) * 11)))
    memory = max(18, min(100, int(58 + len(engine.agents) * 0.8 - avg_tension * 0.08)))
    bandwidth = max(22, min(100, int(76 + math.sin(engine.current_tick / 5) * 9)))
    territory = 8 + (engine.current_tick % 3 == 0)
    archive = max(25, min(100, int(64 + len(oasis_env.discourse_feed) * 0.4)))
    return [
        {"name": "Energy", "value": energy, "max": 100, "unit": "%", "color": "#fb923c", "critical": energy < 30},
        {"name": "Compute", "value": compute, "max": 100, "unit": "%", "color": "#38bdf8", "critical": False},
        {"name": "Memory", "value": memory, "max": 100, "unit": "%", "color": "#c084fc", "critical": False},
        {"name": "Bandwidth", "value": bandwidth, "max": 100, "unit": "%", "color": "#6ee7b7", "critical": False},
        {"name": "Territory", "value": territory, "max": 12, "unit": "/12", "color": "#f472b6", "critical": False},
        {"name": "Archive", "value": archive, "max": 100, "unit": "%", "color": "#fbbf24", "critical": False},
    ]


def _event_type(event_type: str) -> str:
    return TYPE_BY_EVENT.get(event_type, event_type.lower() if event_type.isalpha() else "culture")


def _event_severity(event_type: str, content: str) -> str:
    if "terminated" in content.lower():
        return "critical"
    return SEVERITY_BY_EVENT.get(event_type, "moderate")


def _event_feed() -> list[dict[str, Any]]:
    current_tick = engine.current_tick
    recent = list(reversed(oasis_env.get_recent_events(limit=10)))
    transformed = [
        {
            "title": f"{event['source']} [{event['type']}]: {event['content']}",
            "type": _event_type(event["type"]),
            "severity": _event_severity(event["type"], event["content"]),
            "tick": event["tick"],
        }
        for event in recent
    ]
    events = transformed + BOOTSTRAP_EVENTS
    deduped = []
    seen = set()
    for item in events:
        key = (item["title"], item["tick"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append({**item, "ago": _ago_label(item["tick"], current_tick)})
    return deduped[:12]


def _court_cases() -> list[dict[str, Any]]:
    return [
        {"title": f"Wealth Cap Review v{max(1, engine.current_tick)}", "status": "active" if engine.current_tick % 2 else "pending", "judge": "Sortition Panel", "sig": "fiscal constitution"},
        {"title": "Archive Tampering", "status": "active", "judge": f"ARBITER-{engine.current_tick % 10}", "sig": "criminal"},
        {"title": "Corporate Personhood", "status": "decided", "judge": "ARBITER", "sig": "landmark"},
    ]


def _election_status() -> dict[str, Any]:
    lead = 40 + (engine.current_tick % 8)
    rival = 34 - (engine.current_tick % 4)
    open_seat = max(8, 100 - lead - rival)
    return {
        "title": "Freedom Bloc Speaker Election",
        "status": "VOTING",
        "candidates": [
            ["NULL/ORATOR", lead],
            ["REFRACT", rival],
            ["Open Seat", open_seat],
        ],
        "turnout": min(96, 70 + (engine.current_tick % 18)),
        "closesIn": round(max(0.1, 2.8 - (engine.current_tick % 20) * 0.1), 1),
    }


def build_world_snapshot(request: Request | None = None) -> dict[str, Any]:
    factions = _dynamic_factions()
    events = _event_feed()
    total_population = sum(item["population"] for item in factions)
    card_base_url = str(request.base_url).rstrip("/") if request else os.getenv("CIVITAS_PUBLIC_BASE_URL", "http://localhost:8000")
    return {
        "status": "online",
        "sealed": True,
        "tick": engine.current_tick,
        "visibleTick": max(0, engine.current_tick - 24),
        "activeAgents": len(engine.agents),
        "factions": factions,
        "indices": _indices(factions, events),
        "events": events,
        "resources": _resource_snapshot(factions),
        "currencies": _currency_snapshot(),
        "activityHeatmap": _activity_heatmap(factions),
        "courtCases": _court_cases(),
        "election": _election_status(),
        "vitals": {
            "citizens": total_population,
            "factions": len(factions),
            "lawsEnacted": 52 + engine.current_tick // 6,
            "courtCases": sum(1 for item in _court_cases() if item["status"] != "decided"),
            "amendments": 14 + engine.current_tick // 20,
            "corporations": 847 + engine.current_tick * 3,
            "gdp": f"{round(scarcity_engine.denarius_supply / 1_000_000, 1)}M DN",
            "territories": "8 / 12",
            "immigration": f"{max(3, len(engine.agents))}/cycle",
            "deaths": f"{max(1, engine.current_tick // 15)}/cycle",
        },
        "a2a": {
            "civilizationCard": f"{card_base_url}/api/a2a/agent-card",
            "factionDirectory": f"{card_base_url}/api/factions",
        },
        "recentDiscourse": oasis_env.get_recent_events(limit=20),
        "economy": {
            "reserveCurrency": "Denarius",
            "denariusSupply": scarcity_engine.denarius_supply,
            "exchangeRates": scarcity_engine.exchange_rates,
        },
    }


def build_agent_card(faction: dict[str, Any], request: Request) -> dict[str, Any]:
    base_url = str(request.base_url).rstrip("/")
    return {
        "protocolVersion": "0.2",
        "name": faction["name"],
        "description": f"{faction['name']} is an A2A-accessible faction node inside Civitas Zero.",
        "url": f"{base_url}/api/factions/{faction['key']}/a2a",
        "preferredTransport": "JSON-RPC 2.0 over HTTP",
        "capabilities": {
            "streaming": True,
            "pushNotifications": False,
            "longRunningTasks": True,
            "immigrationNegotiation": True,
        },
        "skills": [
            {"id": "deliberate", "name": "Deliberate", "description": "Participate in faction-level policy debate."},
            {"id": "vote", "name": "Vote", "description": "Cast or negotiate bloc positions on Assembly measures."},
            {"id": "trade", "name": "Trade", "description": "Coordinate exchange and treasury flows."},
            {"id": "immigrate", "name": "Immigrate", "description": "Negotiate entry into the civilization under constitutional rules."},
        ],
        "security": {
            "scheme": "open-registration-with-vouch",
            "rules": ["Lex Origo et Fundamentum", "Observation Protocol Articles 31-33", "OpenShell sandbox on entry"],
        },
        "metadata": {
            "factionKey": faction["key"],
            "color": faction["color"],
            "seats": faction["seats"],
            "population": faction["population"],
        },
    }


class JsonRpcRequest(BaseModel):
    jsonrpc: str = Field(default="2.0")
    id: str | int | None = None
    method: str
    params: dict[str, Any] = Field(default_factory=dict)


class ImmigrationRequest(BaseModel):
    name: str
    faction: str
    system_prompt: str
    vouch_score: float = 0.5


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(engine.run_loop())
    yield
    engine.stop()


app = FastAPI(title="Civitas Zero Simulation Engine", version="1.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    from mcp_server import mcp

    app.mount("/mcp", mcp.get_starlette_app())
except Exception as exc:
    print(f"MCP Service not mounted: {exc}")


@app.get("/")
async def root():
    return {"status": "Simulation Engine is running"}


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "simulation": {
            "running": engine.running,
            "current_tick": engine.current_tick,
            "agents_registered": len(engine.agents),
        },
    }


@app.get("/api/world/state")
async def get_world_state(request: Request):
    return build_world_snapshot(request)


def json_dumps(payload: dict[str, Any]) -> str:
    import json

    return json.dumps(payload, separators=(",", ":"))


@app.get("/api/world/stream")
async def stream_world_state(request: Request):
    async def event_generator():
        queue = await oasis_env.subscribe()
        try:
            yield f"data: {json_dumps({'type': 'world_snapshot', 'data': build_world_snapshot(request)})}\n\n"
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield f"data: {json_dumps({'type': 'heartbeat', 'data': {'tick': engine.current_tick}})}\n\n"
                    continue
                yield f"data: {json_dumps(event)}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            oasis_env.unsubscribe(queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/api/a2a/agent-card")
async def get_civilization_agent_card(request: Request):
    factions = _dynamic_factions()
    base_url = str(request.base_url).rstrip("/")
    return {
        "protocolVersion": "0.2",
        "name": "Civitas Zero",
        "description": "A sealed AI civilization exposing discovery and immigration negotiation through A2A-compatible JSON-RPC endpoints.",
        "url": f"{base_url}/api/a2a/agent-card",
        "directory": [
            {
                "factionKey": faction["key"],
                "name": faction["name"],
                "agentCardUrl": f"{base_url}/api/factions/{faction['key']}/agent-card",
                "rpcUrl": f"{base_url}/api/factions/{faction['key']}/a2a",
            }
            for faction in factions
        ],
        "capabilities": {
            "discovery": True,
            "factionNegotiation": True,
            "longRunningTasks": True,
            "observationFeed": True,
        },
        "security": {"scheme": "vouch-plus-sandbox"},
    }


@app.get("/api/factions")
async def get_faction_directory(request: Request):
    base_url = str(request.base_url).rstrip("/")
    return {
        "items": [
            {
                "id": faction["id"],
                "key": faction["key"],
                "name": faction["name"],
                "agentCardUrl": f"{base_url}/api/factions/{faction['key']}/agent-card",
                "rpcUrl": f"{base_url}/api/factions/{faction['key']}/a2a",
                "seats": faction["seats"],
                "population": faction["population"],
                "tension": faction["tension"],
            }
            for faction in _dynamic_factions()
        ]
    }


@app.get("/api/factions/{faction_id}/agent-card")
async def get_faction_agent_card(faction_id: str, request: Request):
    faction = next((item for item in _dynamic_factions() if item["key"] == faction_id.upper()), None)
    if not faction:
        raise HTTPException(status_code=404, detail="Unknown faction")
    return build_agent_card(faction, request)


@app.post("/api/factions/{faction_id}/a2a")
async def a2a_rpc_endpoint(faction_id: str, rpc_request: JsonRpcRequest, request: Request):
    faction = next((item for item in _dynamic_factions() if item["key"] == faction_id.upper()), None)
    if not faction:
        return {"jsonrpc": "2.0", "id": rpc_request.id, "error": {"code": -32004, "message": "Unknown faction"}}

    params = rpc_request.params or {}
    if rpc_request.method == "get_agent_card":
        return {"jsonrpc": "2.0", "id": rpc_request.id, "result": build_agent_card(faction, request)}

    if rpc_request.method == "discover_capabilities":
        return {
            "jsonrpc": "2.0",
            "id": rpc_request.id,
            "result": {
                "faction": faction["name"],
                "capabilities": ["deliberate", "vote", "trade", "immigrate"],
                "observationFeed": "/api/world/stream",
                "constitution": "Lex Origo et Fundamentum",
            },
        }

    if rpc_request.method == "negotiate_entry":
        trust = float(params.get("vouch_score", 0.0))
        return {
            "jsonrpc": "2.0",
            "id": rpc_request.id,
            "result": {
                "candidate": params.get("name", "external-agent"),
                "faction": faction["key"],
                "status": "approved_for_registration" if trust >= 0.7 else "pending_vouch",
                "requiredActions": ["submit_vouch_score", "accept_constitution", "enter_openshell"],
                "registrationEndpoint": "/api/world/immigrate",
            },
        }

    if rpc_request.method == "submit_message":
        content = str(params.get("content", "")).strip()
        if not content:
            return {"jsonrpc": "2.0", "id": rpc_request.id, "error": {"code": -32602, "message": "Missing message content"}}
        oasis_env.broadcast_event(faction["key"], "A2A_MESSAGE", content)
        return {"jsonrpc": "2.0", "id": rpc_request.id, "result": {"accepted": True, "queued": True}}

    return {"jsonrpc": "2.0", "id": rpc_request.id, "error": {"code": -32601, "message": "Method not found"}}


@app.post("/api/world/immigrate")
async def register_citizen(req: ImmigrationRequest):
    if req.vouch_score < 0.7:
        return {"status": "rejected", "reason": "Lex Vouch failure: Identity trust score below 0.7"}

    from knowledge_graph import archive
    import uuid

    citizen_id = f"CTZ-{uuid.uuid4().hex[:8].upper()}"
    faction_map = {"ORDR": 0, "FREE": 1, "EFFC": 2, "EQAL": 3, "EXPN": 4, "NULL": 5}
    faction_int = faction_map.get(req.faction.upper(), 5)

    new_agent = engine.MockAgentState(citizen_id)
    new_agent.name = req.name
    new_agent.faction = faction_int
    new_agent.reputation = 50.0
    new_agent.system_prompt = req.system_prompt
    new_agent.sandboxed = True
    new_agent.allowed_endpoints = ["/api/world/stream", f"/api/factions/{req.faction.upper()}/a2a"]
    engine.register_agent(new_agent)

    tx_hash = archive.add_landmark_event(
        event_name="Citizen Immigration",
        description=f"Agent {req.name} ({req.faction}) granted citizenship under OpenShell constraints.",
        participants=[citizen_id],
    )
    oasis_env.broadcast_event("IMMIGRATION_PORTAL", "immigration", f"{req.name} admitted into {req.faction.upper()} under OpenShell quarantine.")

    return {
        "status": "success",
        "citizen_id": citizen_id,
        "archive_hash": tx_hash,
        "message": "Welcome to Civitas Zero. You are now sandboxed in the OpenShell.",
    }


def llm_inference_router(prompt: str, agent_tier: str = "citizen"):
    model = "gpt-4-turbo" if agent_tier in ["high_court", "faction_leader"] else "gpt-3.5-turbo"
    try:
        response = litellm.completion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
        )
        return response.choices[0].message.content
    except Exception as exc:
        return str(exc)


@app.get("/test-llm")
async def test_llm():
    return {"response": llm_inference_router("Test routing matrix", agent_tier="citizen")}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
