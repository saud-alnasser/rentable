import assert from 'node:assert/strict';
import test from 'node:test';

import {
	ADMINISTRATION,
	ADMINISTRATION_BY_ROLE,
	EVERY_ADMINISTRATION,
	HIGHEST_USABLE_BIT,
	maskOf,
	permits
} from '../index.ts';

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

/**
 * The seven grantable acts of requirement 4, each on the bit it was given, and no eighth.
 *
 * **The bits are written out rather than derived**, because Rust holds a copy of this table and
 * reads this file as text to prove the two agree (`organization/permission.rs`). A bit that moved
 * here and not there is a member whose stored permissions mean something else on the other side of
 * the boundary, which is the one failure neither language can catch on its own.
 *
 * *Bits 4 and 5 carried two acts effort 826 retired: deleting a workspace, which needs the Turso
 * authority and so was a flag granting could not deliver, and a transfer of ownership, which is
 * Turso's succession rather than anything this application performs. Nothing had shipped, and
 * requirement 19 forgets every organization written under the old table, so no stored value
 * survives to be misread.*
 */
test('the seven grantable acts sit on the bits requirement 4 gives them, and nothing else does', () => {
	assert.deepEqual(ADMINISTRATION, {
		inviteMember: 0,
		removeMember: 1,
		changeRole: 2,
		renameWorkspace: 3,
		resetPassword: 4,
		renameMember: 5,
		grantWorkspace: 6
	});
	assert.equal(EVERY_ADMINISTRATION.length, 7);
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
			'entirely, which is why maskOf sums powers of two and permits divides'
	);
});

test('a plain member administers nothing', () => {
	assert.equal(ADMINISTRATION_BY_ROLE.member, 0);

	for (const name of EVERY_ADMINISTRATION) {
		assert.equal(permits(ADMINISTRATION_BY_ROLE.member, name), false, `member may ${name}`);
	}
});

/**
 * **Both roles carry every act, and what separates them is not in this table.**
 *
 * Requirement 5 keeps six acts out of the permission model altogether, because each of them needs
 * the Turso authority and the authority lives on the owner's machine rather than in a row: a flag
 * for one would be a promise granting cannot keep. So the owner and the administrator read alike
 * here, and Rust refuses the owner's acts by asking who the session is.
 */
test('an owner and an administrator both administer every grantable act', () => {
	for (const name of EVERY_ADMINISTRATION) {
		assert.equal(permits(ADMINISTRATION_BY_ROLE.owner, name), true, `owner may not ${name}`);
		assert.equal(
			permits(ADMINISTRATION_BY_ROLE.administrator, name),
			true,
			`administrator may not ${name}`
		);
	}

	assert.equal(ADMINISTRATION_BY_ROLE.owner, ADMINISTRATION_BY_ROLE.administrator);
});

// **The acts are named rather than a total asserted**, and the difference is what the test
// catches: `assert.equal(ADMINISTRATION_BY_ROLE.administrator, 127)` would pass just as well if
// a flag were renamed underneath it, and would have to be edited by whoever added the next
// one. Naming the act is the same thing every caller does.
test('an act is read by name, and a narrowed row carries only what it was given', () => {
	assert.equal(permits(ADMINISTRATION_BY_ROLE.administrator, 'renameWorkspace'), true);
	assert.equal(permits(ADMINISTRATION_BY_ROLE.administrator, 'grantWorkspace'), true);

	// the column is still the truth, which is the whole reason a default may change without a
	// migration: a member narrowed to one act carries that one and no other.
	assert.equal(permits(maskOf('renameWorkspace'), 'renameWorkspace'), true);
	assert.equal(permits(maskOf('renameWorkspace'), 'grantWorkspace'), false);
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
	const mask = maskOf('removeMember', 'grantWorkspace');

	assert.equal(permits(mask, 'removeMember'), true);
	assert.equal(permits(mask, 'grantWorkspace'), true);
	assert.equal(permits(mask, 'inviteMember'), false);
	assert.equal(permits(mask, 'renameMember'), false);
	assert.equal(mask, 2 ** ADMINISTRATION.removeMember + 2 ** ADMINISTRATION.grantWorkspace);
});
