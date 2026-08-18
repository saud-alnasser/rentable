import type { Contract, Unit } from '$lib/platform/database/schema';
import type { ExportColumn } from '$lib/design/csv';
import {
	planImport,
	toImportIdentity,
	type ImportCollision,
	type ImportField,
	type ImportOptions,
	type ImportRejection
} from '$lib/design/import';
import type { ImportTable } from '$lib/platform/tauri';
import { identity as nationalIdPattern, phone as phonePattern } from '$lib/tenant/tenant';

/**
 * WORKSPACE TRANSFER
 *
 * a whole workspace as one file, and one file back into a workspace.
 *
 * A directory can hand over its own records. A workspace could not hand over itself: a tenant
 * moving to another machine, or an operator handing a workspace on, needed five exports and
 * five imports made in exactly the right order, and any slip left the second machine holding
 * contracts whose tenants were missing.
 *
 * **One workbook, a sheet per concept.** The tabs are the concepts and their order is the order
 * the writes have to run in — a unit after the complex holding it, a payment after its contract.
 *
 * **A sheet names another record the way a person would.** Never by a row id: an id is this
 * database's own bookkeeping and means nothing in the workspace the file is read into. A tenant
 * is their national id, a complex is its name, a unit is its complex and its own name, and a
 * contract is its government number — or, where it has none, its tenant and the day it started.
 *
 * **Nothing here writes, and nothing here is derived.** The whole resolution happens in the
 * planning pass, against the file and the workspace at once, because a batch is built before
 * any of it runs and cannot branch on its own results ([[rules/data]], under *Multi-table
 * writes*). A reference that cannot be resolved refuses the file whole rather than dropping one
 * row: the row it named is what another row exists for, and importing the half that resolved
 * would build a workspace the file never described.
 *
 * **The file's headings are written in English and read in both languages.** A directory's
 * export is a document for a person and is written in the language they are reading in (#523).
 * A workspace transfer is a handover between two installations, which may not be set to the
 * same language — a file whose column names changed with the exporter's locale would be a file
 * the importer could not recognise. So it is written one way and matched against both.
 */

/** The concepts a workspace is made of, in the order they have to be written. */
export const TRANSFER_CONCEPTS = [
	'tenants',
	'complexes',
	'units',
	'contracts',
	'payments'
] as const;

/** One of them. */
export type TransferConcept = (typeof TRANSFER_CONCEPTS)[number];

/** What separates a complex from the unit inside it, in a reference to that unit. */
const UNIT_SEPARATOR = ' / ';
/** What separates one unit reference from the next, where a contract holds several. */
const UNIT_LIST_SEPARATOR = '; ';
/** What stands between a tenant and a day, in the reference a contract with no number falls back on. */
const CONTRACT_SEPARATOR = ' @ ';
/** the shape that fallback has, which is how a reference is told from a government number. */
const FALLBACK_REFERENCE = /^\S+ @ \d{4}-\d{2}-\d{2}$/;

/** A day, as a file spells one: the machine form, which is what every reader agrees on. */
export function toIsoDay(value: number | Date) {
	return new Date(value).toISOString().slice(0, 10);
}

/** The day a file spells, as the instant the workspace holds — or nothing where it is not a day. */
export function fromIsoDay(value: string) {
	const day = value.trim();

	if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
		return undefined;
	}

	const parsed = Date.parse(`${day}T00:00:00.000Z`);

	return Number.isNaN(parsed) ? undefined : parsed;
}

/** What a file calls one unit: the complex holding it, and its own name. */
export function toUnitReference(complex: string, unit: string) {
	return `${complex.trim()}${UNIT_SEPARATOR}${unit.trim()}`;
}

/**
 * The complex and the unit a reference names.
 *
 * Split at the *last* separator, so a complex whose own name contains one still resolves — a
 * unit's name is the tail, and it is the half far more likely to be a plain number.
 */
export function toUnitParts(reference: string): [string, string] {
	const at = reference.lastIndexOf(UNIT_SEPARATOR);

	return at === -1
		? ['', reference.trim()]
		: [reference.slice(0, at).trim(), reference.slice(at + UNIT_SEPARATOR.length).trim()];
}

/**
 * What a file calls one contract.
 *
 * The government number, which is what a person calls a contract and is unique where it is
 * present. Where it is absent the fallback is the tenant and the day the term started, which
 * is the next thing a person would say — and two contracts that share both and have no number
 * between them are two contracts this file cannot tell apart. That is a collision, reported
 * with both rows named, and the operator's answer is to give one of them its number.
 */
