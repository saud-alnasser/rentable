import assert from 'node:assert/strict';
import test from 'node:test';

import {
	ADMINISTRATION,
	ADMINISTRATION_BY_ROLE,
	EVERY_ADMINISTRATION,
	HIGHEST_USABLE_BIT,
	maskOf,
	permits
} from './permission.ts';

// The guard decision 04 chose option A on the strength of. Deleting it takes the protection
// with it, which is why it is the first test in the file rather than the last.
test('no flag reaches bit 53, and each has a bit of its own', () => {
	const bits = Object.values(ADMINISTRATION);

	for (const [name, bit] of Object.entries(ADMINISTRATION)) {
		assert.ok(
			Number.isInteger(bit) && bit >= 0,
			`${name} sits at ${bit}, which is not a bit index`
		);
		assert.ok(
			bit <= HIGHEST_USABLE_BIT,
			`${name} sits at bit ${bit}. Bit 53 and above round the low-order bits away on read, ` +
				'so the flags defined first would be corrupted on rows already written. Decision 04 ' +
				'names the way out: a row per granted permission, which is a migration.'
		);
	}

	assert.equal(new Set(bits).size, bits.length, 'two flags share a bit');
});

test('every flag at once is still an exact value', () => {
	const everything = maskOf(...EVERY_ADMINISTRATION);

	assert.ok(
		Number.isSafeInteger(everything),
		`a membership holding every permission stores ${everything}, which JavaScript cannot hold exactly`
	);
	assert.ok(EVERY_ADMINISTRATION.length <= HIGHEST_USABLE_BIT + 1);
});

// Why this module does arithmetic where bit-twiddling would read more naturally. Decision 04
// measured the ceiling at 2^53; the operators have a second, lower one nobody had measured.
test('a flag high in the range survives the operators this module uses', () => {
	const high = 2 ** HIGHEST_USABLE_BIT;

	assert.equal(Math.floor((high + 1) / 2 ** HIGHEST_USABLE_BIT) % 2, 1, 'bit 52 reads as set');
	assert.equal(Math.floor((high + 1) / 2 ** 0) % 2, 1, 'bit 0 reads as set alongside it');

	assert.equal(
		high | 0,
		0,
		"javascript's bitwise operators coerce to a signed 32-bit integer, so bit 52 is lost " +
			'entirely — which is why maskOf sums powers of two and permits divides'
	);
});

test('a plain member administers nothing', () => {
	assert.equal(ADMINISTRATION_BY_ROLE.member, 0);

	for (const name of EVERY_ADMINISTRATION) {
		assert.equal(permits(ADMINISTRATION_BY_ROLE.member, name), false, `member may ${name}`);
	}
});

test('an owner administers everything, and an administrator does not', () => {
	for (const name of EVERY_ADMINISTRATION) {
		assert.equal(permits(ADMINISTRATION_BY_ROLE.owner, name), true, `owner may not ${name}`);
	}

	assert.equal(permits(ADMINISTRATION_BY_ROLE.administrator, 'inviteMember'), true);
	assert.equal(permits(ADMINISTRATION_BY_ROLE.administrator, 'deleteWorkspace'), false);
	assert.equal(permits(ADMINISTRATION_BY_ROLE.administrator, 'transferOwnership'), false);
});

test('a name given twice is a name given once', () => {
	assert.equal(maskOf('changeRole', 'changeRole'), maskOf('changeRole'));
	assert.equal(permits(maskOf('changeRole', 'changeRole'), 'changeRole'), true);
	assert.equal(
		permits(maskOf('changeRole', 'changeRole'), 'renameWorkspace'),
		false,
		'two of one flag summed into the bit above it'
	);
});

test('a mask carries exactly the flags it was built from', () => {
	const mask = maskOf('removeMember', 'renameWorkspace');

	assert.equal(permits(mask, 'removeMember'), true);
	assert.equal(permits(mask, 'renameWorkspace'), true);
	assert.equal(permits(mask, 'inviteMember'), false);
	assert.equal(mask, 2 ** ADMINISTRATION.removeMember + 2 ** ADMINISTRATION.renameWorkspace);
});
