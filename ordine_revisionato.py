"""Conservative study families; M3 follows the reviewed PDF. M4 stays legacy."""
import collections
import hashlib
import json
import re
import unicodedata
from pathlib import Path

MAX_BLOCK = 15
# Grammar only: never remove negations, numbers, dates or financial conditions.
STOP = set('il lo la i gli le un uno una di del dello della dei degli delle a al allo alla ai agli alle da dal dallo dalla dai dagli dalle in nel nello nella nei negli nelle su sul sullo sulla sui sugli sulle con per tra fra e o che quale quali seguente seguenti sensi art articolo'.split())
# Conservative vetoes: these words can reverse a rule despite high lexical similarity.
CONDITIONS = set('non no senza escluso esclusi escluse esente esenti imponibile imponibili prima dopo entro oltre minimo massimo minima massima maggiore minore maggiori minori superiore inferiore superiori inferiori progressiva regressiva diretta indiretta acconto imposta sostitutiva consentito vietato ammesso obbligatorio facoltativo positivo negativo positivi negativi maturato realizzato qualificate qualificata qualificati qualificato aumento diminuzione aumenta diminuisce ribasso rialzo semplice composta fixed floating payer receiver call put acquisto vendita compratore venditore long short dettaglio professionale professionali sicav sicaf sim sgr fia oicvm onorabilità professionalità indipendenza iscrizione cancellazione riammissione assicurazione cambio impresa residente residenti estero esteri italiano italiani dichiarazione amministrato gestito'.split())


def normalized(text):
    return ' '.join(re.findall(r'\w+|[=+*/^<>≤≥√×÷−%()\[\]-]', unicodedata.normalize('NFKC', text).casefold()))


def words(text):
    return frozenset(w for w in normalized(text).split() if w not in STOP)


def signature(text):
    tokens = normalized(text).split()
    return (tuple(re.findall(r'\d+(?:[.,]\d+)*\s*%?', text)),
            frozenset(w for w in tokens if w in CONDITIONS),
            re.sub(r'\s+', '', text).casefold() if re.search(r'[=+*^<>≤≥√×÷·]', text) else '')


def similarity(a, b):
    return len(a & b) / len(a | b) if a or b else 1.0


def answer_key(text):
    # Only a leading definite article is harmless. Preserve prepositions,
    # conjunctions, repeated words and roles (Tizio pays Caio != Caio pays Tizio).
    return re.sub(r'^(?:il|lo|la|i|gli|le) ', '', normalized(text))


def prepare(q):
    return dict(q, _q=words(q['domanda']), _a=words(q['A']),
                _qs=signature(q['domanda']), _as=signature(q['A']))


# Reviewed changes of fact/role: equal solutions belong in the answer section,
# not among paraphrases of the same question.
DIFFERENT_CASES = {(606, 607), (730, 731), (1194, 1196), (1344, 1347),
                   (1784, 1785), (1906, 1907)}


def equivalent(a, b, score=None):
    """Same context, compatible conditions, near-identical stem AND answer."""
    if tuple(sorted((a['n'], b['n']))) in DIFFERENT_CASES: return False
    if '_q' not in a: a = prepare(a)
    if '_q' not in b: b = prepare(b)
    return (a['contenuto'] == b['contenuto'] and a['sub'] == b['sub']
            and a['_qs'] == b['_qs'] and a['_as'] == b['_as']
            and (score if score is not None else similarity(a['_q'], b['_q'])) >= .88
            and answer_key(a['A']) == answer_key(b['A']))


def same_answer(a, b):
    # Short but informative answers (CONSOB, lordisti...) are useful; yes/no,
    # bare rates and durations alone do not establish a learning family.
    generic = set('sì si no sempre mai tutti tutte nessuno nessuna entrambi entrambe possibile impossibile anni anno mesi mese giorni giorno euro punti punto percento cento entro oltre pari uno due tre quattro cinque sei sette otto nove dieci'.split())
    if any(not {w for w in words(q['A']) if w.isalpha() and w not in generic} for q in (a, b)):
        return False
    return (a['contenuto'] == b['contenuto'] and a['sub'] == b['sub']
            and a['_as'] == b['_as']
            and answer_key(a['A']) == answer_key(b['A'])
            and similarity(a['_q'], b['_q']) >= .25)


def families(items, matches):
    """Complete-link: a new member must match every existing member."""
    out = []
    for item in sorted(items, key=lambda q: q['n']):
        for group in out:
            if len(group) < MAX_BLOCK and all(matches(item, other) for other in group):
                group.append(item)
                break
        else:
            out.append([item])
    return out


