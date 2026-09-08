import json
from pathlib import Path

p = Path(r"C:\Users\USER\Desktop\Diriyah-Delivery-Lifecycle\.tmp-poc-docs\dictionary.json")
sheets = json.loads(p.read_text(encoding="utf-8"))
out = Path(r"C:\Users\USER\Desktop\Diriyah-Delivery-Lifecycle\.tmp-poc-docs")
for sh in sheets:
    lines = [f"# {sh['name']} ({sh['row_count']} rows)"]
    for row in sh["rows"]:
        lines.append(" | ".join(str(c) for c in row))
    safe = sh["name"].replace("/", "-")
    (out / f"sheet_{safe}.txt").write_text("\n".join(lines), encoding="utf-8")
print("wrote", len(sheets), "sheets")
