import {
	cancelGoogleDrivePendingLinkSession,
	finishGoogleDriveLinkSession,
	isGoogleDriveLinkCancelledError,
	startGoogleDriveLinkSession
} from '$lib/api/utils/remote-sync-google-drive';

import { LinkSessionFlow, type LinkSessionDriver, type LinkSessionHandlers } from './link-session';

/** the real Drive operations. Separate from the flow so the sequence stays testable. */
const googleDriveLinkSessionDriver: LinkSessionDriver = {
	start: startGoogleDriveLinkSession,
	finish: finishGoogleDriveLinkSession,
	cancel: cancelGoogleDrivePendingLinkSession,
	isCancellation: isGoogleDriveLinkCancelledError
};

/**
 * The reactive face of {@link LinkSessionFlow}. Owns nothing but the mirrors — every
 * decision is the flow's, so what a component reads here and what the tests exercise
 * there cannot drift apart.
 */
export class LinkSession {
	#flow: LinkSessionFlow;

	session = $state.raw<LinkSessionFlow['session']>(null);
	isFinalizing = $state(false);

	/** true while authorization is outstanding or its result is being applied. */
	isLinking = $derived(this.session !== null || this.isFinalizing);

	constructor(
		handlers: LinkSessionHandlers,
		driver: LinkSessionDriver = googleDriveLinkSessionDriver
	) {
		this.#flow = new LinkSessionFlow(driver, handlers);

		this.#flow.observe(() => {
			this.session = this.#flow.session;
			this.isFinalizing = this.#flow.isFinalizing;
		});
	}

	begin = () => this.#flow.begin();

	cancel = () => this.#flow.cancel();
}
