import json
from google import genai
from google.genai.types import GenerateContentConfig

from retrieval import retrieve

genai_client = genai.Client()

GENERATION_MODEL = "gemini-3.6-flash"

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

    prompt = f"""Question: {question}

Retrieved excerpts:
{context}

Respond in the required JSON format."""

    response = genai_client.models.generate_content(
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