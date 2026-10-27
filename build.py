import json
q=json.load(open('ocf_5000_quesiti.json'))
C=[];S=[];ci={};si={}
def idx(v,L,D):
    if v not in D: D[v]=len(L); L.append(v)
    return D[v]
rows=[[x['materia'],idx(x['contenuto'].replace('_ ',': ').replace('_',':'),C,ci),idx(x['sub'] or '',S,si),x['livello'],x['domanda'],x['A'],x['B'],x['C'],x['D'],1 if x.get('pratico') else 0] for x in q]
# spiegazioni «Spiega il perché» (spiegazioni/m*.json, chiave = numero della domanda) e domande gemelle (stesso testo)
import glob, re, collections
SP={}
for f in sorted(glob.glob('spiegazioni/m*.json')): SP.update(json.load(open(f,encoding='utf-8')))
norm=lambda t: re.sub(r'[^a-z0-9]','',t.lower())
gr=collections.defaultdict(list)
for x in q: gr[norm(x['domanda'])].append(x)
GEM={}
for g in gr.values():
    if len(g)>1:
        for x in g: GEM[str(x['n'])]=[[o['n'],o['A'],norm(o['A'])==norm(x['A'])] for o in g if o['n']!=x['n']]
print('spiegazioni:',len(SP),'| domande con gemella:',len(GEM))
data=json.dumps({'c':C,'s':S,'q':rows,'sp':SP,'gem':GEM},ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
t=open('palestra_template.html').read()
# versione: la pagina la confronta con version.txt e si ricarica da sola quando ne esce una nuova
import time
VER=time.strftime('%Y%m%d-%H%M%S')
t=t.replace('/*__VERSION__*/', VER)
open('version.txt','w').write(VER+'\n')
# report Excel (ExcelJS + grafici): modulo separato, incollato nello stesso <script>
t=t.replace('/*__EXCEL__*/', open('parts/excel.js').read())
assert '/*__EXCEL__*/' not in t
open('palestra_ocf.html','w').write(t.replace('/*__DATA__*/',data))
open('preview.html','w').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>'+t.replace('/*__DATA__*/',data)+'</body></html>')
# versione per GitHub Pages: documento completo, esclusa dai motori di ricerca
PWA_HEAD=('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  '<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#2E7D32">'
  '<link rel="manifest" href="manifest.webmanifest"><link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">'
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes">'
  '<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><meta name="apple-mobile-web-app-title" content="Palestra OCF">')
open('index.html','w').write('<!doctype html><html lang="it"><head>'+PWA_HEAD+'</head><body>'+t.replace('/*__DATA__*/',data)+'</body></html>')
print('built')
