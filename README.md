# AirPilot

**A retrieval-grounded AI copilot for aviation safety regulations — built to demonstrate trustworthy, citation-backed AI over hallucination-prone bare LLM output.**

Live demo: `https://airpilot-frontend.onrender.com/`
Source:`https://github.com/MirajPrasain/airpilot-v2`

---

## The problem this demonstrates

Ask a bare LLM a safety-critical regulatory question and it will often answer fluently, confidently, and specifically — complete with regulation numbers and subsection citations — even when it's wrong, imprecise, or citing something that doesn't exist. There's no way for a user to tell the difference from the outside.

AirPilot answers the same questions two ways, side by side: once from a bare LLM with no grounding, and once from a retrieval-augmented pipeline that answers **only** from real, retrievable text in 14 CFR Part 91 (General Operating and Flight Rules), with every citation traceable back to the FAA's own published regulation text.

## What it actually does

1. User asks a question (e.g. _"Can I fly under the influence of alcohol?"_).
2. The question is embedded and matched against a vector index of Part 91 regulation text in MongoDB Atlas.
3. Retrieved chunks are passed to an LLM that is instructed to answer **only** from that text, or explicitly say it can't — never blend in outside knowledge.
4. The same question is sent to a bare LLM call with no retrieval, for direct comparison.
5. Both answers render side by side, with AirPilot's citations shown as clickable links straight to the real eCFR page for that section.

## Why this is harder than a typical RAG demo

Most RAG tutorials stop at "it retrieves something and answers." This project treats three things as first-class engineering problems, not afterthoughts:

### 1. Structure-aware chunking, not blind fixed-size splitting

Regulation text has real internal structure (`(a)`, `(b)`, `(1)`, `(i)` nesting) that a naive character-count split destroys — cutting a rule apart from the exception that governs it. AirPilot parses the eCFR's own XML hierarchy and chunks along lettered subsection boundaries, with a paragraph-level fallback for unstructured content (e.g. the definitions section). **261 regulation sections → 864 chunks**, each with a clean, real, lookup-able citation.

### 2. A two-layer defense against hallucinated relevance

A pure similarity-score threshold is not sufficient on its own — this was verified empirically, not assumed. A plausible-but-out-of-scope question (e.g. commercial space launch licensing) can score _above_ the retrieval threshold while being completely unanswerable from this corpus, because it shares surface vocabulary with real Part 91 content. AirPilot combines:

- A coarse retrieval score threshold (filters obviously irrelevant queries), and
- An explicit LLM-judged relevance gate at generation time (`is_answerable`), which reads the actual retrieved text and refuses to answer if it doesn't genuinely address the question — even if it cleared the score threshold.

### 3. A real, measured eval layer — not just eyeballing outputs

An 18-question, hand-verified eval set spans seven categories: clear retrieval, numeric precision (exact regulatory thresholds — 8-hour rule, 0.04% BAC, altitude minimums), deeply nested subsection targeting, cross-section reasoning, definitional lookups, adjacent-section confusion, and out-of-scope rejection. Every expected citation and fact was verified directly against corpus text before being written into the answer key.

**Result: 17/18 passing**, with the one miss documented and understood (a retrieval near-miss on an awkwardly-phrased question, confirmed non-representative when the same question — phrased more naturally — retrieved correctly through the live UI).

## Architecture

```
14 CFR Part 91 (eCFR API)
        │
        ▼
  XML parsing + structure-aware chunking
        │
        ▼
  Gemini embeddings (gemini-embedding-001, 3072-dim)
        │
        ▼
  MongoDB Atlas Vector Search (cosine similarity)
        │
        ▼
  Retrieval (score threshold) ──┐
                                 ├──▶  Generation (LLM relevance gate + grounded citation)
  Bare LLM (no retrieval) ───────┘            │
                                               ▼
                                    FastAPI backend  ──▶  React + TypeScript frontend
```

## Tech stack

- **Data pipeline:** Python, eCFR Versioner API, `xml.etree.ElementTree`
- **Embeddings & generation:** Google Gemini API (`gemini-embedding-001`, `gemini-3.6-flash`)
- **Vector database:** MongoDB Atlas Vector Search
- **Backend:** FastAPI
- **Frontend:** React, TypeScript, Tailwind CSS, React Router
- **Deployment:** Render (backend web service + frontend static site)

## Known limitations

- Corpus currently covers 14 CFR Part 91 only (general operating and flight rules) — not the full CFR, not NASA ASRS incident reports or NTSB accident reports (planned extensions).
- Retrieval quality is sensitive to exact question phrasing — a rephrased version of a question can retrieve meaningfully better or worse than the original, which the eval set surfaced directly rather than hid.
- Render's free tier cold-starts after inactivity; the first request after idle time may take 30–60 seconds.

## Running it locally

```bash
# Backend
cd backend
pip install -r requirements.txt
# add GEMINI_API_KEY and MONGODB_URI to a .env file
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Evals

```bash
cd backend/evals
python3 eval_runner.py
```

Runs all 18 questions against the live pipeline and prints a pass/fail report broken down by category.
