"""Check M1 coverage, per-option explanations and safe editorial markup."""
import argparse
import collections
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def no_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'Chiave duplicata: {key}')
        result[key] = value
    return result
class Markup(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
    def handle_starttag(self, tag, attrs):
        assert tag in {'b', 'i'} and not attrs, f'Tag non ammesso: {tag}'
        self.stack.append(tag)
    def handle_endtag(self, tag):
        assert self.stack and self.stack.pop() == tag, f'Chiusura non coerente: {tag}'
    def handle_startendtag(self, tag, attrs):
        raise AssertionError(f'Tag non ammesso: {tag}')
def words(text):
    return re.sub(r'<[^>]+>', ' ', text).split()
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--partial', action='store_true')
    args = ap.parse_args()
    bank = json.loads((ROOT/'ocf_5000_quesiti.json').read_text())
    ids = {str(q['n']) for q in bank if q['materia'] == 1}
    assert ids == {str(n) for n in range(1, 2001)}
    data = json.loads((ROOT/'spiegazioni/m1.json').read_text(), object_pairs_hook=no_duplicate_keys)
    assert not data.keys()-ids, 'ID estranei alla materia 1'
    if not args.partial:
        assert data.keys() == ids, f'Mancano {len(ids-data.keys())} spiegazioni'
    errors, warnings, lengths = [], [], []
    seen = {}
    for key, sp in sorted(data.items(), key=lambda kv:int(kv[0])):
        try:
            assert {'q','p','x','k'} <= sp.keys(), 'Campi mancanti'
            assert sp.keys() <= {'q','p','x','k','t'}, 'Campi inattesi'
            assert set(sp['x']) == {'B','C','D'}, 'Servono tre motivazioni B/C/D'
            emphasis = re.findall(r'<b>(.*?)</b>', sp['p'], re.S)
            assert 1 <= len(emphasis) <= 2, 'Servono uno o due passaggi chiave in grassetto'
            assert all(value.strip() for value in emphasis), 'Grassetto vuoto'
            assert sum(len(words(value)) for value in emphasis) < len(words(sp['p'])), 'Non evidenziare l’intero paragrafo'
            fields = {name:sp[name] for name in ['q','p','k']}
            fields.update({f'x.{k}':v for k,v in sp['x'].items()})
            if 't' in sp:fields['t'] = sp['t']
            for name, value in fields.items():
                assert isinstance(value,str) and value.strip(), f'Testo vuoto: {name}'
                assert not re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]',value), f'Caratteri di controllo: {name}'
                parser = Markup()
                parser.feed(value)
                assert not parser.stack, f'Tag non chiusi: {name}'
                assert '**' not in value and '<script' not in value.lower(), f'Markup inatteso: {name}'
                maximum = 95 if name=='q' else 90 if name=='p' else 40 if name.startswith('x.') else 70
                if len(words(value)) > maximum:
                    warnings.append({'id':key,'field':name,'warning':'Testo lungo','words':len(words(value))})
                if name.startswith('x.'):
                    assert not re.match(r'^(?:La risposta è (?:errata|sbagliata)|Contrasta con la norma)[.! ]*$',value,re.I), 'Motivazione generica'
            assert len(set(sp['x'].values())) == 3, 'Motivazioni identiche nella stessa domanda'
            signature = json.dumps(sp,sort_keys=True,ensure_ascii=False)
            assert signature not in seen, f'Spiegazione interamente identica alla {seen.get(signature)}'
            seen[signature] = key
            lengths.append(sum(len(words(v)) for v in fields.values()))
        except (AssertionError,KeyError,TypeError) as exc:
            errors.append({'id':key,'error':str(exc)})
    report = {
        'spiegazioni':len(data),'attese':2000,
        'spiegazioni_con_grassetto':sum(bool(re.search(r'<b>.+?</b>',value.get('p',''),re.S)) for value in data.values()),
        'motivazioni_errate':sum(len(v.get('x',{})) for v in data.values()),
        'copertura_per_argomento':dict(collections.Counter(q['contenuto'] for q in bank if str(q['n']) in data)),
        'errori':errors,'segnalazioni_editoriali':warnings,
        'parole_medie':round(sum(lengths)/len(lengths),1) if lengths else 0,
        'banca_sha256':hashlib.sha256((ROOT/'ocf_5000_quesiti.json').read_bytes()).hexdigest()
    }
    out = ROOT/'lavoro_m1/verifica_copertura.json'
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:report[k] for k in ['spiegazioni','attese','spiegazioni_con_grassetto','motivazioni_errate','parole_medie']},ensure_ascii=False))
    print(f'Errori: {len(errors)}; segnalazioni: {len(warnings)}')
    if errors:
        print(json.dumps(errors,ensure_ascii=False,indent=2))
        raise SystemExit(1)
if __name__ == '__main__':main()
