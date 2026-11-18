"""Topic-first paths: preserve question/answer families within their context."""
import argparse, collections, json
from pathlib import Path
from ordine_revisionato import prepare, normalized, equivalent, same_answer, families, similarity
from ordini_approvati import source_fingerprint

def generate(subject):
    lookup={q['n']:prepare(q) for q in subject}; remaining=set(lookup); units=[]
    if subject[0]['materia']==3:
        for g in json.loads(Path('ordine_m3.json').read_text())['groups']:
            if g['section']==3:continue
            split=collections.defaultdict(list)
            for n in g['ids']:split[lookup[n]['contenuto'],lookup[n]['sub']].append(n)
            units.extend(split.values());remaining.difference_update(g['ids'])
    else:
        for match in [lambda a,b:normalized(a['domanda'])==normalized(b['domanda']),equivalent,same_answer]:
            contexts=collections.defaultdict(list)
            for n in sorted(remaining):
                q=lookup[n];contexts[q['contenuto'],q['sub']].append(q)
            for items in contexts.values():
                for group in families(items,match):
                    if len(group)>1:
                        ids=[q['n'] for q in group];units.append(ids);remaining.difference_update(ids)
    units.extend([[n] for n in sorted(remaining)])
    contexts=collections.defaultdict(list)
    for unit in units:
        key=collections.Counter((lookup[n]['contenuto'],lookup[n]['sub']) for n in unit).most_common(1)[0][0]
        contexts[key].append(unit)
    sequence=[]
    for key,groups in sorted(contexts.items(),key=lambda kv:min(min(u) for u in kv[1])):
        groups=sorted(groups,key=min);prev=groups.pop(0);sequence.extend(prev)
        while groups:
            a=lookup[prev[-1]]
            def affinity(unit):
                b=lookup[unit[0]]
                return (.8*similarity(a['_q'],b['_q'])+.2*similarity(a['_a'],b['_a']),-min(unit))
            prev=groups.pop(max(range(len(groups)),key=lambda i:affinity(groups[i])));sequence.extend(prev)
    blocks=[];labels=collections.Counter()
    for i in range(0,len(sequence),15):
        ids=sequence[i:i+15];topics=collections.Counter((lookup[n]['contenuto']+': '+lookup[n]['sub']) if subject[0]['materia']==1 else (lookup[n]['sub'] or lookup[n]['contenuto']) for n in ids)
        label=' / '.join(k for k,v in topics.most_common(2));labels[label]+=1
        blocks.append({'label':label,'ids':ids})
    seen=collections.Counter()
    for b in blocks:
        label=b['label'];seen[label]+=1
        if labels[label]>1:b['label']=f'{label} · {seen[label]}'
    assert len(sequence)==len(set(sequence))==len(subject)
    return {'subject':subject[0]['materia'],'source_sha256':source_fingerprint(subject),'method':'Argomento continuo; famiglie curate o conservative; somiglianza di domanda e risposta nello stesso contesto','blocks':blocks}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('subject',type=int,choices=[1,2,3]);args=parser.parse_args()
    qs=[q for q in json.loads(Path('ocf_5000_quesiti.json').read_text()) if q['materia']==args.subject]
    path=Path(f'percorsi_approvati/m{args.subject}.json');path.write_text(json.dumps(generate(qs),ensure_ascii=False,indent=2)+'\n');print(path)
