import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { createMemoryDatabase } from '$lib/platform/database/memory';
import { keepRetiredOut, RETIRABLE } from '$lib/platform/database/retired';
import * as s from '$lib/platform/database/schema';
import { SRC_ROOT, sourceFiles } from '#tests/source.ts';

const KEPT = 'e0000000-0000-7000-8000-000000000001';
const RETIRED = 'e0000000-0000-7000-8000-000000000002';
const CONTRACT = 'e0000000-0000-7000-8000-000000000003';
const CONTRACT_RETIRED = 'e0000000-0000-7000-8000-000000000004';
const COMPLEX = 'e0000000-0000-7000-8000-000000000005';
const COMPLEX_RETIRED = 'e0000000-0000-7000-8000-000000000006';

/**
 * A workspace holding one record of each kind that heals, and an exact copy of each that the pass
 * retired into it: the copy still in its table, as the pass leaves it.
 */
async function healed() {
	const db = createMemoryDatabase();
	const tenant = { nationalId: '1012345678', name: 'Sara', phone: '+966501234567' };
	const complex = { name: 'Palm Court', location: 'Riyadh' };
	const contract = {
		govId: 'GOV-1',
		status: 'active' as const,
		start: new Date(1_750_000_000_000),
		end: new Date(1_780_000_000_000),
		interval: '1m' as const,
		cost: 1000,
		tenantId: KEPT
	};

	await db.batch([
		db.insert(s.tenant).values({ id: KEPT, ...tenant }),
		db.insert(s.tenant).values({ id: RETIRED, ...tenant, mergedInto: KEPT }),
		db.insert(s.complex).values({ id: COMPLEX, ...complex }),
		db.insert(s.complex).values({ id: COMPLEX_RETIRED, ...complex, mergedInto: COMPLEX }),
		db.insert(s.contract).values({ id: CONTRACT, ...contract }),
		db.insert(s.contract).values({ id: CONTRACT_RETIRED, ...contract, mergedInto: CONTRACT })
	]);

	return db;
}

test('the tables a record can be retired from are the five whose records heal', () => {
	assert.deepEqual([...RETIRABLE].sort(), ['complex', 'contract', 'payment', 'tenant', 'unit']);
});

test('a read of a tenant, a complex or a contract never answers a retired one', async () => {
	const db = await healed();

	assert.deepEqual(
		(await db.select({ id: s.tenant.id }).from(s.tenant)).map((row) => row.id),
		[KEPT]
	);
	assert.deepEqual(
		(await db.select({ id: s.complex.id }).from(s.complex)).map((row) => row.id),
		[COMPLEX]
	);
	assert.deepEqual(
		(await db.select({ id: s.contract.id }).from(s.contract)).map((row) => row.id),
		[CONTRACT]
	);
	assert.equal(
		await db.select().from(s.tenant).where(eq(s.tenant.id, RETIRED)).get(),
		undefined,
		'a retired record is not found even by its id'
	);
});

test('a join keeps the retired out of both sides, and a left join still answers its row', async () => {
	const db = await healed();

	const joined = await db
		.select({ contract: s.contract.id, tenant: s.tenant.id })
		.from(s.contract)
		.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id));

	assert.deepEqual(joined, [{ contract: CONTRACT, tenant: KEPT }]);

	// a contract left pointing at a retired tenant, as a machine that had not heard of the merge
	// makes one, answers with no tenant beside it rather than with the retired one.
	await db.update(s.contract).set({ tenantId: RETIRED }).where(eq(s.contract.id, CONTRACT));

	const left = await db
		.select({ contract: s.contract.id, tenant: s.tenant.id })
		.from(s.contract)
		.leftJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id));

	assert.deepEqual(left, [{ contract: CONTRACT, tenant: null }]);
});

test('a write still reaches a retired record by its id, so the pass can carry it', async () => {
	const db = await healed();

	// a statement written by hand reads past nothing either.
	assert.deepEqual(await db.all(sql.raw(`select name from tenant where id = '${RETIRED}'`)), []);

	// an edit made to the retired copy by its id, as a machine that had not heard of the merge
	// makes one, lands on it.
	const touched = await db
		.update(s.tenant)
		.set({ name: 'Sara Al-Harbi' })
		.where(eq(s.tenant.id, RETIRED))
		.returning({ name: s.tenant.name });

	assert.deepEqual(touched, [{ name: 'Sara Al-Harbi' }]);

	await db.delete(s.tenant).where(inArray(s.tenant.id, [RETIRED]));

	assert.deepEqual(
		await db.update(s.tenant).set({ name: 'x' }).where(eq(s.tenant.id, RETIRED)).returning(),
		[],
		'a delete reaches a retired record too'
	);
});

