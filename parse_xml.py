import xml.etree.ElementTree as ET
import json

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
    sections = parse_sections("title14_part91.xml")
    corpus = [s for s in sections if len(s["text"]) > 0]

    print(f"Total parsed: {len(sections)}")
    print(f"Final corpus (non-empty): {len(corpus)}")

    with open("part91_corpus.json", "w") as f:
        json.dump(corpus, f, indent=2)

    print("Saved to part91_corpus.json")