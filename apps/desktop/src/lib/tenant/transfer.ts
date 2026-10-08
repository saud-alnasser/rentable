import * as s from '$lib/platform/database/schema';
import { newId } from '$lib/platform/database/identity';
import { defineSheet } from '$lib/transfer';
import { asc } from 'drizzle-orm';
import {
	ensureTenantsAvailable,
	identity as nationalIdPattern,
	phone as phonePattern,
	TenantSchema
} from './tenant';

/**
 * THE TENANTS SHEET
 *
 * what a workspace file holds of the tenants, and how they are read back (`$lib/transfer`). A
 * tenant points at nothing, so what its sheet reads is what it creates; a contract names one by
 * national id.
 */

/** A tenant, as a file holds one. */
export type TransferTenant = { name: string; nationalId: string; phone: string };

/** a row of the sheet, as text, before it is a tenant. */
type TenantRow = { name: string; nationalId: string; phone: string };

// derived from the schema rather than restated ([[rules/api-layer]], under *Where things live*).
// Written out, it was three bare strings: the national id and phone patterns `TenantSchema`
// carries were dropped, so a file could write a tenant `tenant.create` refuses. An identity in
// Arabic-Indic digits was the sharp case, because `platform/database/schema.ts` rests its
// ASCII-only search guarantee on such a value being refused on the way in, and one written past
// this was findable by no search afterwards.
const TransferTenantSchema = TenantSchema.omit({ id: true });

export default defineSheet({
	concept: 'tenants',
	order: 1,
	names: { written: 'Tenants', accepted: ['tenants', 'المستأجرون'] },
	view: 'viewTenant',
	columns: [
		{ header: 'Name', value: (tenant: TransferTenant) => tenant.name },
		{ header: 'National ID', value: (tenant) => tenant.nationalId },
		{ header: 'Phone', value: (tenant) => tenant.phone }
	],
	read: async (db): Promise<TransferTenant[]> => {
		const tenants = await db.select().from(s.tenant).orderBy(asc(s.tenant.name), asc(s.tenant.id));

		return tenants.map((tenant) => ({
			name: tenant.name,
			nationalId: tenant.nationalId,
			phone: tenant.phone
		}));
	},
	// each tenant's national id and phone: a tenant is unique on each, and they are checked apart.
	held: async (db) => {
		const tenants = await db
			.select({ nationalId: s.tenant.nationalId, phone: s.tenant.phone })
			.from(s.tenant);

		return tenants.map((tenant) => [tenant.nationalId, tenant.phone]);
	},
	fields: [
		{ id: 'name', headers: ['Name', 'الاسم'], required: true },
		{
			id: 'nationalId',
			headers: ['National ID', 'الهوية الوطنية'],
			required: true,
			identity: 'nationalId'
		},
		{ id: 'phone', headers: ['Phone', 'الهاتف'], required: true, identity: 'phone' }
	],
	validate: (row: TenantRow) => {
		if (!nationalIdPattern.test(row.nationalId)) {
			return row.nationalId;
		}

		return phonePattern.test(row.phone) ? undefined : row.phone;
	},
	toRecord: (row) => ({
		name: row.name.trim(),
		nationalId: row.nationalId.trim(),
		phone: row.phone.trim()
	}),
	// a contract names its tenant by national id alone, where a row repeating one is turned away
	// under either its national id or its phone.
	answers: {
		held: (name) => [(typeof name === 'string' ? name : name[0]) ?? ''],
		record: (tenant) => [tenant.nationalId],
		unknown: 'workspace.unknownTenant',
		ids: async (db) => {
			const tenants = await db
				.select({ id: s.tenant.id, nationalId: s.tenant.nationalId })
				.from(s.tenant);

			return tenants.map((tenant) => [[tenant.nationalId], tenant.id] as const);
		}
	},
	input: TransferTenantSchema,
	write: async (tenants, writing) => {
		const rows = tenants.map((tenant) => {
			const id = newId();

			writing.name([tenant.nationalId], id);

			return { id, name: tenant.name, nationalId: tenant.nationalId, phone: tenant.phone };
		});

		// the checks `tenant.createMany` makes: the plan rejected a value the workspace held, but
		// one can arrive by sync before the write, and no rule of the shared database refuses it any
		// longer (effort 857, requirement 14), so the whole write is refused by name here.
		await ensureTenantsAvailable(writing.db, rows);

		return {
			statements: rows.map((row) => writing.db.insert(s.tenant).values(row)),
			count: rows.length
		};
	}
});