test('the statements drizzle writes gain the condition where they read, and nowhere else', () => {
	const db = createMemoryDatabase();
	const t = alias(s.tenant, 't');
	const written = (query: { toSQL(): { sql: string } }) => keepRetiredOut(query.toSQL().sql);

	assert.equal(
		written(db.select({ id: s.tenant.id }).from(s.tenant).where(eq(s.tenant.id, 'x'))),
		'select "id" from "tenant" where "tenant"."merged_into" is null and ("tenant"."id" = ?)'
	);
	assert.equal(
		written(db.select({ id: s.tenant.id }).from(s.tenant)),
		'select "id" from "tenant" where "tenant"."merged_into" is null'
	);
	assert.equal(
		written(db.select({ id: t.id }).from(t).where(eq(t.id, 'x'))),
		'select "id" from "tenant" "t" where "t"."merged_into" is null and ("t"."id" = ?)'
	);
	assert.equal(
		written(
			db
				.select({ name: s.tenant.name })
				.from(s.contract)
				.innerJoin(s.tenant, eq(s.contract.tenantId, s.tenant.id))
				.leftJoin(s.contractUnit, eq(s.contractUnit.contractId, s.contract.id))
				.where(and(eq(s.contract.id, 'x')))
				.orderBy(s.contract.id)
				.limit(3)
		),
		'select "tenant"."name" from "contract" inner join "tenant" on "tenant"."merged_into" is null and ("contract"."tenant_id" = "tenant"."id") left join "contract_unit" on "contract_unit"."contract_id" = "contract"."id" where "contract"."merged_into" is null and ("contract"."id" = ?) order by "contract"."id" limit ?'
	);
	assert.equal(
		written(
			db
				.select({ id: s.unit.id })
				.from(s.unit)
				.innerJoin(s.complex, eq(s.unit.complexId, s.complex.id))
				.orderBy(s.unit.name)
		),
		'select "unit"."id" from "unit" inner join "complex" on "complex"."merged_into" is null and ("unit"."complex_id" = "complex"."id") where "unit"."merged_into" is null order by "unit"."name"'
	);
	assert.equal(
		written(
			db
				.select({ n: sql`count(*)` })
				.from(s.payment)
				.where(
					sql`exists (select 1 from ${s.contract} where ${s.contract.id} = ${s.payment.contractId} or ${s.contract.govId} is null)`
				)
		),
		'select count(*) from "payment" where "payment"."merged_into" is null and (exists (select 1 from "contract" where "contract"."merged_into" is null and ("contract"."id" = "payment"."contract_id" or "contract"."gov_id" is null)))'
	);
	assert.equal(
		written(
			db
				.select({ id: s.payment.id })
				.from(s.payment)
				.where(inArray(s.payment.contractId, db.select({ id: s.contract.id }).from(s.contract)))
		),
		'select "id" from "payment" where "payment"."merged_into" is null and ("payment"."contract_id" in (select "id" from "contract" where "contract"."merged_into" is null))'
	);

	// writes name their table and are left as they are.
	for (const query of [
		db.update(s.tenant).set({ name: 'a' }).where(eq(s.tenant.id, 'x')).returning(),
		db.delete(s.contract).where(eq(s.contract.id, 'x')),
		db.insert(s.complex).values({ id: 'a', name: 'b', location: 'c' })
	]) {
		assert.equal(written(query), query.toSQL().sql);
	}

	// a statement naming none of the three, or one only sharing a prefix, is answered as it was.
	const units = db.select().from(s.contractUnit).where(eq(s.contractUnit.contractId, 'x'));

	assert.equal(written(units), units.toSQL().sql);
});

test('a statement written by hand gains the condition wherever it reads one of the three', () => {
	assert.equal(
		keepRetiredOut('SELECT name FROM tenant WHERE id = ? OR phone = ? ORDER BY name'),
		'SELECT name FROM tenant WHERE "tenant"."merged_into" is null and (id = ? OR phone = ?) ORDER BY name'
	);
	assert.equal(
		keepRetiredOut('select count(*) from contract c group by c.status'),
		'select count(*) from contract c where "c"."merged_into" is null group by c.status'
	);
	assert.equal(
		keepRetiredOut(
			"select * from complex as k where k.name = 'from tenant' union select * from complex"
		),
		`select * from complex as k where "k"."merged_into" is null and (k.name = 'from tenant') union select * from complex where "complex"."merged_into" is null`
	);
	assert.equal(
		keepRetiredOut('delete from "tenant" where "id" = ?'),
		'delete from "tenant" where "id" = ?'
	);
	assert.equal(
		keepRetiredOut('select 1 from "tenant", "complex"'),
		'select 1 from "tenant", "complex" where "tenant"."merged_into" is null',
		'a second table after a comma is not seen, which the source check below forbids writing'
	);
});

/**
 * **What would let a read forget the condition**, checked over the source rather than trusted:
 * a client that is not built by `createDatabase`, so its statements never pass the rewrite, or a
 * statement naming one of the three tables where the rewrite does not look for one. A read
 * written in a new place through either fails here.
 */
test('every statement reaches the engine through the one client the rewrite is in', () => {
	const clients: string[] = [];
	const unseen: string[] = [];

	for (const { file, label: relative } of sourceFiles(/\.(ts|svelte)$/)) {
		const source = readFileSync(file, 'utf8');

		const builds =
			/from 'drizzle-orm\/(sqlite-proxy|better-sqlite3|libsql)'/.test(source) &&
			/\bdrizzle\(/.test(source);
		const invokes = /execute_(single|batch)_sql/.test(source);

		if ((builds || invokes) && relative !== 'lib/platform/database/client.ts') {
			clients.push(relative);
		}

		// a table interpolated into a `sql` template is read where it follows `from` or `join`,
		// and anywhere else it is a read the rewrite does not see.
		for (const match of source.matchAll(/(\w+)?\s*\$\{s\.(tenant|complex|contract)\}/g)) {
			if (!/^(from|join)$/i.test(match[1] ?? '')) {
				unseen.push(`${relative}: ${match[0].trim()}`);
			}
		}
	}

	assert.deepEqual(clients, [], `a database client built outside client.ts under ${SRC_ROOT}`);
	assert.deepEqual(unseen, [], 'a table named where the rewrite does not look for a read');
});
