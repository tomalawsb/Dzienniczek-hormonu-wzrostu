#!/data/data/com.termux/files/usr/bin/bash
# Dzienniczek hormonu wzrostu PWA
# Android / Termux: kopiuje cały projekt do repozytorium i wysyła zmiany bez pytania o opis commita.

set -euo pipefail

REPO_URL="https://github.com/tomalawsb/Dzienniczek-hormonu-wzrostu.git"
GIT_USER_NAME="Tomasz Wolak"
GIT_USER_EMAIL="wolak82@gmail.com"
PROJECT_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TEMP_ROOT="$HOME/.cache/dzienniczek_hormonu_wzrostu_git_upload"
REPO_WORK_PATH="$TEMP_ROOT/repo"

info() { printf '\033[1;36m%s\033[0m\n' "$1"; }
ok() { printf '\033[1;32m%s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[1;31mBŁĄD: %s\033[0m\n\n' "$1"; exit 1; }

printf '%s\n' "===================================================="
printf '%s\n' " Wysyłanie Dzienniczka hormonu wzrostu na GitHub"
printf '%s\n' " Android / Termux"
printf '%s\n' "===================================================="

command -v pkg >/dev/null 2>&1 || fail "Ten plik trzeba uruchomić w aplikacji Termux."

info "Folder projektu: $PROJECT_PATH"
info "Repozytorium: $REPO_URL"

info "Sprawdzam potrzebne pakiety..."
pkg update -y >/dev/null
pkg install -y git gh rsync >/dev/null
ok "Git, GitHub CLI i rsync są gotowe."

REQUIRED_FILES=(
  "index.html"
  "style.css"
  "app.js"
  "manifest.json"
  "service-worker.js"
  "app-version.json"
  "icon-192.png"
  "icon-512.png"
  "README.md"
  ".github/workflows/deploy-pages.yml"
)

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "$PROJECT_PATH/$file" ]] || fail "Brak wymaganego pliku: $file. Uruchom skrypt z rozpakowanego głównego folderu programu."
done

APP_VERSION="$(python - "$PROJECT_PATH/app-version.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as f:
    print(json.load(f).get('version', '').strip())
PY
)"
[[ -n "$APP_VERSION" ]] || fail "W app-version.json brakuje pola version."
COMMIT_MESSAGE="Dzienniczek hormonu wzrostu $APP_VERSION - aktualizacja"

info "Wersja programu: $APP_VERSION"
info "Opis commita: $COMMIT_MESSAGE"

if ! gh auth status --hostname github.com >/dev/null 2>&1; then
  warn "Pierwsze logowanie do GitHuba. Termux wyświetli kod i otworzy stronę logowania."
  gh auth login --hostname github.com --git-protocol https --web
fi
gh auth setup-git >/dev/null 2>&1 || true

rm -rf "$TEMP_ROOT"
mkdir -p "$TEMP_ROOT"

info "Pobieram aktualne repozytorium..."
git clone "$REPO_URL" "$REPO_WORK_PATH"

cd "$REPO_WORK_PATH"
git config user.name "$GIT_USER_NAME"
git config user.email "$GIT_USER_EMAIL"
git config core.autocrlf false
git branch -M main

info "Kopiuję cały projekt..."
rsync -a --delete \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.idea/' \
  --exclude='.vscode/' \
  --exclude='*.zip' \
  --exclude='*.sha256' \
  --exclude='.DS_Store' \
  --exclude='Thumbs.db' \
  "$PROJECT_PATH/" "$REPO_WORK_PATH/"

for file in "${REQUIRED_FILES[@]}"; do
  [[ -f "$REPO_WORK_PATH/$file" ]] || fail "Po kopiowaniu brakuje pliku: $file"
done

git add -A
if [[ -z "$(git status --porcelain)" ]]; then
  warn "Brak zmian do wysłania. Repozytorium jest już aktualne."
  exit 0
fi

info "Zmiany wykryte przez Git:"
git status --short

git commit -m "$COMMIT_MESSAGE"
info "Wysyłam na GitHub..."
git push origin main

printf '%s\n' "===================================================="
ok "Gotowe. Projekt został wysłany na GitHub."
printf 'Repozytorium: %s\n' "$REPO_URL"
printf 'Wersja: %s\n' "$APP_VERSION"
printf '%s\n' "===================================================="
