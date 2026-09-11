# AirPilot v2

Retrieval-augmented Q&A over 14 CFR Part 91.

## Structure

- `backend/` — FastAPI app, retrieval/generation logic, and the data pipeline
  - `pipeline/` — XML parsing, chunking, embedding, and Atlas loading scripts
  - `evals/` — eval runner and eval set
  - `data/` — corpus, chunks, and embedded data files
- `frontend/` — React app (scaffolded separately)

## Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```
