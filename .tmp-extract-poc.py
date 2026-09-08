import zipfile, re, json, os
from pathlib import Path
from xml.etree import ElementTree as ET

out_dir = Path(r"C:\Users\USER\Desktop\Diriyah-Delivery-Lifecycle\.tmp-poc-docs")
out_dir.mkdir(exist_ok=True)


def texts_from_xml(xml_bytes: bytes) -> list[str]:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []
    texts: list[str] = []
    for t in root.iter("{http://schemas.openxmlformats.org/drawingml/2006/main}t"):
        if t.text and t.text.strip():
            texts.append(t.text.strip())
    for t in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"):
        if t.text and t.text.strip():
            texts.append(t.text.strip())
    return texts


def extract_pptx(path: str, max_slides: int = 120):
    slides = []
    with zipfile.ZipFile(path) as z:
        names = sorted(
            [n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)],
            key=lambda n: int(re.search(r"(\d+)", n).group(1)),
        )
        for i, name in enumerate(names[:max_slides]):
            texts = texts_from_xml(z.read(name))
            if texts:
                slides.append({"slide": i + 1, "text": texts})
    return slides


def extract_docx(path: str):
    with zipfile.ZipFile(path) as z:
        return texts_from_xml(z.read("word/document.xml"))


def extract_xlsx(path: str):
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall(
                "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si"
            ):
                parts = []
                for t in si.iter(
                    "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"
                ):
                    if t.text:
                        parts.append(t.text)
                shared.append("".join(parts))
        sheets = []
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid_to_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
        rns = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
        for sh in wb.find(ns + "sheets"):
            name = sh.attrib.get("name")
            rid = sh.attrib.get(rns + "id")
            target = rid_to_target[rid]
            if not target.startswith("xl/"):
                target = "xl/" + target
            sheet_root = ET.fromstring(z.read(target))
            rows_out = []
            for row in sheet_root.iter(ns + "row"):
                cells = {}
                for c in row.findall(ns + "c"):
                    ref = c.attrib.get("r", "")
                    t = c.attrib.get("t")
                    v = c.find(ns + "v")
                    is_el = c.find(ns + "is")
                    val = ""
                    if t == "s" and v is not None and v.text is not None:
                        val = shared[int(v.text)]
                    elif t == "inlineStr" and is_el is not None:
                        val = "".join(x.text or "" for x in is_el.iter(ns + "t"))
                    elif v is not None and v.text is not None:
                        val = v.text
                    cells[ref] = val
                if cells:

                    def col_key(ref: str) -> int:
                        m = re.match(r"([A-Z]+)", ref)
                        letters = m.group(1) if m else "A"
                        n = 0
                        for ch in letters:
                            n = n * 26 + ord(ch) - 64
                        return n

                    ordered = [
                        v for k, v in sorted(cells.items(), key=lambda kv: col_key(kv[0]))
                    ]
                    if any(str(x).strip() for x in ordered):
                        rows_out.append(ordered)
            sheets.append({"name": name, "rows": rows_out[:250], "row_count": len(rows_out)})
        return sheets


files = {
    "brand": r"c:\Users\USER\Downloads\01 - Brand and Colors.pptx",
    "dictionary": r"c:\Users\USER\Downloads\Pre-Initiation_POC_Templates_and_Data_Dictionary R.xlsx",
    "explanation": r"c:\Users\USER\Downloads\POC - Pre-Initiation Process Explanation.docx",
    "mockups": r"c:\Users\USER\Downloads\Pre-Initiation_System_Mockups.pptx",
    "process_pptx": r"c:\Users\USER\Downloads\TECHNOLOGY DEPARTMENT -PRE-INITIATION PROCESS (1).pptx",
}

for key in ["brand", "mockups", "process_pptx"]:
    slides = extract_pptx(files[key], max_slides=150)
    (out_dir / f"{key}.json").write_text(
        json.dumps(slides, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    lines = []
    for s in slides:
        lines.append(f"===== SLIDE {s['slide']} =====")
        lines.extend(s["text"])
        lines.append("")
    (out_dir / f"{key}.txt").write_text("\n".join(lines), encoding="utf-8")
    print(key, "slides", len(slides))

texts = extract_docx(files["explanation"])
(out_dir / "explanation.txt").write_text("\n".join(texts), encoding="utf-8")
print("explanation", len(texts))

sheets = extract_xlsx(files["dictionary"])
(out_dir / "dictionary.json").write_text(
    json.dumps(sheets, ensure_ascii=False, indent=2), encoding="utf-8"
)
lines = []
for sh in sheets:
    lines.append(f"===== SHEET: {sh['name']} ({sh['row_count']} rows) =====")
    for row in sh["rows"][:180]:
        lines.append(" | ".join(str(c) for c in row))
    lines.append("")
(out_dir / "dictionary.txt").write_text("\n".join(lines), encoding="utf-8")
print("dictionary", [s["name"] for s in sheets])

pdf = Path(r"c:\Users\USER\Downloads\Diriyah POC Process Map.pdf")
pdf_text = ""
try:
    from pypdf import PdfReader

    reader = PdfReader(str(pdf))
    pdf_text = "\n\n".join((p.extract_text() or "") for p in reader.pages)
    print("pdf pages", len(reader.pages), "chars", len(pdf_text))
except Exception as e:
    print("pypdf fail", e)
    os.system("python -m pip install pypdf -q")
    from pypdf import PdfReader

    reader = PdfReader(str(pdf))
    pdf_text = "\n\n".join((p.extract_text() or "") for p in reader.pages)
    print("pdf after install", len(reader.pages), len(pdf_text))

(out_dir / "process_map.txt").write_text(pdf_text or "(empty)", encoding="utf-8")
print("done")
