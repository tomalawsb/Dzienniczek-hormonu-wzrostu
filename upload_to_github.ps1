# upload_to_github.ps1
# Dzienniczek hormonu wzrostu PWA
# Skrypt pobiera repozytorium, kopiuje cały projekt i wysyła zmiany bez pytania o opis commita.

$ErrorActionPreference = "Stop"

$RepoUrl = "https://github.com/tomalawsb/Dzienniczek-hormonu-wzrostu.git"
$GitUserName = "Tomasz Wolak"
$GitUserEmail = "wolak82@gmail.com"

$ProjectPath = $PSScriptRoot
$TempRoot = Join-Path $env:TEMP "dzienniczek_hormonu_wzrostu_git_upload"
$RepoWorkPath = Join-Path $TempRoot "repo"

function Stop-WithMessage($Message) {
    Write-Host ""
    Write-Host "BŁĄD: $Message" -ForegroundColor Red
    Write-Host ""
    Set-Location $ProjectPath -ErrorAction SilentlyContinue
    exit 1
}

function Info($Message) { Write-Host $Message -ForegroundColor Cyan }
function Ok($Message) { Write-Host $Message -ForegroundColor Green }
function Warn($Message) { Write-Host $Message -ForegroundColor Yellow }

Write-Host "===================================================="
Write-Host " Wysyłanie Dzienniczka hormonu wzrostu na GitHub"
Write-Host "===================================================="

Info "Folder projektu: $ProjectPath"
Info "Repozytorium: $RepoUrl"

try { git --version | Out-Null } catch {
    Stop-WithMessage "Git nie jest zainstalowany albo nie jest dostępny w PATH."
}

$RequiredFiles = @(
    "index.html",
    "style.css",
    "app.js",
    "manifest.json",
    "service-worker.js",
    "app-version.json",
    "icon-192.png",
    "icon-512.png",
    "README.md",
    "upload_to_github_android.sh",
    "URUCHOMIENIE_NA_ANDROIDZIE.txt",
    ".github\workflows\deploy-pages.yml"
)

foreach ($File in $RequiredFiles) {
    if (!(Test-Path (Join-Path $ProjectPath $File))) {
        Stop-WithMessage "Brak wymaganego pliku: $File. Uruchom skrypt z głównego folderu programu."
    }
}

try {
    $VersionConfig = Get-Content (Join-Path $ProjectPath "app-version.json") -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
    Stop-WithMessage "Nie można odczytać app-version.json: $($_.Exception.Message)"
}

$AppVersion = [string]$VersionConfig.version
if ([string]::IsNullOrWhiteSpace($AppVersion)) {
    Stop-WithMessage "W app-version.json brakuje pola version."
}

$DefaultCommitMessage = "Dzienniczek hormonu wzrostu $AppVersion - aktualizacja"
Info "Wersja programu: $AppVersion"
Info "Opis commita: $DefaultCommitMessage"

Info "Czyszczę katalog tymczasowy..."
if (Test-Path $TempRoot) {
    Remove-Item $TempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $TempRoot | Out-Null

Info "Pobieram aktualne repozytorium z GitHuba..."
git clone $RepoUrl $RepoWorkPath
if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage "Nie udało się pobrać repozytorium."
}

Set-Location $RepoWorkPath
git config user.name "$GitUserName"
git config user.email "$GitUserEmail"
git config core.autocrlf false
git branch -M main
Ok "Autor Git: $GitUserName <$GitUserEmail>"

Info "Kopiuję aktualny projekt do repozytorium..."
$RoboArgs = @(
    $ProjectPath,
    $RepoWorkPath,
    "/MIR",
    "/XD", ".git", "node_modules", ".idea", ".vscode",
    "/XF", "*.zip", "*.sha256", ".DS_Store", "Thumbs.db"
)
robocopy @RoboArgs | Out-Null
$RoboCode = $LASTEXITCODE
if ($RoboCode -gt 7) {
    Stop-WithMessage "Robocopy nie skopiował poprawnie plików. Kod: $RoboCode"
}

Info "Sprawdzam wymagane pliki po skopiowaniu..."
foreach ($File in $RequiredFiles) {
    if (!(Test-Path (Join-Path $RepoWorkPath $File))) {
        Stop-WithMessage "Po kopiowaniu brakuje wymaganego pliku: $File"
    }
}

Info "Dodaję pliki..."
git add -A

$Status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($Status)) {
    Warn "Brak zmian do wysłania. Repozytorium jest już aktualne."
    Set-Location $ProjectPath
    exit 0
}

Info "Zmiany wykryte przez Git:"
git status --short

Info "Tworzę commit: $DefaultCommitMessage"
git commit -m "$DefaultCommitMessage"
if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage "Nie udało się utworzyć commita."
}

Info "Wysyłam na GitHub..."
git push origin main
if ($LASTEXITCODE -ne 0) {
    Stop-WithMessage "Nie udało się wysłać projektu. Sprawdź logowanie GitHub lub Git Credential Manager."
}

Set-Location $ProjectPath

Write-Host "===================================================="
Ok "Gotowe. Projekt został wysłany na GitHub."
Write-Host "Repozytorium: $RepoUrl"
Write-Host "Wersja: $AppVersion"
Write-Host "===================================================="
