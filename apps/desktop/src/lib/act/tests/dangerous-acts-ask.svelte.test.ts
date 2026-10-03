import { cleanup, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// what one feature reads of another in the window is provided as the surfaces are composed, as
// the frame does by importing them (`contributionsTo` in `$lib/feature/surface`).
import '$lib/app/surfaces';
import { isDangerous, toCardActions, type RecordAct } from '$lib/act';
import ComplexHost from '$lib/complex/component/host.svelte';
import { complexActs } from '$lib/complex/host.svelte';
import UnitHost from '$lib/complex/unit/component/host.svelte';
import { unitActs } from '$lib/complex/unit/host.svelte';
import type { ContractActRecord } from '$lib/contract/acts';
import ContractHost from '$lib/contract/component/host.svelte';
import { contractActs } from '$lib/contract/host.svelte';
import { placeholderStrings as strings } from '$lib/design/tests/strings';
import { LL, setLocale } from '$lib/i18n/i18n-svelte';
import { loadLocale } from '$lib/i18n/i18n-util.sync';
import OrganizationHost from '$lib/organization/component/host.svelte';
import {
	holderActs,
	memberActs,
	resetOrganizationHost,
	roleActs,
	workspaceActs
} from '$lib/organization/host.svelte';
import { hostAnswers, resetHostAnswers } from '$lib/organization/tests/host-hooks';
import {
	fakeOrganizationMember,
	fakeOrganizationRole,
	fakeOrganizationRoles,
	fakeOrganizationSession,
	fakeOrganizationWorkspace
} from '$lib/organization/tests/testing';
import PaymentHost from '$lib/payment/component/host.svelte';
import { paymentActs } from '$lib/payment/host.svelte';
import TenantHost from '$lib/tenant/component/host.svelte';
import { tenantActs } from '$lib/tenant/host.svelte';
import Providers from '#tests/providers.svelte';
import { get } from 'svelte/store';
import type { Component } from 'svelte';

/**
 * EVERY DANGEROUS ACT ASKS FIRST
 *
 * Effort 846, requirement 2 as revised on 2026-10-02, and criterion 2, at the human's word: "make
 * sure deangours actions have confirmation dialog even in domain records deletes have confirmation
 * dialong and dangours actions". An act that deletes, ends, removes, signs out, disconnects,
 * forgets or hands something over is declared in the error tone ([[rules/interface]], *Delete and
 * confirm*), and the declaration's type makes it name its confirmation.
 *
 * This is the guard that keeps it so, in two halves:
 *
 * - **Every declaration is read**: each `acts.ts` under `src/lib` is found by its path, every
 *   `declare...Acts` in it is called, and every act it declares in the error tone, or in the
 *   `destructive` group, is found to name its confirmation. A concept added with a dangerous act
 *   that names none fails here, and so does one added without a host case below.
 * - **Every dangerous act is run through its host**, the one the frame mounts, exactly as its
 *   card's menu runs it: a dialog is put in front of the reader and nothing is written. A host
 *   that ran one at once fails here. The record pages and the command menu run the same `run`,
 *   so the card's route stands for them.
 *
 * **The writes are stood in for**: each record concept's mutation hooks note what they were
 * asked (`asked`), and the organization's are `host-hooks.ts`'s, which note theirs on
 * `hostAnswers.writes`.
 */

const { asked, noting, settled } = vi.hoisted(() => {
	const asked: string[] = [];

	return {
		asked,
		/** a mutation hook that notes what it was asked and goes through. */
		noting: (hook: string) => () => ({
			isPending: false,
			mutateAsync: async (id: string) => {
				asked.push(`${hook}:${id}`);
			}
		}),
		/** a read that has settled on nothing in the way. */
		settled: () => () => ({ isPending: false, isPlaceholderData: false, data: [] })
	};
});

vi.mock('$lib/tenant/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/tenant/query')>()),
	useDeleteTenant: noting('deleteTenant'),
	useReadTenant: () => async () => undefined
}));

