import { mayRun } from '$lib/design/acts';
import { declareComplexActs, type ComplexActId, type ComplexActRecord } from '$lib/complex/acts';

/**
 * THE COMPLEX HOST, ASKED FOR ANYWHERE AND DRAWN ONCE
 *
 * The complex form and the complex's delete confirmation are mounted once, in the frame, by
 * `complex/component/host.svelte`, and asked for from places that share no parent: a card in the
 * directory, the complex's own page and the command menu. What they share is this module-level
 * rune state, the shape `contract/host.svelte.ts` set: a request is raised here and the host
 * answers it. A unit's host is its own, in `complex/unit/host.svelte.ts`.
 */

type ComplexHostState = {
	/**
	 * the form, where one is open, and the complex it opens on. `key` changes on every opening and
	 * every closing, so a form opened a second time does not open on what was typed into the first.
	 */
	form: { open: boolean; key: number; value?: ComplexActRecord };
	/** the one complex being asked about. */
	deleting: ComplexActRecord | null;
	/** the complex whose details are on their way to the clipboard. */
	copying: ComplexActRecord | null;
	/** an act asked for by a complex's identity alone, from the command menu. */
	asked: { actId: string; complexId: string } | null;
};

export const complexHostState = $state<ComplexHostState>({
	form: { open: false, key: 0 },
	deleting: null,
	copying: null,
	asked: null
});

function openForm(value?: ComplexActRecord) {
	complexHostState.form = { value, open: true, key: complexHostState.form.key + 1 };
}

/** The form was dismissed: it goes, and the next opening starts on a clean draft. */
export function closeComplexForm() {
	complexHostState.form = { open: false, key: complexHostState.form.key + 1 };
}

/** The confirmation was dismissed, or answered. */
export function closeComplexConfirmation() {
	complexHostState.deleting = null;
}

/** Every complex act, bound to this host. The one list every surface projects. */
export const complexActs = declareComplexActs({
	copyDetails: (complex) => {
		complexHostState.copying = complex;
	},
	edit: (complex) => openForm(complex),
	confirmDelete: (complex) => {
		complexHostState.deleting = complex;
	}
});

export const complexHost = {
	/**
	 * run one act on a complex the caller holds. An act the complex does not admit is not run, and
	 * the answer says whether it was.
	 */
	run(actId: ComplexActId, complex: ComplexActRecord) {
		const act = complexActs.find((declared) => declared.id === actId);

		if (!mayRun(act, complex)) {
			return false;
		}

		act.run(complex);

		return true;
	},
	/** run one act on a complex named by its identity alone; the host reads the rest. */
	runOn(actId: string, complexId: string) {
		complexHostState.asked = { actId, complexId };
	},
	/** open the form on a new complex. */
	create() {
		openForm();
	}
};

/** nobody is signed in any more: nothing here outlives the session that opened it. */
export function resetComplexHost() {
	closeComplexForm();
	complexHostState.deleting = null;
	complexHostState.copying = null;
	complexHostState.asked = null;
}
