# «Studia in ordine»: per ogni materia, le domande nell'ordine degli argomenti con le simili una dopo l'altra, in blocchi da max 15
import re, collections
STOP=set("il lo la i gli le un uno una di a da in con su per tra fra e o che del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla sui sugli sulle è sono si non come quale quali cosa ai sensi art codice civile seguenti delle affermazioni se può deve ha hanno essere d l un'".split())
def toks(t):
    return {w[:6] for w in re.findall(r"[a-zàèéìòù0-9]+", t.lower()) if w not in STOP and len(w)>2}
def sim(a,b):
    u=len(a|b); return len(a&b)/u if u else 0
SUPER, SIMILE, MAXB = 0.6, 0.34, 15
def families(qs):
    # qs: domande di un sottoargomento (ordine banca dati). Famiglie = domande collegate da somiglianza >= SIMILE
    T=[toks(x['domanda'])|toks(x['A']) for x in qs]; n=len(qs); par=list(range(n))
    def f(i):
        while par[i]!=i: par[i]=par[par[i]]; i=par[i]
        return i
    S=[[sim(T[i],T[j]) for j in range(n)] for i in range(n)]
    for i in range(n):
        for j in range(i+1,n):
            if S[i][j]>=SIMILE: par[f(j)]=f(i)
    fam=collections.OrderedDict()
    for i in range(n): fam.setdefault(f(i),[]).append(i)
    out=[]
    for mem in fam.values():
        # dentro la famiglia: catena del più simile, così le quasi uguali restano attaccate
        chain=[mem[0]]; rest=mem[1:]
        while rest:
            k=max(rest,key=lambda j:(S[chain[-1]][j],-j)); chain.append(k); rest.remove(k)
        out.append([(qs[i]['n'], max([S[i][j] for j in mem if j!=i] or [0])) for i in chain])
    return out
def blocks(qs_mat):
    # un argomento (contenuto) alla volta; dentro, i sottoargomenti in fila e le famiglie mai spezzate (se ci stanno)
    cont=collections.OrderedDict()
    for x in qs_mat: cont.setdefault(x['contenuto'],collections.OrderedDict()).setdefault(x['sub'] or '',[]).append(x)
    B=[]
    for subs in cont.values():
        fams=[f for v in subs.values() for f in families(v)]; tot=sum(len(f) for f in fams)
        nb=-(-tot//MAXB); target=-(-tot//nb); cur=[] # blocchi di misura simile dentro l'argomento
        for f in fams:
            ids=[n for n,_ in f]
            if cur and len(cur)+len(ids)>MAXB: B.append(cur); cur=[]
            while len(ids)>MAXB: B.append(ids[:MAXB]); ids=ids[MAXB:]
            cur+=ids
            if len(cur)>=target: B.append(cur); cur=[]
        if cur:
            if B and len(cur)<5 and len(B[-1])+len(cur)<=MAXB+3 and B[-1][0] in {x['n'] for v in subs.values() for x in v}: B[-1]+=cur # niente bloccchetti minuscoli in coda
            else: B.append(cur)
    return B
if __name__=='__main__':
    import json
    q=json.load(open('ocf_5000_quesiti.json')); m5=[x for x in q if x['materia']==5]
    B=blocks(m5); L=[len(b) for b in B]
    print(len(B),'blocchi', 'tot',sum(L), 'min',min(L),'max',max(L), collections.Counter(L))
    by=collections.OrderedDict()
    for x in m5: by.setdefault((x['contenuto'],x['sub'] or ''),[]).append(x)
    ns=nsup=nsim=nsolo=0
    for k,v in by.items():
        for f in families(v):
            for n,s in f:
                if s>=SUPER: nsup+=1
                elif s>=SIMILE: nsim+=1
                else: nsolo+=1
    print('super simili',nsup,'simili',nsim,'da sole',nsolo,'| sottoargomenti',len(by))
