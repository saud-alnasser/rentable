import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isWholeHalalas } from '../money.ts';

describe('isWholeHalalas', () => {
	it('accepts an amount with no decimal part', () => {
		assert.equal(isWholeHalalas('3'), true);
	});

	it('accepts one and two decimal places', () => {
		assert.equal(isWholeHalalas('0.1'), true);
		assert.equal(isWholeHalalas('2.5'), true);
		assert.equal(isWholeHalalas('0.29'), true);
	});

	it('accepts the smallest amount the input allows', () => {
		assert.equal(isWholeHalalas('0.01'), true);
	});

	it('refuses a third decimal place', () => {
		assert.equal(isWholeHalalas('0.005'), false);
		assert.equal(isWholeHalalas('0.015'), false);
		assert.equal(isWholeHalalas('12.345'), false);
	});

	// scaling by 100 puts 0.07 at 7.000000000000001 and 0.015 at 1.4999999999999998, so a test
	// that rounds the scaled value gets both of these wrong in opposite directions.
	it('is not fooled by the amounts that make a float scale badly', () => {
		assert.equal(isWholeHalalas('0.07'), true);
		assert.equal(isWholeHalalas('0.29'), true);
		assert.equal(isWholeHalalas('1.005'), false);
	});

	// the scaled value stops being exactly representable long before the input stops accepting
	// numbers, which is the case a `value * 100 === Math.round(value * 100)` test fails.
	it('holds at a magnitude where the scaled value is no longer exact', () => {
		assert.equal(isWholeHalalas('99999999.99'), true);
		assert.equal(isWholeHalalas('12345678.91'), true);
	});

	it('accepts exponent notation, which the input also accepts', () => {
		assert.equal(isWholeHalalas('1e3'), true);
	});

	it('refuses a value that is not a number', () => {
		assert.equal(isWholeHalalas('abc'), false);
	});
});
