import assert from 'node:assert/strict';
import test from 'node:test';

import { i18nObject } from '../i18n-util.ts';
import { loadAllLocales } from '../i18n-util.sync.ts';

// the formatter is reached the way a surface reaches it — through a translated string — so
// what these pin is the rendered line rather than an `Intl` call anyone could make.
loadAllLocales();

test('a count in an arabic string reads in western numerals', () => {
	assert.equal(i18nObject('ar').common.table.results({ count: 436 }), '436 نتيجة');
});

test('a count in an english string reads in western numerals', () => {
	assert.equal(i18nObject('en').common.table.results({ count: 436 }), '436 results');
});

test('a count past a thousand carries the western group separator in both locales', () => {
	assert.equal(i18nObject('ar').common.table.results({ count: 1436 }), '1,436 نتيجة');
	assert.equal(i18nObject('en').common.table.results({ count: 1436 }), '1,436 results');
});
