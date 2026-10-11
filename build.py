import json
q=json.load(open('ocf_5000_quesiti.json'))
C=[];S=[];ci={};si={}
def idx(v,L,D):
    if v not in D: D[v]=len(L); L.append(v)
    return D[v]
rows=[[x['materia'],idx(x['contenuto'].replace('_ ',': ').replace('_',':'),C,ci),idx(x['sub'] or '',S,si),x['livello'],x['domanda'],x['A'],x['B'],x['C'],x['D'],1 if x.get('pratico') else 0] for x in q]
data=json.dumps({'c':C,'s':S,'q':rows},ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
t=open('palestra_template.html').read()
open('palestra_ocf.html','w').write(t.replace('/*__DATA__*/',data))
open('preview.html','w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+t.replace('/*__DATA__*/',data)+'</body></html>')
print('built')
