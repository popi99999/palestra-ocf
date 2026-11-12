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
            cuts.append(min(cand,key=lambda p:(0 if not bounds or p in bounds else 1,cos(V[seq[p-1]],V[seq[p]]),abs(p-c))))  # mai spezzare un gruppo di uguali
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

# ---- Sezioni a crescendo: prima le uguali, poi quelle con la stessa risposta, poi le molto simili, le simili, le altre ----
SEZIONI=[('Uguali','q',0.42),('Stessa risposta','a',0.6)]
def vectorsA(qs):
    docs=[collections.Counter(toks(x['A'])) for x in qs]; df=collections.Counter(w for d in docs for w in d); V={}
    for x,d in zip(qs,docs):
        v={w:(1+math.log(c))*math.log(1+len(qs)/df[w]) for w,c in d.items()}; nrm=math.sqrt(sum(a*a for a in v.values())) or 1
        V[x['n']]={w:a/nrm for w,a in v.items()}
    return V
def cut(seq,V,bounds=None):
    # blocchi da max 15, tutti di misura simile; il taglio cade dove due domande vicine si somigliano meno
    tot=len(seq); nb=-(-tot//MAXB); base=tot/nb; cuts=[]
    for k in range(1,nb):
        c=round(k*base); prev=cuts[-1] if cuts else 0; w=5 if bounds else 3; lo=max(prev+1,c-w); hi=min(tot-1,c+w)
        cand=[p for p in range(lo,hi+1) if p-prev<=MAXB and tot-p<=MAXB*(nb-k)] or [c]
        cuts.append(min(cand,key=lambda p:(0 if not bounds or p in bounds else 1,cos(V[seq[p-1]],V[seq[p]]),abs(p-c))))  # mai spezzare un gruppo di uguali
    return [seq[a:b] for a,b in zip([0]+cuts,cuts+[tot])]
def gruppi(left,W,th,cap=12):
    # gruppi "stretti": due gruppi si uniscono solo se, in media, TUTTE le loro domande si somigliano (niente catene A~B~C con A diversa da C)
    L=sorted(left); P=[]
    for a in range(len(L)):
        for b in range(a+1,len(L)):
            c=cos(W[L[a]],W[L[b]])
            if c>=th: P.append((c,L[a],L[b]))
    P.sort(reverse=True); g={i:[i] for i in L}
    for c,x,y in P:
        A,B=g[x],g[y]
        if A is B or len(A)+len(B)>cap: continue
        if sum(cos(W[i],W[j]) for i in A for j in B)/(len(A)*len(B))<th: continue
        A.extend(B)
        for j in B: g[j]=A
    seen=set(); out=[]
    for i in L:
        G=g[i]
        if id(G) not in seen and len(G)>1: seen.add(id(G)); out.append(G)
    # chi è rimasto fuori ma è molto simile a una domanda di un gruppo, entra in quel gruppo (se c'è posto)
    for i in L:
        if len(g[i])>1: continue
        best=max(((max(cos(W[i],W[j]) for j in G),k) for k,G in enumerate(out) if len(G)<15),default=(0,-1))
        if best[0]>=th+0.08: out[best[1]].append(i); g[i]=out[best[1]]
    return [sorted(G) for G in out]
def pack(groups):
    # riempie i blocchi con gruppi interi (max 15); un blocco si chiude quando è pieno quanto basta
    tot=sum(map(len,groups)); target=tot/(-(-tot//MAXB)); B=[]; cur=[]
    for g in groups:
        if cur and (len(cur)+len(g)>MAXB or len(cur)>=target): B.append(cur); cur=[]
        cur=cur+g
    if cur: B.append(cur)
    if len(B)>1 and len(B[-1])<6 and len(B[-2])+len(B[-1])<=MAXB: B[-2]+=B.pop()
    return B
def sezioni(qs_mat):
    V=vectors(qs_mat); VA=vectorsA(qs_mat); left=sorted(x['n'] for x in qs_mat); out=[]
    for name,kind,th in SEZIONI:
        W=VA if kind=='a' else V
        comp=gruppi(left,W,th)
        if not comp: continue
        out.append((name,'',pack([chain(c,W) for c in comp])))  # i gruppi uno dopo l'altro, nell'ordine del libro, mai spezzati
        seq=[n for c in comp for n in c]; used=set(seq); left=[i for i in left if i not in used]
    if left:
        cont=collections.OrderedDict(); D={x['n']:x for x in qs_mat}
        for n in left: cont.setdefault(D[n]['contenuto'],[]).append(n)
        # il resto: stesso argomento, un argomento alla volta nell'ordine del libro, le simili una dopo l'altra
        for c,ids in cont.items():
            subs=collections.OrderedDict()
            for n in ids: subs.setdefault(D[n]['sub'] or '',[]).append(n)
            out.append(('Stesso argomento',c,cut([n for s in subs.values() for n in chain(s,V)],V)))
    return out
