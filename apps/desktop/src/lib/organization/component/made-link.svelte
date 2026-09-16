<script lang="ts">
	import type { MadeLink } from '$lib/platform/host';
	import FormSurface from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import { onSubmit } from '$lib/design/form';
	import { LL } from '$lib/i18n/i18n-svelte';
	import LinkHandover from '$lib/organization/component/link-handover.svelte';
	import { toast } from 'svelte-sonner';

	/**
	 * The link and the code one act made for an account, shown once (effort 828, requirement 20).
	 *
	 * **One panel for both kinds.** An account whose password is not yet set gets a link that asks
	 * the person to choose one, and an account that has a password gets a link that lands its
	 * machine at the wall; what the person handing either over does is the same, so the panel says
	 * nothing about which it is and the block that draws it is `link-handover.svelte`, shared with
	 * an invitation's copy control.
	 *
	 * **Nothing is stored for later.** The pair is shown once, on a surface with one control, and
	 * dropped when that surface closes. A person who lost it makes another, which is cheaper than
	 * keeping a live credential on a screen somebody walks past, and the earlier link stops working
	 * when the next one replaces it.
	 *
	 * **Light, on the shared form surface** ([[rules/interface]], *Form surface*). A link, a code
	 * and a date is the light weight, declared rather than measured, so it is a centred panel.
	 *
	 * **The clipboard is this component's**, which is what `link-handover.svelte` takes `copied`
	 * and `onCopy` for: the block reads none, and each host says a copy its own way.
	 */
	let {
		organizationName,
		made,
		onDismiss
	}: {
		/** the organization the link admits into, named on the panel. */
		organizationName: string;
		/** the pair the last link act produced, or `null` while there is none to show. */
		made: MadeLink | null;
		onDismiss: () => void;
	} = $props();

	let copied = $state(false);

	// a new pair is a new link to copy, so the mark follows the result.
	$effect(() => {
		void made;
		copied = false;
	});

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
	const enhance = onSubmit(() => onDismiss());
</script>

<FormSurface
	open={made !== null}
	onOpenChange={(open) => {
		if (!open) onDismiss();
	}}
	{enhance}
	weight="light"
	title={$LL.organization.dashboard.linkTitle()}
>
	{#if made}
		<LinkHandover
			{organizationName}
			notice={$LL.organization.dashboard.cannotSend()}
			linkLabel={$LL.organization.dashboard.linkLabel()}
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
