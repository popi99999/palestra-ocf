/* ================= ESPORTAZIONE EXCEL: report di studio con grafici =================
   parts/excel.js: va incollato nello stesso <script> della pagina (stesso scope, niente moduli).
   Legge S senza mai modificarlo. ExcelJS 4.4.0 si scarica solo al primo clic su "Scarica Excel".
   Funzioni pubbliche: exportExcel(btn) e dailyStats(sessions); tutte le altre hanno il prefisso rx.
   Definizioni usate ovunque:
     Domande affrontate = h.n · Risposte date = voci di h.q con esito diverso da 0
     Giuste = esito 1 · Errate = esito -1 · Non la sapevo = esito -2 · Non date = esito 0
     Sbagliate totali = Errate + Non la sapevo · Non giuste = n - giuste (unico dato dei test vecchi senza h.q)
     Percentuali sempre su Risposte date. Il giorno di un test è quello del suo INIZIO. */

/* ---------- costanti (servono solo al clic: dailyStats non ne dipende) ---------- */
const RX_EXCELJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js";
const RX_WHICH = {all:"Tutte", new:"Mai fatte", err:"Sbagliate", worst:"Sbagliate più spesso", redo:"Rifai sbagliate"};
const RX_TIME = {free:"Cronometro libero", q60:"60 s a domanda", q85:"85 s a domanda", tot:"Totale come all'esame"};
const RX_SRC = {bar:"Barra allenamento", cat:"Allenati su una categoria", group:"Allenati su una parte", "home-new":"Home: mai fatte", "home-err":"Home: sbagliate", redo:"Rifai sbagliate", worst:"Sbagliate più spesso"};
const RX_ESITO = {"1":"Giusta", "-1":"Errata", "-2":"Non la sapevo", "0":"Non data"};
const RX_HEX = {green:"#2E7D32", red:"#C62828", blue:"#1976D2", grey:"#9E9E9E", orange:"#EF6C00", text:"#212121", muted:"#616161", grid:"#ECECEC", axis:"#BDBDBD"};
const RX_ARGB = {green:"FF2E7D32", greenDark:"FF1B5E20", greenLine:"FFA5D6A7", red:"FFC62828", blue:"FF1976D2", orange:"FFE65100", grey:"FF757575",
  white:"FFFFFFFF", text:"FF212121", muted:"FF616161", border:"FFD9D9D9", zebra:"FFF3F8F3", total:"FFE8F5E9"};
const RX_TINT = {green:"FFE8F5E9", red:"FFFFEBEE", blue:"FFE3F2FD", orange:"FFFFF3E0", grey:"FFF5F5F5"};
const RX_FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const RX_CHART_W = 590; // larghezza di un grafico nel foglio Report (px); due grafici affiancati
let rxLibPromise = null;
let rxBusy = false; // report in preparazione: l'aggiornamento automatico aspetta

/* ---------- sessioni: lettura robusta (anche quelle vecchie senza dettagli) ---------- */
function rxNum(v){ v=+v; return Number.isFinite(v) ? v : 0; }
function rxValidSession(h){ return !!h && typeof h==="object" && rxNum(h.n)>0 && rxNum(h.t)>0 && !(h.k==="sim" && h.nc); }
function rxStart(h){ const s=rxNum(h.start); return s>0 ? s : rxNum(h.t)-Math.max(0,rxNum(h.sec))*1000; }
function rxGoal(h){
  // obiettivo massimo del test: quello salvato, altrimenti dall'obiettivo in vigore quel giorno (g60), altrimenti quello attuale
  const g=rxNum(h.goal); if(g>0) return g;
  const g60=rxNum(h.g60), n=rxNum(h.n);
  if(g60>0) return Math.max(1, Math.round(g60*n/60));
  return goalFor(n);
}
function rxQ(h){ return Array.isArray(h.q) ? h.q.filter(it=>Array.isArray(it) && Number.isInteger(+it[0]) && +it[0]>=1 && +it[0]<=Q.length) : []; }
function rxCounts(h){
  const n=Math.max(0, Math.round(rxNum(h.n))), q=rxQ(h), has=q.length>0;
  const c={n, ok:Math.min(n, Math.max(0, Math.round(rxNum(h.ok)))), notOk:0, has, q, ans:null, okq:null, err:null, dk:null, nd:null, wrong:null, pct:null};
  if(has){
    c.okq=0; c.err=0; c.dk=0; c.nd=0;
    for(const it of q){ const e=+it[1]; if(e===1) c.okq++; else if(e===-1) c.err++; else if(e===-2) c.dk++; else c.nd++; }
    c.ans=c.okq+c.err+c.dk; c.wrong=c.err+c.dk; c.pct=c.ans ? c.okq/c.ans : null; c.ok=Math.min(n, c.okq);
  }
  c.notOk=n-c.ok;
  return c;
}

/* ---------- giorni di studio (funzione pura, usata anche dalla pagina web) ----------
   sessions: elenco di sessioni come in S.h (si scartano da sole quelle con n=0 e le simulazioni non completate;
   il filtro per materia lo fa chi chiama). Ritorna i giorni dal più recente, raggruppati per giorno di INIZIO del test:
   {key:"YYYY-MM-DD", date:ms mezzanotte locale, weekday:"sabato", first, last (inizio primo/ultimo test, ms), lastEnd,
    tests, n (domande affrontate), ok (giuste), notOk (non giuste), detailTests (test con dettaglio),
    ans (risposte date), okq (giuste nei test con dettaglio), err, dk (non la sapevo), nd (non date), wrong (sbagliate totali),
    pct (okq/ans, null se non ci sono risposte date), sec, avgSec (sec/n), inGoal (test dentro l'obiettivo), cats:[indici categoria]}
   ans/okq/err/dk/nd/wrong valgono null nei giorni con soli test vecchi (senza dettaglio). */
function dailyStats(sessions){
  const map=new Map();
  for(const h of (Array.isArray(sessions) ? sessions : [])){
    if(!rxValidSession(h)) continue;
    const st=rxStart(h), key=dayKey(st), c=rxCounts(h), sec=Math.max(0, rxNum(h.sec)), end=rxNum(h.t);
    let d=map.get(key);
    if(!d){
      const dt=new Date(st); dt.setHours(0,0,0,0);
      d={key, date:dt.getTime(), weekday:dt.toLocaleDateString("it-IT",{weekday:"long"}), first:st, last:st, lastEnd:end,
         tests:0, n:0, ok:0, notOk:0, detailTests:0, ans:0, okq:0, err:0, dk:0, nd:0, wrong:0, pct:null, sec:0, avgSec:null, inGoal:0, cats:new Set()};
      map.set(key, d);
    }
    d.tests++; d.n+=c.n; d.ok+=c.ok; d.notOk+=c.notOk; d.sec+=sec;
    d.first=Math.min(d.first, st); d.last=Math.max(d.last, st); d.lastEnd=Math.max(d.lastEnd, end);
    if(c.has){ d.detailTests++; d.ans+=c.ans; d.okq+=c.okq; d.err+=c.err; d.dk+=c.dk; d.nd+=c.nd; d.wrong+=c.wrong; }
    if(sec<=rxGoal(h)) d.inGoal++;
    const cats = c.has ? c.q.map(it=>Q[+it[0]-1][1]) : (Array.isArray(h.cats) ? h.cats : []);
    for(const ci of cats) d.cats.add(ci);
  }
  return [...map.values()].sort((a,b)=>b.date-a.date).map(d=>{
    const o=Object.assign({}, d, {cats:[...d.cats]});
    o.pct = o.ans ? o.okq/o.ans : null;
    o.avgSec = o.n ? o.sec/o.n : null;
    if(!o.detailTests){ o.ans=null; o.okq=null; o.err=null; o.dk=null; o.nd=null; o.wrong=null; }
    return o;
  });
}

/* ---------- piccoli formati ---------- */
function rxN(v, d){ d=d||0; return Number(v).toLocaleString("it-IT",{minimumFractionDigits:d, maximumFractionDigits:d}); }
const rxPl=(n,s,p)=>n===1 ? s : p;
function rxPctS(fr){ return Math.round(fr*100)+"%"; }
// "il 83%" si scrive "l'83%" (anche 1, 8, 11 e 80-89)
function rxIlPct(fr){ const v=Math.round(fr*100); return (v===0 ? "lo " : v===1 || v===8 || v===11 || (v>=80 && v<=89) ? "l'" : "il ")+v+"%"; }
function rxDur(sec){ sec=Math.max(0, Math.round(sec||0)); if(sec<60) return sec+" s"; const tm=Math.round(sec/60), h=Math.floor(tm/60), mi=tm%60; return h ? `${h} h ${pad2(mi)} min` : `${mi} min`; }
function rxCovS(a){ return a.todo>0 ? Math.min(99, Math.round(a.cov*100))+"%" : rxPctS(a.cov); }
function rxShort(s, n){ s=String(s||"").replace(/\s+/g," ").trim(); return s.length>n ? s.slice(0,n-1).trimEnd()+"…" : s; }
function rxEsc(s){ return String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
// ExcelJS scrive le date in UTC: si passano le cifre locali come se fossero UTC, così Excel mostra l'ora italiana giusta
function rxXDate(t){ const d=new Date(t); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); }
function rxXDateTime(t){ const d=new Date(t); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds())); }
// "il 11/10" si scrive "l'11/10" (anche dall', all'): vale per i giorni 1, 8 e 11
function rxArt(prep, t){ const d=new Date(t).getDate(); return d===1 || d===8 || d===11 ? {il:"l'", dal:"dall'", al:"all'"}[prep]+dmy(t) : prep+" "+dmy(t); }
function rxCatNames(cis, catNo){ return [...new Set(cis||[])].filter(ci=>CONT[ci]!=null).sort((a,b)=>(catNo.get(a)||999)-(catNo.get(b)||999)).map(ci=>CONT[ci]).join("; "); }
function rxSelText(h, G){
  // sezioni scelte prima di iniziare: null = tutte; assente = dato non salvato
  if(h.selC===null) return "Tutte";
  if(!Array.isArray(h.selC) || !h.selC.length) return "";
  const selS=Array.isArray(h.selS) ? new Set(h.selS) : null, parts=[], done=new Set();
  for(const g of G){
    if(!h.selC.includes(g.ci)) continue; done.add(g.ci);
    const picked=selS ? g.subs.filter(s=>selS.has(s.si)) : [];
    parts.push(!picked.length || picked.length===g.subs.length ? `${CONT[g.ci]} (tutta)` : `${CONT[g.ci]}: ${picked.map(s=>SUB[s.si]||"—").join(", ")}`);
  }
  for(const ci of h.selC) if(!done.has(ci) && CONT[ci]!=null) parts.push(CONT[ci]);
  return parts.join("; ");
}
function rxTitle(h){ return String(h.title||"").replace(/ \(interrotto\)$/,"") + (h.cut ? " (interrotto)" : ""); }

