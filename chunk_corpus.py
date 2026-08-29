import json
import re
from dotenv import load_dotenv
from google import genai


load_dotenv()  # reads .env in the current directory, sets the values as env vars for this process
client = genai.Client()  # still works the same way — reads GEMINI_API_KEY, now sourced from .env


def is_reserved_placeholder(text: str) -> bool:
    """True if a chunk's content is just a [Reserved] marker, nothing else."""
    stripped = re.sub(r'^\([a-z0-9]+\)\s*', '', text).strip()  # strip leading "(b)" etc.
    return stripped.lower() in ("[reserved]", "reserved")

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

if __name__ == "__main__":
    corpus = json.load(open("part91_corpus.json"))
    
    all_chunks = []
    for section in corpus:
        for chunk in split_section(section):
            if not is_reserved_placeholder(chunk["text"]):
                all_chunks.append(chunk)

    print(f"Sections: {len(corpus)}")
    print(f"Total chunks: {len(all_chunks)}")

    with open("part91_chunks.json", "w") as f:
        json.dump(all_chunks, f, indent=2)

    print("Saved to part91_chunks.json")

    chunks = json.load(open("part91_chunks.json"))
    defs_chunks = [c for c in chunks if c["chunk_id"].startswith("91.851")]
    for c in defs_chunks[:3]:
        print(c["chunk_id"], "|", c["citation"])