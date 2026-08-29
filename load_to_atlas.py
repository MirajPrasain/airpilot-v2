import json
import os
from dotenv import load_dotenv
load_dotenv()

from pymongo import MongoClient

client = MongoClient(os.environ["MONGODB_URI"])
db = client["airpilot"]
collection = db["part91_chunks"]

chunks = json.load(open("part91_embedded.json"))

# wipe any previous load before re-inserting, so re-running this script
# doesn't create duplicates
collection.delete_many({})
collection.insert_many(chunks)

print(f"Inserted {collection.count_documents({})} documents")