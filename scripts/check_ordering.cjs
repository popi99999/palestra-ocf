const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');
const readData=file=>JSON.parse(fs.readFileSync(file,'utf8').match(/<script id="ocf-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const built=readData(path.join(root,'index.html'));
for(const name of ['palestra_ocf.html','preview.html']) assert.deepEqual(readData(path.join(root,name)),built);
for(let m=1;m<=5;m++){
 const ids=built.ord[m].flatMap(([s,c,B])=>B.flat());
 const expected=built.q.flatMap((q,i)=>q[0]===m?[i+1]:[]);
 assert.deepEqual([...ids].sort((a,b)=>a-b),expected);
 const blocks=built.ord[m].flatMap(e=>e[2]);
 assert(blocks.every(b=>b.length>=14&&b.length<=15));
 assert.equal(blocks.length,Math.ceil(expected.length/15));
 const sections=[...new Set(built.ord[m].map(e=>e[0]))];
 const displayed=sections.flatMap(s=>built.ord[m].filter(e=>e[0]===s).flatMap(e=>e[2].flat()));
 assert.deepEqual(displayed,ids,'Le intestazioni non devono riordinare i blocchi');
}
if(process.argv[2]){
 const previous=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 for(let m=1;m<=5;m++) assert.deepEqual(built.ord[m].flatMap(e=>e[2].flat()),previous.ord[m].flatMap(e=>e[2].flat()),`Ordine domande M${m} alterato`);
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
for(const name of ['index.html','palestra_ocf.html','preview.html']){
 const text=fs.readFileSync(path.join(root,name),'utf8');
 for(const match of text.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(!/type="application\/json"/.test(match[0].split('>')[0])&&match[1].trim()) new vm.Script(match[1],{filename:name});
 }
}
console.log('OK: tutte le 5 materie complete, blocchi 14-15, 3 build coerenti, progressi per ID preservati, JS valido; baseline: tutte le sequenze e banca dati invariate.');
