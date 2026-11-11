# «Studia in ordine»: per ogni materia, le domande nell'ordine degli argomenti con le simili una dopo l'altra, in blocchi da max 15
import re, math, collections
STOP=set("il lo la i gli le un uno una di a da in con su per tra fra e o che del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle è sono si non come quale quali cosa ai sensi art codice civile seguenti affermazioni se può deve ha hanno essere quando caso base secondo sia più anche solo ogni altro altra".split())
def toks(t): return [w[:6] for w in re.findall(r"[a-zàèéìòù0-9]+", t.lower()) if w not in STOP and len(w)>2]
MAXB, VICINE, LEGATE = 15, 0.45, 0.2
def vectors(qs):
    # parole chiave pesate: quelle rare (fideiussione, usufrutto…) contano molto, quelle comuni poco. Domanda + risposta giusta.
    docs=[collections.Counter(toks(x['domanda'])+toks(x['A'])) for x in qs]; df=collections.Counter(w for d in docs for w in d)
    V={}
    for x,d in zip(qs,docs):
        v={w:(1+math.log(c))*math.log(1+len(qs)/df[w]) for w,c in d.items()}; nrm=math.sqrt(sum(a*a for a in v.values())) or 1
        V[x['n']]={w:a/nrm for w,a in v.items()}
    return V
def cos(a,b):
    if len(a)>len(b): a,b=b,a
    return sum(v*b.get(w,0) for w,v in a.items())
def chain(ids,V):
    # ogni domanda è seguita dalla più simile tra quelle rimaste: le quasi uguali restano attaccate, le legate vicine
    out=[ids[0]]; rest=ids[1:]
    while rest:
        k=max(rest,key=lambda j:(round(cos(V[out[-1]],V[j]),6),-j)); out.append(k); rest.remove(k)
    return out
def blocks(qs_mat):
    V=vectors(qs_mat); cont=collections.OrderedDict()
    for x in qs_mat: cont.setdefault(x['contenuto'],collections.OrderedDict()).setdefault(x['sub'] or '',[]).append(x['n'])
    B=[]
    for subs in cont.values():
        seq=[n for ids in subs.values() for n in chain(ids,V)]; tot=len(seq)
        nb=-(-tot//MAXB); base=tot/nb; cuts=[]
        for k in range(1,nb):
            c=round(k*base); lo=max((cuts[-1] if cuts else 0)+1,c-2); hi=min(tot-1,c+2)
            # il taglio tra due blocchi cade dove le domande vicine si somigliano meno (senza superare 15)
            cand=[p for p in range(lo,hi+1) if p-(cuts[-1] if cuts else 0)<=MAXB and tot-p<=MAXB*(nb-k)] or [c]
            cuts.append(min(cand,key=lambda p:(cos(V[seq[p-1]],V[seq[p]]),abs(p-c))))
        for a,b in zip([0]+cuts,cuts+[tot]): B.append(seq[a:b])
    return B
def stats(qs_mat):
    V=vectors(qs_mat); B=blocks(qs_mat); c=collections.Counter()
    for b in B:
        for i,n in enumerate(b):
            s=max([cos(V[n],V[b[j]]) for j in (i-1,i+1) if 0<=j<len(b)] or [0])
            c['quasi uguali' if s>=VICINE else 'legate' if s>=LEGATE else 'sole']+=1
    return B,c
if __name__=='__main__':
    import json,sys
    q=json.load(open('ocf_5000_quesiti.json')); D={x['n']:x for x in q}; m=[x for x in q if x['materia']==5]
    B,c=stats(m); L=[len(b) for b in B]; V=vectors(m)
    print(len(B),'blocchi tot',sum(L),'min',min(L),'max',max(L)); print(dict(c))
    for b in B[7:9]:
        print('=== blocco')
        for i,n in enumerate(b): print(round(cos(V[b[i-1]],V[n]),2) if i else '   ', n, D[n]['domanda'][:95])
