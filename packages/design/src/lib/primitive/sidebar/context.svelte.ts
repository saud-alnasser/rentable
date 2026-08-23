import { IsBelowShellBreakpoint } from '#lib/is-below-shell-breakpoint.svelte.js';
import { getContext, setContext } from 'svelte';

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

	setOpenDrawer = (value: boolean) => {
		this.openDrawer = value;
	};

	/**
	 * Fold the navigation, or unfold it, whichever the current presentation means.
	 *
	 * **The keyboard shortcut that runs this is registered by the consumer, not here**, and
	 * `SIDEBAR_KEYBOARD_SHORTCUT` in `./constants.js` is the key it is registered against. It used
	 * to be an `$effect` in this constructor, and it cannot be one now: what a registration says
	 * about itself is read out of the registering application's own translations, so a packaged
	 * primitive holding one would be naming keys in a dictionary this package cannot see. The
	 * consumer calls {@link useSidebar} inside its own rail and registers this function.
	 */
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
