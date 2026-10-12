# Palestra Ponte (Mac)

Registra nel DB Excel Mediolanum («DB OCF 08.2026 - CLASSE 30.xlsm») i test fatti sulla Palestra, da qualunque dispositivo.

- Ogni 20 s legge i test nuovi dall'account (stesso codice della Palestra) e, se il DB è aperto in Excel, aggiorna il foglio **Database**
  con le regole del DB: **T** «Quesito Affrontato» +1 per risposta, **G** «E2» +1 per errore; **S** è una formula del DB e non si tocca.
- Ogni test si registra una volta sola (`~/Library/Application Support/PalestraPonte/registrati.json`), poi il DB viene salvato.
- Configurazione: `~/Library/Application Support/PalestraPonte/config.json` → `{"code": "XXXX-…", "since": <ms>}` (solo sul Mac, mai nel repo).
- Avvio automatico: `~/Library/LaunchAgents/it.palestraocf.ponte.plist` → `~/Applications/Palestra Ponte.app`.
- Stato e registro: `stato.json`, `ponte.log` nella stessa cartella; prova senza scrivere: `PalestraPonte --once --dry`.

Compilazione: `swiftc -O ponte/main.swift -o ponte/build/PalestraPonte.app/Contents/MacOS/PalestraPonte` (+ Info.plist, `codesign -s -`).
`core.swift` + `cli/main.swift` (dbctl) sono gli strumenti usati per studiare la finestra del quiz del DB.
