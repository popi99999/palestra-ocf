// Exercise the actual renderer for every M1 question and answer permutation.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'palestra_template.html'), 'utf8');
const bank = JSON.parse(fs.readFileSync(path.join(root, 'ocf_5000_quesiti.json'), 'utf8'));
const sp = JSON.parse(fs.readFileSync(path.join(root, 'spiegazioni/m1.json'), 'utf8'));
const renderer = template.split('function spiegaHTML(n, order, open){')[1].split('\ndocument.addEventListener')[0];
assert(renderer, 'Renderer non trovato');
const ctx = {
  Q: bank.map(q => [q.materia, 0, 0, q.livello, q.domanda, q.A, q.B, q.C, q.D, +!!q.pratico]),
  SP: sp, GEM: {}, L: ['A', 'B', 'C', 'D'], BY_MAT: {},
  esc: s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c])),
  icon: () => ''
};
vm.createContext(ctx);
vm.runInContext('function spiegaHTML(n, order, open){' + renderer, ctx);
const permutations = a => a.length ? a.flatMap((v, i) => permutations(a.filter((_, j) => j !== i)).map(p => [v, ...p])) : [[]];
let checked = 0;
for (const q of bank.filter(q => q.materia === 1)) {
  assert(sp[q.n], `Manca spiegazione ${q.n}`);
  for (const order of permutations([0, 1, 2, 3])) {
    const html = ctx.spiegaHTML(q.n, order, true);
    const correct = ctx.L[order.indexOf(0)];
    assert(html.includes(`Risposta giusta: ${correct} — ${ctx.esc(q.A)}`), `Risposta corretta disallineata ${q.n}`);
    for (let original = 1; original < 4; original++) {
      const label = ctx.L[order.indexOf(original)];
      const text = sp[q.n].x[ctx.L[original]];
      assert(html.includes(`<li><b>${label}</b> — ${text}</li>`), `Motivo disallineato ${q.n}/${original}`);
    }
    assert.equal((html.match(/<li>/g) || []).length, 3, `Tre alternative attese ${q.n}`);
    checked++;
  }
  const browse = ctx.spiegaHTML(q.n, null, false);
  assert(browse.includes('aria-expanded="false"'));
  for (const key of ['B', 'C', 'D']) assert(browse.includes(ctx.esc(q[key])), `Testo alternativa mancante ${q.n}/${key}`);
}
for (const file of ['index.html', 'palestra_ocf.html', 'preview.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const data = html.match(/<script id="ocf-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert(data, `Dati assenti ${file}`);
  const built = JSON.parse(data[1]);
  for (let id = 1; id <= 2000; id++) assert.deepEqual(built.sp[id], sp[id], `Build non aggiornata ${file}/${id}`);
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (/type="application\/json"/.test(match[0].split('>')[0])) continue;
    if (match[1].trim()) new vm.Script(match[1], {filename: file});
  }
}
console.log(`OK: 2000 domande, ${checked} ordini delle risposte, 6000 motivazioni, 3 build coerenti e JavaScript valido.`);
