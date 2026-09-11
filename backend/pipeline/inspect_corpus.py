import json
corpus = json.load(open("../data/part91_corpus.json"))
# #Inspect Headings to have a general idea about what kind of eval questions to form  eg:- 91.1701 - § 91.1701 Applicability.
# for s in corpus:
#     print(s["identifier"], "-", s["heading"])


# #Find out the text for specific Sections 
# target_ids = ["91.17", "91.119", "91.155", "91.176", "91.851", "91.3"]

# for tid in target_ids:
#     section = next((s for s in corpus if s["identifier"] == tid), None)
#     if section:
#         print(f"=== {tid} — {section['heading']} ===")
#         print(section["text"][:1500])
#         print()
#     else:
#         print(f"=== {tid} NOT FOUND ===\n")

# for s in corpus:
#     print(s["identifier"], "-", s["heading"])


target_ids = ["91.157", "91.177"]
for tid in target_ids:
    section = next((s for s in corpus if s["identifier"] == tid), None)
    print(f"=== {tid} — {section['heading']} ===")
    print(section["text"][:1500])
    print()