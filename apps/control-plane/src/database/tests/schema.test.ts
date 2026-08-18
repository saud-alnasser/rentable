import assert from 'node:assert/strict';
import test from 'node:test';

import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';

import * as schema from '../schema.ts';

const tables = Object.values(schema).filter((exported) => is(exported, SQLiteTable));

const configOf = (name: string) => {
	const table = tables.find((candidate) => getTableName(candidate) === name);
	assert.ok(table, `there is no table named ${name}`);
	return getTableConfig(table);
};

const columnNamed = (columns: ReturnType<typeof configOf>['columns'], name: string) => {
	const column = columns.find((candidate) => candidate.name === name);
	assert.ok(column, `there is no column named ${name}`);
	return column;
};

// "No domain table" is the property the whole architecture rests on — the API is in the
// credential path and never in the data path, and a table describing a contract here is the
// first step of the shape that was rejected. Nothing else in the tree would object to one.
test('the control plane describes accounts, workspaces and membership, and nothing else', () => {
	assert.deepEqual(tables.map(getTableName).sort(), ['account', 'membership', 'workspace']);
});

test('an account is identified by Google, and by nothing else', () => {
	const { columns } = configOf('account');

	assert.ok(columnNamed(columns, 'id').primary);
	assert.ok(
		columnNamed(columns, 'google_user_id').isUnique,
		'two accounts could be the same Google user'
	);
	assert.ok(columnNamed(columns, 'google_user_id').notNull);
	assert.equal(columnNamed(columns, 'avatar_url').notNull, false, 'not everybody has a picture');
});

// An address that was reassigned belongs to a different Google subject, so it is a different
// person and a different row. A unique index here would refuse their first sign-in.
test('an email is not an identity, so two accounts may hold one', () => {
	const { columns } = configOf('account');

	assert.equal(
		columnNamed(columns, 'email').isUnique,
		false,
		'the email is unique again — see the note on `account` in schema.ts'
	);
	assert.equal(columnNamed(columns, 'email').notNull, true);
});

test('a workspace belongs to an account, and the reference is declared', () => {
	const { columns, foreignKeys } = configOf('workspace');

	assert.ok(columnNamed(columns, 'owner_account_id').notNull);
	assert.deepEqual(
		foreignKeys.map((key) => getTableName(key.reference().foreignTable)),
		['account']
	);
});

// A workspace with no database is a state only a crash produces, and creating one removes the
// database again rather than leaving the record half-written. So the columns are not null, and
// no reader has to carry the case.
test('a workspace names the database its data lives in', () => {
	const { columns } = configOf('workspace');

	assert.ok(columnNamed(columns, 'database_name').notNull);
	assert.ok(
		columnNamed(columns, 'database_name').isUnique,
		'two workspaces could share a database'
	);
	assert.ok(columnNamed(columns, 'database_hostname').notNull);
});

/**
 * Decision 06's column: how far this workspace's database has been migrated.
 *
 * **Not null with a default of zero**, because a workspace's database is created empty and every
 * record is written at zero — there is no moment at which "we do not know" is the truth, and a
 * nullable column would have made the mint carry a case that never happens. The authority is the
 * hosted database's own ledger; this is what the mint compares against without opening it.
 */
test('a workspace says how far its database has been migrated', () => {
	const { columns } = configOf('workspace');
	const version = columnNamed(columns, 'schema_version');

	assert.equal(version.getSQLType(), 'integer');
	assert.equal(version.notNull, true);
	assert.equal(version.default, 0, 'a workspace database is created empty');
});

test('one membership per account per workspace', () => {
	const { primaryKeys } = configOf('membership');

	assert.equal(primaryKeys.length, 1);
	assert.deepEqual(primaryKeys.flatMap((key) => key.columns.map((column) => column.name)).sort(), [
		'account_id',
		'workspace_id'
	]);
});

// Decision 05, expressed where it can be checked: a member's access to data is their
// membership, so the only thing a membership row grades is administration. A second permission
// column — one naming records rather than acts — is what this test exists to notice.
test('a membership grades administration and nothing else', () => {
	const { columns } = configOf('membership');

	assert.deepEqual(columns.map((column) => column.name).sort(), [
		'account_id',
		'created_at',
		'permissions',
		'role',
		'updated_at',
		'workspace_id'
	]);

	const permissions = columnNamed(columns, 'permissions');

	assert.equal(permissions.getSQLType(), 'integer', 'decision 04 stores the set as one integer');
	assert.equal(permissions.notNull, true);
	assert.equal(permissions.default, 0, 'a member with no administration is the ordinary case');
});
