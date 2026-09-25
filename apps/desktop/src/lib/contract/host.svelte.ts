import { mayRun } from '$lib/design/acts';
import {
	declareContractActs,
	type ContractActId,
	type ContractActRecord,
	type ContractConfirmation
} from '$lib/contract/acts';

/**
 * THE CONTRACT HOST, ASKED FOR ANYWHERE AND DRAWN ONCE
 *
 * Every form and confirmation a contract act opens is mounted once, in the frame, by
 * `contract/component/host.svelte`, and asked for from places that share no parent: a card in any
 * list of contracts, the contract's own page, the dashboard and the command menu. So what they
 * share is this, module-level rune state the way `organization/dialogs.svelte.ts` is: a request is
 * raised here and the host answers it.
 *
 * **One host and not one per surface.** A form mounted per surface was four `ContractForm`s in
 * the tree, and superforms keys a form by its schema, so they collided. One host is one form.
 */

/** A contract as the form edits it, or the details a new one starts from. */
export type ContractFormValue = Omit<ContractActRecord, 'id'> & { id?: string };

/** What a new contract starts with, where the surface asking already knows it. */
export type ContractPrefill = {
	/** the tenant the contract is for. */
	tenantId?: string;
	/** the units it starts out holding, which the form still offers to change. */
	unitIds?: string[];
};

type ContractHostState = {
	/**
	 * the form, where one is open: what it opens on and what it renews. `key` changes on every
	 * opening and every closing, because the form holds a draft and a form opened a second time must
	 * not open on what was typed into the first.
	 */
	form: {
		open: boolean;
		key: number;
		value?: ContractFormValue;
		renewsContractId?: string;
		prefill?: ContractPrefill;
	};
	/** the one contract being asked about, and what it is being asked. */
	confirming: { kind: ContractConfirmation; contract: ContractActRecord } | null;
	/** the contract whose details are on their way to the clipboard. */
	copying: ContractActRecord | null;
	/** the contract whose tenant is being reminded, while its reminder is read and opened. */
	reminding: ContractActRecord | null;
	/**
	 * an act asked for by a contract's identity alone, from a surface that holds nothing else: the
	 * command menu, and the dashboard's queue. The host reads the contract and answers on its terms.
	 */
	asked: { actId: string; contractId: string } | null;
};

export const contractHostState = $state<ContractHostState>({
	form: { open: false, key: 0 },
	confirming: null,
	copying: null,
	reminding: null,
	asked: null
});

function openForm(opening: Omit<ContractHostState['form'], 'open' | 'key'>) {
	contractHostState.form = { ...opening, open: true, key: contractHostState.form.key + 1 };
}

/** The form was dismissed: it goes, and the next opening starts on a clean draft. */
export function closeContractForm() {
	contractHostState.form = { open: false, key: contractHostState.form.key + 1 };
}

/** The confirmation was dismissed, or answered. */
export function closeContractConfirmation() {
	contractHostState.confirming = null;
}

/** Every contract act, bound to this host. The one list every surface projects. */
export const contractActs = declareContractActs({
	copyDetails: (contract) => {
		contractHostState.copying = contract;
	},
	duplicate: (contract) =>
		// the government id is a contract's unique field, so the copy starts without it rather than
		// with a value that cannot be saved.
		openForm({ value: { ...contract, id: undefined, govId: '' } }),
	// a renewal is opened on an identity and reads everything else off the predecessor.
	renew: (contract) => openForm({ renewsContractId: contract.id }),
	remind: (contract) => {
		contractHostState.reminding = contract;
	},
	edit: (contract) => openForm({ value: contract }),
	confirm: (kind, contract) => {
		contractHostState.confirming = { kind, contract };
	}
});

export const contractHost = {
	/**
	 * run one act on a contract the caller holds. An act the contract does not admit is not run,
	 * and the answer says whether it was.
	 */
	run(actId: ContractActId, contract: ContractActRecord) {
		const act = contractActs.find((declared) => declared.id === actId);

		if (!mayRun(act, contract)) {
			return false;
		}

		act.run(contract);

		return true;
	},
	/**
	 * run one act on a contract named by its identity alone; the host reads the rest, and refuses
	 * with a sentence an act the contract does not admit.
	 */
	runOn(actId: string, contractId: string) {
		contractHostState.asked = { actId, contractId };
	},
	/**
	 * open the form on a new contract, starting from what the caller already knows: the tenant's
	 * page names the tenant, and the unit's page the unit.
	 */
	create(prefill?: ContractPrefill) {
		openForm({ prefill });
	}
};

/** nobody is signed in any more: nothing here outlives the session that opened it. */
export function resetContractHost() {
	closeContractForm();
	contractHostState.confirming = null;
	contractHostState.copying = null;
	contractHostState.reminding = null;
	contractHostState.asked = null;
}
