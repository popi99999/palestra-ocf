# Ordine di studio - 13 novembre 2026

Raggruppamento semantico applicato a M1, M2, M3 e M5. Successivamente, su richiesta dell’utente, ridistribuiti i blocchi di TUTTE le materie, inclusa M4: ogni blocco ha 14 o 15 domande. Le sequenze delle domande e tutte le informazioni diverse dai blocchi restano identiche alla versione precedente.

## Criterio

Prima testi identici e parafrasi compatibili; poi risposte uguali nel medesimo contesto; infine microargomenti con casi e calcoli vicini. Le famiglie automatiche richiedono compatibilità con ogni membro, non una catena di somiglianze. Le risposte conservano ordine delle parole, ruoli, formule, negazioni e numeri. Sì/no, aliquote isolate e durate da sole non formano una famiglia. I confronti ambigui restano tra i casi di argomento, senza etichetta di equivalenza.

M3 riproduce la sequenza del PDF revisionato e le sue 144 famiglie. Le 40 suddivisioni iniziali sono ora ripartite in 34 blocchi da 14-15; il PDF resta la fonte dell’ordine, non della nuova numerazione dei blocchi. M5 include 14 famiglie semantiche verificate oltre ai raggruppamenti conservativi. I file di famiglie curate controllano l’impronta della banca dati e richiedono revisione se cambia.

## Distribuzione pubblicata

| Materia | Domande | Blocchi | Dimensione |
|---|---:|---:|---|
| M5 | 400 | 27 | 14-15 |
| M4 | 500 | 34 | 14-15 |
| M3 | 500 | 34 | 14-15 |
| M2 | 1600 | 107 | 14-15 |
| M1 | 2000 | 134 | 14-15 |

## Verifica

- Test Python: copertura, determinismo, capienza, testo identico, negazioni/numeri, formule M2, ruoli invertiti, famiglie M5 e corrispondenza al PDF M3.
- `node scripts/check_ordering.cjs`: tre build identiche nei dati, copertura delle cinque materie, progressi ricostruiti dagli identificativi originali, JavaScript valido.
- Confronto con il payload precedente: sequenze di tutte e cinque le materie identiche e tutte le chiavi diverse da `ord` identiche.
- Nessun cambiamento a testi, risposte, alternative, identificativi, spiegazioni o persistenza dei progressi.

## Limiti

Il matcher automatico è intenzionalmente prudente: può lasciare parafrasi vere nella sezione per argomento. Questo è preferibile a classificare come uguali casi che cambiano condizioni o ruoli. I gruppi curati di M3 e M5 aggiungono collegamenti semantici verificati senza estenderli per somiglianza lessicale.

## Revisione

Il controllo indipendente ha segnalato tre famiglie con ruoli invertiti (2928/2929, 2393/2394, 1894/1917). Correzione coperta da regressioni: il confronto delle risposte ora conserva la sequenza delle parole. Nessun rilievo bloccante rimasto noto dopo la correzione.

## Bilanciamento dei blocchi

Il numero di sessioni è il minimo compatibile con il massimo di 15: le dimensioni differiscono al massimo di una domanda. La partizione non riordina nessun quesito. Quando ci sono più tagli possibili da 14/15, preferisce non dividere famiglie note e, a parità, cerca i collegamenti più deboli. Le etichette dei blocchi di passaggio indicano entrambe le sezioni o categorie. I gruppi possono proseguire nel blocco successivo quando il limite di 15 lo richiede.
