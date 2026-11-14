import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from ordini_approvati import load_approved_order


class ApprovedOrdersTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / 'm4.json'
        self.subject = [{'n': n, 'materia': 4, 'domanda': f'Domanda {n}', 'A': 'Risposta'} for n in range(1, 32)]
        self.ids = list(range(31, 0, -1))
        self.plan = {
            'subject': 4,
            'source_sha256': hashlib.sha256(json.dumps(self.subject, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
            'blocks': [{'label': f'Argomento {i}', 'ids': self.ids[start:start + 15]} for i, start in enumerate(range(0, 31, 15))],
        }
        self.addCleanup(self.temp.cleanup)

    def load(self):
        self.path.write_text(json.dumps(self.plan))
        return load_approved_order(self.subject, self.path)

    def test_missing_plan_leaves_the_legacy_generator_available(self):
        self.assertIsNone(load_approved_order(self.subject, self.path))

    def test_keeps_the_approved_order_and_short_last_block(self):
        result = self.load()
        self.assertEqual([n for group in result for block in group[2] for n in block], self.ids)
        self.assertEqual([len(group[2][0]) for group in result], [15, 15, 1])
        self.assertEqual(result[0][3], 'Argomento 0')

    def test_rejects_a_changed_correct_answer(self):
        self.subject[0]['A'] = 'Altra risposta'
        with self.assertRaises(ValueError):
            self.load()

    def test_rejects_duplicate_or_missing_questions(self):
        self.plan['blocks'][0]['ids'][0] = self.plan['blocks'][0]['ids'][1]
        with self.assertRaises(ValueError):
            self.load()

    def test_rejects_rebalancing_the_approved_blocks(self):
        self.plan['blocks'][0]['ids'].pop()
        self.plan['blocks'][1]['ids'].insert(0, 31)
        with self.assertRaises(ValueError):
            self.load()

    def test_rejects_blank_topic_labels(self):
        self.plan['blocks'][0]['label'] = '  '
        with self.assertRaises(ValueError):
            self.load()

    def test_rejects_a_plan_for_a_different_subject(self):
        self.plan['subject'] = 5
        with self.assertRaises(ValueError):
            self.load()


if __name__ == '__main__':
    unittest.main()
