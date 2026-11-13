# Ordine di studio - 13 novembre 2026

Applicato a M1, M2, M3 e M5. Materia 4 e tutte le altre informazioni incorporate nella pagina rimangono identiche alla versione precedente.

## Criterio

Prima testi identici e parafrasi compatibili; poi risposte uguali nel medesimo contesto; infine microargomenti con casi e calcoli vicini. Le famiglie automatiche richiedono compatibilità con ogni membro, non una catena di somiglianze. Le risposte conservano ordine delle parole, ruoli, formule, negazioni e numeri. Sì/no, aliquote isolate e durate da sole non formano una famiglia. I confronti ambigui restano tra i casi di argomento, senza etichetta di equivalenza.

M3 riproduce il PDF revisionato: 144 famiglie, 40 blocchi, sequenza completa invariata rispetto alla proposta. M5 include 14 famiglie semantiche verificate oltre ai raggruppamenti conservativi. I file di famiglie curate controllano l’impronta della banca dati e richiedono revisione se cambia.

## Distribuzione pubblicata

| Materia | Uguali/equivalenti | Stessa risposta | Stesso argomento | Blocchi |
|---|---:|---:|---:|---:|
| M1 | 96 | 237 | 1667 | 163 |
| M2 | 36 | 49 | 1515 | 130 |
| M3 | 101 | 152 | 247 | 40 |
| M4 | 250 | 24 | 226 | 41 |
| M5 | 24 | 8 | 368 | 38 |

## Verifica

- Test Python: copertura, determinismo, capienza, testo identico, negazioni/numeri, formule M2, ruoli invertiti, famiglie M5 e corrispondenza al PDF M3.
- `node scripts/check_ordering.cjs`: tre build identiche nei dati, copertura delle cinque materie, progressi ricostruiti dagli identificativi originali, JavaScript valido.
- Confronto con il payload precedente: M4 e tutte le chiavi diverse da `ord` identiche.
- Nessun cambiamento a testi, risposte, alternative, identificativi, spiegazioni o persistenza dei progressi.

## Limiti

Il matcher automatico è intenzionalmente prudente: può lasciare parafrasi vere nella sezione per argomento. Questo è preferibile a classificare come uguali casi che cambiano condizioni o ruoli. I gruppi curati di M3 e M5 aggiungono collegamenti semantici verificati senza estenderli per somiglianza lessicale.

## Revisione

Il controllo indipendente ha segnalato tre famiglie con ruoli invertiti (2928/2929, 2393/2394, 1894/1917). Correzione coperta da regressioni: il confronto delle risposte ora conserva la sequenza delle parole. Nessun rilievo bloccante rimasto noto dopo la correzione.
