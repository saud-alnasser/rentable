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
 * The Rust side holds the same six acts on the same bits and reads this package's source to
 * prove it (`organization/permission.rs`); this table is the role half of the same guarantee.
 */

const ROLES: Role[] = ['owner', 'administrator', 'member'];

/** what each act is, for each role. The decision of record; the package is what carries it. */
const DECIDED: Record<Administration, Record<Role, boolean>> = {
	inviteMember: { owner: true, administrator: true, member: false },
	removeMember: { owner: true, administrator: true, member: false },
	changeRole: { owner: true, administrator: true, member: false },
	renameWorkspace: { owner: true, administrator: false, member: false },
	deleteWorkspace: { owner: true, administrator: false, member: false },
	transferOwnership: { owner: true, administrator: false, member: false }
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

// the two acts the dashboard draws on: inviting is the administrator's too, and creating or
// destroying a workspace is the owner's alone, which is why an administrator is told to ask.
test('an administrator invites, and only an owner deletes a workspace', () => {
	assert.equal(permits(ADMINISTRATION_BY_ROLE.administrator, 'inviteMember'), true);
	assert.equal(permits(ADMINISTRATION_BY_ROLE.administrator, 'deleteWorkspace'), false);
	assert.equal(permits(ADMINISTRATION_BY_ROLE.member, 'inviteMember'), false);
	assert.equal(permits(ADMINISTRATION_BY_ROLE.owner, 'deleteWorkspace'), true);
});
