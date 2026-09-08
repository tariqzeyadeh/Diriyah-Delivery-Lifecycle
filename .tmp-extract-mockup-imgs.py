import zipfile, re
from pathlib import Path

p = r"c:\Users\USER\Downloads\Pre-Initiation_System_Mockups.pptx"
out = Path(r"C:\Users\USER\Desktop\Diriyah-Delivery-Lifecycle\.tmp-poc-docs\mockup-images")
out.mkdir(parents=True, exist_ok=True)
z = zipfile.ZipFile(p)
for i in range(1, 23):
    rel = f"ppt/slides/_rels/slide{i}.xml.rels"
    xml = z.read(rel).decode("utf-8", errors="ignore")
    targets = re.findall(r'Target="([^"]+)"', xml)
    imgs = [t for t in targets if re.search(r"\.(png|jpg|jpeg|emf|wmf)$", t, re.I)]
    for j, t in enumerate(imgs[:1]):
        path = t.lstrip("/")
        if path not in z.namelist() and t.startswith("../"):
            path = "ppt/" + t[3:]
        data = z.read(path)
        dest = out / f"slide{i}.jpeg"
        dest.write_bytes(data)
        print("wrote", dest.name, len(data))
