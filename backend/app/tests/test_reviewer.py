import json
import pytest
from app.services.reviewer_service import (
    ReviewerContentSchema,
    TopicSection,
    _extract_reviewer_components_from_excerpts,
    _enrich_reviewer,
)
from app.services.pdf_generator import generate_material_pdf_bytes


def test_reviewer_schema_normalizes_corrupted_llm_output():
    """Verify that stray array integers and nested terms/aids are salvaged gracefully."""
    raw = {
        "title": "**Cisco Networking & Security Reviewer**",
        "executive_summary__": "Placeholder summary from notes",
        "learning_objectives": ["", "Master VLANs", "Understand OSPF"],
        "topics": [
            {
                "topic_title": "1. VLAN Fundamentals",
                "bullet_points": ["VLANs segment traffic.", "Improves local security."],
                "key_terms": [{"term": "VLAN", "definition": "Virtual Local Area Network."}],
                "memory_aids": [{"type": "Rule", "description": "Tag trunk ports with 802.1Q"}],
            },
            2,  # Stray integer often emitted by 1B models
            {
                "topic_title": "2. Routing & OSPF",
                "bullet_points": ["OSPF is an interior gateway protocol.", "Uses link-state routing."],
                "key_terms": [{"term": "OSPF", "definition": "Open Shortest Path First."}],
                "memory_aids": ["Formula: Cost is inversely proportional to bandwidth"],
            },
            3,  # Stray integer
        ],
    }

    validated = ReviewerContentSchema.model_validate(raw)
    assert validated.title == "Cisco Networking & Security Reviewer"
    assert len(validated.topics) == 2
    assert validated.topics[0].topic_title == "VLAN Fundamentals"
    assert validated.topics[1].topic_title == "Routing & OSPF"

    # Verify nested key terms and memory aids were lifted
    term_names = [kt.term for kt in validated.key_terms]
    assert "VLAN" in term_names
    assert "OSPF" in term_names

    assert len(validated.memory_aids) >= 1
    # Verify objectives were cleaned (empty string removed)
    assert "" not in validated.learning_objectives
    assert len(validated.learning_objectives) == 2


def test_reviewer_enrichment_from_document_text():
    sample_text = """
    Cisco Packet Tracer Architecture and Topology:
    The topology models a central router connected to hospital departments.
    Traffic is segmented using VLAN 10 for Administration, VLAN 20 for Clinical, and VLAN 30 for Guests.
    Inter-VLAN routing is handled through multilayer switch SVIs.
    
    Network Security and Access Control:
    Security controls include a guest isolation ACL, SSH-based remote management, and port security.
    BPDU Guard prevents unauthorized switch connections.
    Syslog monitoring records all administrative access events.
    """

    empty_reviewer = ReviewerContentSchema(
        title="Sample Reviewer",
        executive_summary="Complete reviewer grounded in the provided notes.",
        topics=[],
        key_terms=[],
        memory_aids=[],
        practice_questions=[],
    )

    enriched = _enrich_reviewer(empty_reviewer, sample_text, "Sample_Network.pdf")

    # Reviewer must be thoroughly enriched
    assert len(enriched.topics) >= 2
    assert any("Security" in t.topic_title or "Topology" in t.topic_title or "Architecture" in t.topic_title for t in enriched.topics)
    assert len(enriched.key_terms) >= 2
    assert len(enriched.memory_aids) >= 1
    assert len(enriched.practice_questions) >= 2
    assert len(enriched.executive_summary) > 50
    assert "Sample_Network.pdf" in enriched.executive_summary


def test_pdf_generation_with_complete_reviewer():
    reviewer_data = {
        "title": "Comprehensive Networking Reviewer",
        "executive_summary": "In-depth synthesis of enterprise routing and switching architectures.",
        "learning_objectives": ["Understand VLANs", "Configure OSPF"],
        "topics": [
            {
                "topic_title": "VLAN Segmentation",
                "bullet_points": ["Isolates broadcast domains.", "Enhances departmental security."],
            }
        ],
        "key_terms": [{"term": "VLAN", "definition": "Virtual Local Area Network"}],
        "memory_aids": ["Remember: 802.1Q tags Ethernet frames on trunk lines."],
        "practice_questions": ["What is the primary function of a VLAN?"],
    }

    stored = {
        "mode": "standard",
        "source_chunks_used": [1, 2],
        "reviewer": reviewer_data,
    }

    pdf_bytes = generate_material_pdf_bytes(
        title="Comprehensive Networking Reviewer",
        material_type="reviewer",
        content_json_str=json.dumps(stored),
    )

    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 2000
    assert pdf_bytes.startswith(b"%PDF")
