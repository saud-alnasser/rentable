/**
 * SIGNING OUT, AS AN EVENT
 *
 * The account menu asks; the startup unit does. They are in different components with no
 * parent between them, and the one thing the menu has to say is *the person asked to leave*, so
 * it says it on the window and the shell, which owns the wall, hears it and puts the wall up.
 *
 * *`sync/sign-in.ts` held this beside the Google sign-in until the control plane retired; the
 * sign-in went, and this is what was left of the file.*
 */
const SIGNED_OUT_EVENT = 'rentable:signed-out';

/** the person asked to leave: the shell hears this and signs them out. */
export function requestSignOut() {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(new CustomEvent(SIGNED_OUT_EVENT));
}

export function listenForSignOut(listener: () => void) {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const handler = () => listener();

	window.addEventListener(SIGNED_OUT_EVENT, handler);
	return () => window.removeEventListener(SIGNED_OUT_EVENT, handler);
}
