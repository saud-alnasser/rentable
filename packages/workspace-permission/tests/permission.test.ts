import assert from 'node:assert/strict';
import test from 'node:test';

import {
	ADMINISTRATION,
	ADMINISTRATION_BY_ROLE,
	BUILT_IN,
	EVERY_ADMINISTRATION,
	EVERY_FLAG,
	FAMILIES,
	FLAGS,
	HIGHEST_USABLE_BIT,
	MEMBER_ADMINISTRATION,
	OWNER_ONLY,
	WRITE_FLAGS,
	effectiveIn,
	maskOf,
	permits,
	xorOf,
	type Flag
} from '../index.ts';

/**
 * The guard decision 04 chose option A on the strength of, as a function so the test below can
 * prove it still fails a flag at bit 53 rather than trusting that it would.
 */
const guard = (table: Readonly<Record<string, number>>): void => {
	const bits = Object.values(table);

	for (const [name, bit] of Object.entries(table)) {
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
};

// Deleting the guard takes the protection with it, which is why it is the first test in the
// file rather than the last.
test('no flag reaches bit 53, and each has a bit of its own', () => {
	guard(FLAGS);
	guard(ADMINISTRATION);
});

test('the guard fails a flag at bit 53, and at a bit two flags share', () => {
	assert.throws(() => guard({ ...FLAGS, aFiftyFourthFlag: 53 }), /bit 53/);
	assert.throws(() => guard({ ...FLAGS, aSecondInviteMember: 0 }), /two flags share a bit/);
	assert.doesNotThrow(() => guard({ ...FLAGS, theLastUsableFlag: 52 }));
});

/**
 * Every flag on the bit the plan of effort 838 gives it, and nothing else.
 *
 * **The bits are written out rather than derived**, because Rust holds a copy of this table and
 * reads the package as text to prove the two agree (`organization/permission.rs`). A bit that
 * moved here and not there is a member whose stored permissions mean something else on the other
 * side of the boundary, which is the one failure neither language can catch on its own.
 */
test('every flag sits on the bit the plan gives it, and bits 18, 19 and 40 up are free', () => {
	assert.deepEqual(FLAGS, {
		inviteMember: 0,
		removeMember: 1,
		assignRole: 2,
		renameWorkspace: 3,
		resetPassword: 4,
		renameMember: 5,
		grantWorkspace: 6,
		manageRoles: 7,
		overrideMember: 8,
		manageMark: 9,
		createWorkspace: 10,
		deleteWorkspace: 11,
		mintReadOnly: 12,
		lockOut: 13,
		renewCredentials: 14,
		tursoAccount: 15,
		transferOwnership: 16,
		deleteOrganization: 17,
		viewComplex: 20,
		createComplex: 21,
		editComplex: 22,
		deleteComplex: 23,
		viewUnit: 24,
		createUnit: 25,
		editUnit: 26,
		deleteUnit: 27,
		viewTenant: 28,
		createTenant: 29,
		editTenant: 30,
		deleteTenant: 31,
		viewContract: 32,
		createContract: 33,
		editContract: 34,
		deleteContract: 35,
		viewPayment: 36,
		createPayment: 37,
		editPayment: 38,
		deletePayment: 39
	});
	assert.equal(EVERY_FLAG.length, 38);
	assert.deepEqual(
		EVERY_FLAG.map((flag) => FLAGS[flag]),
		[...EVERY_FLAG.map((flag) => FLAGS[flag])].sort((left, right) => left - right),
		'EVERY_FLAG is in bit order'
	);
});

/**
 * Today's seven acts, under today's names, on the same bits as the flags they are.
 *
 * *Bits 4 and 5 carried two acts effort 826 retired, and nothing that shipped stored them; the
 * table below is what every importer reads until ticket 11 of effort 838 moves them onto `FLAGS`.*
 */
test("today's names stay on their bits, and changeRole is assignRole", () => {
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
	assert.equal(ADMINISTRATION.changeRole, FLAGS.assignRole);

	for (const name of EVERY_ADMINISTRATION) {
		if (name !== 'changeRole') {
			assert.equal(ADMINISTRATION[name], FLAGS[name], `${name} moved`);
		}
	}

	assert.equal(maskOf('changeRole'), maskOf('assignRole'));
	assert.equal(maskOf('changeRole', 'assignRole'), 2 ** FLAGS.assignRole, 'an alias counted twice');
	assert.equal(permits(maskOf('assignRole'), 'changeRole'), true);
});

test('the families partition the flags, each record kind in the order view, create, edit, delete', () => {
	const grouped = Object.values(FAMILIES).flat();

	assert.deepEqual([...grouped].sort(), [...EVERY_FLAG].sort(), 'a flag in no family or in two');
	assert.equal(new Set(grouped).size, grouped.length);

	assert.deepEqual(Object.keys(FAMILIES), [
		'administration',
		'owner',
		'complex',
		'unit',
		'tenant',
		'contract',
		'payment'
	]);
	assert.deepEqual(
		FAMILIES.administration.map((flag) => FLAGS[flag]),
		[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
	);
	assert.deepEqual(
		FAMILIES.owner.map((flag) => FLAGS[flag]),
		[10, 11, 12, 13, 14, 15, 16, 17]
	);

	for (const [index, kind] of (
		['complex', 'unit', 'tenant', 'contract', 'payment'] as const
	).entries()) {
		const noun = kind[0].toUpperCase() + kind.slice(1);

		assert.deepEqual(FAMILIES[kind], [
			`view${noun}`,
			`create${noun}`,
			`edit${noun}`,
			`delete${noun}`
		]);
		assert.deepEqual(
			(FAMILIES[kind] as readonly Flag[]).map((flag) => FLAGS[flag]),
			[0, 1, 2, 3].map((offset) => 20 + index * 4 + offset)
		);
	}
});

test("the owner's flags, the member administration and the write flags are the ones the plan names", () => {
	assert.deepEqual(OWNER_ONLY, [
		'createWorkspace',
		'deleteWorkspace',
		'mintReadOnly',
		'lockOut',
		'renewCredentials',
		'tursoAccount',
		'transferOwnership',
		'deleteOrganization'
	]);
	assert.deepEqual([...MEMBER_ADMINISTRATION].sort(), [
		'assignRole',
		'inviteMember',
		'overrideMember',
		'removeMember',
		'renameMember',
		'resetPassword'
	]);
	assert.deepEqual(
		[...WRITE_FLAGS].sort(),
		EVERY_FLAG.filter((flag) => /^(create|edit|delete)[A-Z]/.test(flag) && FLAGS[flag] >= 20).sort()
	);
	assert.equal(WRITE_FLAGS.length, 15);
});

test('the built-in roles carry the ids, ranks and masks the plan gives them', () => {
	const every = maskOf(...EVERY_FLAG);
	const records = (...verbs: readonly string[]): Flag[] =>
		EVERY_FLAG.filter((flag) => verbs.some((verb) => flag.startsWith(verb)) && FLAGS[flag] >= 20);

	assert.deepEqual(
		Object.values(BUILT_IN).map(({ id, rank }) => [id, rank]),
		[
			['owner', 2_000_000],
			['manager', 1_000_000],
			['member', 0]
		]
	);

	assert.equal(BUILT_IN.owner.mask, every);
	assert.equal(BUILT_IN.manager.mask, every - maskOf(...OWNER_ONLY));
	assert.equal(BUILT_IN.member.mask, maskOf(...records('view', 'create', 'edit')));

	for (const flag of EVERY_FLAG) {
		assert.equal(permits(BUILT_IN.owner.mask, flag), true, `owner may not ${flag}`);
		assert.equal(
			permits(BUILT_IN.manager.mask, flag),
			!OWNER_ONLY.includes(flag),
			`manager and ${flag}`
		);
		assert.equal(
			permits(BUILT_IN.member.mask, flag),
			FLAGS[flag] >= 20 && !flag.startsWith('delete'),
			`member and ${flag}`
		);
	}
});

test('every flag at once is still an exact value', () => {
	const everything = maskOf(...EVERY_FLAG);

	assert.ok(
		Number.isSafeInteger(everything),
		`a row holding every permission stores ${everything}, which JavaScript cannot hold exactly`
	);
	assert.equal(everything, 2 ** 40 - 1 - 2 ** 18 - 2 ** 19);
});

// Why this module does arithmetic where bit-twiddling would read more naturally. Decision 04
// measured the ceiling at 2^53; the operators have a second, lower one at bit 31, and the payment
// flags sit above it.
test('a flag at bit 39 survives xorOf and permits, where ^ and & coerce it away', () => {
	const payment = 2 ** FLAGS.deletePayment;

	assert.equal(FLAGS.deletePayment, 39);

	assert.equal(xorOf(payment + 1, 1), payment, 'xorOf kept bit 39');
	assert.equal(xorOf(payment, payment), 0);
	assert.equal(xorOf(payment, 0), payment);
	assert.equal(
		(payment + 1) ^ 1,
		0,
		"javascript's ^ coerces to a signed 32-bit integer, so bit 39 is lost entirely, which is " +
			'why xorOf works bit by bit'
	);

	assert.equal(permits(payment, 'deletePayment'), true, 'permits read bit 39');
	assert.equal(permits(payment, 'viewComplex'), false);
	assert.equal(
		payment & payment,
		0,
		"javascript's & coerces the same way, which is why permits divides"
	);

	const high = 2 ** HIGHEST_USABLE_BIT;

	assert.equal(xorOf(high + 1, high), 1, 'bit 52 reads, and bit 0 alongside it');
	assert.equal(high | 0, 0, 'which is also why maskOf sums powers of two rather than using |');
});

test('a read-only grant clears every write flag and nothing else', () => {
	const every = maskOf(...EVERY_FLAG);

	assert.equal(effectiveIn(every, 'full-access'), every);
	assert.equal(effectiveIn(every, 'read-only'), every - maskOf(...WRITE_FLAGS));
	assert.equal(
		effectiveIn(maskOf('viewPayment', 'deletePayment'), 'read-only'),
		maskOf('viewPayment')
	);
	assert.equal(effectiveIn(0, 'read-only'), 0);
});

test('a plain member administers nothing', () => {
	assert.equal(ADMINISTRATION_BY_ROLE.member, 0);

	for (const name of EVERY_ADMINISTRATION) {
		assert.equal(permits(ADMINISTRATION_BY_ROLE.member, name), false, `member may ${name}`);
	}
});

/**
 * **Both of today's roles carry every act, and what separates them is not in this table.**
 *
 * Requirement 5 of effort 826 keeps six acts out of the table today, because each of them needs the
 * Turso authority and the authority lives on the owner's machine rather than in a row. So the owner
 * and the administrator read alike here, and Rust refuses the owner's acts by asking who the
 * session is. `BUILT_IN` is where the owner's flags are named instead.
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
	const mask = maskOf('removeMember', 'grantWorkspace', 'deletePayment');

	assert.equal(permits(mask, 'removeMember'), true);
	assert.equal(permits(mask, 'grantWorkspace'), true);
	assert.equal(permits(mask, 'deletePayment'), true);
	assert.equal(permits(mask, 'inviteMember'), false);
	assert.equal(permits(mask, 'renameMember'), false);
	assert.equal(permits(mask, 'editPayment'), false);
	assert.equal(
		mask,
		2 ** FLAGS.removeMember + 2 ** FLAGS.grantWorkspace + 2 ** FLAGS.deletePayment
	);
});
