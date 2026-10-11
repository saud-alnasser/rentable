import type { RoleKind } from '@rentable/workspace-permission';

import type { Database } from '$lib/api/context';
import type { Host } from '$lib/app/host';
import type { Screen } from './screen';

/**
 * One state the owner is shown: a screen of the real interface, put where a check needs it.
 *
 * **Reached only through what the app is told and what is done on screen**: the records, the
 * member looking, what the shell answers, then the steps a person would take. Nothing in product
 * code reads a flag for it, so what is drawn is what the app draws.
 */
export type State = {
	/** unique across the stage; kept in the selection, so renaming one re-picks the first. */
	id: string;
	/** what the bar names it. */
	label: string;
	/** what the owner is to look at, in a sentence. */
	look: string;
	/** where the window is when the steps start, as a path: `/contracts`. */
	route: string;
	/** who is looking. The owner, with every permission, unless a state says otherwise. */
	member?: {
		role?: Exclude<RoleKind, 'custom'>;
		/** their permissions across the organization, as `maskOf(...)` builds them. */
		permissions?: number;
		access?: 'full-access' | 'read-only';
	};
	/** changes to the mock records, written after them and before the window draws. */
	records?: (db: Database) => Promise<void>;
	/** changes to what the shell answers: replace a capability of the staged host. */
	host?: (host: Host) => void;
	/** what is done on screen to reach the state, once the route has drawn. */
	steps?: (screen: Screen) => Promise<void>;
	/**
	 * what the owner does last, which a step cannot do for them: a focus ring shows only after a
	 * real key press, and a toast stack spreads only under a real pointer. The look line asks for
	 * it; `scripts/stage-shots.mjs` does it through the browser's own input.
	 */
	owner?: {
		/** a key to press, by its `KeyboardEvent.key`: `Escape`. */
		press?: string;
		/** what to point at, as a selector: `[data-sonner-toaster]`. */
		hover?: string;
	};
};

/** A file of states under `./state/`, in the order the bar steps through them. */
export type StateFile = { states: State[] };

export type Language = 'ar' | 'en';
export type Appearance = 'light' | 'dark';

/** What the bar has chosen, kept across the reload every change makes. */
export type Selection = { state: string; language: Language; appearance: Appearance };

const KEY = 'stage';

export function readSelection(): Selection {
	const fallback: Selection = { state: '', language: 'en', appearance: 'light' };

	try {
		return { ...fallback, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
	} catch {
		return fallback;
	}
}

/**
 * Choose again and build the window from nothing: every change reloads, so no state leaks into the
 * next, and a record written in one is gone in the other.
 */
export function select(change: Partial<Selection>, route?: string) {
	localStorage.setItem(KEY, JSON.stringify({ ...readSelection(), ...change }));
	window.location.assign(route ?? window.location.pathname);
}

/**
 * Every state in `./state/`, effort files first and the example tour last, so an effort's states
 * are what the bar opens on and the tour is there when none are.
 */
export function allStates(): State[] {
	const files = import.meta.glob<StateFile>('./state/*.ts', { eager: true });
	const names = Object.keys(files).sort((a, b) =>
		a.endsWith('/example.ts') ? 1 : b.endsWith('/example.ts') ? -1 : a.localeCompare(b)
	);

	return names.flatMap((name) => files[name].states);
}
