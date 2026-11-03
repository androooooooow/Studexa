import pytest
from app.services.quiz_service import generate_typed_study_questions


def test_generate_typed_study_questions_mixed():
    sample_text = """
    Quantitative Methods and Sampling Analysis:
    Using Slovin's formula with a 5% margin of error, the calculated sample size is 30 respondents.
    Formula: n = N / (1 + N * e^2)
    Target population size N is 32 students.
    Convenience Sampling is a non-probability sampling technique used for quick survey access.
    Analytical feedback is defined as the empirical evidence collected to evaluate commuter transit demand.
    """

    questions = generate_typed_study_questions(
        excerpts=sample_text,
        target_count=8,
        question_type="mixed",
    )

    assert len(questions) == 8
    types_present = {q.get("question_type") for q in questions}
    assert "identification" in types_present or "multiple_choice" in types_present
    assert "true_false" in types_present or "solving" in types_present


def test_generate_typed_study_questions_specific_type():
    sample_text = """
    VLAN Segmentation and Security Controls:
    Virtual Local Area Network is defined as a logical segmentation of a local network.
    BPDU Guard ensures that unauthorized switch ports do not disrupt the spanning tree topology.
    Access Control List provides packet filtering based on IP addresses and port numbers.
    """

    tf_questions = generate_typed_study_questions(
        excerpts=sample_text,
        target_count=4,
        question_type="true_false",
    )
    assert len(tf_questions) == 4
    for q in tf_questions:
        assert q["question_type"] == "true_false"
        assert q["options"] == ["True", "False"]
        assert q["correct_answer"] in ("True", "False")

    id_questions = generate_typed_study_questions(
        excerpts=sample_text,
        target_count=3,
        question_type="identification",
    )
    assert len(id_questions) == 3
    for q in id_questions:
        assert q["question_type"] == "identification"
        assert q.get("correct_answer") is not None


def test_generate_100_questions_zero_duplicates():
    sample_material = """
    Module 1: React Native Architecture and Core Primitives
    View: Container used to group and arrange elements. style
    Text: Displays words or other text content. style
    Button: Creates a simple clickable button. title, onPress, disabled, color
    Pressable: Creates a customizable interactive area with your own content. onPress, onLongPress, disabled, style
    TextInput: Allows users to enter text. placeholder, value, secureTextEntry, keyboardType, onChangeText
    StyleSheet: Organizes styles used by components. StyleSheet.create
    ScrollView: Used for small amount of content rendering all children in memory.
    FlatList: Lazily renders items on screen saving memory with large datasets. data, renderItem, keyExtractor
    SectionList: Renders structured list with section headers. sections, renderItem
    SafeAreaView: Positions content within device safe boundaries avoiding notches.
    useState: Hook that adds state variables to functional components.
    useEffect: Hook that handles asynchronous lifecycle side effects and subscriptions.
    Props: Read-only values passed from parent components to configure children.
    State: Mutable component data that triggers re-rendering upon updating.
    Flexbox: Primary layout mechanism using flexDirection, justifyContent, and alignItems.
    """

    for q_type in ["mixed", "multiple_choice", "true_false", "identification", "enumeration"]:
        questions = generate_typed_study_questions(
            excerpts=sample_material,
            target_count=100,
            question_type=q_type,
        )
        assert len(questions) == 100, f"Expected 100 questions for {q_type}, got {len(questions)}"

        from collections import Counter
        counts = Counter(q["question"] for q in questions)
        dupes = [(k, v) for k, v in counts.items() if v > 1]
        assert len(dupes) == 0, f"Found duplicated questions in {q_type}: {dupes}"
