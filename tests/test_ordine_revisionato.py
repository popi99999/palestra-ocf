import copy,hashlib,json,re,unittest
from pathlib import Path
import ordine_revisionato as new

ROOT=Path(__file__).resolve().parents[1]
BANK=json.loads((ROOT/'ocf_5000_quesiti.json').read_text())
def q(n,question,answer='Con ritenuta a titolo di imposta del 26%'):
    return dict(n=n,materia=1,contenuto='Argomento',sub='Contesto',domanda=question,A=answer)
def section_of(sections,n):
    return next(s for s,c,B in sections if any(n in b for b in B))
class OrderingTests(unittest.TestCase):
    def test_opposite_conditions_are_not_equivalent(self):
        a=q(1,'Quando una imposta è definita progressiva?','Il debito cresce più che proporzionalmente al reddito')
        b=q(2,'Quando una imposta è definita regressiva?','Il debito cresce meno che proporzionalmente al reddito')
        self.assertFalse(new.equivalent(a,b,1))
    def test_negation_and_numbers_are_not_discarded(self):
        for a,b in [('Il cliente può acquistare 10 azioni?','Il cliente non può acquistare 10 azioni?'),('Il cliente investe 100 euro. Quale imposta paga?','Il cliente investe 200 euro. Quale imposta paga?')]:
            self.assertFalse(new.equivalent(q(1,a),q(2,b),1))
    def test_same_percentage_or_yes_is_not_an_answer_family(self):
        for answer in ['Sì','No','26%','Il 26%','Sì, sempre']:
            result=new.sezioni([q(1,'Come sono tassati i dividendi?',answer),q(2,'Come sono tassati gli interessi?',answer)])
            self.assertNotEqual(section_of(result,1),'Stessa risposta')
    def test_actual_m2_formulas_and_swap_directions_stay_distinct(self):
        bank={q['n']:q for q in BANK}
        for a,b in [(2696,2697),(2907,2908)]:
            self.assertFalse(new.equivalent(bank[a],bank[b]))
    def test_formula_operators_are_not_erased_in_exact_questions(self):
        result=new.sezioni([q(1,'Quanto vale C*(1+i*t)?'),q(2,'Quanto vale C*(1+i)^t?')])
        self.assertNotEqual(section_of(result,1),'Uguali')
    def test_actual_answers_with_reversed_roles_are_distinct(self):
        bank={q['n']:new.prepare(q) for q in BANK}
        for a,b in [(2928,2929),(2393,2394),(1894,1917)]:
            self.assertFalse(new.same_answer(bank[a],bank[b]))
            self.assertFalse(new.equivalent(bank[a],bank[b]))
    def test_different_m1_cases_are_not_called_equivalent(self):
        bank={q['n']:q for q in BANK}
        for a,b in [(606,607),(730,731),(1194,1196),(1344,1347),(1784,1785),(1906,1907)]:
            self.assertFalse(new.equivalent(bank[a],bank[b]))
    def test_reviewed_m5_paraphrases_precede_answer_families(self):
        result=new.sezioni([q for q in BANK if q['materia']==5])
        for n in [4750,4755,4919,4926,4809,4812]:
            self.assertEqual(section_of(result,n),'Uguali')
        for n in [4688,4689,4848,4928]:
            self.assertEqual(section_of(result,n),'Stessa risposta')
    def test_short_informative_answers_can_form_contextual_families(self):
        items=[q(1,'Quale autorità vigila sugli intermediari?', 'CONSOB'),q(2,'Quale autorità approva il prospetto degli intermediari?', 'CONSOB')]
        result=new.sezioni(items)
        self.assertEqual(section_of(result,1),'Stessa risposta')
    def test_exact_stems_with_distinct_answers_stay_together(self):
        result=new.sezioni([q(1,'Quali strumenti sono ammessi?','Le azioni'),q(2,'Quali strumenti sono ammessi?','I titoli di Stato'),q(3,'Quanto costa?', 'Dieci euro')])
        self.assertEqual(result[0][0],'Uguali')
        self.assertEqual(result[0][2][0],[1,2])
    def test_related_subtopics_share_blocks_without_splitting_their_groups(self):
        qs=[dict(q(n,f'Quale è il caso numero {n}?',f'Risposta del caso {n}'),sub='Uno' if n<4 else 'Due') for n in range(1,8)]
        result=new.sezioni(qs)
        blocks=[b for s,c,B in result for b in B]
        self.assertEqual(len(blocks),1)
        self.assertEqual(set(blocks[0][:3]),{1,2,3})
    def test_complete_link_prevents_similarity_chains(self):
        items=[q(i,str(i)) for i in range(1,4)]
        families=new.families(items,lambda a,b:abs(a['n']-b['n'])==1)
        self.assertTrue(all(len(g)<=2 for g in families))
    def test_m4_published_order_is_unchanged(self):
        for name in ('index.html','palestra_ocf.html','preview.html'):
            data=json.loads(re.search(r'<script id="ocf-data" type="application/json">(.*?)</script>',(ROOT/name).read_text(),re.S).group(1))
            actual=hashlib.sha256(json.dumps(data['ord']['4'],separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
            self.assertEqual(actual, '80da208157792fbfa199858da90e53691c51ffeaaac60efbbc41ddd6f0e0c02f')
    def test_m3_source_drift_fails_closed(self):
        changed=copy.deepcopy([x for x in BANK if x['materia']==3]);changed[0]['A']+=' changed'
        with self.assertRaisesRegex(ValueError,'M3'):new.reviewed_m3(changed)
    def test_all_subjects_are_complete_deterministic_and_bounded(self):
        for m in (1,2,3,5):
            qs=[x for x in BANK if x['materia']==m]
            result=new.sezioni(qs);again=new.sezioni(list(reversed(qs)))
            self.assertEqual(result,again)
            ids=[n for s,c,B in result for b in B for n in b]
            self.assertEqual(sorted(ids),sorted(x['n'] for x in qs))
            self.assertEqual(len(ids),len(set(ids)))
            self.assertTrue(all(1<=len(b)<=15 for s,c,B in result for b in B))
    def test_m3_exact_pdf_sequence_and_boundaries(self):
        plan=json.loads((ROOT/'ordine_m3.json').read_text())
        sections=new.reviewed_m3([x for x in BANK if x['materia']==3])
        actual=[b for s,c,B in sections for b in B]
        self.assertEqual(actual,plan['blocks'])
        self.assertEqual(len(actual),40)
if __name__=='__main__':unittest.main()
