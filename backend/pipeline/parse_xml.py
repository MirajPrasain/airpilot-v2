import xml.etree.ElementTree as ET
import gzip
import json
import urllib.request

ECFR_BASE_URL = "https://www.ecfr.gov/api/versioner/v1"

def fetch_latest_issue_date(title: str) -> str:
    """Look up eCFR's latest issue date for a title, for use as the date path segment below."""
    with urllib.request.urlopen(f"{ECFR_BASE_URL}/titles.json") as response:
        titles = json.load(response)["titles"]
    matching = next(t for t in titles if str(t["number"]) == str(title))
    return matching["latest_issue_date"]

def download_xml(title: str, part: str, output_path: str, date: str | None = None) -> str:
    """Download the eCFR XML for a title/part and save it to output_path.
    If date is omitted, uses the title's latest issue date. Returns output_path."""
    if date is None:
        date = fetch_latest_issue_date(title)

    url = f"{ECFR_BASE_URL}/full/{date}/title-{title}.xml?part={part}"
    # the endpoint refuses to serve uncompressed - request gzip and decompress ourselves
    request = urllib.request.Request(url, headers={"Accept-Encoding": "gzip"})
    with urllib.request.urlopen(request) as response:
        raw = response.read()
        if response.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)

    with open(output_path, "wb") as f:
        f.write(raw)

    print(f"Downloaded title {title} part {part} (as of {date}) to {output_path}")
    return output_path

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
        heading = head_el.text.strip() if head_el is not None and head_el.text else "" #if head el is not empty and head.el has text get the head text, or set it to empty ""

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

def report_empty_sections(sections: list[dict]) -> None:
    """Diagnostic: find sections parsed with zero text. A zero-length section is either
    genuinely [Reserved] in the regulation, or a sign the parser missed a tag type
    (e.g. content in a table instead of <P>/<FP>/<FP-2>) - print identifiers/headings
    to tell the two cases apart before deciding whether to drop or fix them."""
    empty = [s for s in sections if len(s["text"]) == 0]
    print(f"Empty sections: {len(empty)}")
    for s in empty:
        print(s["identifier"], "-", s["heading"])

    # sanity check: empty + non-empty should account for every section
    non_empty = [s for s in sections if len(s["text"]) > 0]
    print(f"Total: {len(sections)}, Non-empty: {len(non_empty)}")

    # spot-check one known stub (91.905) - confirms it's actually blank/reserved
    # rather than just short, before trusting it as a genuine [Reserved] section
    print(next(s for s in sections if s["identifier"] == "91.905")["text"][:300])

# 91.331, 91.905: confirmed genuinely [Reserved] in the regulation - no independent
# prose, not a parser gap. Dropped along with all other zero-text sections below.
KNOWN_STUB_SECTIONS = {"91.331", "91.905"}

def generate_corpus(xml_path: str, output_path: str) -> list[dict]:
    """Parse xml_path into sections, drop empty ones, and save the result as JSON to output_path."""
    sections = parse_sections(xml_path)
    corpus = [s for s in sections if len(s["text"]) > 0]

    with open(output_path, "w") as f:
        json.dump(corpus, f, indent=2)

    print(f"Total parsed: {len(sections)}")
    print(f"Final corpus (non-empty): {len(corpus)}")
    print(f"Saved to {output_path}")

    return corpus

if __name__ == "__main__":
    pass
    #corpus = generate_corpus("../data/title14_part91.xml", "../data/part91_corpus.json")
    #report_empty_sections(parse_sections("../data/title14_part91.xml"))