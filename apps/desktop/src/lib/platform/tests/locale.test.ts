import assert from 'node:assert/strict';
import test from 'node:test';

import {
	RIYAL,
	formatLocaleMoney,
	formatLocaleMoneyRange,
	formatLocaleRangeWithUnit
} from '../locale.ts';

const LTR_ISOLATE = '⁦';
const POP_ISOLATE = '⁩';

/** what the reader would see, with the invisible direction marks taken back out. */
function visible(text: string) {
	return text.replaceAll(LTR_ISOLATE, '').replaceAll(POP_ISOLATE, '').replaceAll('\u00a0', ' ');
}

test('the symbol leads the amount in english', () => {
	assert.equal(visible(formatLocaleMoney('en', 1500)), `${RIYAL} 1,500`);
});

// the same order in the string, because the isolate below is what decides where it lands rather
// than the sentence it is dropped into.
test('and leads it in arabic too, in that locale digits', () => {
	assert.equal(visible(formatLocaleMoney('ar', 1500)), `${RIYAL} ١٬٥٠٠`);
});

// the point of the isolate: left and right are not fixed positions in a bidirectional document,
// and which way a symbol falls depends on the bidi class of the character rather than on
// anything this application chooses.
test('an amount is isolated and forced left to right, so its place does not depend on the sentence', () => {
	const formatted = formatLocaleMoney('ar', 1500);

	assert.ok(formatted.startsWith(LTR_ISOLATE), 'an amount opens the isolate');
	assert.ok(formatted.endsWith(POP_ISOLATE), 'and closes it');
	assert.ok(
		formatted.indexOf(RIYAL) < formatted.indexOf('١'),
		'the symbol comes before the figure'
	);
});

// a figure and its symbol are one thing, and a line break between them reads as two.
test('the symbol is joined to the figure by a space that does not break', () => {
	assert.ok(formatLocaleMoney('en', 1500).includes(`${RIYAL}\u00a0`));
});

test('a range carries one symbol for the pair, not one each', () => {
	assert.equal(visible(formatLocaleMoneyRange('en', 1121, 2242)), `${RIYAL} 1,121 / 2,242`);
});

test('an amount that is already text is taken as written', () => {
	assert.equal(visible(formatLocaleMoney('en', ' 1,500.50 ')), `${RIYAL} 1,500.50`);
});

// the currency is the one thing here that is not a translation, so both locales get the same
// mark — where a word unit still reads in the direction of the sentence around it.
test('a word unit still follows the reading direction, unlike the symbol', () => {
	assert.equal(formatLocaleRangeWithUnit('en', 80, 80, 'units'), '80 / 80 units');
	assert.equal(formatLocaleRangeWithUnit('ar', 80, 80, 'وحدات'), 'وحدات ٨٠ / ٨٠');
});