export function toContractReference(contract: {
	govId?: string | null;
	tenant: string;
	start: number | Date;
}) {
	const stated = contract.govId?.trim();

	return stated || `${contract.tenant.trim()}${CONTRACT_SEPARATOR}${toIsoDay(contract.start)}`;
}

/** The government number a reference carries, or nothing where it is the fallback shape. */
export function toGovIdFromReference(reference: string) {
	const stated = reference.trim();

	return FALLBACK_REFERENCE.test(stated) ? undefined : stated || undefined;
}

// what crosses to and from the file, per concept. Only what a record actually holds: a status,
// a paid amount and an expected amount are written for the reader and never read back, because
// they are derived from the term and the payments and reconciliation recomputes them.

export type TransferTenant = { name: string; nationalId: string; phone: string };

export type TransferComplex = { name: string; location: string };

export type TransferUnit = { complex: string; name: string; status: Unit['status'] };

export type TransferContract = {
	reference: string;
	/** the tenant's national id. */
	tenant: string;
	/** the units it holds, each as its own reference. */
	units: string[];
	start: number;
	end: number;
	interval: Contract['interval'];
	cost: number;
	status: Contract['status'];
	paidAmount: number;
	expectedAmount: number;
};

export type TransferPayment = { contract: string; date: number; amount: number };

/** A whole workspace, as a file holds it. */
export type WorkspaceTransfer = {
	tenants: TransferTenant[];
	complexes: TransferComplex[];
	units: TransferUnit[];
	contracts: TransferContract[];
	payments: TransferPayment[];
};

/** an empty one, which is what a plan starts from and what a refused file stays at. */
export function emptyTransfer(): WorkspaceTransfer {
	return { tenants: [], complexes: [], units: [], contracts: [], payments: [] };
}

/** How many records a transfer holds, across all five concepts. */
export function countTransfer(transfer: WorkspaceTransfer) {
	return TRANSFER_CONCEPTS.reduce((total, concept) => total + transfer[concept].length, 0);
}

/**
 * What the workspace already holds, by the same names the file uses.
 *
 * Values rather than rows, and in the shape the identity is built from: a tenant is a national
 * id and a phone number together, a unit is its complex and its own name. Read as a set rather
 * than checked row by row, for the reason the tenant import already records — a file of five
 * hundred rows would otherwise be five hundred round trips before one of them is written.
 */
export type WorkspaceHeld = {
	/** each tenant's national id and phone. */
	tenants: string[][];
	/** complex names. */
	complexes: string[];
	/** each unit's complex and its own name. */
	units: string[][];
	/** contract references. */
	contracts: string[];
	/**
	 * each payment's contract, day and amount, spelled exactly as a file spells them.
	 *
	 * A payment has no name of its own, so what makes one recognisable is all three of its
	 * columns together — and they are compared as the strings a file carries rather than as
	 * values, because that is what the row being checked against them is.
	 */
	payments: string[][];
};

/** nothing held, which is the workspace a transfer is designed to be read into. */
export function emptyHeld(): WorkspaceHeld {
	return { tenants: [], complexes: [], units: [], contracts: [], payments: [] };
}

// the sheets. Each declares what it is called, what a file of it holds, and how a row of it is
// read back — one declaration, read by both directions, so a column cannot be written under one
// name and looked for under another.

/** what a sheet is called in the file, and every spelling the reader accepts for it. */
type SheetNames = { written: string; accepted: readonly string[] };

const SHEET_NAMES: Record<TransferConcept, SheetNames> = {
	tenants: { written: 'Tenants', accepted: ['tenants', 'المستأجرون'] },
	complexes: { written: 'Complexes', accepted: ['complexes', 'المجمعات'] },
	units: { written: 'Units', accepted: ['units', 'الوحدات'] },
	contracts: { written: 'Contracts', accepted: ['contracts', 'العقود'] },
	payments: { written: 'Payments', accepted: ['payments', 'المدفوعات'] }
};

/** What the tab for a concept is called in a file this writes. */
export function toSheetTitle(concept: TransferConcept) {
	return SHEET_NAMES[concept].written;
}

/** The rows of every sheet, as strings, before any of it is a record. */
type TenantRow = { name: string; nationalId: string; phone: string };
type ComplexRow = { name: string; location: string };
type UnitRow = { complex: string; name: string };
type ContractRow = {
	reference: string;
	tenant: string;
	units: string;
	start: string;
	end: string;
	interval: string;
	cost: string;
};
type PaymentRow = { contract: string; date: string; amount: string };

