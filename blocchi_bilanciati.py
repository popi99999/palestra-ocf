"""Redistribute the existing sequence into equally sized blocks, at most 15."""
import math


def rebalance(entries, contents=(), protected_pairs=(), affinity=None):
    ids, metadata = [], []
    for entry in entries:
        name, ci, blocks = entry[:3]
        for block in blocks:
            ids.extend(block)
            metadata.extend([(name, ci)] * len(block))
    if not ids:
        return []
    count = math.ceil(len(ids) / 15)
    small, larger_count = divmod(len(ids), count)
    protected_pairs = set(protected_pairs)

    def boundary_cost(end):
        if end == len(ids):
            return (0, 0.0)
        pair = (ids[end - 1], ids[end])
        # Lexicographic cost: preserve families before optimising topic breaks.
        return (int(pair in protected_pairs),
                affinity(*pair) if affinity else float(metadata[end - 1] == metadata[end]))

    # State = number of larger blocks used; end = step * small + state.
    states, parents = {0: (0, 0.0)}, {}
    for step in range(1, count + 1):
        following = {}
        for used, cost in states.items():
            for large in (0, 1):
                next_used = used + large
                if next_used > larger_count or larger_count - next_used > count - step:
                    continue
                end = step * small + next_used
                boundary = boundary_cost(end)
                candidate = (cost[0] + boundary[0], cost[1] + boundary[1])
                if next_used not in following or candidate < following[next_used]:
                    following[next_used] = candidate
                    parents[(step, next_used)] = (used, small + large)
        states = following
    sizes, used = [], larger_count
    for step in range(count, 0, -1):
        used, size = parents[(step, used)]
        sizes.append(size)
    sizes.reverse()

    result, offset = [], 0
    for size in sizes:
        block = ids[offset:offset + size]
        meta = metadata[offset:offset + size]
        names = list(dict.fromkeys(name for name, ci in meta))
        cis = list(dict.fromkeys(ci for name, ci in meta))
        name = ' + '.join(names)
        ci = cis[0] if len(cis) == 1 else -1
        label = ' + '.join(contents[c] for c in cis if 0 <= c < len(contents)) if len(cis) > 1 else ''
        if result and result[-1][0] == name and result[-1][1] == ci and result[-1][3] == label:
            result[-1][2].append(block)
        else:
            result.append([name, ci, [block], label])
        offset += size
    assert [n for entry in result for block in entry[2] for n in block] == ids
    assert max(sizes) <= 15 and max(sizes) - min(sizes) <= 1
    return result
