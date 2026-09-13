import assert from 'node:assert/strict';
import test from 'node:test';

import {
	ADMINISTRATION_BY_ROLE,
	EVERY_ADMINISTRATION,
	permits,
	type Administration,
	type Role
} from '@rentable/workspace-permission';

/**
 * WHO MAY DO WHAT
 *
 * The package decides which acts each role administers, and this is the table of those decisions
 * written out so that a change to either side is a change somebody has to look at. **It iterates
 * the package's own export**, `EVERY_ADMINISTRATION`, rather than a list copied here: an act added
 * to the package without a row in this table fails the typecheck on `DECIDED` and, if the type
 * were widened, the runtime assertion below it. An act that nobody decided for is what the
 * criterion guards against, because the default for an undecided act is whatever bit arithmetic
 * happens to give, and that is a permission bug that looks exactly like a gate working.
 *
 * The Rust side holds the same seven acts on the same bits and reads this package's source to
 * prove it (`organization/permission.rs`); this table is the role half of the same guarantee.
 *
 * **The owner and the administrator read alike here, and that is requirement 5 of effort 826
 * rather than a table nobody finished.** What separates them is the acts the table does not hold:
 * creating and deleting a workspace, minting a read-only credential, locking a member out,
 * renewing credentials, the Turso account and the organization's own link. Each needs the Turso
 * authority, which sits on one machine and in no row, so a flag for one would be a promise
 * granting cannot keep; Rust refuses them by asking who the session is.
 */

const ROLES: Role[] = ['owner', 'administrator', 'member'];

/** what each act is, for each role. The decision of record; the package is what carries it. */
const DECIDED: Record<Administration, Record<Role, boolean>> = {
	inviteMember: { owner: true, administrator: true, member: false },
	removeMember: { owner: true, administrator: true, member: false },
	changeRole: { owner: true, administrator: true, member: false },
	renameWorkspace: { owner: true, administrator: true, member: false },
	resetPassword: { owner: true, administrator: true, member: false },
	renameMember: { owner: true, administrator: true, member: false },
	grantWorkspace: { owner: true, administrator: true, member: false }
};

test('every act in the package has a decision for every role, and the package agrees with it', () => {
	assert.deepEqual(
		Object.keys(DECIDED).sort(),
		[...EVERY_ADMINISTRATION].sort(),
		'an act in the package has no row here, or a row here names no act'
	);

	for (const act of EVERY_ADMINISTRATION) {
		const decision = DECIDED[act];

		assert.ok(decision, `${act} was added to the package without a role decision`);

		for (const role of ROLES) {
			assert.equal(
				permits(ADMINISTRATION_BY_ROLE[role], act),
				decision[role],
				`${role} ${decision[role] ? 'should' : 'should not'} administer ${act}`
			);
		}
	}
});

// the seven are exactly requirement 4's, named here so that adding one to the package without
// deciding what it is for fails on this list rather than on bit arithmetic nobody reads.
test('the acts are requirement 4 of effort 826, and no others', () => {
	assert.deepEqual(
		[...EVERY_ADMINISTRATION].sort(),
		[
			'changeRole',
			'grantWorkspace',
			'inviteMember',
			'removeMember',
			'renameMember',
			'renameWorkspace',
			'resetPassword'
		],
		'the grantable acts are not the seven requirement 4 names'
	);
});

// what the members section draws on: an administrator is given every grantable act, a plain member
// none, and the acts that need the Turso authority are in neither because they are in no table.
test('an administrator administers, a member does not, and neither table names an owner-only act', () => {
	assert.equal(permits(ADMINISTRATION_BY_ROLE.administrator, 'inviteMember'), true);
	assert.equal(permits(ADMINISTRATION_BY_ROLE.administrator, 'grantWorkspace'), true);
	assert.equal(permits(ADMINISTRATION_BY_ROLE.member, 'inviteMember'), false);
	assert.equal(permits(ADMINISTRATION_BY_ROLE.member, 'grantWorkspace'), false);

	for (const absent of ['createWorkspace', 'deleteWorkspace', 'mintReadOnly', 'lockOut']) {
		assert.ok(
			!(EVERY_ADMINISTRATION as string[]).includes(absent),
			`${absent} is a flag granting cannot deliver`
		);
	}
});
