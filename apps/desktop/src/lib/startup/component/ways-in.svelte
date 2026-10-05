<script lang="ts">
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';

	/**
	 * The two ways in, one size, each a label over whose it is: setting up on the person's own Turso
	 * account, and joining by a link.
	 *
	 * **The welcome's, and the switcher's "add organization" draws the same pair** (effort 851,
	 * requirement 4), on the wall and on the no-workspace screen, so adding an organization is the
	 * process a person met when they had none. Setting up is the prominent one, since it is the
	 * first thing anybody does with the application, and joining is outlined. *The two sentences go
	 * back to 2026-09-15, when the human walked the merged build and could not tell from the labels
	 * which way in was theirs. They were drawn in `sign-in.svelte` alone until the switcher.*
	 */
	let {
		onSetUpOrganization,
		onJoinByLink
	}: {
		/** the walk, on the person's own Turso account: the way in for whoever owns the organization. */
		onSetUpOrganization: () => void;
		/** the connect screen: a link and its code, pasted or handed over by the operating system. */
		onJoinByLink: () => void;
	} = $props();
</script>

<div class="flex flex-col gap-3">
	<Button
		size="lg"
		class="h-auto w-full flex-col gap-1 py-3"
		onclick={onSetUpOrganization}
		data-sign-in-set-up
	>
		<span class="first-letter:uppercase">{$LL.layout.signIn.setUp()}</span>
		<span class="text-xs font-normal opacity-80" data-sign-in-set-up-description>
			{$LL.layout.signIn.setUpDescription()}
		</span>
	</Button>

	<Button
		size="lg"
		variant="outline"
		class="h-auto w-full flex-col gap-1 py-3"
		onclick={onJoinByLink}
		data-sign-in-join
	>
		<span class="first-letter:uppercase">{$LL.layout.signIn.connectByLink()}</span>
		<span class="text-xs font-normal text-muted-foreground" data-sign-in-link-description>
			{$LL.layout.signIn.connectByLinkDescription()}
		</span>
	</Button>
</div>
