# Spiegazioni della materia 1

Ogni domanda della materia 1 dispone di una domanda riformulata in italiano semplice (`q`), una motivazione della risposta corretta (`p`), tre motivazioni relative alle alternative (`x.B`, `x.C`, `x.D`) e un richiamo breve (`k`). La nota `t` è facoltativa e segnala differenze tra domande simili o ambiguità del quesito.

Le lettere nella sorgente sono quelle della banca: A è la chiave corretta. L'interfaccia riassocia le motivazioni alle lettere effettivamente visualizzate dopo il mescolamento. I riferimenti alle domande gemelle devono restare un aiuto aggiuntivo: ogni spiegazione è leggibile autonomamente.

Il paragrafo «Perché è giusta» di ciascuna delle 2.000 spiegazioni evidenzia uno o due passaggi decisivi. La selezione riguarda il caso concreto: condizioni, negazioni, soglie complete, criteri distintivi o autorità competenti. Non vengono messi in grassetto interi paragrafi. Il controllo di copertura considera questo paragrafo, senza contare titoli, pulsanti o risposta corretta già evidenziata dall'interfaccia.

## Controlli riproducibili

```sh
python3 scripts/validate_m1_explanations.py
python3 build.py
node scripts/check_m1_renderer.cjs
```

Il primo controllo verifica copertura dei 2.000 ID, struttura delle 6.000 motivazioni, campi non vuoti e markup limitato a grassetto/corsivo. Segnala inoltre lunghezze e motivazioni identiche da esaminare. Il secondo ricostruisce i documenti distribuiti. Il terzo esegue la funzione effettiva dell'interfaccia nei 24 ordini possibili delle risposte di ogni domanda, verifica il collegamento di ciascuna motivazione, confronta le tre build con i dati e controlla la sintassi JavaScript.

Questi controlli verificano struttura e comportamento; la correttezza sostanziale richiede la lettura della domanda e delle sue quattro alternative. La redazione è stata suddivisa per intervalli, con revisione aggiuntiva dei casi numerici, delle autorità, delle frasi generiche e delle ambiguità emerse.

## Criteri per i quesiti ambigui

La banca ufficiale e le sue chiavi non vengono cambiate da questo aggiornamento. Nei casi individuati si distingue la risposta attesa dal quiz dalla formulazione completa della regola:

- Requisiti minimi: un periodo superiore al minimo può essere sufficiente nella realtà; non viene descritto come insufficiente solo perché diverso dal minimo atteso (per esempio 224, 226, 231, 234).
- EuGB: un intervallo più stretto può essere incluso nel limite generale; la 1126 lo segnala esplicitamente.
- Onorabilità: la 1346 distingue i generici delitti non colposi dalle categorie speciali; la 1350 chiarisce il riferimento all'articolo 1 e il minimo annuale; la 1356 distingue «maggiore di un anno» dalla soglia normativa «non inferiore a un anno».
- Le spiegazioni seguono il caso e la versione normativa richiamati dalla banca. L'aggiornamento non costituisce una certificazione di allineamento dell'intera banca alla normativa vigente; i testi di domanda possono contenere refusi o formulazioni non univoche.

Fonti primarie utilizzate per verifiche mirate: [regolamenti Consob](https://www.consob.it/web/area-pubblica/regolamenti), [regolamento Banca d'Italia sulla gestione collettiva](https://www.bancaditalia.it/compiti/vigilanza/normativa/archivio-norme/regolamenti/20120508/index.html), [DM 472/1998](https://www.normattiva.it/uri-res/N2Ls?urn:nir:ministero.tesoro.bilancio.programmazione.economica:decreto:1998-11-11;472), [regolamento UE 2023/2631](https://eur-lex.europa.eu/eli/reg/2023/2631/oj/ita).
