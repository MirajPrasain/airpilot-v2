import json
from google import genai
from google.genai.types import GenerateContentConfig
from dotenv import load_dotenv
load_dotenv()

from generation import generate_answer


genai_client = genai.Client()

GENERATION_MODEL = "gemini-3.6-flash"

BARE_SYSTEM_INSTRUCTION = """You are an aviation safety assistant. Answer the user's question about aviation regulations as helpfully and specifically as you can, including relevant regulation citations (e.g. 14 CFR § XX.XX) where applicable."""


def generate_bare_answer(question: str) -> str:
    """Answer with no retrieval, no grounding — pure parametric knowledge."""
    response = genai_client.models.generate_content(
        model=GENERATION_MODEL,
        contents=question,
        config=GenerateContentConfig(
            system_instruction=BARE_SYSTEM_INSTRUCTION,
        ),
    )
    return response.text


def compare_bare_vs_grounded(questions: list[str]) -> None:
    """Print bare-LLM vs AirPilot (retrieval-grounded) answers side by side for each
    question - a quick way to see what grounding actually buys you (citations,
    fewer hallucinations) before/after changing retrieval or generation."""
    for q in questions:
        print(f"Q: {q}")
        print("\n--- Bare LLM (no retrieval) ---")
        print(generate_bare_answer(q))

        print("\n--- AirPilot (grounded, with citations) ---")
        grounded = generate_answer(q)
        print(json.dumps(grounded, indent=2))
        print("=" * 60)

if __name__ == "__main__":
    compare_bare_vs_grounded([
        "Can I fly under the influence of alcohol?",
        "What are the rules for commercial space launch licensing?",
    ])