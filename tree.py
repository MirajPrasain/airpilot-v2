import json
import urllib.request

def fetch_structure(date: str, title: str) -> dict: #to search by date and title
    url = f"https://www.ecfr.gov/api/versioner/v1/structure/{date}/title-{title}.json" #constructing a url which takes required date and title parameters
    with urllib.request.urlopen(url) as response: #sending request with "with" to close the request just like closing a file. response is a file like stream object
        return json.load(response) #gets converted to a dictionary i.e json syntax

def find_node(node: dict, target_type: str, target_id: str) -> dict | None: #node param is the tree itself/ 
    """DFS: return the first node matching type+identifier, or None."""
    if node.get("type") == target_type and node.get("identifier") == target_id:
        return node

    for child in node.get("children", []):
        result = find_node(child, target_type, target_id)
        if result is not None:
            return result


    return None

def collect_sections(node: dict) -> list[dict]:
    """Recursively collect every node of type 'section' anywhere below (and including) this node."""
    sections = []

    if node.get("type") == "section":
        sections.append(node)

    for child in node.get("children", []):
        sections.extend(collect_sections(child))

    return sections

if __name__ == "__main__":
    tree = fetch_structure("2026-07-01", "14")
    part_91 = find_node(tree, target_type="part", target_id="91")

    # for child in part_91.get("children", []):
    #   print(child["type"], "-", child["label"])

    # if part_91 is None:
    #     print("Part 91 not found")
    # else:
    #     print(f"Found: {part_91['label']}")
    #     print(f"Size: {part_91['size']} bytes")
    #     section_count = len(part_91.get("children", []))
    #     print(f"Sections (or subparts): {section_count}")

    sections = collect_sections(part_91)
    print(f"Total sections found: {len(sections)}")
    for s in sections[:10]:
        print(s["identifier"], "-", s["label"])

    # for child in part_91.get("children", []):
    #   print(child["type"], "-", child["label"])
