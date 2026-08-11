import { IsBelowShellBreakpoint } from '$lib/design/is-below-shell-breakpoint.svelte.js';
import { matchesShortcutKey } from '$lib/design/shortcut.js';
import { getContext, setContext } from 'svelte';
import { SIDEBAR_KEYBOARD_SHORTCUT } from './constants.js';

type Getter<T> = () => T;

export type SidebarStateProps = {
	/**
	 * A getter function that returns the current open state of the sidebar.
	 * We use a getter function here to support `bind:open` on the `Sidebar.Provider`
	 * component.
	 */
	open: Getter<boolean>;

	/**
	 * A function that sets the open state of the sidebar. To support `bind:open`, we need
	 * a source of truth for changing the open state to ensure it will be synced throughout
	 * the sub-components and any `bind:` references.
	 */
	setOpen: (open: boolean) => void;
};

class SidebarState {
	readonly props: SidebarStateProps;
	open = $derived.by(() => this.props.open());
	openDrawer = $state(false);
	setOpen: SidebarStateProps['setOpen'];
	#isBelowShellBreakpoint: IsBelowShellBreakpoint;
	state = $derived.by(() => (this.open ? 'expanded' : 'collapsed'));

	constructor(props: SidebarStateProps) {
		this.setOpen = props.setOpen;
		this.#isBelowShellBreakpoint = new IsBelowShellBreakpoint();
		this.props = props;

		// the drawer is destroyed by the crossing rather than closed by it: the dialog
		// primitive's teardown decrements a nested-open counter and never writes this flag
		// back, so it survives a presentation it no longer describes. Left alone, a drawer
		// opened narrow re-opens itself the next time the window narrows, unasked.
		$effect(() => {
			if (!this.presentsAsDrawer) {
				this.openDrawer = false;
			}
		});
	}

	/** Whether the navigation is presenting as an overlay drawer rather than as a rail. */
	get presentsAsDrawer() {
		return this.#isBelowShellBreakpoint.current;
	}

	// Event handler to apply to the `<svelte:window>`
	handleShortcutKeydown = (e: KeyboardEvent) => {
		if (matchesShortcutKey(e, SIDEBAR_KEYBOARD_SHORTCUT) && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			this.toggle();
		}
	};

	setOpenDrawer = (value: boolean) => {
		this.openDrawer = value;
	};

	toggle = () => {
		return this.presentsAsDrawer ? (this.openDrawer = !this.openDrawer) : this.setOpen(!this.open);
	};
}

const SYMBOL_KEY = 'scn-sidebar';

/**
 * Instantiates a new `SidebarState` instance and sets it in the context.
 *
 * Call this during component initialization only: the state it creates owns an effect that
 * closes the drawer when the window stops being narrow enough to present one.
 *
 * @param props The constructor props for the `SidebarState` class.
 * @returns  The `SidebarState` instance.
 */
export function setSidebar(props: SidebarStateProps): SidebarState {
	return setContext(Symbol.for(SYMBOL_KEY), new SidebarState(props));
}

/**
 * Retrieves the `SidebarState` instance from the context. This is a class instance,
 * so you cannot destructure it.
 * @returns The `SidebarState` instance.
 */
export function useSidebar(): SidebarState {
	return getContext(Symbol.for(SYMBOL_KEY));
}