/* ---------- raccolta dei dati del report (solo lettura) ---------- */
function rxCollect(){
  const m=ONLY, now=Date.now(), ids=BY_MAT[m].slice(), G=groupsOf(m), goalNow=goal60();
  const SM=(S && S.m && S.m[m] && typeof S.m[m]==="object") ? S.m[m] : {};
  const H=(S && Array.isArray(S.h)) ? S.h : [];
  const rec=n=>{ const r=SM[n]; if(!Array.isArray(r)) return null; const seen=Math.max(0, Math.round(rxNum(r[0]))); return seen ? {seen, ok:Math.min(seen, Math.max(0, Math.round(rxNum(r[1])))), last:r[2] ? 1 : 0} : null; };
  const pos=new Map(ids.map((n,i)=>[n,i+1])), catNo=new Map(G.map((g,i)=>[g.ci,i+1]));

  // test della materia, come nell'app: niente simulazioni (le sessioni vecchie senza ms valgono per la materia), in ordine di inizio
  const sess=H.filter(h=>rxValidSession(h) && h.k!=="sim" && (!Array.isArray(h.ms) || !h.ms.length || h.ms.includes(m)))
    .slice().sort((a,b)=>rxStart(a)-rxStart(b) || rxNum(a.t)-rxNum(b.t));
  const tests=sess.map((h,i)=>{
    const c=rxCounts(h), st=rxStart(h), sec=Math.max(0, rxNum(h.sec)), goal=rxGoal(h);
    const qm=c.q.filter(it=>Q[+it[0]-1][0]===m);
    const cats=c.has ? [...new Set(c.q.map(it=>Q[+it[0]-1][1]))] : (Array.isArray(h.cats) ? h.cats.slice() : []);
    return Object.assign(c, {no:i+1, h, start:st, end:rxNum(h.t), sec, goal, inGoal:sec<=goal, spq:c.n ? sec/c.n : null, qm, cats});
  });
  const T={tests:tests.length, n:0, ok:0, notOk:0, sec:0, inGoal:0, detailTests:0, oldTests:0, ans:0, okq:0, err:0, dk:0, nd:0, wrong:0};
  for(const t of tests){
    T.n+=t.n; T.ok+=t.ok; T.notOk+=t.notOk; T.sec+=t.sec; if(t.inGoal) T.inGoal++;
    if(t.has){ T.detailTests++; T.ans+=t.ans; T.okq+=t.okq; T.err+=t.err; T.dk+=t.dk; T.nd+=t.nd; T.wrong+=t.wrong; } else T.oldTests++;
  }
  T.pct = T.ans ? T.okq/T.ans : null;
  T.spq = T.n ? T.sec/T.n : null;
  const days=dailyStats(sess);

  // per domanda, dai test con dettaglio: secondi spesi e "non la sapevo"
  const qd=new Map();
  for(const t of tests) for(const it of t.qm){
    const n=+it[0]; let s=qd.get(n); if(!s){ s={secSum:0, secN:0, dk:0}; qd.set(n,s); }
    if(it[2]!=null && Number.isFinite(+it[2])){ s.secSum+=+it[2]; s.secN++; }
    if(+it[1]===-2) s.dk++;
  }
  const inTest=(t,ci,si)=> t.has
    ? t.qm.some(it=>{ const q=Q[+it[0]-1]; return q[1]===ci && (si==null || q[2]===si); })
    : t.cats.includes(ci) && (si==null || (Array.isArray(t.h.subs) && t.h.subs.includes(si)));
  const agg=(list, ci, si)=>{
    let seen=0, okL=0, wrL=0, att=0, cor=0, secSum=0, secN=0, dk=0;
    for(const n of list){
      const r=rec(n); if(r){ seen++; att+=r.seen; cor+=r.ok; if(r.last) okL++; else wrL++; }
      const s=qd.get(n); if(s){ secSum+=s.secSum; secN+=s.secN; dk+=s.dk; }
    }
    const tot=list.length;
    return {tot, seen, todo:tot-seen, okL, wrL, att, cor, acc:att ? cor/att : null, prep:tot ? Math.round(okL/tot*100) : 0, cov:tot ? seen/tot : 0,
      tests: ci==null ? tests.length : tests.filter(t=>inTest(t,ci,si)).length, avgSec:secN ? secSum/secN : null, dk};
  };
  const cats=G.map((g,i)=>Object.assign(agg(g.ids, g.ci, null), {no:i+1, ci:g.ci, name:CONT[g.ci]}));
  const subs=[]; G.forEach((g,i)=>g.subs.forEach(s=>subs.push(Object.assign(agg(s.ids, g.ci, s.si), {cno:i+1, ci:g.ci, si:s.si, cat:CONT[g.ci], name:SUB[s.si]||"(senza sottocategoria)"}))));
  const total=agg(ids, null, null);

  const questions=[];
  G.forEach(g=>g.subs.forEach(s=>s.ids.forEach(n=>{ const q=Q[n-1]; questions.push({n, pos:pos.get(n), cat:CONT[q[1]], sub:SUB[q[2]]||"", lvl:q[3], prat:q[9] ? 1 : 0, text:q[4], ans:q[5], r:rec(n)}); })));
  const errors=questions.filter(x=>x.r && x.r.seen>x.r.ok).map(x=>Object.assign({}, x, {wrong:x.r.seen-x.r.ok}))
    .sort((a,b)=>b.wrong-a.wrong || a.r.last-b.r.last || b.wrong/b.r.seen-a.wrong/a.r.seen || a.pos-b.pos);
  const toReview=questions.filter(x=>x.r && !x.r.last).length;

  // ultimi 14 giorni (oggi compreso) per i grafici giornalieri
  const byKey=new Map(days.map(d=>[d.key,d])), last14=[];
  for(let i=13;i>=0;i--){
    const d=new Date(now); d.setHours(12,0,0,0); d.setDate(d.getDate()-i);
    const x=byKey.get(dayKey(d.getTime()));
    last14.push({lab:pad2(d.getDate())+"/"+pad2(d.getMonth()+1), wd:d.toLocaleDateString("it-IT",{weekday:"short"}).replace(".",""), today:i===0,
      tests:x ? x.tests : 0, ok:x ? x.ok : 0, nd:x && x.nd ? x.nd : 0, wrong:x ? x.notOk-(x.nd||0) : 0});
  }
  const sto=(typeof store!=="undefined" && store) ? store : {};
  const D={now, m, ids, G, pos, catNo, goal60:goalNow, tests, T, days, last14, cats, subs, total, questions, errors, toReview,
    account: sto.code ? String(sto.code).slice(0,4) : "non collegato",
    sync: sto.online && sto.lastSync ? `${dmy(sto.lastSync)} alle ${hm(sto.lastSync)}` : "non sincronizzato"};
  D.insights=rxInsights(D);
  return D;
}

