"""Load reviewed question sequences without changing their block boundaries."""
import hashlib
import json
from pathlib import Path


def source_fingerprint(subject):
    payload = json.dumps(sorted(subject, key=lambda q: q['n']), ensure_ascii=False,
                         sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(payload.encode()).hexdigest()


def load_approved_order(subject, filename):
    path = Path(filename)
    if not path.exists():
        return None
    plan = json.loads(path.read_text(encoding='utf-8'))
    if (not subject or {q['materia'] for q in subject} != {plan['subject']}
            or source_fingerprint(subject) != plan['source_sha256']):
        raise ValueError(f'{path}: la banca dati è cambiata; rivedere il percorso approvato')
    blocks = plan['blocks']
    ids = [n for block in blocks for n in block['ids']]
    expected = {q['n'] for q in subject}
    if len(ids) != len(expected) or len(set(ids)) != len(ids) or set(ids) != expected:
        raise ValueError(f'{path}: domande mancanti, duplicate o estranee alla materia')
    sizes = [15] * (len(subject) // 15)
    if len(subject) % 15:
        sizes.append(len(subject) % 15)
    if [len(block['ids']) for block in blocks] != sizes:
        raise ValueError(f'{path}: i blocchi devono conservare le divisioni da 15 del PDF')
    labels = [block['label'].strip() for block in blocks]
    if any(not label for label in labels) or len(set(labels)) != len(labels):
        raise ValueError(f'{path}: ogni blocco deve avere un argomento riconoscibile')
    return [['Argomenti', -1, [block['ids']], label]
            for block, label in zip(blocks, labels)]
