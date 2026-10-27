from pathlib import Path
import json, zipfile
root = Path(__file__).resolve().parents[1]
version = json.loads((root / "manifest.json").read_text())["version"]
files = ["manifest.json", "index.html", "background.js", "contentLauncher.js", "aiEnhancer.js", "offlineParser.js", "offlineParser.js.LEGAL.txt", "panel-overrides.css", "privacy.html"]
files += [str(p.relative_to(root)) for d in ("icons", "assets") for p in (root / d).rglob("*") if p.is_file()]
output = root / "dist" / f"timeshift-chrome-store-v{version}.zip"
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, name)
print(output)
