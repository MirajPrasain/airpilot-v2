from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from generation import generate_answer
from bare_llm import generate_bare_answer

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://airpilot-frontend.onrender.com"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class QuestionRequest(BaseModel):
    question: str


@app.post("/ask")
def ask(request: QuestionRequest):
    grounded = generate_answer(request.question)
    bare = generate_bare_answer(request.question)

    return {
        "question": request.question,
        "airpilot": grounded,
        "bare_llm": {"answer": bare},
    }


@app.get("/health")
def health():
    return {"status": "ok"}