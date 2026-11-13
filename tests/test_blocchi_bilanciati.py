import math,unittest
from blocchi_bilanciati import rebalance

def flatten(entries): return [n for entry in entries for b in entry[2] for n in b]
class BalancedBlocksTests(unittest.TestCase):
    def test_all_subject_sizes_are_fourteen_or_fifteen(self):
        for count in (400,500,1600,2000):
            old=[['Uguali',-1,[list(range(1,8))]],['Stesso argomento',3,[list(range(8,count+1))]]]
            result=rebalance(old)
            sizes=[len(b) for entry in result for b in entry[2]]
            self.assertEqual(flatten(result),list(range(1,count+1)))
            self.assertEqual(len(sizes),math.ceil(count/15))
            self.assertTrue(all(14<=n<=15 for n in sizes))
    def test_small_section_is_joined_with_the_next(self):
        old=[['Uguali',-1,[[1,2]]],['Stessa risposta',-1,[list(range(3,16))]]]
        new=rebalance(old)
        self.assertEqual(flatten(new),list(range(1,16)))
        self.assertEqual(len(new),1)
        self.assertEqual(new[0][0],'Uguali + Stessa risposta')
    def test_related_topics_are_described_when_combined(self):
        old=[['Stesso argomento',0,[list(range(1,8))]],['Stesso argomento',1,[list(range(8,16))]]]
        new=rebalance(old,contents=['Titoli di credito','Obbligazioni'])
        self.assertEqual(new[0][1],-1)
        self.assertEqual(new[0][3],'Titoli di credito + Obbligazioni')
    def test_prefers_a_boundary_between_families(self):
        old=[['Uguali',-1,[list(range(1,30))]]]
        # 29 questions: either 14+15 or 15+14. Protect the pair at 14/15.
        result=rebalance(old,protected_pairs={(14,15)})
        self.assertEqual([len(b) for e in result for b in e[2]],[15,14])
    def test_empty_and_short_inputs(self):
        self.assertEqual(rebalance([]),[])
        self.assertEqual(flatten(rebalance([['Uguali',-1,[[1,2,3]]]])),[1,2,3])
    def test_deterministic(self):
        old=[['Stesso argomento',2,[list(range(1,501))]]]
        self.assertEqual(rebalance(old),rebalance(old))
if __name__=='__main__':unittest.main()
