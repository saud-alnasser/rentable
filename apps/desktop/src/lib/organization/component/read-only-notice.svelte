<script lang="ts">
	import { Callout } from '@rentable/design/primitive/callout/index.js';
	import { isFloorsUnreadable } from '$lib/api/context';
	import { LL } from '$lib/i18n/i18n-svelte';
	import { useFetchOrganizationState } from '$lib/organization/query';
	import { UpdateAction } from '$lib/update/ui';
	import PencilOffIcon from '@lucide/svelte/icons/pencil-off';

	/**
	 * What a member reads above every screen of the workspace while a newer rentable has upgraded
	 * the organization, or the workspace open, past what this one writes (effort 857, requirement
	 * 6): everything still reads, nothing can be changed, and updating rentable is the way back,
	 * with the update action right there.
	 *
	 * **On the pattern of the locked notice** (`./locked-notice.svelte`): a callout standing on the
	 * surface it is about ([[rules/interface]], *Feedback*), and the surface is the whole workspace,
	 * so it is drawn at the shell's `notice` place. `warning`, as the switcher's callout for the
	 * version is, because something waits on the reader: every write control they meet is refused
	 * for this one reason, said once here, and each control then gives its own short reason.
	 *
	 * **The sentence is the refusal's** (`refusals.host.workspaceReadOnlyByVersion`, or the
	 * organization's), the one an act refused for the version reads as, so the notice and the act
	 * say the same thing. It is read off the state every heartbeat reads again, so it appears within
	 * one heartbeat of a pull bringing the raise, and goes once this build may write again. Past
	 * reading is not said here: the workspace-held screen or the switcher stands instead.
	 */
	const stateQuery = useFetchOrganizationState();

	// the organization's verdict before the workspace's where both hold it read-only (ticket 16),
	// since changes in the whole organization wait on the update, the workspace's among them.
	const held = $derived.by(() => {
		const data = stateQuery.data;
		const readOnly = (data?.heldByVersion ?? []).filter((held) => held.standing === 'readOnly');

		return data?.session
			? (readOnly.find((held) => held.target === 'organization') ?? readOnly[0] ?? null)
			: null;
	});

	// floors that could not be read are not a newer version (ticket 31): the notice says changes
	// are paused until they can be, and offers no update, which would not lift it.
	const floorsUnreadable = $derived(held !== null && isFloorsUnreadable(held));

	const sentence = $derived(
		held?.target === 'organization'
			? $LL.common.refusals.host.organizationReadOnlyByVersion()
			: floorsUnreadable
				? $LL.common.refusals.host.workspaceFloorsUnreadable()
				: $LL.common.refusals.host.workspaceReadOnlyByVersion()
	);
</script>

{#if held}
	<div class="mx-auto w-full max-w-5xl px-6 pt-6" data-read-only-notice>
		<Callout tone="warning" class="flex items-start gap-3">
			<PencilOffIcon class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<div class="flex min-w-0 flex-1 flex-col gap-3">
				<p>{sentence}</p>
				{#if !floorsUnreadable}
					<UpdateAction variant="notice" />
				{/if}
			</div>
		</Callout>
	</div>
{/if}
