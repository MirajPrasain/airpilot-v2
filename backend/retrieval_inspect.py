from retrieval import retrieve

# unused - not called anywhere; invoke manually or via pytest when you want to check
def test_relevant_question() -> None:
    """A clearly relevant question should retrieve chunks with decent scores,
    including the section that actually answers it (91.17 - Alcohol or drugs)."""
    results = retrieve("Can I fly under the influence of alcohol?")

    assert len(results) > 0
    assert results[0]["score"] > 0.85
    assert any(r["chunk_id"].startswith("91.17") for r in results)

# unused - not called anywhere; invoke manually or via pytest when you want to check
def test_irrelevant_question() -> None:
    """A clearly irrelevant question should be filtered out entirely by min_score."""
    results = retrieve("What is the capital of France?", limit=5)

    assert results == []

# unused - not called anywhere; invoke manually or via pytest when you want to check
def test_borderline_question() -> None:
    """A question that's related but not squarely covered by Part 91 - there's no
    fixed expected answer here, so just check retrieve() doesn't break and, if
    anything comes back, it respects min_score and has the expected shape."""
    results = retrieve("What are the rules for commercial space launch licensing?", limit=5)

    assert isinstance(results, list)
    for r in results:
        assert r["score"] >= 0.8
        assert {"chunk_id", "citation", "heading", "text", "score"} <= r.keys()
