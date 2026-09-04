import json
import re
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).parent.parent
RESOURCES = json.load(open(ROOT / "data" / "resources.json"))

def clean_line(line):
    line = re.sub(r"\s+", " ", line).strip()
    return line

def extract_questions(pdf_path):
    questions = []
    current = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for raw_line in text.split("\n"):
                line = clean_line(raw_line)
                if not line:
                    continue
                if line.startswith("Unit ") and ":" in line and len(line) < 80:
                    # section header line, e.g. "Unit 3: Electrochemistry..." - skip, not a question
                    continue
                if line.startswith("•"):
                    if current:
                        questions.append(clean_line(" ".join(current)))
                    current = [line.lstrip("• ").strip()]
                else:
                    if current:
                        current.append(line)
    if current:
        questions.append(clean_line(" ".join(current)))
    # drop anything too short to be a real question (noise/artifacts)
    return [q for q in questions if len(q) > 12]

bank = {}
total_q = 0
for collection in RESOURCES["unitCollections"]:
    for unit in collection["units"]:
        pyq_url = unit.get("pyqUrl")
        if not pyq_url:
            continue
        pdf_path = ROOT / "public" / pyq_url.lstrip("/")
        if not pdf_path.exists():
            print("MISSING:", pdf_path)
            continue
        questions = extract_questions(pdf_path)
        bank[pyq_url] = {
            "subject": collection["name"],
            "unitNumber": unit["number"],
            "unitTitle": unit["title"],
            "questions": questions,
        }
        total_q += len(questions)

out_path = ROOT / "data" / "pyq-bank.json"
with open(out_path, "w") as f:
    json.dump(bank, f, indent=2)

print(f"Wrote {out_path} with {len(bank)} units and {total_q} total questions")
