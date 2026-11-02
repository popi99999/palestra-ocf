import json,glob,re,sys
m=json.load(open('spiegazioni/m5.json'))
tot=0
for f in sorted(glob.glob('spiegazioni_v3/m5_*.json')):
    d=json.load(open(f))
    for n,e in d.items():
        assert all(e.get(k) for k in 'qpexkr'),(n,f); assert set(e['x'])<=set('BCD') and e['x'],n
        assert not re.search(r'<(?!/?(b|i)>)[^>]*>',json.dumps(e,ensure_ascii=False)),n
    m.update(d); tot+=len(d)
json.dump(m,open('spiegazioni/m5.json','w'),ensure_ascii=False,indent=1); print('nuove',tot)
