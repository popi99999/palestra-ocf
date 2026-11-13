# Ordine di studio M1, M2, M3 e M5 - Implementation Plan

> For agentic workers: implement inline with superpowers:executing-plans. Steps use checkboxes.

**Goal:** Apply the approved ordering criterion to M1/M2/M3/M5 and publish the site, preserving M4 and all question/progress identities.

**Architecture:** Keep the existing section/block payload and the legacy M4 generator. Add a conservative question-only matcher for M1/M2/M5 and the reviewed, source-fingerprinted M3 families from the delivered PDF. The build validates exact coverage before embedding data.

**Tech Stack:** Python standard library, existing static HTML/JS and GitHub Pages.

**Spec:** User-approved PDF grouping and explicit instruction to apply to the site; correction excludes M4 and includes M5.

## Global Constraints
- Never change question text, correct answers, distractors, question IDs or progress storage.
- M3 must reproduce the PDF's sequence and 40 block boundaries.
- Preserve M4's published ordering exactly.
- Every question once, blocks 1-15 questions, deterministic output.
- Identical stems come first even when answer choices differ.
- Equivalence cannot discard negations or numeric conditions; use complete-link grouping to avoid transitive drift.
- Shared short answers or isolated percentages do not establish an answer family.

## Review Focus
- Identical stems with differing correct alternatives remain adjacent and individually intact.
- Negations, taxable/exempt and numeric changes are not accepted as paraphrases.
- Large families stay contiguous when they exceed 15 questions.
- Existing ordered-session histories determine completion by question ID, not old block number.
- A stale M3 source bank must fail the build, not silently reuse a reviewed plan.

### Task 1: Ordering and integrity checks
Files: create ordine_revisionato.py, ordine_m3.json, tests/test_ordine_revisionato.py; modify build.py.
- [x] Write failing tests for opposite questions, numeric changes, trivial answers, exact stems, completeness and M3 source drift.
- [x] Implement conservative family ordering and reviewed M3 loading.
- [x] Test full-bank coverage, determinism, max block size, exact M3 plan, unchanged M4 and all non-order data.

### Task 2: Build, browser verification and release
Files: generated index.html, palestra_ocf.html, preview.html, version.txt; update README ordering documentation.
- [x] Rebuild and compare the baseline payload: only ord and version may change.
- [x] Inspect candidate groups and record counts/limitations in docs/ordine-studio.md.
- [x] Exercise ordered reading in browser without recording study answers on the user's account; verify existing progress logic with a synthetic history in a Node VM.
- [ ] Review diff, commit, fast-forward publish, verify deployed version and M4 order.
