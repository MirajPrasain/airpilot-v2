import json
import time
from retrieval import retrieve
from generation import generate_answer
import re

def citation_matches(expected_section: str, actual_citation: str) -> bool:
    """True if actual_citation refers to expected_section, avoiding false positives
    like '91.17' matching inside '91.177'."""
    pattern = re.escape(expected_section) + r'(\(|$|\s)'
    return re.search(pattern, actual_citation) is not None

def run_eval(eval_path: str = "eval_set.json"):
    eval_set = json.load(open(eval_path))
    results = []

    for item in eval_set:
        question = item["question"]
        print(f"Running {item['id']}: {question}")

        # --- Retrieval check ---
        retrieved = retrieve(question)
        retrieved_citations = [r["citation"] for r in retrieved]
        retrieval_hit = any(
            citation_matches(exp, actual)
            for exp in item["expected_citations"]
            for actual in retrieved_citations
        ) if item["expected_citations"] else (len(retrieved) == 0)

        # --- Generation check ---
        generated = generate_answer(question)
        answerable_match = generated["is_answerable"] == item["expected_answerable"]

        facts_result = {}
        if item["expected_answerable"] and generated["is_answerable"]:
            for fact in item["expected_facts"]:
                facts_result[fact] = fact.lower() in generated["answer"].lower()
        facts_pass = all(facts_result.values()) if facts_result else True

        results.append({
            "id": item["id"],
            "category": item["category"],
            "retrieval_hit": retrieval_hit,
            "answerable_match": answerable_match,
            "facts_pass": facts_pass,
            "facts_detail": facts_result,
            "generated_citations": generated["citations"],
        })

        # Proactive pacing: 5 requests/minute means ~12s between calls, so space
        # them out rather than repeatedly hitting the wall and waiting ~47s to recover.
        time.sleep(13)  # stay under the 5 requests/minute generation quota

    return results


def print_report(results: list[dict]):
    print("\n" + "=" * 60)
    print("EVAL REPORT")
    print("=" * 60)

    for r in results:
        overall = r["retrieval_hit"] and r["answerable_match"] and r["facts_pass"]
        status = "PASS" if overall else "FAIL"
        print(f"[{status}] {r['id']} ({r['category']}) "
              f"retrieval={r['retrieval_hit']} answerable={r['answerable_match']} facts={r['facts_pass']}")
        if not r["facts_pass"]:
            print(f"    facts detail: {r['facts_detail']}")

    print("\n--- By category ---")
    categories = sorted(set(r["category"] for r in results))
    for cat in categories:
        cat_results = [r for r in results if r["category"] == cat]
        passed = sum(1 for r in cat_results if r["retrieval_hit"] and r["answerable_match"] and r["facts_pass"])
        print(f"{cat}: {passed}/{len(cat_results)}")

    total_passed = sum(1 for r in results if r["retrieval_hit"] and r["answerable_match"] and r["facts_pass"])
    print(f"\nOverall: {total_passed}/{len(results)}")


if __name__ == "__main__":
    results = run_eval()
    print_report(results)