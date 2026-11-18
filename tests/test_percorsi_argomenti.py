import json, unittest
from pathlib import Path
from genera_percorsi_argomenti import generate
class TopicPathsTests(unittest.TestCase):
 def test_all_available_paths(self):
  bank=json.loads(Path('ocf_5000_quesiti.json').read_text())
  for m in (1,2,3):
   path=Path(f'percorsi_approvati/m{m}.json')
   if not path.exists():continue
   subject=[q for q in bank if q['materia']==m];plan=json.loads(path.read_text());ids=[n for b in plan['blocks'] for n in b['ids']]
   self.assertEqual(set(ids),{q['n'] for q in subject});self.assertEqual(len(ids),len(subject));self.assertEqual(plan,generate(subject))
   self.assertTrue(all(len(b['ids'])==15 for b in plan['blocks'][:-1]));self.assertEqual(len({b['label'] for b in plan['blocks']}),len(plan['blocks']))
 def test_m3_curated_families_stay_adjacent(self):
  plan=json.loads(Path('percorsi_approvati/m3.json').read_text());ids=[n for b in plan['blocks'] for n in b['ids']];pos={n:i for i,n in enumerate(ids)}
  for g in json.loads(Path('ordine_m3.json').read_text())['groups']:
   positions=[pos[n] for n in g['ids']];self.assertEqual(positions,list(range(positions[0],positions[0]+len(positions))))
