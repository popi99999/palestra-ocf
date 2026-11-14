# Percorsi approvati M4 e M5 Implementation Plan

> **For agentic workers:** Execute the two releases sequentially with verification after each.

**Goal:** Pubblicare gli ordini approvati dei due PDF e mostrare il solo nome dell’argomento nei blocchi verde acqua.

**Architecture:** JSON versionati con ID e nomi, validati contro l’impronta della banca dati. La build li carica senza generatore o bilanciamento; la griglia conserva l’ordine e lo storico usa sempre gli ID originali.

**Tech Stack:** Python standard library, HTML/CSS/JavaScript statici, GitHub Pages.

**Spec:** Richiesta approvata: M4 prima, verifica online, M5 rifinita dopo; 15 domande per blocco, ultimo 5/10, solo argomenti sulle schede, nessun conteggio fatto/giusto.

## Global Constraints
- Testi, alternative, risposte corrette, ID, spiegazioni, sincronizzazione e materie 1/2/3 invariati.
- Nessun azzeramento dei progressi; aggiornamento della cache e della versione ad ogni pubblicazione.

## Review Focus
- Build successive conservano esattamente sequenze e blocchi dei PDF.
- Nomi lunghi leggibili anche a 320px senza riordinamento.
- Storico esistente non genera conteggi sulle schede.
- Leggi apre tutte le domande anche dopo il filtro errori.
- Il secondo aggiornamento parte solo dopo verifica live del primo.

### Release 1: materia 4
- [x] Loader con validazione, regressioni, JSON M4 e schede nominate.
- [x] Build, test, confronto baseline, browser e review.
- [ ] Commit, push e verifica del payload pubblico e della versione.

### Release 2: materia 5
- [ ] JSON M5 rifinito, stessi controlli e nuovo numero cache.
- [ ] Commit/push separato e verifica online di entrambi gli ordini.
