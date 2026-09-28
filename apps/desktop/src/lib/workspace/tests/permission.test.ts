import assert from 'node:assert/strict';
import test from 'node:test';

import {
	BUILT_IN,
	EVERY_FLAG,
	FAMILIES,
	WRITE_FLAGS,
	maskOf
} from '@rentable/workspace-permission';
import { accessIn } from '$lib/api/context';
import { i18nObject } from '$lib/i18n/i18n-util.ts';
import { loadLocale } from '$lib/i18n/i18n-util.sync.ts';
import { fakeOrganizationSession, fakeOrganizationWorkspace } from '$lib/platform/tests/testing.ts';
import {
	IMPORT_FLAGS,
	memberPermissions,
	refusalOf,
	refusalOfEvery,
	VIEW_FLAG,
	type RecordFlag,
	type RecordKind
} from '$lib/workspace/permission';

/**
 * WHAT A RECORD CONTROL IS REFUSED FOR
 *
 * Effort 838, requirement 10 and criterion 10: a control whose flag the reader lacks says which
 * flag, in both languages; a read-only grant refuses every write with the grant as the reason; and
 * the value decided on is the one the tRPC context decides on, the session's permissions folded for
 * the workspace open.
 */

loadLocale('en');
loadLocale('ar');

const en = i18nObject('en');
const ar = i18nObject('ar');

const RECORD_FLAGS: RecordFlag[] = [
	...FAMILIES.complex,
	...FAMILIES.unit,
	...FAMILIES.tenant,
	...FAMILIES.contract,
	...FAMILIES.payment
];

const EVERY = maskOf(...EVERY_FLAG);
const fullAccess = (permissions: number) => ({ permissions, accessLevel: 'full-access' as const });

test('a flag the reader holds is refused nothing', () => {
	for (const flag of RECORD_FLAGS) {
		assert.equal(refusalOf(flag, fullAccess(EVERY), en), undefined, flag);
	}
});

test('a flag the reader lacks is refused, naming it, in english and in arabic', () => {
	for (const flag of RECORD_FLAGS) {
		const standing = fullAccess(maskOf(...EVERY_FLAG.filter((held) => held !== flag)));

		assert.equal(refusalOf(flag, standing, en), en.common.permission.missing[flag](), flag);
		assert.equal(refusalOf(flag, standing, ar), ar.common.permission.missing[flag](), flag);
	}

	// each reason is its own sentence: two flags sharing one would not be naming either.
	const sentences = new Set(RECORD_FLAGS.map((flag) => en.common.permission.missing[flag]()));

	assert.equal(sentences.size, RECORD_FLAGS.length);
	assert.equal(
		en.common.permission.missing.deleteTenant(),
		'you do not have permission to delete tenants.'
	);
	assert.equal(ar.common.permission.missing.deleteTenant(), 'ليست لديك صلاحية حذف المستأجرين.');
});

test('the member role deletes nothing, so every delete names its flag', () => {
	const member = fullAccess(BUILT_IN.member.mask);

	for (const flag of RECORD_FLAGS) {
		const refusal = refusalOf(flag, member, en);

		assert.equal(
			refusal,
			flag.startsWith('delete') ? en.common.permission.missing[flag]() : undefined,
			flag
		);
	}
});

test('on a read-only grant every create, edit and delete is refused for the grant, and viewing is not', () => {
	// the role carries every flag, and the member role carries no delete: the grant is the reason
	// either way, because it is what stands in the way.
	for (const permissions of [EVERY, BUILT_IN.member.mask]) {
		const standing = { permissions, accessLevel: 'read-only' as const };

		for (const flag of RECORD_FLAGS) {
			assert.equal(
				refusalOf(flag, standing, en),
				WRITE_FLAGS.includes(flag) ? en.common.permission.readOnly() : undefined,
				flag
			);
		}

		assert.equal(refusalOf('editTenant', standing, ar), ar.common.permission.readOnly());
	}
});

test('a view the role does not carry is refused for the role on a read-only grant too', () => {
	const standing = {
		permissions: maskOf(...EVERY_FLAG.filter((flag) => flag !== 'viewPayment')),
		accessLevel: 'read-only' as const
	};

	assert.equal(refusalOf('viewPayment', standing, en), en.common.permission.missing.viewPayment());
});

test('nothing is refused before the standing is known', () => {
	for (const flag of RECORD_FLAGS) {
		assert.equal(refusalOf(flag, null, en), undefined);
	}
});

test('of several flags, the first one lacking is the reason, and none lacking is none', () => {
	const standing = fullAccess(
		maskOf(...EVERY_FLAG.filter((flag) => flag !== 'createUnit' && flag !== 'createPayment'))
	);

	assert.equal(
		refusalOfEvery(IMPORT_FLAGS, standing, en),
		en.common.permission.missing.createUnit()
	);
	assert.equal(refusalOfEvery(IMPORT_FLAGS, fullAccess(EVERY), en), undefined);
	assert.equal(refusalOfEvery([], fullAccess(0), en), undefined);
});

test('an import asks for what the import procedure asks for: every kind created', () => {
	assert.deepEqual([...IMPORT_FLAGS].sort(), [
		'createComplex',
		'createContract',
		'createPayment',
		'createTenant',
		'createUnit'
	]);
});

test('the held standing answers every reader, and forgets on signing out', (context) => {
	context.after(() => memberPermissions.hold(null));

	const kinds = Object.keys(VIEW_FLAG) as RecordKind[];

	// before anything arrives every kind is shown, for the reason nothing is refused.
	assert.ok(kinds.every((kind) => memberPermissions.views(kind)));

	memberPermissions.hold(
		fullAccess(maskOf(...EVERY_FLAG.filter((flag) => flag !== 'viewContract')))
	);

	assert.deepEqual(
		kinds.filter((kind) => !memberPermissions.views(kind)),
		['contract']
	);
	assert.equal(
		memberPermissions.refusal('viewContract', en),
		en.common.permission.missing.viewContract()
	);

	memberPermissions.hold(null);

	assert.equal(memberPermissions.refusal('viewContract', en), undefined);
});

test('the access folded is the one the context folds: the grant on the workspace open, or read-only', () => {
	const session = fakeOrganizationSession({
		workspaces: [
			fakeOrganizationWorkspace({ id: 'ws-full', accessLevel: 'full-access' }),
			fakeOrganizationWorkspace({ id: 'ws-read', accessLevel: 'read-only' })
		]
	});

	assert.equal(accessIn(session, 'ws-full'), 'full-access');
	assert.equal(accessIn(session, 'ws-read'), 'read-only');
	assert.equal(accessIn(session, 'ws-elsewhere'), 'read-only');
	assert.equal(accessIn(session, null), 'read-only');
});
