import json
import re
import time
from google import genai
from google.genai import errors
from google.genai.types import GenerateContentConfig

from retrieval import retrieve

genai_client = genai.Client()

GENERATION_MODEL = "gemini-3.6-flash"


def generate_content_with_retry(model, contents, config, max_retries=5):
    """Generation is capped at 5 requests/minute on the free tier — far stricter
    than the 100/minute for embeddings — so retry on 429 with the delay Google
    actually tells us to wait, instead of assuming a limit."""
    for attempt in range(max_retries):
        try:
            return genai_client.models.generate_content(model=model, contents=contents, config=config)
        except errors.ClientError as e:
            if e.code == 429:
                match = re.search(r"retry in ([\d.]+)s", str(e))
                wait_time = float(match.group(1)) + 2 if match else 15
                print(f"Rate limited on generation. Waiting {wait_time:.1f}s...")
                time.sleep(wait_time)
            else:
                raise
    raise RuntimeError("Max retries exceeded for generation call")

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "is_answerable": {"type": "boolean"},
        "citations": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["answer", "is_answerable", "citations"],
}

SYSTEM_INSTRUCTION = """You are AirPilot, an aviation safety assistant. You answer ONLY using the provided regulation excerpts below — never from your own general knowledge.

Rules:
1. Read the excerpts carefully. If they genuinely answer the question, set is_answerable to true, write the answer grounded strictly in the excerpts, and list the exact citation(s) you used.
2. If the excerpts are only tangentially related, off-topic, or don't actually address what was asked — even if they mention similar-sounding terms — set is_answerable to false, leave citations empty, and explain briefly in "answer" that the corpus doesn't cover this.
3. Never invent a citation that isn't in the provided excerpts. Never blend outside knowledge into the answer.
"""


def generate_answer(question: str) -> dict:
    chunks = retrieve(question) #the top-k most relevant chunks for a question

    # Layer 1: nothing cleared the retrieval threshold at all — no LLM call needed
    if not chunks:
        return {
            "answer": "I don't have relevant information in the Part 91 corpus to answer this question.",
            "is_answerable": False,
            "citations": [],
        }

    # Layer 2: hand chunks to the LLM and let it judge real relevance
    context = "\n\n".join( #for this code breakdown,see Python Advanced Basics Chat in Claude 
        f"[{c['citation']}]\n{c['text']}" for c in chunks
    )

    prompt = f"""Question: {question}. Retrieved excerpts: {context}
                Respond in the required JSON format."""

    response = generate_content_with_retry(
        model=GENERATION_MODEL,
        contents=prompt,
        config=GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=RESPONSE_SCHEMA,
        ),
    )

    return json.loads(response.text)


if __name__ == "__main__":
    for q in [
        "Can I fly under the influence of alcohol?",
        "What is the capital of France?",
        "What are the rules for commercial space launch licensing?",
    ]:
        print(f"Q: {q}")
        result = generate_answer(q)
        print(json.dumps(result, indent=2))
        print("---")