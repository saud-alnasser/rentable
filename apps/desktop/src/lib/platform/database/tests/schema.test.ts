import assert from 'node:assert/strict';
import { test } from 'node:test';

import { history, HistorySchema } from '../schema.ts';

// THE STORED HISTORY CONCEPTS
//
// The `concept` column of `history` is data at rest: a row written today is read by every later
// version. Its values were spelled out in the schema until effort 840, and are now read off the
// permission package's `RECORD_KINDS`, so a kind renamed or added there would change what the
// column accepts without an edit here. This pins the five strings a row may hold, whatever their
// order, which is stored nowhere (ticket 67).

const STORED = ['complex', 'contract', 'payment', 'tenant', 'unit'];

test('the history column accepts exactly the five concepts it always stored', () => {
	assert.deepEqual([...history.concept.enumValues].sort(), STORED);
});

test('a history row is read with exactly the five concepts it always stored', () => {
	assert.deepEqual([...HistorySchema.shape.concept.options].sort(), STORED);
});