/* ---------- "Cosa dicono i tuoi dati": frasi brevi ricavate solo dai numeri ---------- */
function rxInsights(D){
  const out=[], T=D.T, gq=D.goal60/60, tot=D.total;
  out.push(tot.seen
    ? `Copertura: hai risposto almeno una volta a ${tot.seen} ${rxPl(tot.seen,"domanda","domande")} su ${tot.tot} (${rxCovS(tot)}); ${tot.todo===1 ? "ne resta 1 mai fatta" : `ne restano ${tot.todo} mai fatte`}. Livello di preparazione: ${tot.prep}/100.`
    : `Non hai ancora risposto a nessuna delle ${tot.tot} domande: sono tutte da fare.`);
  if(T.tests){
    const lt=D.tests[D.tests.length-1], nd=D.days.length;
    out.push(`Hai studiato in ${nd} ${nd===1?"giorno":"giorni diversi"} per ${rxDur(T.sec)} in ${T.tests} test; l'ultimo è iniziato ${rxArt("il", lt.start)} alle ${hm(lt.start)}.`);
  } else out.push("Non hai ancora fatto nessun test: grafici e tabelle si riempiono man mano che ti alleni.");
  if(T.n){
    const d=T.spq-gq, rel=Math.abs(d)<0.05 ? "in linea" : d>0 ? `${rxN(d,1)} s sopra` : `${rxN(-d,1)} s sotto`;
    out.push(`Tempo: in media ${rxN(T.spq,1)} s per domanda, contro un obiettivo di ${rxN(gq,1)} s (${D.goal60} s ogni 60 domande): sei ${rel}. Dentro l'obiettivo in ${T.inGoal} test su ${T.tests} (${rxPctS(T.inGoal/T.tests)}).`);
  }
  const tp=D.tests.filter(t=>t.pct!=null);
  const ratio=l=>{ const a=l.reduce((s,t)=>s+t.ans,0); return a ? l.reduce((s,t)=>s+t.okq,0)/a : null; };
  const spq=l=>{ const n=l.reduce((s,t)=>s+t.n,0); return n ? l.reduce((s,t)=>s+t.sec,0)/n : null; };
  if(tp.length>=6){
    const last=tp.slice(-5), prev=tp.slice(-10,-5), a=ratio(last), b=ratio(prev), diff=Math.round(a*100)-Math.round(b*100);
    const sl=spq(last), sp=spq(prev), pv=prev.length===1 ? "del test precedente" : `dei ${prev.length} precedenti`;
    const dv=diff ? (diff>0?"+":"")+diff+" "+rxPl(Math.abs(diff),"punto","punti") : "invariato";
    out.push(`Andamento: negli ultimi 5 test hai ${rxIlPct(a)} di risposte giuste, contro ${rxIlPct(b)} ${pv} (${dv})${sl!=null&&sp!=null?`; il tempo per domanda passa da ${rxN(sp,1)} a ${rxN(sl,1)} s`:""}.`);
  } else if(tp.length){
    const t=tp[tp.length-1];
    out.push(`Ultimo test con dettaglio (n. ${t.no}, ${dmy(t.start)}): ${t.okq} ${rxPl(t.okq,"giusta","giuste")} su ${t.ans} ${rxPl(t.ans,"risposta data","risposte date")}, ${rxIlPct(t.pct)}.`);
  }
  const rated=D.cats.filter(c=>c.att>=5 && c.acc!=null).sort((a,b)=>a.acc-b.acc || b.att-a.att);
  if(rated.length>=2 && Math.round(rated[0].acc*100)===Math.round(rated[rated.length-1].acc*100)){
    out.push(`Le ${rated.length} categorie con almeno 5 risposte date sono tutte ${rxIlPct(rated[0].acc).replace(/^il /,"al ").replace(/^lo /,"allo ").replace(/^l'/,"all'")} di risposte giuste: nessuna più debole delle altre.`);
  } else if(rated.length>=2){
    const w=rated[0], s=rated[rated.length-1];
    out.push(`Categoria più debole: «${w.name}», con ${rxIlPct(w.acc)} di risposte giuste su ${w.att} date.`);
    out.push(`Categoria più forte: «${s.name}», con ${rxIlPct(s.acc)} su ${s.att} risposte date.`);
  } else if(rated.length===1){
    out.push(`Solo «${rated[0].name}» ha almeno 5 risposte date (${rxPctS(rated[0].acc)} giuste su ${rated[0].att}): ancora nessun confronto tra categorie.`);
  } else if(tot.att){
    out.push(`Nessuna categoria ha ancora 5 risposte date (in tutto ne hai ${tot.att}): troppo poche per dire dove sei più debole.`);
  }
  if(T.detailTests && T.ans){
    if(T.dk){
      const top=D.cats.filter(c=>c.dk>0).sort((a,b)=>b.dk-a.dk)[0];
      out.push(`Hai risposto «Non la so» ${T.dk} ${T.dk===1?"volta":"volte"} su ${T.ans} risposte date (${rxPctS(T.dk/T.ans)})${top?`, più spesso in «${top.name}» (${top.dk})`:""}.`);
    } else out.push(T.detailTests===1 ? "Non hai usato «Non la so» nell'unico test con dettaglio." : `Non hai mai usato «Non la so» ${String(T.detailTests)[0]==="8"||T.detailTests===11?"negli":"nei"} ${T.detailTests} test con dettaglio.`);
  }
  const top3=D.errors.slice(0,3);
  if(top3.length) out.push(`${top3.length===1?"La domanda sbagliata più spesso":"Le "+top3.length+" domande sbagliate più spesso"}: ${top3.map(e=>`n. ${e.pos} «${rxShort(e.text,60)}» (${e.wrong} su ${e.r.seen})`).join("; ")}.`);
  if(D.toReview) out.push(`${D.toReview} ${D.toReview===1?"domanda ha":"domande hanno"} l'ultima risposta sbagliata: sono nel foglio «Errori» con stato «Ancora da ripassare».`);
  else if(tot.seen) out.push(tot.seen===1 ? "Nessuna domanda da ripassare: l'ultima risposta dell'unica domanda fatta è giusta." : `Nessuna domanda da ripassare: l'ultima risposta di tutte le ${tot.seen} domande fatte è giusta.`);
  const next=D.cats.filter(c=>c.todo>0).sort((a,b)=>b.todo-a.todo || (a.acc==null?1:a.acc)-(b.acc==null?1:b.acc))[0];
  if(next) out.push(`Prossimo passo consigliato: «${next.name}», la categoria con più domande ancora da fare (${next.todo} su ${next.tot}).`);
  else if(D.toReview) out.push(`Hai fatto tutte le ${tot.tot} domande: prossimo passo, ${D.toReview===1 ? "ripassare quella con l'ultima risposta sbagliata" : `ripassare le ${D.toReview} con l'ultima risposta sbagliata`}.`);
  return out;
}

/* ================= grafici: canvas 2D a scala 2x, inseriti come PNG ================= */
function rxCanvas(w, h){
  const c=document.createElement("canvas"); c.width=Math.round(w*2); c.height=Math.round(h*2);
  const x=c.getContext("2d"); x.scale(2,2);
  x.fillStyle="#FFFFFF"; x.fillRect(0,0,w,h);
  x.strokeStyle="#E0E0E0"; x.lineWidth=1; rxRR(x,0.5,0.5,w-1,h-1,10); x.stroke();
  return {c, x, w, h};
}
function rxRR(x, X, Y, W, H, r){
  r=Math.max(0, Math.min(r, W/2, H/2));
  x.beginPath(); x.moveTo(X+r,Y); x.lineTo(X+W-r,Y); x.arcTo(X+W,Y,X+W,Y+r,r); x.lineTo(X+W,Y+H-r); x.arcTo(X+W,Y+H,X+W-r,Y+H,r);
  x.lineTo(X+r,Y+H); x.arcTo(X,Y+H,X,Y+H-r,r); x.lineTo(X,Y+r); x.arcTo(X,Y,X+r,Y,r); x.closePath();
}
function rxF(x, size, weight){ x.font=`${weight||"normal"} ${size}px ${RX_FONT}`; }
function rxText(x, s, X, Y, o){
  o=o||{}; rxF(x, o.size||12, o.weight);
  x.textAlign=o.align||"left"; x.textBaseline=o.base||"alphabetic";
  if(o.halo){ x.lineWidth=4; x.lineJoin="round"; x.strokeStyle="#FFFFFF"; x.strokeText(s,X,Y); }
  x.fillStyle=o.color||RX_HEX.text; x.fillText(s,X,Y);
}
function rxFit(x, s, maxW){ s=String(s); if(x.measureText(s).width<=maxW) return s; while(s.length>1 && x.measureText(s+"…").width>maxW) s=s.slice(0,-1); return s.trimEnd()+"…"; }
function rxWrap(x, s, maxW, maxLines){
  const words=String(s).split(/\s+/), lines=[]; let cur="";
  for(const w of words){ const t=cur ? cur+" "+w : w; if(!cur || x.measureText(t).width<=maxW) cur=t; else { lines.push(cur); cur=w; } }
  if(cur) lines.push(cur);
  if(lines.length>maxLines){ const keep=lines.slice(0,maxLines); keep[maxLines-1]=rxFit(x, lines.slice(maxLines-1).join(" "), maxW); return keep; }
  return lines.map(l=>rxFit(x,l,maxW));
}
function rxHead(k, title, sub){
  rxText(k.x, title, 20, 30, {size:16, weight:"bold"});
  if(sub){ rxF(k.x,12); rxText(k.x, rxFit(k.x, sub, k.w-40), 20, 50, {size:12, color:RX_HEX.muted}); }
  return 64;
}
function rxLegend(k, items, y){
  // legenda allineata a destra sulla riga del titolo
  const x=k.x; let X=k.w-20;
  for(const it of items.slice().reverse()){
    rxF(x,12); const tw=x.measureText(it.label).width; X-=tw;
    rxText(x, it.label, X, y, {size:12, color:RX_HEX.muted, base:"middle"});
    X-=18;
    if(it.dash){ x.save(); x.setLineDash([5,3]); x.strokeStyle=it.color; x.lineWidth=2; x.beginPath(); x.moveTo(X,y); x.lineTo(X+14,y); x.stroke(); x.restore(); }
    else { x.fillStyle=it.color; rxRR(x,X+1,y-6,12,12,3); x.fill(); }
    X-=14;
  }
}
function rxEmpty(k, top, hint){
  const x=k.x, X=20, Y=top+4, W=k.w-40, H=k.h-Y-20;
  x.fillStyle="#FAFAFA"; rxRR(x,X,Y,W,H,10); x.fill();
  x.save(); x.setLineDash([6,5]); x.strokeStyle="#C8C8C8"; x.lineWidth=1.2; rxRR(x,X,Y,W,H,10); x.stroke(); x.restore();
  rxText(x, "Ancora nessun dato", X+W/2, Y+H/2-(hint?8:0), {size:16, weight:"bold", color:"#9E9E9E", align:"center", base:"middle"});
  if(hint) rxText(x, hint, X+W/2, Y+H/2+16, {size:12, color:"#9E9E9E", align:"center", base:"middle"});
  return k.c.toDataURL("image/png");
}
function rxTicks(maxV, target, ints){
  // scala "tonda": passo 1/2/2,5/5/10 × 10^k
  target=target||5; if(!(maxV>0)) maxV=1;
  const raw=maxV/target, p=Math.pow(10, Math.floor(Math.log10(raw))), f=raw/p;
  let step=(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p;
  if(ints) step=Math.max(1, Math.round(step));
  return {step, top:Math.ceil(maxV/step-1e-9)*step};
}
function rxToneHex(fr){ const v=Math.round(fr*100); return v>=80 ? RX_HEX.green : v>=60 ? RX_HEX.orange : RX_HEX.red; }

// linea per test: un asse y, linea tratteggiata di riferimento, etichette di valore
function rxChartLine(o){
  const k=rxCanvas(o.w,o.h), x=k.x, top=rxHead(k, o.title, o.sub), sc=o.scale;
  const leg=(o.legend||[]).concat(o.ref!=null && o.ref<=sc.top ? [{label:o.refLabel, color:"#757575", dash:true}] : []);
  if(leg.length) rxLegend(k, leg, 30);
  if(!o.pts.length) return rxEmpty(k, top, o.hint);
  const L=58, R=26, Tp=top+18, B=o.h-46, iw=o.w-L-R, ih=B-Tp, n=o.pts.length;
  const Y=v=>B-Math.max(0, Math.min(v, sc.top))/sc.top*ih;
  const X=i=> n===1 ? L+iw/2 : L+12+i*(iw-24)/(n-1);
  for(let v=0; v<=sc.top+1e-9; v+=sc.step){
    const yy=Math.round(Y(v))+0.5; x.strokeStyle=v===0 ? RX_HEX.axis : RX_HEX.grid; x.lineWidth=1;
    x.beginPath(); x.moveTo(L,yy); x.lineTo(L+iw,yy); x.stroke();
    rxText(x, o.yFmt(v), L-8, yy, {size:11, color:RX_HEX.muted, align:"right", base:"middle"});
  }
  if(n>1){
    x.beginPath(); x.moveTo(X(0),Y(0)); o.pts.forEach((p,i)=>x.lineTo(X(i),Y(p.y))); x.lineTo(X(n-1),Y(0)); x.closePath();
    x.globalAlpha=0.08; x.fillStyle=o.color; x.fill(); x.globalAlpha=1;
  }
  if(o.ref!=null && o.ref<=sc.top){
    const yy=Y(o.ref); x.save(); x.setLineDash([7,5]); x.strokeStyle="#757575"; x.lineWidth=1.5;
    x.beginPath(); x.moveTo(L,yy); x.lineTo(L+iw,yy); x.stroke(); x.restore();
  }
  if(n>1){ x.beginPath(); o.pts.forEach((p,i)=> i ? x.lineTo(X(i),Y(p.y)) : x.moveTo(X(i),Y(p.y))); x.strokeStyle=o.color; x.lineWidth=2.5; x.lineJoin="round"; x.stroke(); }
  const r=n>30 ? 3 : 4.5;
  o.pts.forEach((p,i)=>{ x.beginPath(); x.arc(X(i),Y(p.y),r,0,Math.PI*2); x.fillStyle=p.color||o.color; x.fill(); x.lineWidth=1.5; x.strokeStyle="#FFFFFF"; x.stroke(); });
  const all=n<=15;
  o.pts.forEach((p,i)=>{ if(all || i===n-1) rxText(x, o.vFmt(p.y), X(i), Y(p.y)-11, {size:11, weight:"bold", color:p.color||o.color, align:"center", halo:true}); });
  const every=Math.ceil(n/Math.max(2, Math.floor(iw/40)));
  o.pts.forEach((p,i)=>{ if(i===n-1 || (i%every===0 && n-1-i>=every/2)) rxText(x, p.lab, X(i), B+16, {size:11, color:RX_HEX.muted, align:"center"}); });
  if(o.xTitle) rxText(x, o.xTitle, L+iw/2, o.h-10, {size:11, color:RX_HEX.muted, align:"center"});
  return k.c.toDataURL("image/png");
}
// barre verticali (anche impilate) per giorno
function rxChartBars(o){
  const k=rxCanvas(o.w,o.h), x=k.x, top=rxHead(k, o.title, o.sub);
  if(o.legend) rxLegend(k, o.legend, 30);
  const tots=o.cols.map(c=>c.vals.reduce((a,b)=>a+b,0));
  if(!tots.some(v=>v>0)) return rxEmpty(k, top, o.hint);
  const L=48, R=18, Tp=top+20, B=o.h-46, iw=o.w-L-R, ih=B-Tp, n=o.cols.length, slot=iw/n, bw=Math.min(30, slot*0.62);
  const sc=rxTicks(Math.max(...tots), 4, true), Y=v=>v/sc.top*ih;
  for(let v=0; v<=sc.top+1e-9; v+=sc.step){
    const yy=Math.round(B-Y(v))+0.5; x.strokeStyle=v===0 ? RX_HEX.axis : RX_HEX.grid; x.lineWidth=1;
    x.beginPath(); x.moveTo(L,yy); x.lineTo(L+iw,yy); x.stroke();
    rxText(x, rxN(v), L-8, yy, {size:11, color:RX_HEX.muted, align:"right", base:"middle"});
  }
  o.cols.forEach((c,i)=>{
    const cx=L+slot*(i+0.5); let y0=B; const cuts=[];
    c.vals.forEach((v,s)=>{ if(!v) return; const hh=Y(v); x.fillStyle=o.colors[s]; x.fillRect(cx-bw/2, y0-hh, bw, hh); y0-=hh; cuts.push(y0); });
    cuts.pop(); x.fillStyle="#FFFFFF"; cuts.forEach(yc=>x.fillRect(cx-bw/2, yc-0.75, bw, 1.5));
    if(tots[i]) rxText(x, rxN(tots[i]), cx, y0-6, {size:11, weight:"bold", color:"#424242", align:"center"});
    rxText(x, c.wd, cx, B+15, {size:10.5, weight:c.today?"bold":"normal", color:c.today?RX_HEX.text:RX_HEX.muted, align:"center"});
    rxText(x, c.lab, cx, B+29, {size:10.5, weight:c.today?"bold":"normal", color:c.today?RX_HEX.text:RX_HEX.muted, align:"center"});
  });
  return k.c.toDataURL("image/png");
}
// barre orizzontali: % giuste per categoria (dalla più debole)
function rxChartCats(o){
  const k=rxCanvas(o.w,o.h), x=k.x, top=rxHead(k, o.title, o.sub);
  if(!o.rows.some(r=>r.acc!=null)) return rxEmpty(k, top, o.hint);
  const labW=Math.round(o.w*0.36), L=20+labW+12, R=112, Tp=top+26, iw=o.w-L-R, rowH=o.rowH, n=o.rows.length, bot=Tp+n*rowH;
  for(let v=0; v<=100; v+=20){
    const xx=Math.round(L+v/100*iw)+0.5; x.strokeStyle=v===0 ? RX_HEX.axis : RX_HEX.grid; x.lineWidth=1;
    x.beginPath(); x.moveTo(xx,Tp-4); x.lineTo(xx,bot); x.stroke();
    rxText(x, v+"%", xx, Tp-10, {size:10.5, color:RX_HEX.muted, align:"center"});
  }
  o.rows.forEach((r,i)=>{
    const cy=Tp+i*rowH+rowH/2;
    rxF(x,12); const lines=rxWrap(x, r.name, labW, 2);
    lines.forEach((ln,j)=>rxText(x, ln, 20, cy+(j-(lines.length-1)/2)*14, {size:12, color:RX_HEX.text, base:"middle"}));
    x.fillStyle="#F2F2F2"; rxRR(x,L,cy-8,iw,16,4); x.fill();
    if(r.acc!=null){
      const col=rxToneHex(r.acc); x.fillStyle=col; rxRR(x,L,cy-8,Math.max(4,r.acc*iw),16,4); x.fill();
      const s1=rxPctS(r.acc); rxText(x, s1, L+iw+10, cy, {size:12, weight:"bold", color:col, base:"middle"});
      rxF(x,12,"bold"); const w1=x.measureText(s1).width;
      rxText(x, ` · ${r.att} risp.`, L+iw+10+w1, cy, {size:11, color:RX_HEX.muted, base:"middle"});
    } else rxText(x, "mai fatta", L+iw+10, cy, {size:12, color:RX_HEX.grey, base:"middle"});
  });
  const x80=L+0.8*iw; x.save(); x.setLineDash([6,4]); x.strokeStyle="#757575"; x.lineWidth=1.3;
  x.beginPath(); x.moveTo(x80,Tp-4); x.lineTo(x80,bot); x.stroke(); x.restore();
  rxText(x, "Verde da 80%, arancio 60–79%, rosso sotto 60%, grigio se mai fatta. Tratteggio: soglia 80%.", 20, o.h-16, {size:11, color:RX_HEX.muted});
  return k.c.toDataURL("image/png");
}
// barre orizzontali impilate: domande fatte vs da fare per categoria
function rxChartCover(o){
  const k=rxCanvas(o.w,o.h), x=k.x, top=rxHead(k, o.title, o.sub);
  rxLegend(k, [{label:"Fatte", color:RX_HEX.blue}, {label:"Da fare", color:"#CFCFCF"}], 30);
  if(!o.rows.some(r=>r.seen>0)) return rxEmpty(k, top, o.hint);
  const labW=Math.round(o.w*0.36), L=20+labW+12, R=112, Tp=top+26, iw=o.w-L-R, rowH=o.rowH, n=o.rows.length, bot=Tp+n*rowH;
  const sc=rxTicks(Math.max(...o.rows.map(r=>r.tot)), 5, true), Xv=v=>v/sc.top*iw;
  for(let v=0; v<=sc.top+1e-9; v+=sc.step){
    const xx=Math.round(L+Xv(v))+0.5; x.strokeStyle=v===0 ? RX_HEX.axis : RX_HEX.grid; x.lineWidth=1;
    x.beginPath(); x.moveTo(xx,Tp-4); x.lineTo(xx,bot); x.stroke();
    rxText(x, rxN(v), xx, Tp-10, {size:10.5, color:RX_HEX.muted, align:"center"});
  }
  o.rows.forEach((r,i)=>{
    const cy=Tp+i*rowH+rowH/2;
    rxF(x,12); const lines=rxWrap(x, r.name, labW, 2);
    lines.forEach((ln,j)=>rxText(x, ln, 20, cy+(j-(lines.length-1)/2)*14, {size:12, color:RX_HEX.text, base:"middle"}));
    x.fillStyle="#CFCFCF"; rxRR(x,L,cy-8,Math.max(4,Xv(r.tot)),16,4); x.fill();
    if(r.seen){ x.fillStyle=RX_HEX.blue; rxRR(x,L,cy-8,Math.max(4,Xv(r.seen)),16,4); x.fill(); }
    const s1=`${r.seen}/${r.tot}`; rxText(x, s1, L+iw+10, cy, {size:12, weight:"bold", color:RX_HEX.blue, base:"middle"});
    rxF(x,12,"bold"); const w1=x.measureText(s1).width;
    rxText(x, ` · ${r.tot-r.seen} da fare`, L+iw+10+w1, cy, {size:11, color:RX_HEX.muted, base:"middle"});
  });
  rxText(x, "Asse: numero di domande. Fatte = con almeno una risposta.", 20, o.h-16, {size:11, color:RX_HEX.muted});
  return k.c.toDataURL("image/png");
}
function rxDrawCharts(D){
  const W=RX_CHART_W, out={}, gq=D.goal60/60;
  const withPct=D.tests.filter(t=>t.pct!=null), lp=withPct.slice(-40), old=D.tests.filter(t=>!t.has).length, noAns=D.tests.filter(t=>t.has && t.pct==null).length;
  out.perf={w:W, h:320, url:rxChartLine({w:W, h:320, title:"Risposte giuste per test",
    sub:`% di giuste sulle risposte date${withPct.length>40?" · ultimi 40 test":""}${old?` · ${old} test senza dettaglio ${rxPl(old,"escluso","esclusi")}`:""}${noAns?` · ${noAns} test senza risposte date ${rxPl(noAns,"escluso","esclusi")}`:""}`,
    pts:lp.map(t=>({lab:String(t.no), y:Math.round(t.pct*100), color:Math.round(t.pct*100)>=80 ? RX_HEX.green : RX_HEX.red})),
    scale:{step:20, top:100}, yFmt:v=>v+"%", vFmt:v=>v+"%", ref:80, refLabel:"soglia 80%", color:RX_HEX.green,
    xTitle:"N. del test (foglio «Test fatti»)", hint:"Fai un test per vedere l'andamento"})};
  const ls=D.tests.slice(-40), sMax=Math.max(gq, ...ls.map(t=>t.spq||0)), ssc=rxTicks(sMax*1.15, 5);
  out.speed={w:W, h:320, url:rxChartLine({w:W, h:320, title:"Secondi per domanda",
    sub:`Durata ÷ domande affrontate in ogni test${D.tests.length>40?" · ultimi 40 test":""}`,
    pts:ls.map(t=>({lab:String(t.no), y:Math.round(t.spq*10)/10})),
    scale:ssc, yFmt:v=>rxN(v, Number.isInteger(ssc.step)?0:1)+" s", vFmt:v=>rxN(v, v<10?1:0)+" s", ref:gq, refLabel:`obiettivo ${rxN(gq,1)} s`, color:RX_HEX.blue,
    xTitle:"N. del test (foglio «Test fatti»)", hint:"Fai un test per vedere i tuoi tempi"})};
  out.days={w:W, h:300, url:rxChartBars({w:W, h:300, title:"Domande al giorno", sub:"Ultimi 14 giorni, per giorno di inizio del test",
    legend:[{label:"Giuste", color:RX_HEX.green}, {label:"Sbagliate", color:RX_HEX.red}, {label:"Non date", color:RX_HEX.grey}],
    cols:D.last14.map(d=>({lab:d.lab, wd:d.wd, today:d.today, vals:[d.ok, d.wrong, d.nd]})), colors:[RX_HEX.green, RX_HEX.red, RX_HEX.grey],
    hint:"Nessun test negli ultimi 14 giorni"})};
  out.tests={w:W, h:300, url:rxChartBars({w:W, h:300, title:"Test al giorno", sub:"Numero di test iniziati ogni giorno, ultimi 14 giorni",
    cols:D.last14.map(d=>({lab:d.lab, wd:d.wd, today:d.today, vals:[d.tests]})), colors:[RX_HEX.blue], hint:"Nessun test negli ultimi 14 giorni"})};
  const rowH=36, hc=64+26+D.cats.length*rowH+34;
  const catRows=D.cats.slice().sort((a,b)=>(a.acc==null)-(b.acc==null) || (a.acc||0)-(b.acc||0) || b.att-a.att).map(c=>({name:c.name, acc:c.acc, att:c.att}));
  out.cats={w:W, h:hc, url:rxChartCats({w:W, h:hc, rowH, title:"Categorie: % di risposte giuste", sub:"Su tutte le risposte date, dalla categoria più debole", rows:catRows, hint:"Rispondi a qualche domanda per vedere le categorie"})};
  const covRows=D.cats.slice().sort((a,b)=>b.todo-a.todo || a.no-b.no).map(c=>({name:c.name, seen:c.seen, tot:c.tot}));
  out.cover={w:W, h:hc, url:rxChartCover({w:W, h:hc, rowH, title:"Copertura per categoria", sub:"Domande fatte e da fare, da dove ne restano di più", rows:covRows, hint:"Nessuna domanda ancora fatta"})};
  return out;
}

/* ================= fogli Excel ================= */
function rxFill(argb){ return {type:"pattern", pattern:"solid", fgColor:{argb}}; }
function rxBorder(argb, topStyle){ const s={style:"thin", color:{argb:argb||RX_ARGB.border}}; return {top:topStyle ? {style:topStyle, color:{argb:RX_ARGB.green}} : s, left:s, bottom:s, right:s}; }
function rxPaint(cell, tone, withFill){
  const fg={green:RX_ARGB.green, red:RX_ARGB.red, orange:RX_ARGB.orange, grey:RX_ARGB.grey, blue:RX_ARGB.blue}[tone]||RX_ARGB.text;
  cell.font={size:11, bold:true, color:{argb:fg}};
  if(withFill) cell.fill=rxFill(RX_TINT[tone]||RX_TINT.grey);
}
function rxPctTone(fr){ const v=Math.round(fr*100); return v>=80 ? "green" : v>=60 ? "orange" : "red"; }
const rxPaintPct = (c,v)=>{ if(typeof v==="number") rxPaint(c, rxPctTone(v), false); };
const rxPaintPrep = (c,v)=>{ if(typeof v==="number") rxPaint(c, rxPctTone(v/100), false); };
const rxPaintYes = (c,v)=>rxPaint(c, v==="Sì" ? "green" : "red", true);
function rxLines(s, per){
  // righe occupate da un testo a capo automatico, andando a capo tra le parole come fa Excel
  let n=0;
  for(const para of String(s).split("\n")){ let cur=0, l=1;
    for(const w of para.split(/\s+/).filter(Boolean)){ const len=w.length; if(!cur) cur=len; else if(cur+1+len<=per) cur+=1+len; else { l++; cur=len; } while(cur>per){ l++; cur-=per; } }
    n+=l; }
  return Math.max(1, n);
}
function rxRowHeight(vals, cols){
  // stima delle righe di testo nelle colonne a capo automatico (Excel non adatta da solo l'altezza dei file generati)
  let lines=1;
  cols.forEach((c,j)=>{ if(!c.wrap) return; const v=vals[j]; if(v==null || v==="") return;
    lines=Math.max(lines, rxLines(v, Math.max(6, Math.floor(c.w*1.05)))); });
  return lines>1 ? Math.min(409, lines*14.5+5) : null;
}
function rxTable(wb, name, cols, rows, o){
  // tabella: intestazione bianca su verde, righe alternate, bordi sottili, riga 1 bloccata, filtro, formati numerici
  o=o||{};
  const ws=wb.addWorksheet(name, {properties:{tabColor:{argb:o.tab||RX_ARGB.green}},
    views:[{state:"frozen", xSplit:o.xSplit||0, ySplit:1, activeCell:"A2", zoomScale:100}],
    pageSetup:{orientation:"landscape", paperSize:9, fitToPage:true, fitToWidth:1, fitToHeight:0}});
  ws.columns=cols.map(c=>({header:c.h, width:c.w}));
  const head=ws.getRow(1); head.height=o.headH||Math.max(34, Math.max(...cols.map(c=>rxLines(c.h, Math.max(4, Math.floor(c.w*0.9)))))*15+6);
  cols.forEach((c,j)=>{ const cell=head.getCell(j+1);
    cell.font={bold:true, size:11, color:{argb:RX_ARGB.white}}; cell.fill=rxFill(RX_ARGB.green);
    cell.alignment={vertical:"middle", horizontal:"center", wrapText:true}; cell.border=rxBorder(RX_ARGB.greenDark); });
  const add=(vals, i, total)=>{
    const row=ws.addRow(vals.map(v=>v===undefined || v==="" ? null : v));
    cols.forEach((c,j)=>{
      const cell=row.getCell(j+1), v=vals[j];
      cell.font={size:11, bold:!!total, color:{argb:RX_ARGB.text}};
      cell.alignment={vertical:"middle", horizontal:c.al || (typeof v==="number" || v instanceof Date ? "right" : "left"), wrapText:!!c.wrap};
      cell.border=rxBorder(RX_ARGB.border, total ? "medium" : null);
      if(c.fmt) cell.numFmt=c.fmt;
      if(total) cell.fill=rxFill(RX_ARGB.total); else if(i%2===1) cell.fill=rxFill(RX_ARGB.zebra);
      if(c.paint && v!=null && v!=="") c.paint(cell, v, vals);
      if(total && cell.font && !cell.font.bold) cell.font=Object.assign({}, cell.font, {bold:true});
    });
    if(o.rowPaint) o.rowPaint(row, vals, i);
    const h=rxRowHeight(vals, cols); if(h) row.height=h;
  };
  rows.forEach((v,i)=>add(v, i, false));
  ws.autoFilter={from:{row:1, column:1}, to:{row:Math.max(1, rows.length+1), column:cols.length}};
  if(o.total) add(o.total, 0, true);
  if(!rows.length && o.emptyText){ const r=ws.addRow([o.emptyText]); r.getCell(1).font={italic:true, size:11, color:{argb:RX_ARGB.muted}}; }
  ws.pageSetup.printTitlesRow="1:1";
  return ws;
}
function rxBox(ws, r, c1, c2, value, st){
  // cella (eventualmente unita su più colonne): lo stile si mette prima dell'unione, così vale per tutto il riquadro
  const cell=ws.getCell(r, c1);
  if(value!==undefined && value!==null) cell.value=value;
  if(st){ if(st.font) cell.font=st.font; if(st.fill) cell.fill=st.fill; if(st.alignment) cell.alignment=st.alignment; if(st.border) cell.border=st.border; if(st.numFmt) cell.numFmt=st.numFmt; }
  if(c2>c1) ws.mergeCells(r, c1, r, c2);
  return cell;
}
function rxSection(ws, r, text){
  rxBox(ws, r, 2, 13, text, {font:{size:14, bold:true, color:{argb:RX_ARGB.green}}, alignment:{vertical:"bottom"}, border:{bottom:{style:"thin", color:{argb:RX_ARGB.greenLine}}}});
  ws.getRow(r).height=26;
}
function rxTile(ws, r, c, t){
  // riquadro KPI su 3 colonne e 3 righe: etichetta, valore grande, nota
  const tint=RX_TINT[t.tone]||RX_TINT.grey, acc={green:RX_ARGB.green, red:RX_ARGB.red, orange:RX_ARGB.orange, blue:RX_ARGB.blue, grey:RX_ARGB.grey}[t.tone]||RX_ARGB.grey;
  const side={style:"thick", color:{argb:RX_ARGB.white}};
  rxBox(ws, r, c, c+2, t.label, {font:{size:10, bold:true, color:{argb:RX_ARGB.muted}}, fill:rxFill(tint), alignment:{vertical:"bottom", horizontal:"left", indent:1}, border:{top:{style:"thick", color:{argb:acc}}, left:side, right:side}});
  rxBox(ws, r+1, c, c+2, t.value, {font:{size:22, bold:true, color:{argb:acc}}, fill:rxFill(tint), alignment:{vertical:"middle", horizontal:"left", indent:1}, numFmt:t.fmt, border:{left:side, right:side}});
  rxBox(ws, r+2, c, c+2, t.sub||"", {font:{size:9.5, color:{argb:RX_ARGB.muted}}, fill:rxFill(tint), alignment:{vertical:"top", horizontal:"left", indent:1, wrapText:true}, border:{left:side, right:side, bottom:side}});
}

function rxSheetReport(wb, D, ch){
  const ws=wb.addWorksheet("Report", {properties:{tabColor:{argb:RX_ARGB.green}}, views:[{showGridLines:false, zoomScale:100}],
    pageSetup:{orientation:"landscape", paperSize:9, fitToPage:true, fitToWidth:1, fitToHeight:0}});
  ws.columns=[{width:2.5}].concat(Array.from({length:12}, ()=>({width:14})), [{width:2.5}]);
  const T=D.T, tot=D.total, gq=D.goal60/60;
  let r=1; const H=h=>{ ws.getRow(r).height=h; };
  rxBox(ws, r, 2, 13, "Palestra OCF — Report di studio", {font:{size:24, bold:true, color:{argb:RX_ARGB.green}}, alignment:{vertical:"middle"}}); H(40); r++;
  rxBox(ws, r, 2, 13, `Materia ${D.m} · ${MAT[D.m].name}`, {font:{size:13, bold:true, color:{argb:RX_ARGB.text}}, alignment:{vertical:"middle"}}); H(21); r++;
  rxBox(ws, r, 2, 13, `Esportato ${rxArt("il", D.now)} alle ${hm(D.now)}  ·  Account: ${D.account}  ·  Ultima sincronizzazione: ${D.sync}`, {font:{size:11, color:{argb:RX_ARGB.muted}}, alignment:{vertical:"middle"}}); H(19); r++;
  rxBox(ws, r, 2, 13, null, {fill:rxFill(RX_ARGB.green)}); H(4); r++;
  H(12); r++;
  rxSection(ws, r, "I numeri principali"); r++;
  H(8); r++;
  const lt=D.tests[D.tests.length-1], fd=D.days[D.days.length-1], ld=D.days[0];
  const tiles=[
    {label:"Domande fatte", value:`${tot.seen}/${tot.tot}`, sub:`${rxCovS(tot)} della materia · ${tot.todo} da fare`, tone:"blue"},
    {label:"Risposte giuste", value:T.pct!=null ? T.pct : "—", fmt:"0%", sub:T.ans ? `${T.okq} giuste su ${T.ans} risposte date${T.oldTests?" (test con dettaglio)":""}` : "nessuna risposta con dettaglio", tone:T.pct==null ? "grey" : rxPctTone(T.pct)},
    {label:"Test fatti", value:T.tests, fmt:"0", sub:lt ? `ultimo: ${dmy(lt.start)} alle ${hm(lt.start)}` : "nessun test ancora", tone:"blue"},
    {label:"Giorni di studio", value:D.days.length, fmt:"0", sub:fd ? (fd===ld ? rxArt("il", fd.date) : `${rxArt("dal", fd.date)} ${rxArt("al", ld.date)}`) : "nessun giorno ancora", tone:"blue"},
    {label:"Tempo totale di studio", value:rxDur(T.sec), sub:`${T.n} domande affrontate`, tone:"blue"},
    {label:"Secondi per domanda", value:T.spq!=null ? T.spq : "—", fmt:'0.0" s"', sub:`obiettivo ${rxN(gq,1)} s (${D.goal60} s ogni 60 domande)`, tone:T.spq==null ? "grey" : T.spq<=gq ? "green" : "red"},
    {label:"Test nell'obiettivo di tempo", value:T.tests ? T.inGoal/T.tests : "—", fmt:"0%", sub:T.tests ? `${T.inGoal} test su ${T.tests}` : "nessun test ancora", tone:T.tests ? "blue" : "grey"},
    {label:"Domande da ripassare", value:D.toReview, fmt:"0", sub:"ultima risposta sbagliata · foglio Errori", tone:D.toReview ? "red" : tot.seen ? "green" : "grey"}
  ];
  tiles.forEach((t,i)=>rxTile(ws, r+Math.floor(i/4)*4, 2+(i%4)*3, t));
  for(const b of [r, r+4]){ ws.getRow(b).height=22; ws.getRow(b+1).height=36; ws.getRow(b+2).height=30; ws.getRow(b+3).height=10; }
  r+=8;
  rxSection(ws, r, "Cosa dicono i tuoi dati"); r++;
  H(6); r++;
  for(const s of D.insights){
    rxBox(ws, r, 2, 13, "•  "+s, {font:{size:11.5, color:{argb:RX_ARGB.text}}, alignment:{vertical:"middle", wrapText:true}});
    H(Math.max(20, Math.ceil(s.length/150)*16+6)); r++;
  }
  H(14); r++;
  rxSection(ws, r, "Grafici"); r++;
  H(8); r++;
  // griglia dei grafici: righe da 15 punti (= 20 px), due grafici per riga (colonne B e H)
  const block=hpx=>{ const n=Math.ceil(hpx/20)+1, s=r; for(let i=0;i<n;i++) ws.getRow(r+i).height=15; r+=n; return s; };
  const place=(key, col, row)=>{ const c=ch && ch[key]; if(!c || !c.url) return; const id=wb.addImage({base64:c.url, extension:"png"}); ws.addImage(id, {tl:{col, row:row-1}, ext:{width:c.w, height:c.h}, editAs:"oneCell"}); };
  const hOf=(...k)=>Math.max(...k.map(x=>ch && ch[x] ? ch[x].h : 300));
  let s=block(hOf("perf","speed")); place("perf",1,s); place("speed",7,s);
  s=block(hOf("days","tests")); place("days",1,s); place("tests",7,s);
  s=block(hOf("cats","cover")); place("cats",1,s); place("cover",7,s);
  return ws;
}

function rxSheetDays(wb, D){
  const cols=[
    {h:"Data", w:11, fmt:"dd/mm/yyyy", al:"center"}, {h:"Giorno", w:11}, {h:"Primo test (ora)", w:10, fmt:"hh:mm:ss", al:"center"}, {h:"Ultimo test (ora)", w:10, fmt:"hh:mm:ss", al:"center"},
    {h:"Test fatti", w:8, fmt:"0"}, {h:"Domande affrontate", w:11, fmt:"0"}, {h:"Risposte date", w:10, fmt:"0"}, {h:"Giuste", w:8, fmt:"0"}, {h:"Errate", w:8, fmt:"0"},
    {h:"Non la sapevo", w:10, fmt:"0"}, {h:"Non date", w:8, fmt:"0"}, {h:"Non giuste", w:9, fmt:"0"}, {h:"% giuste (su risposte date)", w:12, fmt:"0%", paint:rxPaintPct},
    {h:"Tempo totale di studio", w:12, fmt:"[h]:mm:ss", al:"center"}, {h:"Media secondi per domanda", w:12, fmt:"0.0"}, {h:"Test dentro l'obiettivo di tempo", w:13, fmt:"0"},
    {h:"Categorie allenate quel giorno", w:60, wrap:true}
  ];
  const rows=D.days.map(d=>[rxXDate(d.date), d.weekday, rxXDateTime(d.first), rxXDateTime(d.last), d.tests, d.n, d.ans, d.ok, d.err, d.dk, d.nd, d.notOk, d.pct,
    d.sec/86400, d.avgSec, d.inGoal, rxCatNames(d.cats, D.catNo)]);
  const T=D.T, allCats=new Set(); D.days.forEach(d=>d.cats.forEach(ci=>allCats.add(ci)));
  const total=D.days.length ? ["TOTALE", `${D.days.length} ${D.days.length===1?"giorno":"giorni"}`, null, null, T.tests, T.n, T.detailTests ? T.ans : null, T.ok,
    T.detailTests ? T.err : null, T.detailTests ? T.dk : null, T.detailTests ? T.nd : null, T.notOk, T.pct, T.sec/86400, T.spq, T.inGoal,
    (nc=>nc ? (nc===1 ? "1 categoria" : `${nc} categorie diverse`) : null)([...allCats].filter(ci=>CONT[ci]!=null).length)] : null;
  return rxTable(wb, "Giorni", cols, rows, {tab:RX_ARGB.blue, total, emptyText:"Ancora nessun giorno di studio: fai un test e riscarica il report."});
}

function rxSheetTests(wb, D){
  const cols=[
    {h:"N.", w:6, al:"center"}, {h:"Data", w:11, fmt:"dd/mm/yyyy", al:"center"}, {h:"Ora inizio", w:10, fmt:"hh:mm:ss", al:"center"}, {h:"Ora fine", w:10, fmt:"hh:mm:ss", al:"center"},
    {h:"Durata", w:9, fmt:"[mm]:ss", al:"center"}, {h:"Durata (s)", w:9, fmt:"0"}, {h:"Nome del test", w:30, wrap:true}, {h:"Avviato da", w:20, wrap:true},
    {h:"Domande affrontate", w:11, fmt:"0"}, {h:"Risposte date", w:10, fmt:"0"}, {h:"Giuste", w:8, fmt:"0"}, {h:"Errate", w:8, fmt:"0"}, {h:"Non la sapevo", w:10, fmt:"0"},
    {h:"Non date", w:8, fmt:"0"}, {h:"Sbagliate totali", w:10, fmt:"0"}, {h:"Non giuste", w:9, fmt:"0"}, {h:"% giuste (su risposte date)", w:12, fmt:"0%", paint:rxPaintPct},
    {h:"Secondi per domanda", w:11, fmt:"0.0"}, {h:"Obiettivo max", w:10, fmt:"[mm]:ss", al:"center"}, {h:"Dentro l'obiettivo", w:11, al:"center", paint:rxPaintYes},
    {h:"Quali domande", w:16, wrap:true}, {h:"Modalità tempo", w:18, wrap:true}, {h:"Correzione subito", w:11, al:"center"},
    {h:"Sezioni scelte", w:46, wrap:true}, {h:"Categorie svolte", w:46, wrap:true}
  ];
  const rows=D.tests.slice().reverse().map(t=>{
    const h=t.h, d=t.has;
    return [t.no, rxXDate(t.start), rxXDateTime(t.start), rxXDateTime(t.end), t.sec/86400, t.sec, rxTitle(h), h.src ? (RX_SRC[h.src]||String(h.src)) : null,
      t.n, d ? t.ans : null, t.ok, d ? t.err : null, d ? t.dk : null, d ? t.nd : null, d ? t.wrong : null, t.notOk, d ? t.pct : null,
      t.spq, t.goal/86400, t.inGoal ? "Sì" : "No",
      h.w ? (RX_WHICH[h.w]||String(h.w)) : null, h.tm ? (RX_TIME[h.tm]||String(h.tm)) : null,
      h.fb===1 || h.fb===true ? "Sì" : h.fb===0 || h.fb===false ? "No" : null,
      rxSelText(h, D.G)||null, rxCatNames(t.cats, D.catNo)||null];
  });
  return rxTable(wb, "Test fatti", cols, rows, {tab:RX_ARGB.blue, xSplit:1, emptyText:"Ancora nessun test: fai un allenamento e riscarica il report."});
}

function rxSheetErrors(wb, D){
  const cols=[
    {h:"N. nella materia", w:9, al:"center"}, {h:"Categoria", w:30, wrap:true}, {h:"Sottocategoria", w:24, wrap:true}, {h:"Domanda", w:62, wrap:true},
    {h:"Risposta corretta", w:42, wrap:true}, {h:"Risposte date", w:9, fmt:"0"}, {h:"Sbagliate totali", w:10, fmt:"0"}, {h:"% errore", w:9, fmt:"0%"},
    {h:"Ultima risposta", w:11, al:"center", paint:(c,v)=>rxPaint(c, v==="Giusta" ? "green" : "red", true)},
    {h:"Stato", w:19, al:"center", paint:(c,v)=>rxPaint(c, v==="Recuperata" ? "green" : "red", true)}
  ];
  const rows=D.errors.map(e=>[e.pos, e.cat, e.sub, e.text, e.ans, e.r.seen, e.wrong, e.wrong/e.r.seen, e.r.last ? "Giusta" : "Sbagliata", e.r.last ? "Recuperata" : "Ancora da ripassare"]);
  return rxTable(wb, "Errori", cols, rows, {tab:RX_ARGB.red, emptyText:"Nessuna domanda sbagliata finora."});
}

const RX_METRIC_COLS=[
  {h:"Domande", w:9, fmt:"0"}, {h:"Fatte", w:8, fmt:"0"}, {h:"Da fare", w:8, fmt:"0"}, {h:"Giuste (ultima risposta)", w:11, fmt:"0"}, {h:"Sbagliate (ultima risposta)", w:11, fmt:"0"},
  {h:"Risposte date", w:10, fmt:"0"}, {h:"% giuste sulle risposte date", w:12, fmt:"0%", paint:rxPaintPct}, {h:"Liv. preparazione (/100)", w:12, fmt:"0", paint:rxPaintPrep},
  {h:"Copertura (%)", w:11, fmt:"0%"}, {h:"Test in cui compare", w:11, fmt:"0"}, {h:"Tempo medio per domanda (s)", w:12, fmt:"0.0"}
];
function rxMetricVals(a){ return [a.tot, a.seen, a.todo, a.okL, a.wrL, a.att, a.acc, a.prep, a.cov, a.tests, a.avgSec]; }
function rxSheetCats(wb, D){
  const cols=[{h:"N.", w:5, al:"center"}, {h:"Categoria", w:46, wrap:true}].concat(RX_METRIC_COLS);
  const rows=D.cats.map(c=>[c.no, c.name].concat(rxMetricVals(c)));
  return rxTable(wb, "Categorie", cols, rows, {total:[null, "TOTALE"].concat(rxMetricVals(D.total))});
}
function rxSheetSubs(wb, D){
  const cols=[{h:"Categoria", w:36, wrap:true}, {h:"Sottocategoria", w:36, wrap:true}].concat(RX_METRIC_COLS);
  const rows=D.subs.map(s=>[s.cat, s.name].concat(rxMetricVals(s)));
  return rxTable(wb, "Sottocategorie", cols, rows, {total:["TOTALE", null].concat(rxMetricVals(D.total))});
}
function rxSheetQuestions(wb, D){
  const tone={"Da fare":"grey", "Giusta":"green", "Da ripassare":"red"};
  const cols=[
    {h:"N. nella materia", w:9, al:"center"}, {h:"Categoria", w:30, wrap:true}, {h:"Sottocategoria", w:24, wrap:true}, {h:"Livello (punti)", w:8, al:"center"},
    {h:"Pratica", w:8, al:"center"}, {h:"Domanda", w:70, wrap:true}, {h:"Risposta corretta", w:45, wrap:true}, {h:"Risposte date", w:9, fmt:"0"},
    {h:"Giuste", w:8, fmt:"0"}, {h:"Sbagliate totali", w:10, fmt:"0"}, {h:"Stato", w:14, al:"center", paint:(c,v)=>rxPaint(c, tone[v]||"grey", true)}
  ];
  const rows=D.questions.map(x=>[x.pos, x.cat, x.sub, x.lvl, x.prat ? "Sì" : "No", x.text, x.ans, x.r ? x.r.seen : 0, x.r ? x.r.ok : 0, x.r ? x.r.seen-x.r.ok : 0,
    !x.r ? "Da fare" : x.r.last ? "Giusta" : "Da ripassare"]);
  return rxTable(wb, "Domande", cols, rows, {tab:"FF9E9E9E"});
}
function rxSheetDetail(wb, D){
  const tone={"Giusta":"green", "Errata":"red", "Non la sapevo":"orange", "Non data":"grey"};
  const cols=[
    {h:"Data", w:11, fmt:"dd/mm/yyyy", al:"center"}, {h:"Ora inizio test", w:10, fmt:"hh:mm:ss", al:"center"}, {h:"Ora fine test", w:10, fmt:"hh:mm:ss", al:"center"},
    {h:"Test (N.)", w:7, al:"center"}, {h:"N. nella materia", w:9, al:"center"}, {h:"Categoria", w:30, wrap:true}, {h:"Sottocategoria", w:24, wrap:true},
    {h:"Domanda", w:66, wrap:true}, {h:"Esito", w:14, al:"center", paint:(c,v)=>rxPaint(c, tone[v]||"grey", true)}, {h:"Tua risposta", w:42, wrap:true}, {h:"Risposta corretta", w:42, wrap:true}, {h:"Secondi", w:8, fmt:"0"}
  ];
  const rows=[];
  D.tests.slice().reverse().forEach(t=>{
    const d=rxXDate(t.start), a=rxXDateTime(t.start), b=rxXDateTime(t.end);
    t.qm.forEach(it=>{ const n=+it[0], q=Q[n-1], s=it[2]!=null && Number.isFinite(+it[2]) ? +it[2] : null;
      const pk=[0,1,2,3].includes(it[3])?it[3]:null;
      rows.push([d, a, b, t.no, D.pos.get(n), CONT[q[1]], SUB[q[2]]||"", q[4], RX_ESITO[String(+it[1])]||"Non data", pk!=null?q[5+pk]:(+it[1]===1?q[5]:null), q[5], s]); });
  });
  return rxTable(wb, "Dettaglio risposte", cols, rows, {tab:"FF9E9E9E", emptyText:"Ancora nessun test con il dettaglio delle risposte."});
}
function rxSheetGuide(wb, D){
  const gq=rxN(D.goal60/60, 1), S0="§";
  const g=[
    [S0+"Report", "La dashboard: i numeri principali, frasi ricavate dai tuoi dati e 6 grafici. Tutto è calcolato al momento dell'esportazione, solo per la Materia "+D.m+"."],
    ["Domande fatte", "Domande della materia a cui hai risposto almeno una volta, sulle "+D.total.tot+" totali."],
    ["Risposte giuste", "Giuste ÷ risposte date, sommando tutti i test che hanno il dettaglio delle risposte."],
    ["Tempo totale · Secondi per domanda", "Somma delle durate dei test; secondi per domanda = durata ÷ domande affrontate."],
    ["Test nell'obiettivo di tempo", "Quota dei test finiti entro il loro obiettivo massimo (vedi «Obiettivo max»)."],
    ["Domande da ripassare", "Domande la cui ultima risposta è sbagliata (compreso «Non la so»)."],
    [S0+"Parole usate in tutti i fogli", "Le stesse definizioni valgono ovunque."],
    ["Domande affrontate", "Le domande comparse nel test, anche quelle lasciate senza risposta."],
    ["Risposte date", "Domande a cui hai risposto o premuto «Non la so» (escluse le non date). Tutte le percentuali sono calcolate su questo numero."],
    ["Giuste", "Risposte esatte."],
    ["Errate", "Hai scelto una risposta sbagliata."],
    ["Non la sapevo", "Hai premuto «Non la so»: conta come sbagliata."],
    ["Non date", "Domanda comparsa ma lasciata senza risposta (per esempio tempo scaduto)."],
    ["Sbagliate totali", "Errate + Non la sapevo."],
    ["Non giuste", "Domande affrontate − giuste. È l'unico dato dei test vecchi, salvati prima che l'app registrasse ogni singola risposta: per quei test Risposte date, Errate, Non la sapevo, Non date e % giuste restano vuote."],
    ["Date e ore", "Il giorno di un test è quello in cui è iniziato. Se un test vecchio non ha l'ora di inizio, si ricava dall'ora di fine meno la durata. Date, ore e durate sono veri valori Excel: si possono ordinare e filtrare."],
    [S0+"Giorni", "Una riga per ogni giorno in cui hai iniziato almeno un test, dal più recente, con il TOTALE in fondo."],
    ["Primo / Ultimo test (ora)", "Ora di inizio del primo e dell'ultimo test del giorno."],
    ["Giuste e % giuste", "Giuste conta tutti i test del giorno; la % usa solo i test con dettaglio (giuste ÷ risposte date)."],
    ["Tempo totale di studio", "Somma delle durate dei test del giorno (ore:minuti:secondi)."],
    ["Test dentro l'obiettivo di tempo", "Quanti test del giorno hai finito entro il loro obiettivo massimo."],
    [S0+"Test fatti", "Un test per riga, dal più recente. N. è il numero progressivo dal primo test (1 = il primo): è lo stesso dei grafici e del foglio «Dettaglio risposte». Le simulazioni e i test senza domande non compaiono."],
    ["Durata · Durata (s)", "Tempo del test in minuti:secondi e lo stesso valore in secondi."],
    ["Nome del test", "Il nome mostrato nell'app; «(interrotto)» se il test è stato chiuso a metà e recuperato."],
    ["Avviato da", "Da dove è partito il test: Barra allenamento, Allenati su una categoria o su una parte, Home: mai fatte, Home: sbagliate, Rifai sbagliate, Sbagliate più spesso. Vuoto se il dato non è stato salvato."],
    ["Obiettivo max", "Tempo massimo per stare nell'obiettivo: quello salvato con il test; se manca, l'obiettivo in vigore quel giorno; se manca anche quello, l'obiettivo di oggi ("+D.goal60+" secondi ogni 60 domande, cioè "+gq+" s a domanda) applicato alle domande affrontate."],
    ["Dentro l'obiettivo", "Sì se la durata non supera l'obiettivo max."],
    ["Quali domande", "Il filtro scelto: Tutte, Mai fatte, Sbagliate, Sbagliate più spesso o Rifai sbagliate."],
    ["Modalità tempo", "Cronometro libero, 60 s a domanda, 85 s a domanda o Totale come all'esame (85 s per domanda in tutto)."],
    ["Correzione subito", "Sì se la risposta giusta veniva mostrata subito dopo ogni domanda."],
    ["Sezioni scelte", "Categorie (e sottocategorie) selezionate prima di iniziare: «(tutta)» = categoria intera, «Tutte» = nessuna selezione; vuoto se il dato non è stato salvato."],
    ["Categorie svolte", "Le categorie delle domande effettivamente affrontate."],
    [S0+"Errori", "Le domande sbagliate almeno una volta (anche con «Non la so»), dalla più sbagliata."],
    ["% errore", "Sbagliate totali ÷ risposte date su quella domanda."],
    ["Stato", "«Ancora da ripassare» se l'ultima risposta è sbagliata, «Recuperata» se l'ultima è giusta."],
    [S0+"Categorie · Sottocategorie", "Una riga per categoria (nell'ordine del libro) o sottocategoria, con il TOTALE in fondo."],
    ["Fatte / Da fare", "Domande con almeno una risposta / mai fatte."],
    ["Giuste / Sbagliate (ultima risposta)", "Quante domande hanno l'ultima risposta giusta / sbagliata."],
    ["% giuste sulle risposte date", "Tutte le risposte date nel tempo, anche ripetute sulla stessa domanda: giuste ÷ risposte date."],
    ["Liv. preparazione (/100)", "Percentuale delle domande della categoria con l'ultima risposta giusta: le domande mai fatte contano come non preparate."],
    ["Copertura (%)", "Percentuale delle domande della categoria con almeno una risposta."],
    ["Test in cui compare", "In quanti test c'era almeno una domanda della categoria o sottocategoria."],
    ["Tempo medio per domanda (s)", "Media dei secondi spesi sulle singole domande, dai test che registrano i secondi di ogni domanda; vuoto se non ce ne sono."],
    [S0+"Domande", "Tutte le "+D.total.tot+" domande, in ordine di categoria e sottocategoria."],
    ["N. nella materia", "Posizione della domanda nella banca dati della Materia "+D.m+" (da 1 a "+D.total.tot+"): è il numero usato in tutti i fogli."],
    ["Livello (punti)", "Punti che vale la domanda all'esame (1 o 2)."],
    ["Pratica", "Sì per i quesiti pratici."],
    ["Stato", "Da fare = mai fatta; Giusta = ultima risposta giusta; Da ripassare = ultima risposta sbagliata."],
    [S0+"Dettaglio risposte", "Una riga per ogni domanda della Materia "+D.m+" di ogni test con dettaglio, dal test più recente. Test (N.) rimanda al foglio «Test fatti»."],
    ["Tua risposta", "L'alternativa che hai scelto (registrata dal 12 ottobre 2026); vuota se non hai risposto o hai premuto «Non la so»."],
    ["Secondi", "Tempo passato su quella domanda; vuoto se non registrato."],
    [S0+"Grafici (foglio Report)", "Ogni grafico ha un solo asse; se mancano i dati mostra «Ancora nessun dato»."],
    ["Risposte giuste per test", "% di giuste sulle risposte date in ogni test con dettaglio (ultimi 40); punti verdi da 80% in su, rossi sotto. Tratteggio: soglia 80%."],
    ["Secondi per domanda", "Durata ÷ domande affrontate in ogni test (ultimi 40). Tratteggio: obiettivo di oggi, "+gq+" s a domanda."],
    ["Domande al giorno", "Ultimi 14 giorni: giuste (verde), sbagliate (rosso: errate e non la sapevo; per i test vecchi tutte le non giuste), non date (grigio)."],
    ["Test al giorno", "Ultimi 14 giorni: quanti test hai iniziato ogni giorno."],
    ["Categorie: % di risposte giuste", "Dalla più debole: rosso sotto 60%, arancio 60–79%, verde da 80%, grigio se mai fatta."],
    ["Copertura per categoria", "Domande fatte (blu) e da fare (grigio), a partire dalla categoria con più domande da fare."]
  ];
  const rows=g.map(([a,b])=>[a.startsWith(S0) ? a.slice(1) : a, b]);
  const sect=new Set(g.map((x,i)=>x[0].startsWith(S0) ? i : -1).filter(i=>i>=0));
  return rxTable(wb, "Come leggere", [{h:"Foglio / voce", w:34, wrap:true}, {h:"Cosa significa", w:120, wrap:true}], rows, {tab:"FFEF6C00",
    rowPaint:(row, vals, i)=>{ if(!sect.has(i)) return; [1,2].forEach(j=>{ const c=row.getCell(j); c.font={size:12, bold:true, color:{argb:RX_ARGB.green}}; c.fill=rxFill(RX_TINT.green); }); }});
}
function rxBuildWorkbook(lib, D, charts){
  const wb=new lib.Workbook();
  wb.creator="Palestra OCF"; wb.lastModifiedBy="Palestra OCF"; wb.title="Palestra OCF — Report di studio";
  wb.created=new Date(D.now); wb.modified=new Date(D.now);
  rxSheetReport(wb, D, charts);
  rxSheetDays(wb, D);
  rxSheetTests(wb, D);
  rxSheetErrors(wb, D);
  rxSheetCats(wb, D);
  rxSheetSubs(wb, D);
  rxSheetQuestions(wb, D);
  rxSheetDetail(wb, D);
  rxSheetGuide(wb, D);
  return wb;
}

/* ---------- caricamento libreria e download ---------- */
function rxLoadExcelJS(){
  if(window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if(rxLibPromise) return rxLibPromise;
  rxLibPromise=new Promise((res, rej)=>{
    const s=document.createElement("script");
    const fail=e=>{ clearTimeout(timer); s.remove(); rxLibPromise=null; rej(e); };
    const timer=setTimeout(()=>fail(new Error("tempo scaduto")), 45000);
    s.crossOrigin="anonymous"; s.src=RX_EXCELJS_URL; s.async=true;
    s.onload=()=>{ clearTimeout(timer); if(window.ExcelJS) res(window.ExcelJS); else fail(new Error("ExcelJS non disponibile")); };
    s.onerror=()=>fail(new Error("rete"));
    document.head.appendChild(s);
  });
  return rxLibPromise;
}
const RX_XLSX_TYPE="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
function rxIsIOS(){ return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1); }
function rxDeliver(buf, name){
  // iPhone/iPad (soprattutto l'app sulla schermata Home): il download diretto può non partire, si usa il foglio di condivisione
  let file=null; try{ file=new File([buf], name, {type:RX_XLSX_TYPE}); }catch(e){}
  if(rxIsIOS() && file && navigator.canShare && navigator.canShare({files:[file]})){
    dialog({title:"Report pronto", body:`Il file <b>${rxEsc(name)}</b> è pronto. Tocca <b>Salva</b>, poi scegli <b>Salva su File</b> oppure aprilo con <b>Excel</b>.`,
      actions:[{label:"Annulla"}, {label:"Salva", primary:true, run:()=>{ navigator.share({files:[file], title:name}).catch(e=>{ if(!e || e.name!=="AbortError") rxDownload(buf, name); }); }}]});
    return;
  }
  rxDownload(buf, name);
}
function rxDownload(buf, name){
  const blob=new Blob([buf], {type:RX_XLSX_TYPE});
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url; a.download=name; a.rel="noopener"; a.style.display="none";
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ a.remove(); URL.revokeObjectURL(url); }, 60000); // Safari iOS ha bisogno di tempo prima di liberare il file
}

