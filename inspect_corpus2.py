import json

CITATIONS = ["91.3", "91.17", "91.119", "91.177", "91.155", "91.176", "91.157", "91.851"]

def load(path):
    with open(path) as f:
        return json.load(f)

def show_shape(corpus):
    sample = corpus[0] if isinstance(corpus, list) else next(iter(corpus.values()))
    print("--- sample entry keys (so we know the real field names) ---")
    print(list(sample.keys()) if isinstance(sample, dict) else type(sample))
    print()

def find_matches(corpus, citation):
    hits = []
    items = corpus if isinstance(corpus, list) else corpus.values()
    for entry in items:
        blob = json.dumps(entry)
        if citation in blob:
            hits.append(entry)
    return hits

if __name__ == "__main__":
    corpus = load("part91_corpus.json")   # swap to part91_chunks.json if you want the post-chunking view instead
    show_shape(corpus)

    for cite in CITATIONS:
        matches = find_matches(corpus, cite)
        print(f"\n=== {cite} ({len(matches)} match(es)) ===")
        for m in matches:
            print(json.dumps(m, indent=2)[:1500])  # truncate — raise this if a section gets cut off