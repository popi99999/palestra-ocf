# Palestra OCF

Allenamento personale per la prova valutativa OCF: 5.000 quesiti ufficiali (banca dati set–dic 2026), studio per materia, esercitazione adattiva, simulazioni d'esame con punteggio ufficiale (28 teorici + 12 pratici da 2 punti, 20 teorici da 1 punto).

- `palestra_template.html` — pagina (HTML/CSS/JS), con il segnaposto `/*__DATA__*/` per i quesiti
- `ocf_5000_quesiti.json` — banca dati estratta dal PDF ufficiale (risposta corretta sempre `A` nei dati, mescolata a video)
- `build.py` — inietta i quesiti e genera `palestra_ocf.html` (e `preview.html` per aprirla in locale)
- `palestra_ocf.html` — pagina pronta, pubblicata come Artifact Claude privato

Web app: https://popi99999.github.io/palestra-ocf/ (installabile: `manifest.webmanifest`, `sw.js`, `icons/`).

Sincronizzazione: i progressi stanno in Supabase (progetto `palestra-ocf`, tabella `progress`), legati all'hash SHA-256 di un codice personale generato sul primo dispositivo. La tabella non è accessibile direttamente: si passa solo dalle funzioni `load_progress(code)` e `save_progress(code, data)`. Su ogni dispositivo si inserisce lo stesso codice da "Sincronizza i dispositivi".

```
python3 build.py
open preview.html
```

## Studia in ordine

Il percorso M1/M2/M5 usa `ordine_revisionato.py`; M3 segue i gruppi controllati di `ordine_m3.json`, M5 include le famiglie di `ordine_m5_famiglie.json`. M4 conserva il generatore precedente. Criteri, conteggi e verifiche in [docs/ordine-studio.md](docs/ordine-studio.md).

```
python3 -m unittest discover -s tests -v
python3 build.py
node scripts/check_ordering.cjs
```
