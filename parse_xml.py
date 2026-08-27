import xml.etree.ElementTree as ET
import json
import re

def parse_sections(xml_path: str) -> list[dict]:
    tree = ET.parse(xml_path)
    root = tree.getroot()

    sections = []

    for div8 in root.iter("DIV8"): #
        if div8.get("TYPE") != "SECTION":
            continue #skips to the next loop doesnt run the loop content below
        #if div8 is a section 
        section_id = div8.get("N") 


        head_el = div8.find("HEAD")
        heading = head_el.text.strip() if head_el is not None and head_el.text else ""

        paragraphs = []
        # capture both direct <P> tags AND <P>/<FP>/<FP-2> nested inside <EXTRACT>
        for tag in ("P", "FP", "FP-2"):
            for el in div8.iter(tag):
                text = "".join(el.itertext()).strip()
                if text:
                    paragraphs.append(text)

        full_text = "\n".join(paragraphs) 

        sections.append({
            "identifier": section_id,
            "heading": heading,
            "text": full_text,
            "citation": f"14 CFR § {section_id}",
        })

    return sections

if __name__ == "__main__":
    # sections = parse_sections("title14_part91.xml")
    # corpus = [s for s in sections if len(s["text"]) > 0]

    # print(f"Total parsed: {len(sections)}")
    # print(f"Final corpus (non-empty): {len(corpus)}")

    # with open("part91_corpus.json", "w") as f:
    #     json.dump(corpus, f, indent=2)

    # print("Saved to part91_corpus.json")

    #To confirm the file wrote correctly and is exactly the shape you need — a JSON list [...]
    # corpus = json.load(open("part91_corpus.json"))
    # longest = max(corpus, key=lambda s: len(s["text"]))
    # print(longest["identifier"], "-", longest["heading"])
    # print(f"Length: {len(longest['text'])}")
    # print(longest["text"][:600])


        

    corpus = json.load(open("part91_corpus.json"))
    long_sections = [s for s in corpus if len(s["text"]) > 2000]

    pattern_letter = re.compile(r'^\([a-z]\)', re.MULTILINE)
    no_letter_split = [s for s in long_sections if not pattern_letter.search(s["text"])]

    print(f"Long sections total: {len(long_sections)}")
    print(f"Long sections with NO top-level (a)(b)(c) pattern: {len(no_letter_split)}")
    for s in no_letter_split[:5]:
        print(s["identifier"], "-", s["heading"])