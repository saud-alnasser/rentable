const CLOSE_REQUEST_EVENT = 'rentable:window-close-request';

/**
 * Ask whoever owns closing to close the window.
 *
 * The request is not the close: the shell has to finish syncing and hide before the window
 * goes, and a control that can only see itself cannot know when that is done. Anything
 * offering the user a way out of the application asks through this rather than closing the
 * window itself.
 */
export function requestWindowClose() {
	window.dispatchEvent(new CustomEvent(CLOSE_REQUEST_EVENT));
}

/**
 * Subscribe to close requests. The subscriber undertakes to close the window or to decide
 * against it — nothing else in the application acts on a request, so one that is heard by
 * nobody is a request the user made and the application ignored.
 *
 * @returns a function that removes this listener.
 */
export function listenForWindowCloseRequests(listener: () => void) {
	window.addEventListener(CLOSE_REQUEST_EVENT, listener);
	return () => window.removeEventListener(CLOSE_REQUEST_EVENT, listener);
}
