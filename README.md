# Dzienniczek hormonu wzrostu PWA

Wersja: **1.6 - 2406262227**

Responsywna aplikacja PWA do zapisywania podań hormonu wzrostu na telefonie i komputerze. Projekt jest przeznaczony do publikacji przez GitHub Pages.

## Najważniejsze funkcje

- dokładnie jeden wpis dziennie — podanie albo pominięcie dawki,
- główna karta „Co teraz zrobić” z automatyczną propozycją najbliższego działania,
- szybki zapis daty, godziny, dawki i miejsca wkłucia,
- obsługa głosowa po polsku,
- polecenia głosowe można podawać etapami, np. najpierw „wczoraj”, potem „lewy brzuch”,
- brak daty w poleceniu nie nadpisuje wcześniej wybranej daty,
- kalendarz, historia, wyszukiwanie, edycja i usuwanie wpisów,
- automatyczna rotacja miejsc bez uwzględniania przyszłych wpisów,
- automatyczne odświeżenie daty po północy i po powrocie do aplikacji,
- przypomnienie systemowe z proponowanym miejscem wkłucia, dawką i stanem ampułki,
- licznik ampułki liczony automatycznie po kolejnych podaniach, bez zużycia przy dawkach pominiętych,
- automatyczne rozpoczęcie kolejnej ampułki przy następnym podaniu po zakończeniu poprzedniej,
- numer aktualnej ampułki i data jej startu widoczne w aplikacji oraz w raportach PDF/Word/CSV,
- ekran zgód przy pierwszym uruchomieniu,
- raport PDF przez systemowe okno drukowania,
- prawidłowy dokument Microsoft Word `.docx`,
- eksport CSV i pełnej kopii JSON,
- import JSON z walidacją i blokowaniem zduplikowanych dni,
- lokalna kopia poprzedniego zapisu danych,
- działanie offline po pierwszym poprawnym otwarciu,
- obsługa klawiaturą.

## Zasada jednego wpisu dziennie

Aplikacja nie pozwala utworzyć dwóch wpisów z tą samą datą. Jeśli wpis dla wybranego dnia już istnieje, przycisk dodawania otworzy go do edycji. Dotyczy to zapisu ręcznego, głosowego oraz importu danych.

## Przykładowe polecenia głosowe

- `lewy brzuch`
- `wczoraj prawe ramię`
- `wczoraj`, a następnie `prawe ramię`
- `dawka jeden przecinek jeden`
- `pomiń dzisiaj`
- `zapisz`
- `anuluj`

## Ampułka 10 ml

W ustawieniach należy wskazać datę rozpoczęcia znanej ampułki oraz jej numer. Program dalej sam liczy kolejne ampułki po rzeczywistych podaniach. Jeśli poprzednia ampułka została zakończona, następna zacznie się automatycznie przy kolejnym podaniu. Pominięta dawka nie zużywa ampułki i nie rozpoczyna nowej.

Program liczy zużycie technicznie na podstawie pojemności ampułki i dawki zużywanej w ml. Jeśli domyślna jednostka dawki to `ml`, używana jest dawka domyślna. Przy jednostkach `mg`, `IU` albo `j.m.` trzeba wpisać osobno zużycie w ml, bo aplikacja nie przelicza medycznie mg/IU na ml.

Na ekranie głównym pojawia się status ampułki. Gdy dzisiejsza dawka jest ostatnia z bieżącej ampułki, aplikacja pokazuje komunikat i dopisuje tę informację do powiadomienia.

## Przypomnienia

W ustawieniach można wybrać godzinę, zezwolić na powiadomienia i wysłać test. Treść zawiera proponowane miejsce i dawkę, np.:

```text
Czas na zastrzyk
Dzisiaj: lewe udo. Dawka: 1,1 mg. Dzisiaj jest ostatni zastrzyk z tej ampułki.
```

GitHub Pages jest hostingiem statycznym. Przypomnienie działa najpewniej, gdy aplikacja jest otwarta lub system pozwala jej pracować w tle. Po całkowitym zamknięciu przeglądarki dokładna godzina nie jest gwarantowana. Niezawodne powiadomienia o określonej godzinie wymagają wersji natywnej APK albo serwera Web Push.

## Eksport raportów

- **PDF** — otwiera raport i systemowe okno drukowania; wybierz „Zapisz jako PDF”.
- **Word** — pobiera prawidłowy plik `.docx`.
- **CSV** — tabela historii do Excela lub innego arkusza, od najstarszego do najnowszego wpisu, z numerem ampułki, datą jej startu i stanem po wpisie.
- **JSON** — pełna kopia danych i ustawień.

## Skróty klawiaturowe

| Skrót | Działanie |
|---|---|
| `Alt + 1` | Dzisiaj |
| `Alt + 2` | Kalendarz |
| `Alt + 3` | Historia |
| `Alt + 4` | Więcej |
| `Alt + M` | Mikrofon |
| `Alt + N` | Dodaj lub edytuj dzisiejszy wpis |
| `Alt + P` | Raport PDF |
| `Alt + W` | Raport Word |
| `Ctrl + Enter` | Zapis przygotowanego wpisu |
| `Esc` | Zamknięcie okna lub zatrzymanie mikrofonu |

Elementy interfejsu można obsługiwać klawiszami `Tab`, `Shift + Tab`, `Enter` i `Spacja`. W kalendarzu działają strzałki.

## Dane użytkownika

Dane medyczne są przechowywane lokalnie w przeglądarce i nie trafiają do repozytorium GitHub. Telefon i komputer mają osobne dane, dopóki użytkownik nie przeniesie kopii JSON.

Przed każdym zapisem aplikacja tworzy lokalną kopię poprzedniego stanu. Importowane wpisy są sprawdzane pod kątem daty, godziny, dawki, jednostki, miejsca, statusu oraz duplikatów dni.

## Uruchomienie lokalne

Nie otwieraj `index.html` bezpośrednio z dysku. Uruchom serwer w folderze projektu:

```powershell
python -m http.server 8080
```

Następnie otwórz:

```text
http://localhost:8080
```

## Wysyłanie na GitHub

### Windows

Uruchom:

```powershell
.\upload_to_github.ps1
```

### Android / Termux

Uruchom w folderze projektu:

```bash
bash upload_to_github_android.sh
```

Skrypty używają repozytorium:

```text
https://github.com/tomalawsb/Dzienniczek-hormonu-wzrostu.git
```

Nie pytają o opis commita. Przed wysłaniem wykonują kontrolę projektu. Skrypty nie usuwają automatycznie dodatkowych plików istniejących już w repozytorium.