def pack(groups):
    """Pack whole families, preserving their order and maximum size."""
    out, block = [], []
    for group in groups:
        # Large exact-text families are kept consecutive across adjacent blocks.
        for start in range(0, len(group), MAX_BLOCK):
            chunk = group[start:start + MAX_BLOCK]
            if block and len(block) + len(chunk) > MAX_BLOCK:
                out.append(block)
                block = []
            block.extend(chunk)
    if block: out.append(block)
    return out


def reviewed_m3(qs):
    qs = sorted(qs, key=lambda q: q['n'])
    plan = json.loads(Path(__file__).with_name('ordine_m3.json').read_text())
    digest = hashlib.sha256(json.dumps(qs, ensure_ascii=False, sort_keys=True,
                                      separators=(',', ':')).encode()).hexdigest()
    if digest != plan['source_sha256']:
        raise ValueError('M3: la banca dati è cambiata; rivedere il piano approvato')
    names = {1: 'Uguali', 2: 'Stessa risposta', 3: 'Stesso argomento'}
    out = []
    for section in (1, 2, 3):
        families_ = [g['ids'] for g in plan['groups'] if g['section'] == section]
        out.append((names[section], '', pack(families_)))
    blocks = [b for s, c, B in out for b in B]
    if blocks != plan['blocks']:
        raise ValueError('M3: i blocchi non corrispondono al PDF approvato')
    return out


def sezioni(qs):
    qs = sorted(qs, key=lambda q: q['n'])
    if not qs: return []
    if {q['materia'] for q in qs} == {3}: return reviewed_m3(qs)
    pending = {q['n']: prepare(q) for q in qs}
    exact = collections.defaultdict(list)
    for q in qs: exact[normalized(q['domanda'])].append(q['n'])
    identical = [ids for ids in exact.values() if len(ids) > 1]
    for ids in identical:
        for n in ids: pending.pop(n)
    equivalents, answers = [], []
    reviewed = {}
    if {q['materia'] for q in qs} == {5}:
        reviewed = json.loads(Path(__file__).with_name('ordine_m5_famiglie.json').read_text())
        digest = hashlib.sha256(json.dumps(qs, ensure_ascii=False, sort_keys=True,
                                          separators=(',', ':')).encode()).hexdigest()
        if digest != reviewed['source_sha256']:
            raise ValueError('M5: rivedere le famiglie dopo la modifica della banca dati')
    for match, destination in ((equivalent, equivalents), (same_answer, answers)):
        key = 'equivalenti' if match is equivalent else 'stessa_risposta'
        for family in reviewed.get(key, []):
            ids = [n for n in family['ids'] if n in pending]
            if len(ids) > 1:
                destination.append(ids)
                for n in ids: pending.pop(n)
        contexts = collections.defaultdict(list)
        for q in pending.values(): contexts[(q['contenuto'], q['sub'])].append(q)
        for items in contexts.values():
            for group in families(items, match):
                if len(group) < 2: continue
                ids = [q['n'] for q in group]
                destination.append(ids)
                for n in ids: pending.pop(n)
        destination.sort(key=lambda ids: min(ids))
    out = []
    if identical or equivalents: out.append(('Uguali', '', pack(identical + equivalents)))
    if answers: out.append(('Stessa risposta', '', pack(answers)))
    contents = collections.defaultdict(lambda: collections.defaultdict(list))
    for q in pending.values(): contents[q['contenuto']][q['sub']].append(q)
    for content, subs in contents.items():
        # Keep each subtopic consecutive; combine whole small groups only
        # within the same official content to avoid tiny study blocks.
        content_groups = []
        for items in subs.values():
            left = {q['n']: q for q in items}
            seq = [min(left)]; previous = left.pop(seq[0])
            while left:
                n = max(left, key=lambda n: (similarity(previous['_q'], left[n]['_q']), -n))
                seq.append(n); previous = left.pop(n)
            content_groups.extend([seq[i:i + MAX_BLOCK] for i in range(0, len(seq), MAX_BLOCK)])
        out.append(('Stesso argomento', content, pack(content_groups)))
    ids = [n for s, c, B in out for b in B for n in b]
    if len(ids) != len(qs) or set(ids) != {q['n'] for q in qs}:
        raise ValueError('Ordine incompleto o con quesiti duplicati')
    return out
