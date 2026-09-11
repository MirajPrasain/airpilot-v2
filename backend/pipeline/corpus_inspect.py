import json
import re

# unused - not called anywhere; invoke manually when you want to check
def report_longest_section(corpus: list[dict], preview_chars: int = 600) -> None:
    """Diagnostic: show the single longest section - the worst-case outlier most
    likely to break a naive (a)/(b)/(c) splitting assumption. Look at this before
    writing/tuning the splitting regex, not after."""
    longest = max(corpus, key=lambda s: len(s["text"]))
    print(longest["identifier"], "-", longest["heading"])
    print(f"Length: {len(longest['text'])}")
    print(longest["text"][:preview_chars])

def is_reserved_placeholder(text: str) -> bool:
    """True if a chunk's content is just a [Reserved] marker, nothing else."""
    stripped = re.sub(r'^\([a-z0-9]+\)\s*', '', text).strip()  # strip leading "(b)" etc.
    return stripped.lower() in ("[reserved]", "reserved")

#To diagnose long sections and section lenghts before deciding chunking strategy.
#Before writing the splitting regex, one more check — does every long section actually use lettered (a)(b)(c) at the top level, or do some use (1)(2)(3) as their top level instead
# unused - not called anywhere; invoke manually when you want to check
def report_unsplittable_long_sections(corpus: list[dict], threshold: int = 2000) -> None:
    """Diagnostic: among sections longer than threshold, report how many have no
    (a)/(b)/(c) markers for split_section() to split on (i.e. would fall back to
    the weaker newline-based split)."""
    long_sections = [s for s in corpus if len(s["text"]) > threshold]

    pattern_letter = re.compile(r'^\([a-z]\)', re.MULTILINE)
    no_letter_split = [s for s in long_sections if not pattern_letter.search(s["text"])]

    print(f"Long sections total: {len(long_sections)}")
    print(f"Long sections with NO top-level (a)(b)(c) pattern: {len(no_letter_split)}")
    for s in no_letter_split[:5]:
        print(s["identifier"], "-", s["heading"])


# unused - not called anywhere; invoke manually when you want to check
def list_headings(corpus: list[dict]) -> None:
    """Diagnostic: print every section as "identifier - heading" - a quick map of
    what the corpus covers, handy when picking which sections to write eval
    questions against."""
    for s in corpus:
        print(s["identifier"], "-", s["heading"])


# unused - not called anywhere; invoke manually when you want to check
def preview_sections(corpus: list[dict], identifiers: list[str], preview_chars: int = 1500) -> None:
    """Diagnostic: for each identifier, print its heading and the start of its
    text - eyeball the raw content of specific sections before/after chunking."""
    for tid in identifiers:
        section = next((s for s in corpus if s["identifier"] == tid), None)
        if section is None:
            print(f"=== {tid} NOT FOUND ===\n")
            continue
        print(f"=== {tid} - {section['heading']} ===")
        print(section["text"][:preview_chars])
        print()


# unused - not called anywhere; invoke manually when you want to check
def show_shape(corpus) -> None:
    """Diagnostic: print the field names of a sample entry so we know the real
    key names. Works on either a list corpus or a dict-keyed one, and on the
    pre-chunking (part91_corpus.json) or post-chunking (part91_chunks.json) file."""
    sample = corpus[0] if isinstance(corpus, list) else next(iter(corpus.values()))
    print("--- sample entry keys ---")
    print(list(sample.keys()) if isinstance(sample, dict) else type(sample))


# unused - not called anywhere; invoke manually when you want to check
def find_matches(corpus, citation: str) -> list[dict]:
    """Diagnostic: return every entry whose serialized JSON contains `citation`
    anywhere - a blunt substring search that catches the string in any field
    (identifier, citation, text). Works on a list or dict-keyed corpus."""
    items = corpus if isinstance(corpus, list) else corpus.values()
    return [entry for entry in items if citation in json.dumps(entry)]
