<script lang="ts">
	import type { MachineLink } from '$lib/platform/host';
	import FormSurface from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import { onSubmit } from '$lib/design/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import LinkHandover from '$lib/organization/component/link-handover.svelte';
	import LaptopIcon from '@lucide/svelte/icons/laptop';
	import { toast } from 'svelte-sonner';

	/**
	 * Connecting another machine of your own (effort 828, requirement 3).
	 *
	 * **A member does this without asking anybody.** The link carries their own grant on the
	 * organization database, sealed under the code and the link's own secret, so nothing here is
	 * minted on somebody else's machine and nobody else can make the pair: an administrator who
	 * needs to get a member back in issues a reset, which already exists. It sits under a legend of
	 * its own after the other machines, because the two are the same subject from opposite ends:
	 * one opens a machine, the other closes them.
	 *
	 * **Nothing is stored for later.** The pair is shown once, on a surface with one control, and
	 * dropped when that surface closes. A person who lost it presses again and gets another, which
	 * is cheaper than keeping a live credential on a screen somebody walks past, and the earlier
	 * link stops working when the next one replaces it.
	 *
	 * **Light, on the shared form surface** ([[rules/interface]], *Form surface*). A link, a code
	 * and a date is the light weight, declared rather than measured, so it is a centred panel; the
	 * pair itself is `link-handover.svelte`, the block an invitation's result is drawn with, since
	 * both end with one link that is sent and one code that is read out.
	 *
	 * **The clipboard is this component's**, which is what `link-handover.svelte` takes `copied`
	 * and `onCopy` for: the block reads none, and each host says a copy its own way.
	 *
	 * **The mutation is the route's.** This owns the control and the surface and asks for the pair
	 * through `onMake`, as every other act in the settings area is handed ([[rules/frontend]]),
	 * which is what lets the area be rendered with the act faked.
	 */
	let {
		organizationName,
		isMaking,
		onMake
	}: {
		/** the organization the link admits into, named on the panel. */
		organizationName: string;
		/** the pair is being made, which is a moment a person is waiting on. */
		isMaking: boolean;
		/** make a link and a code for another machine; rejects with what the shared handler said. */
		onMake: () => Promise<MachineLink>;
	} = $props();

	let made = $state<MachineLink | null>(null);
	let copied = $state(false);

	const make = async () => {
		try {
			made = await onMake();
			copied = false;
		} catch {
			// said by the shared handler.
		}
	};

	const copy = async () => {
		if (!made) return;

		try {
			await navigator.clipboard.writeText(made.link);
			copied = true;
		} catch {
			toast.error($LL.common.messages.unexpectedError());
		}
	};

	// the surface has nothing to validate: its one control closes it, and pressing Enter in the
	// panel has to reach the same place that control does.
	const enhance = onSubmit(() => {
		made = null;
	});
</script>

<Field.Field orientation="vertical" data-another-machine>
	<Field.Content>
		<Field.Description>{$LL.settings.you.anotherMachine.description()}</Field.Description>
	</Field.Content>

	<div>
		<!-- the verb's glyph before its label; outline rather than solid, since the act is offered
		     and never invited. -->
		<Button
			type="button"
			variant="outline"
			disabled={isMaking}
			data-another-machine-open
			onclick={() => void make()}
		>
			<LaptopIcon class="size-4" />
			{isMaking ? $LL.common.actions.working() : $LL.settings.you.anotherMachine.action()}
		</Button>
	</div>
</Field.Field>

<FormSurface
	open={made !== null}
	onOpenChange={(open) => {
		if (!open) made = null;
	}}
	{enhance}
	weight="light"
	title={$LL.settings.you.anotherMachine.action()}
>
	{#if made}
		<LinkHandover
			{organizationName}
			notice={$LL.settings.you.anotherMachine.notice()}
			linkLabel={$LL.settings.you.anotherMachine.linkTitle()}
			link={made.link}
			code={made.code}
			expiresAt={made.expiresAt}
			{copied}
			onCopy={() => void copy()}
		/>
	{/if}

	{#snippet actions()}
		<Button type="submit">{$LL.organization.dashboard.done()}</Button>
	{/snippet}
</FormSurface>