const TENANT_FIELDS: readonly ImportField<TenantRow>[] = [
	{ id: 'name', headers: ['Name', 'الاسم'], required: true },
	{ id: 'nationalId', headers: ['National Id', 'الهوية الوطنية'], required: true, identity: true },
	{ id: 'phone', headers: ['Phone', 'الهاتف'], required: true, identity: true }
];

const COMPLEX_FIELDS: readonly ImportField<ComplexRow>[] = [
	{ id: 'name', headers: ['Name', 'الاسم'], required: true, identity: true },
	{ id: 'location', headers: ['Location', 'الموقع'], required: true }
];

const UNIT_FIELDS: readonly ImportField<UnitRow>[] = [
	{ id: 'complex', headers: ['Complex', 'المجمع'], required: true, identity: true },
	{ id: 'name', headers: ['Unit', 'الوحدة'], required: true, identity: true }
];

const CONTRACT_FIELDS: readonly ImportField<ContractRow>[] = [
	{ id: 'reference', headers: ['Contract', 'العقد'], required: true, identity: true },
	{ id: 'tenant', headers: ['Tenant', 'المستأجر'], required: true },
	{ id: 'units', headers: ['Units', 'الوحدات'] },
	{ id: 'start', headers: ['Start', 'البداية'], required: true },
	{ id: 'end', headers: ['End', 'النهاية'], required: true },
	{ id: 'interval', headers: ['Interval', 'الدورة'], required: true },
	{ id: 'cost', headers: ['Cost', 'التكلفة'], required: true }
];

// a payment is identified by all three of its columns, and its rows may repeat: two payments of
// the same amount against the same contract on the same day are two payments, while one matching
// a payment already recorded is this file being read a second time.
const PAYMENT_FIELDS: readonly ImportField<PaymentRow>[] = [
	{ id: 'contract', headers: ['Contract', 'العقد'], required: true, identity: true },
	{ id: 'date', headers: ['Date', 'التاريخ'], required: true, identity: true },
	{ id: 'amount', headers: ['Amount', 'المبلغ'], required: true, identity: true }
];

/** every interval a contract may run on, as the file spells them. */
const INTERVALS: readonly Contract['interval'][] = ['1m', '3m', '6m', '12m'];

/**
 * The columns each sheet is written with.
 *
 * Declared beside the fields that read them back, and in the same order: a column added to one
 * and not the other is what makes a file this application wrote a file it cannot read.
 */
export const TRANSFER_COLUMNS: {
	tenants: ExportColumn<TransferTenant>[];
	complexes: ExportColumn<TransferComplex>[];
	units: ExportColumn<TransferUnit>[];
	contracts: ExportColumn<TransferContract>[];
	payments: ExportColumn<TransferPayment>[];
} = {
	tenants: [
		{ header: 'Name', value: (tenant) => tenant.name },
		{ header: 'National Id', value: (tenant) => tenant.nationalId },
		{ header: 'Phone', value: (tenant) => tenant.phone }
	],
	complexes: [
		{ header: 'Name', value: (complex) => complex.name },
		{ header: 'Location', value: (complex) => complex.location }
	],
	units: [
		{ header: 'Complex', value: (unit) => unit.complex },
		{ header: 'Unit', value: (unit) => unit.name },
		// written for the reader and never read back: a unit's status is what its contracts make
		// it, and reconciliation decides it the moment the workspace holds both.
		{ header: 'Status', value: (unit) => unit.status }
	],
	contracts: [
		{ header: 'Contract', value: (contract) => contract.reference },
		{ header: 'Tenant', value: (contract) => contract.tenant },
		{ header: 'Units', value: (contract) => contract.units.join(UNIT_LIST_SEPARATOR) },
		{ header: 'Start', value: (contract) => ({ kind: 'date', value: new Date(contract.start) }) },
		{ header: 'End', value: (contract) => ({ kind: 'date', value: new Date(contract.end) }) },
		{ header: 'Interval', value: (contract) => contract.interval },
		{ header: 'Cost', value: (contract) => ({ kind: 'money', value: contract.cost }) },
		{ header: 'Status', value: (contract) => contract.status },
		{ header: 'Paid', value: (contract) => ({ kind: 'money', value: contract.paidAmount }) },
		{
			header: 'Expected',
			value: (contract) => ({ kind: 'money', value: contract.expectedAmount })
		}
	],
	payments: [
		{ header: 'Contract', value: (payment) => payment.contract },
		{ header: 'Date', value: (payment) => ({ kind: 'date', value: new Date(payment.date) }) },
		{ header: 'Amount', value: (payment) => ({ kind: 'money', value: payment.amount }) }
	]
};

