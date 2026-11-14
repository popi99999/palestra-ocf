const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');
const readData=file=>JSON.parse(fs.readFileSync(file,'utf8').match(/<script id="ocf-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const built=readData(path.join(root,'index.html'));
const approvedFor=m=>{
 const filename=path.join(root,'percorsi_approvati',`m${m}.json`);
 return fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,'utf8')):null;
};
for(const name of ['palestra_ocf.html','preview.html']) assert.deepEqual(readData(path.join(root,name)),built);
for(let m=1;m<=5;m++){
 const ids=built.ord[m].flatMap(([s,c,B])=>B.flat());
 const expected=built.q.flatMap((q,i)=>q[0]===m?[i+1]:[]);
 assert.deepEqual([...ids].sort((a,b)=>a-b),expected);
 const blocks=built.ord[m].flatMap(e=>e[2]);
 const approved=approvedFor(m);
 if(approved){
  assert.deepEqual(blocks,approved.blocks.map(b=>b.ids),'Blocchi diversi dal PDF approvato');
  assert.deepEqual(built.ord[m].map(e=>e[3]),approved.blocks.map(b=>b.label));
 }else assert(blocks.every(b=>b.length>=14&&b.length<=15));
 assert.equal(blocks.length,Math.ceil(expected.length/15));
 const sections=[...new Set(built.ord[m].map(e=>e[0]))];
 const displayed=sections.flatMap(s=>built.ord[m].filter(e=>e[0]===s).flatMap(e=>e[2].flat()));
 assert.deepEqual(displayed,ids,'Le intestazioni non devono riordinare i blocchi');
}
if(process.argv[2]){
 const previous=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 for(let m=1;m<=5;m++) if(!approvedFor(m)) assert.deepEqual(built.ord[m].flatMap(e=>e[2].flat()),previous.ord[m].flatMap(e=>e[2].flat()),`Ordine domande M${m} alterato`);
 for(const key of Object.keys(previous).filter(k=>k!=='ord')) assert.deepEqual(built[key],previous[key],`Dati alterati: ${key}`);
}
const template=fs.readFileSync(path.join(root,'palestra_template.html'),'utf8');
const body=template.split('function ordBlocks(m){')[1].split('\nconst SEZ_D=')[0];
const dayKey=()=> '2026-11-13';
const original=built.ord[3].flatMap(([s,c,B])=>B.flat());
const selected=original.slice(0,17);
const ctx={ORD:built.ord,dayKey,S:{h:[{src:'ordine',ms:[3],t:1,q:selected.map(n=>[n,1,2]),blk:999},{src:'ordine',ms:[3],t:2,q:[[selected[0],-1,2]],blk:1}]}};
vm.createContext(ctx);vm.runInContext('function ordBlocks(m){'+body,ctx);
let result=ctx.ordBlocks(3);
assert.equal(result.fatte,17);
assert.equal(result.all.flatMap(b=>b.ids.filter(n=>selected.includes(n))).length,17);
const first=result.all.find(b=>b.ids.includes(selected[0]));assert(first);assert.equal(first.ok,first.ids.filter(n=>selected.includes(n)&&n!==selected[0]).length);
// A different block assignment still resolves history by stable question IDs.
ctx.ORD={...built.ord,3:[['Uguali',-1,[[selected[16],selected[0]],original.filter(n=>n!==selected[16]&&n!==selected[0])]]]};
result=ctx.ordBlocks(3);assert.equal(result.fatte,17);assert.equal(result.all[0].f,2);assert.equal(result.all[0].ok,1);
// Approved cards show only topics even when historical answers already exist.
ctx.ORD=built.ord;
ctx.BY_MAT=Object.fromEntries([1,2,3,4,5].map(m=>[m,built.q.flatMap((q,i)=>q[0]===m?[i+1]:[])]));
ctx.icon=()=>'';
ctx.esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const renderer=template.split('function ordBlocksHtml(m){')[1].split('\nfunction starBlocks(m){')[0];
vm.runInContext('function ordBlocksHtml(m){'+renderer,ctx);
ctx.Q=built.q;
// Il riepilogo giornaliero e separato dalle etichette delle schede.
ctx.dailyNewHtml=()=>"";
const studyBack=template.split('function studyReturnView(T){')[1].split('\nfunction renderRiepilogo(){')[0];
vm.runInContext('function studyReturnView(T){'+studyBack,ctx);
assert.equal(ctx.studyReturnView({items:[{n:original[0]}],meta:{src:'ordine'}}),'materia');
for(const m of [4,5]){
 const approved=approvedFor(m);if(!approved) continue;
 const ids=approved.blocks.flatMap(b=>b.ids);
 assert.equal(ctx.studyReturnView({items:[{n:ids[0]}],meta:{src:'ordine'}}),'categorie');
 assert.equal(ctx.studyReturnView({items:[{n:ids[0]}],meta:{src:'giorno'}}),'materia');
 ctx.S.h=[{src:'ordine',ms:[m],t:1,blk:999,q:[[ids[0],1,2],[ids[14],-1,2],[ids.at(-1),1,2]]}];
 result=ctx.ordBlocks(m);assert.equal(result.fatte,3);
 assert.equal(result.all[0].f,2);assert.equal(result.all[0].ok,1);
 const html=ctx.ordBlocksHtml(m);
 assert.equal((html.match(/data-ordblk=/g)||[]).length,approved.blocks.length);
 for(const block of approved.blocks) assert(html.includes(ctx.esc(block.label)));
 assert(!/ob-count|ob-arg|ob-sub|✓|giuste|fatte|domande fatte/.test(html),'Le schede devono mostrare solo gli argomenti');
}
for(const name of ['index.html','palestra_ocf.html','preview.html']){
 const text=fs.readFileSync(path.join(root,name),'utf8');
 for(const match of text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(!/type="application\/json"/.test(match[0].split('>')[0])&&match[1].trim()) new vm.Script(match[1],{filename:name});
 }
}
console.log('OK: 5 materie complete; percorsi approvati esatti; altre materie invariate; 3 build coerenti; progressi per ID; schede per argomento senza conteggi; JS valido.');