vi.mock('$lib/complex/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/query')>()),
	useDeleteComplex: noting('deleteComplex'),
	useReadComplex: () => async () => undefined,
	usePlanManyComplexes: () => ({
		isPending: false,
		isFetching: false,
		isPlaceholderData: false,
		data: { eligible: ['c-1'], refused: [], units: 0 }
	})
}));

vi.mock('$lib/complex/unit/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/complex/unit/query')>()),
	useDeleteUnit: noting('deleteUnit'),
	useReadUnit: () => async () => undefined,
	useFetchUnits: settled()
}));

vi.mock('$lib/contract/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/contract/query')>()),
	useDeleteContract: noting('deleteContract'),
	useTerminateContract: noting('terminateContract'),
	useUnterminateContract: noting('unterminateContract'),
	useReadContract: () => async () => undefined,
	useListContracts: settled(),
	useFetchContractUnits: settled()
}));

vi.mock('$lib/payment/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/payment/query')>()),
	useDeletePayment: noting('deletePayment'),
	useReadPayment: () => async () => undefined,
	useFetchContractPayments: settled()
}));

vi.mock('$lib/organization/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/member/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/member/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/role/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/role/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/access/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/access/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/workspace/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/workspace/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$lib/organization/session/query', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/organization/session/query')>()),
	...(await import('$lib/organization/tests/host-hooks')).hostHooks
}));

vi.mock('$app/state', () => ({
	page: { url: new URL('http://localhost/dashboard') }
}));

vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: async () => {}
}));

loadLocale('en');
setLocale('en');

beforeEach(() => {
	asked.length = 0;
	resetHostAnswers();
	hostAnswers.session = fakeOrganizationSession();
	hostAnswers.roles = fakeOrganizationRoles();
});

afterEach(() => {
	cleanup();
	resetOrganizationHost();
	document.body.innerHTML = '';
});

/** Every act a concept declares, as its host binds it, the record it is run on, and that host. */
type HostCase = {
	acts: readonly RecordAct<never>[];
	record: unknown;
	Host: Component;
};

const contract: ContractActRecord = {
	id: 'contract-1',
	govId: '4471',
	status: 'active',
	start: Date.UTC(2026, 0, 1),
	end: Date.UTC(2026, 11, 31),
	interval: '1m',
	cost: 1500,
	paidAmount: 0,
	expectedAmount: 18000,
	tenantId: 'tenant-1',
	tenantName: 'Noura'
};

const roles = fakeOrganizationRoles();

/**
 * One case per declaration, keyed by its `declare...Acts`: a concept whose declaration is found
 * below and has no case here fails, so a new one is held to the rule from its first act.
 */
