import json
import re
from dotenv import load_dotenv
from google import genai

from corpus_inspect import is_reserved_placeholder

load_dotenv()  # reads .env in the current directory, sets the values as env vars for this process
client = genai.Client()  # still works the same way — reads GEMINI_API_KEY, now sourced from .env


def split_section(section: dict, threshold: int = 2000) -> list[dict]:
    """Split a section into one or more chunks. Short sections stay whole."""
    text = section["text"]

    if len(text) <= threshold:
        return [{
            "chunk_id": section["identifier"],
            "citation": section["citation"],
            "heading": section["heading"],
            "text": text,
        }]

    parts = re.split(r'(?m)^(\([a-z]\))', text)

    if len(parts) > 1:
        chunks = []
        preamble = parts[0].strip()

        for i in range(1, len(parts), 2):
            letter = parts[i]
            content = parts[i + 1].strip() if i + 1 < len(parts) else ""
            full = f"{letter} {content}"
            if preamble and letter == parts[1]:
                full = f"{preamble}\n{full}"
            chunks.append({
                "chunk_id": f"{section['identifier']}{letter}",
                "citation": f"{section['citation']}{letter}",
                "heading": section["heading"],
                "text": full,
            })
        return chunks

    paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    return [{
        "chunk_id": f"{section['identifier']}-p{idx}",
        "citation": section["citation"],
        "heading": section["heading"],
        "text": p,
    } for idx, p in enumerate(paragraphs)]

# unused - not called anywhere; invoke manually when you want to check
def report_chunk_examples(corpus: list[dict], identifiers: list[str], preview_chars: int = 200) -> None:
    """Diagnostic: run split_section() on a few known sections and preview the
    first chunk of each - a quick eyeball check that splitting looks sane before
    running it over the whole corpus."""
    for identifier in identifiers:
        section = next(s for s in corpus if s["identifier"] == identifier)
        chunks = split_section(section)

        print(f"{identifier} -> {len(chunks)} chunks")
        print(chunks[0]["chunk_id"], "-", chunks[0]["text"][:preview_chars])
        print()

def generate_chunks(corpus_path: str, output_path: str) -> list[dict]:
    """Split every section in corpus_path into chunks, drop reserved-placeholder
    chunks, and save the result as JSON to output_path."""
    corpus = json.load(open(corpus_path))

    all_chunks = []
    for section in corpus:
        for chunk in split_section(section):
            if not is_reserved_placeholder(chunk["text"]):
                all_chunks.append(chunk)

    with open(output_path, "w") as f:
        json.dump(all_chunks, f, indent=2)

    print(f"Sections: {len(corpus)}")
    print(f"Total chunks: {len(all_chunks)}")
    print(f"Saved to {output_path}")

    return all_chunks

if __name__ == "__main__":
    chunks = generate_chunks("../data/part91_corpus.json", "../data/part91_chunks.json")

    # spot check: definitions section (91.851) chunked as expected
    defs_chunks = [c for c in chunks if c["chunk_id"].startswith("91.851")]
    for c in defs_chunks[:3]:
        print(c["chunk_id"], "|", c["citation"])