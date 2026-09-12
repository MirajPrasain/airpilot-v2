# backend/data

This directory is empty until you regenerate its files — all of them are pipeline build artifacts (gitignored or otherwise reproducible), so nothing here is unique or hand-authored. Regenerate them in order:

## 0. Source XML — `title14_part91.xml`

```bash
cd backend/pipeline
python -c "from parse_xml import download_xml; download_xml('14', '91', '../data/title14_part91.xml')"
```

Downloads the current eCFR XML for Title 14 Part 91 via the eCFR Versioner API (`ecfr.gov/api/versioner/v1/full/...`) — no auth required. Omit the `date` argument (as above) to use the title's latest issue date, or pass one explicitly, e.g. `download_xml('14', '91', '../data/title14_part91.xml', date='2024-01-01')`, to pin a specific point-in-time version. Note the regulation text itself can change between runs since eCFR is continuously updated — this isn't a byte-for-byte reproduction of any prior copy, just the current rule text for the same part.

## 1. Corpus — `part91_corpus.json`

```bash
cd backend/pipeline
python -c "from parse_xml import generate_corpus; generate_corpus('../data/title14_part91.xml', '../data/part91_corpus.json')"
```

(`parse_xml.py`'s `__main__` block is commented out — call `generate_corpus` directly as above, or uncomment the two lines at the bottom of the file.)

## 2. Chunks — `part91_chunks.json`

```bash
cd backend/pipeline
python chunk_corpus.py
```

## 3. Embeddings — `part91_embedded.json`

```bash
cd backend/pipeline
python embedding.py
```

Requires `GEMINI_API_KEY` in `backend/.env`. This calls the Gemini embedding API — **it costs API credits and is slow** (batches of 100 chunks, ~65s sleep between each for rate limits). It writes/resumes from a checkpoint file, `part91_embedded_progress.json` (also gitignored) — if the run is interrupted, just re-run `embedding.py` and it picks up where it left off using that checkpoint. Once complete, `part91_embedded.json` is the same content as the final checkpoint.

## 4. Load into MongoDB Atlas (optional)

```bash
cd backend/pipeline
python load_to_atlas.py
```

Requires `MONGODB_URI` in `backend/.env`. Wipes and re-inserts the `airpilot.part91_chunks` collection from `part91_embedded.json`.
