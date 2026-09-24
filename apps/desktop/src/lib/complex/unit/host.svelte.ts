import { declareUnitActs, type UnitActId, type UnitActRecord } from '$lib/complex/unit/acts';

/**
 * THE UNIT HOST, ASKED FOR ANYWHERE AND DRAWN ONCE
 *
 * The unit form and the unit's delete confirmation are mounted once, in the frame, by
 * `complex/component/unit-host.svelte`, and asked for from places that share no parent: a card in
 * a complex's unit directory, the unit's own page and the command menu. What they share is this
 * module-level rune state, the shape `contract/host.svelte.ts` set: a request is raised here and
 * the host answers it.
 */

/** What a new unit starts with: the complex it is added to, which a unit cannot be without. */
export type UnitPrefill = { complexId: string };

type UnitHostState = {
	/**
	 * the form, where one is open: the unit it opens on, and the complex it writes to. `key`
	 * changes on every opening and every closing, so a form opened a second time does not open on
	 * what was typed into the first. The complex is kept on closing, so the form stays mounted
	 * rather than reading a complex that is not there.
	 */
	form: { open: boolean; key: number; complexId?: string; value?: UnitActRecord };
	/** the one unit being asked about. */
	deleting: UnitActRecord | null;
	/** the unit whose details are on their way to the clipboard. */
	copying: UnitActRecord | null;
	/** an act asked for by a unit's identity alone, from the command menu. */
	asked: { actId: string; unitId: string } | null;
};

export const unitHostState = $state<UnitHostState>({
	form: { open: false, key: 0 },
	deleting: null,
	copying: null,
	asked: null
});

function openForm(complexId: string, value?: UnitActRecord) {
	unitHostState.form = { complexId, value, open: true, key: unitHostState.form.key + 1 };
}

/** The form was dismissed: it goes, and the next opening starts on a clean draft. */
export function closeUnitForm() {
	unitHostState.form = {
		open: false,
		key: unitHostState.form.key + 1,
		complexId: unitHostState.form.complexId
	};
}

/** The confirmation was dismissed, or answered. */
export function closeUnitConfirmation() {
	unitHostState.deleting = null;
}

/** Every unit act, bound to this host. The one list every surface projects. */
export const unitActs = declareUnitActs({
	copyDetails: (unit) => {
		unitHostState.copying = unit;
	},
	edit: (unit) => openForm(unit.complexId, unit),
	confirmDelete: (unit) => {
		unitHostState.deleting = unit;
	}
});

export const unitHost = {
	/**
	 * run one act on a unit the caller holds. An act the unit does not admit is not run, and the
	 * answer says whether it was.
	 */
	run(actId: UnitActId, unit: UnitActRecord) {
		const act = unitActs.find((declared) => declared.id === actId);

		if (!act || !(act.appliesTo?.(unit) ?? true)) {
			return false;
		}

		act.run(unit);

		return true;
	},
	/** run one act on a unit named by its identity alone; the host reads the rest. */
	runOn(actId: string, unitId: string) {
		unitHostState.asked = { actId, unitId };
	},
	/** open the form on new units in the complex named. */
	create(prefill: UnitPrefill) {
		openForm(prefill.complexId);
	}
};

/** nobody is signed in any more: nothing here outlives the session that opened it. */
export function resetUnitHost() {
	unitHostState.form = { open: false, key: unitHostState.form.key + 1 };
	unitHostState.deleting = null;
	unitHostState.copying = null;
	unitHostState.asked = null;
}