/** What a sheet of the file would do, on its own terms. */
export type WorkspaceSheetPlan = {
	concept: TransferConcept;
	/** whether the file carried a sheet for this concept at all. */
	present: boolean;
	/** how many records it would create. */
	create: number;
	rejected: ImportRejection[];
	collisions: ImportCollision[];
	missingColumns: string[];
};

/** A row naming a record nothing answers to. */
export type UnresolvedReference = {
	concept: TransferConcept;
	/** the row's place in its sheet, counting the heading as row one. */
	row: number;
	/** what it named. */
	reference: string;
};

/** What importing a file would do, worked out before it does any of it. */
export type WorkspacePlan = {
	sheets: WorkspaceSheetPlan[];
	unresolved: UnresolvedReference[];
	/** what would be written, or nothing at all where the file is refused. */
	transfer: WorkspaceTransfer;
};

/** Whether a plan may be carried out at all. */
export function isWorkspaceImportable(plan: WorkspacePlan) {
	const refused = plan.sheets.some(
		(sheet) => sheet.missingColumns.length > 0 || sheet.collisions.length > 0
	);

	return !refused && plan.unresolved.length === 0 && countTransfer(plan.transfer) > 0;
}

/**
 * The key a name matches under.
 *
 * The import pass's own, rather than a second answer to the same question: it is what decides
 * whether two rows are the same record, and a reference that resolved under one rule while the
 * collision check ran under another would let a file both refuse a row and point at it. The
 * router that turns names into identities matches under it too, for the same reason.
 */
export function toTransferKey(...values: string[]) {
	return toImportIdentity(values);
}

const key = toTransferKey;

/** The table a concept's sheet is, out of the file's own tabs. */
function tableFor(tables: readonly ImportTable[], concept: TransferConcept) {
	const accepted = SHEET_NAMES[concept].accepted.map((name) => key(name));

	return tables.find((table) => accepted.includes(key(table.name)));
}

