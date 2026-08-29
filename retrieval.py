import os
from dotenv import load_dotenv
load_dotenv()

from pymongo import MongoClient
from google import genai
from google.genai.types import EmbedContentConfig

mongo_client = MongoClient(os.environ["MONGODB_URI"])
collection = mongo_client["airpilot"]["part91_chunks"]

genai_client = genai.Client()


def embed_query(question: str) -> list[float]:
    """Embed a user's question. Note task_type differs from document embedding."""
    response = genai_client.models.embed_content(
        model="gemini-embedding-001",
        contents=question,
        config=EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
    )
    return response.embeddings[0].values


def retrieve(question: str, limit: int = 5, min_score: float = 0.8) -> list[dict]:
    """Return the top-k most relevant chunks for a question, filtering out weak matches."""
    query_vector = embed_query(question)

    pipeline = [
        {
            "$vectorSearch": {
                "index": "vector_index",
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": limit * 15,
                "limit": limit,
            }
        },
        {
            "$addFields": {
                "score": {"$meta": "vectorSearchScore"}
            }
        },
        {
            "$match": {
                "score": {"$gte": min_score}
            }
        },
        {
            "$project": {
                "_id": 0,
                "chunk_id": 1,
                "citation": 1,
                "heading": 1,
                "text": 1,
                "score": 1,
            }
        },
    ]

    return list(collection.aggregate(pipeline))

if __name__ == "__main__":
    #Relevant question check 
    # question = "Can I fly under the influence of alcohol?"
    # results = retrieve(question)
    #  for r in results:
    #         print(f"{r['citation']} (score: {r['score']:.4f})")
    #         print(f"  {r['text'][:150]}...")
    #         print()

    #Irrelevant question thresold check 
    # irrelevant_question = "What is the capital of France?"
    # results = retrieve(irrelevant_question, limit=5)
    # for r in results:
    #     print(f"{r['citation']} (score: {r['score']:.4f})")

    #Borderline case , not maximally irrelevant 
    question = "What are the rules for commercial space launch licensing?"
    results = retrieve(question, limit=5)
    for r in results:
      print(f"{r['citation']} (score: {r['score']:.4f})")


   