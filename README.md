# Palestra OCF

Allenamento personale per la prova valutativa OCF: 5.000 quesiti ufficiali (banca dati set–dic 2026), studio per materia, esercitazione adattiva, simulazioni d'esame con punteggio ufficiale (28 teorici + 12 pratici da 2 punti, 20 teorici da 1 punto).

- `palestra_template.html` — pagina (HTML/CSS/JS), con il segnaposto `/*__DATA__*/` per i quesiti
- `ocf_5000_quesiti.json` — banca dati estratta dal PDF ufficiale (risposta corretta sempre `A` nei dati, mescolata a video)
- `build.py` — inietta i quesiti e genera `palestra_ocf.html` (e `preview.html` per aprirla in locale)
- `palestra_ocf.html` — pagina pronta, pubblicata come Artifact Claude privato

Repo privato: contiene materiale riservato (area riservata OCF, piano Mediolanum). Non renderlo pubblico.

```
python3 build.py
open preview.html
```