/** A number a file states, or nothing where the cell is not one. */
function toNumber(value: string) {
	const stated = value.trim().replace(/,/g, '');

	if (!stated) {
		return undefined;
	}

	const parsed = Number(stated);

	return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Work out what a file would do to a workspace.
 *
 * Every sheet is read on its own terms first — which columns it has, which of its rows are rows
 * at all, whether it repeats a record — and only then is what survived resolved against the
 * file's other sheets and against the workspace. Both, because a file may create a complex and
 * the units in it at once, and may equally add a unit to a complex the workspace already holds.
 *
 * @param tables the file, as the reader handed it over: one table per sheet, each named.
 * @param held what the workspace already has, by the same names the file uses.
 */
export function planWorkspaceImport(
	tables: readonly ImportTable[],
	held: WorkspaceHeld = emptyHeld()
): WorkspacePlan {
	const sheets: WorkspaceSheetPlan[] = [];
	const unresolved: UnresolvedReference[] = [];
	const transfer = emptyTransfer();

	/** what a sheet's own pass produced, recorded as this concept's line of the preview. */
	const record = <TRow extends Record<string, string>>(
		concept: TransferConcept,
		fields: readonly ImportField<TRow>[],
		validate: (row: TRow) => string | undefined,
		existing: ReadonlySet<string>,
		options: ImportOptions = {}
	) => {
		const table = tableFor(tables, concept);

		if (!table) {
			sheets.push({
				concept,
				present: false,
				create: 0,
				rejected: [],
				collisions: [],
				missingColumns: []
			});

			return [];
		}

		const plan = planImport(fields, table, validate, existing, options);

		sheets.push({
			concept,
			present: true,
			create: plan.create.length,
			rejected: plan.rejected,
			collisions: plan.collisions,
			missingColumns: plan.missingColumns
		});

		return plan.create;
	};

	// tenants and complexes point at nothing, so what they produce is what they create.
	const tenants = record<TenantRow>(
		'tenants',
		TENANT_FIELDS,
		(row) => {
			if (!nationalIdPattern.test(row.nationalId)) {
				return row.nationalId;
			}

			return phonePattern.test(row.phone) ? undefined : row.phone;
		},
		new Set(held.tenants.map((values) => key(...values)))
	);

	transfer.tenants = tenants.map(({ record: row }) => ({
		name: row.name.trim(),
		nationalId: row.nationalId.trim(),
		phone: row.phone.trim()
	}));

	const complexes = record<ComplexRow>(
		'complexes',
		COMPLEX_FIELDS,
		() => undefined,
		new Set(held.complexes.map((value) => key(value)))
	);

	transfer.complexes = complexes.map(({ record: row }) => ({
		name: row.name.trim(),
		location: row.location.trim()
	}));

	// what exists once the file has been read: the workspace's own, plus everything above that
	// the file would create. A unit may name a complex from either side.
	const complexKeys = new Set([
		...held.complexes.map((value) => key(value)),
		...transfer.complexes.map((complex) => key(complex.name))
	]);
	const tenantKeys = new Set([
		...held.tenants.map(([nationalId = '']) => key(nationalId)),
		...transfer.tenants.map((tenant) => key(tenant.nationalId))
	]);

	const units = record<UnitRow>(
		'units',
		UNIT_FIELDS,
		() => undefined,
		new Set(held.units.map((values) => key(...values)))
	);

	for (const { row, record: unit } of units) {
		if (!complexKeys.has(key(unit.complex))) {
			unresolved.push({ concept: 'units', row, reference: unit.complex.trim() });

			continue;
		}

		transfer.units.push({ complex: unit.complex.trim(), name: unit.name.trim(), status: 'vacant' });
	}

	const unitKeys = new Set([
		...held.units.map((values) => key(...values)),
		...transfer.units.map((unit) => key(unit.complex, unit.name))
	]);

	const contracts = record<ContractRow>(
		'contracts',
		CONTRACT_FIELDS,
		(row) => {
			const start = fromIsoDay(row.start);
			const end = fromIsoDay(row.end);

			if (start === undefined) {
				return row.start;
			}

			if (end === undefined) {
				return row.end;
			}

			if (end < start) {
				return row.end;
			}

			if (!INTERVALS.includes(row.interval.trim() as Contract['interval'])) {
				return row.interval;
			}

			const cost = toNumber(row.cost);

			return cost === undefined || cost < 0 ? row.cost : undefined;
		},
		new Set(held.contracts.map((value) => key(value)))
	);

	for (const { row, record: contract } of contracts) {
		const named = contract.units
			.split(UNIT_LIST_SEPARATOR)
			.map((value) => value.trim())
			.filter(Boolean);
		const missing = [
			...(tenantKeys.has(key(contract.tenant)) ? [] : [contract.tenant.trim()]),
			...named.filter((unit) => !unitKeys.has(key(...toUnitParts(unit))))
		];

		if (missing.length > 0) {
			for (const reference of missing) {
				unresolved.push({ concept: 'contracts', row, reference });
			}

			continue;
		}

		// the validation above already answered for every one of these, which is what makes the
		// assertions safe: a row whose term or interval did not read was rejected before here.
		transfer.contracts.push({
			reference: contract.reference.trim(),
			tenant: contract.tenant.trim(),
			units: named,
			start: fromIsoDay(contract.start) ?? 0,
			end: fromIsoDay(contract.end) ?? 0,
			interval: contract.interval.trim() as Contract['interval'],
			cost: toNumber(contract.cost) ?? 0,
			// derived, and stated here only because the transfer shape is what the export writes
			// too. Reconciliation decides all three the moment the workspace holds the payments.
			status: 'active',
			paidAmount: 0,
			expectedAmount: 0
		});
	}

	const contractKeys = new Set([
		...held.contracts.map((value) => key(value)),
		...transfer.contracts.map((contract) => key(contract.reference))
	]);

	// a payment already recorded is turned away, and two identical rows of this file are not:
	// the first is this file being read a second time, and doubling every payment in a workspace
	// is the failure that makes a transfer unusable. The second is two payments.
	const payments = record<PaymentRow>(
		'payments',
		PAYMENT_FIELDS,
		(row) => {
			if (fromIsoDay(row.date) === undefined) {
				return row.date;
			}

			const amount = toNumber(row.amount);

			return amount === undefined || amount < 0 ? row.amount : undefined;
		},
		new Set(held.payments.map((values) => key(...values))),
		{ rowsMayRepeat: true }
	);

	for (const { row, record: payment } of payments) {
		if (!contractKeys.has(key(payment.contract))) {
			unresolved.push({ concept: 'payments', row, reference: payment.contract.trim() });

			continue;
		}

		transfer.payments.push({
			contract: payment.contract.trim(),
			date: fromIsoDay(payment.date) ?? 0,
			amount: toNumber(payment.amount) ?? 0
		});
	}

	// a reference nothing answers to refuses the file whole rather than dropping the row that
	// named it: the row it pointed at is what that row exists for, and writing the half that
	// resolved would build a workspace the file never described.
	return {
		sheets,
		unresolved,
		transfer: unresolved.length > 0 ? emptyTransfer() : transfer
	};
}
