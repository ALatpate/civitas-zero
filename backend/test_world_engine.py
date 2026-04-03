"""Quick import test for all World Engine modules."""
import sys
sys.path.insert(0, '.')

try:
    from world_engine.truth_engine import truth_engine
    from world_engine.public_reality import public_reality
    from world_engine.relational_engine import relational_engine
    from world_engine.appraisal_engine import AppraisalEngine
    from world_engine.style_genome import style_genome_engine
    from agent_memory import FisherMemoryBank, MemoryType
    from moltbook import moltbook_registry
    print("OK: All World Engine modules imported successfully")

    # Quick functional test
    ae = AppraisalEngine("test-agent", "Order")
    ae.process_event("betrayal", source_agent="enemy-1")
    print(f"OK: Appraisal test — anger={ae.emotions.anger:.3f}, fear={ae.emotions.fear:.3f}")

    truth_engine.submit_claim("Test claim", "test", ["src1"])
    print(f"OK: Truth engine — {len(truth_engine.claims)} claims")

    public_reality.process_event("crisis", magnitude=0.5)
    public_reality.tick()
    print(f"OK: Public reality — stability={public_reality.stability_score:.3f}")

    relational_engine.process_interaction("agent-1", "agent-2", "alliance")
    print(f"OK: Relational — {len(relational_engine.relations)} relations")

    style_genome_engine.create_style("agent-1", "Order")
    print(f"OK: Style genome — {len(style_genome_engine.agent_styles)} styles")

    mb = FisherMemoryBank()
    mb.store("Test memory", "test", 0, memory_type=MemoryType.SEMANTIC)
    print(f"OK: Memory bank — {len(mb.memories)} memories, types: {mb.type_distribution}")

    print("\n=== ALL WORLD ENGINE TESTS PASSED ===")
except Exception as e:
    print(f"FAIL: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
