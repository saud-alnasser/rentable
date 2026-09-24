import { contractHost } from '$lib/contract/host.svelte';
import { declareTenantActs, type TenantActId, type TenantActRecord } from '$lib/tenant/acts';

/**
 * THE TENANT HOST, ASKED FOR ANYWHERE AND DRAWN ONCE
 *
 * The tenant form and the tenant's delete confirmation are mounted once, in the frame, by
 * `tenant/component/host.svelte`, and asked for from places that share no parent: a card in the
 * directory, the tenant's own page and the command menu. What they share is this module-level
 * rune state, the shape `contract/host.svelte.ts` set: a request is raised here and the host
 * answers it.
 */

type TenantHostState = {
	/**
	 * the form, where one is open, and the tenant it opens on. `key` changes on every opening and
	 * every closing, so a form opened a second time does not open on what was typed into the first.
	 */
	form: { open: boolean; key: number; value?: TenantActRecord };
	/** the one tenant being asked about. */
	deleting: TenantActRecord | null;
	/** the tenant whose details are on their way to the clipboard. */
	copying: TenantActRecord | null;
	/** an act asked for by a tenant's identity alone, from the command menu. */
	asked: { actId: string; tenantId: string } | null;
};

export const tenantHostState = $state<TenantHostState>({
	form: { open: false, key: 0 },
	deleting: null,
	copying: null,
	asked: null
});

function openForm(value?: TenantActRecord) {
	tenantHostState.form = { value, open: true, key: tenantHostState.form.key + 1 };
}

/** The form was dismissed: it goes, and the next opening starts on a clean draft. */
export function closeTenantForm() {
	tenantHostState.form = { open: false, key: tenantHostState.form.key + 1 };
}

/** The confirmation was dismissed, or answered. */
export function closeTenantConfirmation() {
	tenantHostState.deleting = null;
}

/** Every tenant act, bound to this host. The one list every surface projects. */
export const tenantActs = declareTenantActs({
	copyDetails: (tenant) => {
		tenantHostState.copying = tenant;
	},
	edit: (tenant) => openForm(tenant),
	newContract: (tenant) => contractHost.create({ tenantId: tenant.id }),
	confirmDelete: (tenant) => {
		tenantHostState.deleting = tenant;
	}
});

export const tenantHost = {
	/**
	 * run one act on a tenant the caller holds. An act the tenant does not admit is not run, and
	 * the answer says whether it was.
	 */
	run(actId: TenantActId, tenant: TenantActRecord) {
		const act = tenantActs.find((declared) => declared.id === actId);

		if (!act || !(act.appliesTo?.(tenant) ?? true)) {
			return false;
		}

		act.run(tenant);

		return true;
	},
	/** run one act on a tenant named by its identity alone; the host reads the rest. */
	runOn(actId: string, tenantId: string) {
		tenantHostState.asked = { actId, tenantId };
	},
	/** open the form on a new tenant. */
	create() {
		openForm();
	}
};

/** nobody is signed in any more: nothing here outlives the session that opened it. */
export function resetTenantHost() {
	closeTenantForm();
	tenantHostState.deleting = null;
	tenantHostState.copying = null;
	tenantHostState.asked = null;
}