const cases: Record<string, HostCase> = {
	declareTenantActs: {
		acts: tenantActs as readonly RecordAct<never>[],
		record: { id: 'tenant-1', name: 'Noura', nationalId: '1000000001', phone: '+966500000001' },
		Host: TenantHost
	},
	declareComplexActs: {
		acts: complexActs as readonly RecordAct<never>[],
		record: { id: 'c-1', name: 'Tower', location: 'Riyadh' },
		Host: ComplexHost
	},
	declareUnitActs: {
		acts: unitActs as readonly RecordAct<never>[],
		record: { id: 'unit-1', name: 'A1', status: 'vacant', complexId: 'c-1' },
		Host: UnitHost
	},
	declareContractActs: {
		acts: contractActs as readonly RecordAct<never>[],
		record: contract,
		Host: ContractHost
	},
	declarePaymentActs: {
		acts: paymentActs as readonly RecordAct<never>[],
		record: {
			id: 'payment-1',
			date: Date.UTC(2026, 1, 1),
			amount: 1500,
			contractId: 'contract-1',
			contractStatus: 'active'
		},
		Host: PaymentHost
	},
	declareMemberActs: {
		acts: memberActs as readonly RecordAct<never>[],
		record: {
			member: fakeOrganizationMember({ id: 'member-1', username: 'noura' }),
			context: {
				pending: {
					linking: false,
					unsetting: false,
					endingSessions: false,
					offering: false,
					withdrawing: false
				}
			},
			standing: null
		},
		Host: OrganizationHost
	},
	declareWorkspaceActs: {
		acts: workspaceActs as readonly RecordAct<never>[],
		record: { workspace: fakeOrganizationWorkspace(), context: {} },
		Host: OrganizationHost
	},
	declareHolderActs: {
		acts: holderActs as readonly RecordAct<never>[],
		record: {
			holder: {
				member: fakeOrganizationMember({ id: 'member-1', username: 'noura' }),
				context: {
					canGrantWorkspace: true,
					pending: {
						linking: false,
						unsetting: false,
						endingSessions: false,
						offering: false,
						withdrawing: false
					}
				},
				standing: null
			},
			workspace: fakeOrganizationWorkspace(),
			writing: false
		},
		Host: OrganizationHost
	},
	declareRoleActs: {
		acts: roleActs as readonly RecordAct<never>[],
		record: {
			role: fakeOrganizationRole({ id: 'collector', rank: 250_000 }),
			roles,
			members: [],
			reader: { rank: 2_000_000, canManageRoles: true, permissions: 0 },
			pending: { moving: false }
		},
		Host: OrganizationHost
	}
};

/** Every act declaration under `src/lib`, found by its path rather than listed. */
const modules = import.meta.glob<Record<string, unknown>>('../../**/acts.ts', { eager: true });

/** Every `declare...Acts` those modules export, by its name. */
const declarations = Object.values(modules).flatMap((module) =>
	Object.entries(module).filter(
		(entry): entry is [string, (host: unknown) => RecordAct<unknown>[]] =>
			/^declare[A-Z]\w*Acts$/.test(entry[0]) && typeof entry[1] === 'function'
	)
);

// every request the acts make answers nothing: only what each declares is read here.
const silentHost = new Proxy({}, { get: () => () => {} });

describe('every act declared dangerous names its confirmation', () => {
	test('the declarations are found, every concept and the organization among them', () => {
		expect(declarations.map(([name]) => name).sort()).toEqual(Object.keys(cases).sort());
	});

	for (const [name, declare] of declarations) {
		test(`${name}: every act in the error tone, or the destructive group, says what it asks`, () => {
			const acts = declare(silentHost);
			const dangerous = acts.filter((act) => isDangerous(act) || act.group === 'destructive');

			for (const act of dangerous) {
				expect(act.tone, `${act.id} is destructive and drawn as such`).toBe('error');
				expect(
					['reversible', 'cascade', 'irreversible'],
					`${act.id} names its confirmation`
				).toContain(act.confirmation);
			}
		});
	}
});

const dialog = () => [...document.querySelectorAll('[data-slot="dialog-content"]')].at(-1) ?? null;

describe('every dangerous act asks through its host before anything is written', () => {
	for (const [name, { acts, record, Host }] of Object.entries(cases)) {
		for (const act of acts.filter(isDangerous)) {
			test(`${name}: ${act.id} puts a question in front of the reader and writes nothing`, async () => {
				render(Host, {}, { wrapper: Providers, wrapperProps: { strings, direction: 'ltr' } });

				// the organization's acts are gated on who is reading, which the record's context
				// carries; the card's entry is not what is under test there, the host's answer is.
				const entry = toCardActions([act], record as never, get(LL)).at(0);

				if (entry && !entry.unavailable) {
					entry.onSelect();
				} else {
					act.run(record as never);
				}

				await waitFor(() => expect(dialog(), `${act.id} asks`).not.toBeNull());
				await new Promise((resolve) => setTimeout(resolve, 30));

				expect(asked).toEqual([]);
				expect(hostAnswers.writes).toEqual([]);
			});
		}
	}
});
