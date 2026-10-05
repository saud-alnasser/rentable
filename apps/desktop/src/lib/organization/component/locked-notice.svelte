<script lang="ts">
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';

	/**
	 * What a locked member reads above every screen of the workspace (effort 851, requirement 32):
	 * their account is locked until an owner or a manager unlocks it, and they can still view and
	 * change their password.
	 *
	 * **A callout standing on the surface it is about** ([[rules/interface]], *Feedback*), and the
	 * surface is the whole workspace, so it is drawn at the shell's `notice` place rather than on
	 * one page. `info`, because a locked account is working as it should, as the contract units
	 * lock notice is. It says why every write control the reader meets is refused, once, where
	 * each control then gives its own short reason.
	 *
	 * **The sentence is the refusal's** (`refusals.host.locked`), the one Rust's `Locked` reads as,
	 * so the notice and an act refused for the lock say the same thing. It is read off the session
	 * every heartbeat reads again, so it goes as soon as the session reads unlocked.
	 */
	const stateQuery = useFetchOrganizationState();
	const locked = $derived(stateQuery.data?.session?.locked === true);
</script>

{#if locked}
	<div class="mx-auto w-full max-w-5xl px-6 pt-6" data-locked-notice>
		<Callout tone="info" class="flex items-start gap-3">
			<LockKeyholeIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<p>{$LL.common.refusals.host.locked()}</p>
		</Callout>
	</div>
{/if}
