#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]

REQUIRED = [
    "index.html", "style.css", "app.js", "manifest.json", "service-worker.js",
    "app-version.json", "icon-192.png", "icon-512.png", "README.md",
    "upload_to_github.ps1", "upload_to_github_android.sh",
    "tests/logic_test.mjs", ".github/workflows/deploy-pages.yml",
]

errors: list[str] = []

for relative in REQUIRED:
    if not (ROOT / relative).is_file():
        errors.append(f"Brak pliku: {relative}")

if errors:
    print("\n".join(f"BŁĄD: {item}" for item in errors))
    raise SystemExit(1)

index = (ROOT / "index.html").read_text(encoding="utf-8")
app = (ROOT / "app.js").read_text(encoding="utf-8")
worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")
readme = (ROOT / "README.md").read_text(encoding="utf-8")
android_script = (ROOT / "upload_to_github_android.sh").read_text(encoding="utf-8")
windows_script = (ROOT / "upload_to_github.ps1").read_text(encoding="utf-8-sig")

try:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = json.loads((ROOT / "app-version.json").read_text(encoding="utf-8"))
except json.JSONDecodeError as exc:
    errors.append(f"Nieprawidłowy JSON: {exc}")
    manifest = {}
    version = {}

html_ids = re.findall(r'\bid="([^"]+)"', index)
duplicates = sorted({item for item in html_ids if html_ids.count(item) > 1})
if duplicates:
    errors.append(f"Powtórzone identyfikatory HTML: {', '.join(duplicates)}")

cache_match = re.search(r"const ids = \[(.*?)\];", app, flags=re.S)
if not cache_match:
    errors.append("Nie znaleziono listy identyfikatorów cacheElements().")
else:
    cached_ids = re.findall(r"'([^']+)'", cache_match.group(1))
    missing_ids = sorted(set(cached_ids) - set(html_ids))
    if missing_ids:
        errors.append(f"app.js odwołuje się do nieistniejących ID: {', '.join(missing_ids)}")

version_text = str(version.get("version", "")).strip()
if not re.fullmatch(r"\d+\.\d+ - \d{10}", version_text):
    errors.append("Wersja musi mieć format: numer + DDMMRRHHMM.")
if version_text and version_text not in readme:
    errors.append("README.md nie zawiera bieżącej wersji z app-version.json.")

if manifest.get("display") != "standalone":
    errors.append("manifest.json powinien używać display=standalone.")
if manifest.get("start_url") != "./" or manifest.get("scope") != "./":
    errors.append("manifest.json ma nieprawidłowe start_url lub scope.")

required_logic = [
    "keepOneEntryPerDate",
    "getEntryForDate(entry.date, entry.id)",
    "Aplikacja pozwala tylko na jeden wpis dziennie",
    "parseDateFromSpeech",
    "createDocxBlob",
    ".docx",
    "scheduleMidnightRefresh",
]
for token in required_logic:
    if token not in app:
        errors.append(f"Brak wymaganej logiki w app.js: {token}")

if version_text:
    cache_version = version_text.split(" - ", 1)[0]
    if f"gh-dzienniczek-v{cache_version}" not in worker:
        errors.append(f"service-worker.js nie ma numeru cache wersji {cache_version}.")

if "pkg install -y python git gh rsync" not in android_script:
    errors.append("Skrypt Android nie instaluje kompletu wymaganych pakietów.")

private_email = "wolak82@gmail.com"
if private_email in android_script or private_email in windows_script:
    errors.append("Skrypty zawierają prywatny adres e-mail zamiast adresu GitHub noreply.")

if errors:
    print("Kontrola projektu: NIEPOWODZENIE")
    for item in errors:
        print(f"- {item}")
    raise SystemExit(1)

print(f"Kontrola projektu: OK ({version_text})")
