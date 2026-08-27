import json
import time
import os
import re
from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import errors
from google.genai.types import EmbedContentConfig

client = genai.Client()

BATCH_SIZE = 100
CHECKPOINT_FILE = "part91_embedded_progress.json"

def embed_batch_with_retry(texts: list[str], max_retries: int = 5):
    """Call embed_content, and if rate-limited, wait exactly as long as Google says, then retry."""
    for attempt in range(max_retries): # loops until max retries
        try:
            return client.models.embed_content(
                model="gemini-embedding-001",
                contents=texts,
                config=EmbedContentConfig(task_type="RETRIEVAL_DOCUMENT"),
            )
        except errors.ClientError as e:
            if e.code == 429:
                # pull the exact wait time out of the error message Google gives us
                match = re.search(r"retry in ([\d.]+)s", str(e)) #match.group(0) holds entire chunk. 
                wait_time = float(match.group(1)) + 2 if match else 65  # match.group(1) shows only the number inside the round brackets which is the retry interval , becoming our wait time. (+2s safety margin)
                print(f"Rate limited. Waiting {wait_time:.1f}s before retry {attempt + 1}/{max_retries}...")
                time.sleep(wait_time)
            else:
                raise  # a different error (400, 500, etc.) — don't swallow it, let it surface

    raise RuntimeError("Max retries exceeded for this batch")


def embed_chunks(chunks: list[dict]) -> list[dict]:
    if os.path.exists(CHECKPOINT_FILE): #if checkpoint file exists
        results = json.load(open(CHECKPOINT_FILE)) #load it as json object into results 
        done_ids = {r["chunk_id"] for r in results} #loop the checkpoint file i.e results json and collect id if all. (chunks in this checkpoint file are done. )
        chunks = [c for c in chunks if c["chunk_id"] not in done_ids] #loop the whole chunk json , find the chunks not ine done (i.e) they are yet to be parsed -> create an array of it. 
        print(f"Resuming the process. {len(results)} already embedded (are in checkpoint files), Now,  {len(chunks)} are remaining (still in part_91 corpus)")  
    else: # if no checkpoint file exists
        results = [] 

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        texts = [c["text"] for c in batch]

        print(f"Embedding batch {i // BATCH_SIZE + 1} ({len(batch)} chunks)...")

        response = embed_batch_with_retry(texts)

        for chunk, embedding_obj in zip(batch, response.embeddings):
            results.append({**chunk, "embedding": embedding_obj.values})

        with open(CHECKPOINT_FILE, "w") as f: #put results back into the checkpoint file 
            json.dump(results, f)

        time.sleep(65)  # baseline pause, since we know one batch = full quota

    return results

if __name__ == "__main__":
    chunks = json.load(open("part91_chunks.json")) #load the chunks as objects / json so that the function can carry out operations in it 
    embedded = embed_chunks(chunks)

    print(f"Embedded {len(embedded)} chunks")
    print(f"Vector length: {len(embedded[0]['embedding'])}")

    with open("part91_embedded.json", "w") as f:
        json.dump(embedded, f)

    print("Saved to part91_embedded.json")