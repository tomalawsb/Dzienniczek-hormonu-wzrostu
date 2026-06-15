# Dzienniczek hormonu wzrostu PWA

Wersja: **1.1 - 1506262134**

Responsywna aplikacja PWA do zapisywania podań hormonu wzrostu na telefonie i komputerze. Program działa jako statyczna strona i może być publikowany przez GitHub Pages.

## Najważniejsze funkcje

- szybki zapis daty, godziny, dawki i miejsca wkłucia,
- brak daty w poleceniu głosowym oznacza lokalną datę urządzenia w chwili wypowiedzenia,
- obsługa głosowa po polsku, np. „lewy brzuch”, „wczoraj prawe ramię”, „dawka jeden przecinek jeden”, „zapisz”,
- obsługa ręczna i pełna obsługa klawiaturą,
- kalendarz z oznaczeniem podań i pominiętych dawek,
- historia z filtrowaniem, edycją i usuwaniem wpisów,
- automatyczna propozycja kolejnego miejsca wkłucia,
- przypomnienie systemowe o ustawionej godzinie z proponowanym miejscem wkłucia,
- ekran zgód przy pierwszym uruchomieniu: mikrofon, powiadomienia i trwałe przechowywanie danych,
- eksport raportu do PDF przez systemowe okno drukowania,
- eksport raportu do pliku Word `.doc`,
- eksport kopii JSON i historii CSV,
- import kopii JSON,
- działanie offline po pierwszym poprawnym otwarciu,
- jasny interfejs dopasowany do telefonu, tabletu i komputera.

## Przypomnienia

W ustawieniach można:

- włączyć lub wyłączyć przypomnienie,
- ustawić godzinę, np. `21:00`,
- wysłać testowe powiadomienie,
- sprawdzić stan zgody na powiadomienia.

Treść przypomnienia zawiera automatycznie proponowane miejsce, np.:

```text
Czas na zastrzyk
Dzisiaj: lewe udo. Dawka: 1,1 mg.
```

Aplikacja korzysta z systemowych powiadomień, service workera i — gdy przeglądarka pozwoli — okresowej pracy w tle. GitHub Pages jest hostingiem statycznym, dlatego po całkowitym zamknięciu przeglądarki system może opóźnić lub pominąć lokalne przypomnienie. W pełni gwarantowane powiadomienia o dokładnej godzinie wymagają wersji natywnej APK albo serwera wysyłającego Web Push.

## Eksport raportów

- **PDF** — aplikacja otwiera przygotowany raport i systemowe okno drukowania; wybierz „Zapisz jako PDF”.
- **Word** — pobierany jest plik `.doc`, który można otworzyć w Microsoft Word i zgodnych edytorach.
- **CSV** — tabela historii do Excela lub innego arkusza.
- **JSON** — pełna kopia danych i ustawień do ponownego importu.

## Skróty klawiaturowe

| Skrót | Działanie |
|---|---|
| `Alt + 1` | Dzisiaj |
| `Alt + 2` | Kalendarz |
| `Alt + 3` | Historia |
| `Alt + 4` | Więcej |
| `Alt + M` | Mikrofon |
| `Alt + N` | Nowy wpis ręczny |
| `Alt + P` | Eksport raportu PDF |
| `Alt + W` | Eksport raportu Word |
| `Ctrl + Enter` | Zapis przygotowanego wpisu |
| `Esc` | Zamknięcie okna lub zatrzymanie mikrofonu |

Wszystkie elementy można również obsługiwać klawiszami `Tab`, `Shift + Tab`, `Enter` i `Spacja`. W kalendarzu działają strzałki.

## Dane użytkownika

Dane są przechowywane lokalnie w pamięci przeglądarki. Repozytorium GitHub nie zawiera wpisów medycznych użytkownika.

Telefon i komputer przechowują osobne dane. Do przeniesienia historii między urządzeniami służy eksport i import pliku JSON. Automatyczna synchronizacja wymagałaby osobnej bazy danych i logowania.

## Uruchomienie lokalne

Aplikacji PWA nie należy testować przez bezpośrednie otwarcie pliku `index.html`. Uruchom prosty serwer w folderze projektu:

```powershell
python -m http.server 8080
```

Następnie otwórz:

```text
http://localhost:8080
```

## Wysłanie projektu na GitHub — Windows

Repozytorium docelowe:

```text
https://github.com/tomalawsb/Dzienniczek-hormonu-wzrostu
```

Uruchom w głównym folderze projektu:

```powershell
powershell -ExecutionPolicy Bypass -File .\upload_to_github.ps1
```

Skrypt sam pobiera repozytorium, kopiuje projekt, tworzy commit z numerem wersji i wysyła gałąź `main`.

## Wysłanie projektu na GitHub — Android

Android wymaga aplikacji Termux. Instrukcja znajduje się w pliku:

```text
URUCHOMIENIE_NA_ANDROIDZIE.txt
```

Po jednorazowym przyznaniu Termuxowi dostępu do pamięci uruchom w folderze projektu:

```bash
bash upload_to_github_android.sh
```

Skrypt sam instaluje Git, GitHub CLI i rsync, prowadzi przez pierwsze logowanie do GitHuba, kopiuje cały projekt i wysyła zmiany.

## Publikacja przez GitHub Pages

Projekt zawiera workflow `.github/workflows/deploy-pages.yml`.

1. Wejdź w ustawienia repozytorium.
2. Otwórz sekcję **Pages**.
3. Jako źródło wybierz **GitHub Actions**.
4. Poczekaj na zakończenie zadania w zakładce **Actions**.

Docelowy adres:

```text
https://tomalawsb.github.io/Dzienniczek-hormonu-wzrostu/
```

## Pliki projektu

- `index.html` — układ aplikacji,
- `style.css` — responsywny interfejs,
- `app.js` — dane, głos, kalendarz, raporty, zgody i przypomnienia,
- `manifest.json` — konfiguracja PWA,
- `service-worker.js` — działanie offline, powiadomienia i obsługa pracy w tle,
- `app-version.json` — numer wersji,
- `upload_to_github.ps1` — wysyłanie na GitHub w Windows,
- `upload_to_github_android.sh` — wysyłanie na GitHub z Androida przez Termux,
- `URUCHOMIENIE_NA_ANDROIDZIE.txt` — instrukcja dla Androida,
- `.github/workflows/deploy-pages.yml` — publikacja przez GitHub Pages.

## Ważne

Aplikacja nie dobiera dawki i nie zastępuje zaleceń lekarza. Zapisuje wyłącznie informacje wpisane lub wypowiedziane przez użytkownika.