async function exportExcel(btn){
  if(IN_CLAUDE){
    dialog({title:"Scarica il report Excel", body:"Qui dentro Claude non si possono scaricare file. Apri la web app <b>popi99999.github.io/palestra-ocf</b> e premi lì <b>Scarica Excel</b>: trovi lo stesso report con i tuoi progressi.", actions:[{label:"Ok", primary:true}]});
    return;
  }
  const old=btn ? btn.innerHTML : null;
  if(btn){ btn.disabled=true; btn.innerHTML=icon("hourglass_top")+" Preparo il report…"; }
  rxBusy=true;
  try{
    let lib;
    try{ lib=await rxLoadExcelJS(); }
    catch(e){
      dialog({title:"Report non creato", body:"Non riesco a scaricare il componente che crea il file Excel: serve la connessione a internet. Controlla la rete e riprova.", actions:[{label:"Ok", primary:true}]});
      return;
    }
    await new Promise(r=>setTimeout(r, 30)); // lascia ridisegnare il bottone prima del lavoro pesante
    const D=rxCollect();
    const wb=rxBuildWorkbook(lib, D, rxDrawCharts(D));
    const buf=await wb.xlsx.writeBuffer();
    rxDeliver(buf, `Palestra-OCF-report-${dayKey(D.now)}.xlsx`);
  }catch(e){
    console.error("exportExcel", e);
    dialog({title:"Report non creato", body:`Qualcosa è andato storto mentre preparavo il file Excel. Riprova; se succede ancora, riferisci questo messaggio: <code>${rxEsc(e && e.message || e)}</code>`, actions:[{label:"Ok", primary:true}]});
  }finally{
    rxBusy=false;
    if(btn){ btn.disabled=false; btn.innerHTML=old; }
  }
}
