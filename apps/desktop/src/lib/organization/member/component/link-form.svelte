<script lang="ts">
	import FormSurface, { insetControl } from '@rentable/design/block/form-surface.svelte';
	import { Button } from '@rentable/design/primitive/button/index.js';
	import * as Field from '@rentable/design/primitive/field/index.js';
	import * as Select from '@rentable/design/primitive/select/index.js';
	import { cn } from '@rentable/design/tailwind.js';
	import { onSubmit } from '$lib/form';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import {
		DEFAULT_LINK_LIFETIME_HOURS,
		LINK_LIFETIME_HOURS,
		formatLinkLifetime
	} from '$lib/organization/member/link-lifetime';
	import LinkIcon from '@lucide/svelte/icons/link';

	/**
	 * Making a link: how long it and its code last, chosen before it is made (effort 851,
	 * requirement 11).
	 *
	 * **One choice, and it starts where most people would leave it.** Every hour from one to
	 * twenty-three, every day from one to six, then a week, shortest first, at three days until
	 * changed. Thirty values is a select ([[rules/interface]], *Field kinds*), and the sentence under
	 * it says what the choice does: the pair stops working together. What is made is shown on the
	 * handover panel (`made-link.svelte`), which prints the moment it lapses.
	 *
	 * **Light, on the shared form surface** ([[rules/interface]], *Form surface*): one value, declared
	 * rather than measured.
	 *
	 * **The mutation is the caller's.** This owns the choice and hands the hours up through
	 * `onMake`; the member host makes the link, closes this and opens the handover.
	 */
	let {
		open,
		onOpenChange,
		username,
		isMaking,
		onMake
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** the account the link is for, named under the title. */
		username: string;
		/** the link is being made, which is a moment a person is waiting on. */
		isMaking: boolean;
		onMake: (lifetimeHours: number) => void;
	} = $props();

	let chosen = $state(String(DEFAULT_LINK_LIFETIME_HOURS));

	// every link starts at the default: a lifetime chosen for one account is not a setting.
	$effect(() => {
		if (!open) chosen = String(DEFAULT_LINK_LIFETIME_HOURS);
	});

	const enhance = onSubmit(() => {
		if (!isMaking) onMake(Number(chosen));
	});
</script>

<FormSurface
	{open}
	{onOpenChange}
	{enhance}
	weight="light"
	title={$LL.organization.dashboard.makeLink()}
	description={$LL.organization.dashboard.linkFor({ username })}
>
	<Field.Field data-link-lifetime={chosen}>
		<Field.Label for="link-lifetime">{$LL.organization.dashboard.linkLifetime()}</Field.Label>
		<Select.Root
			type="single"
			value={chosen}
			onValueChange={(value) => {
				if (value) chosen = value;
			}}
			disabled={isMaking}
		>
			<Select.Trigger id="link-lifetime" class={cn('w-full', insetControl)}>
				{formatLinkLifetime($locale, Number(chosen))}
			</Select.Trigger>
			<Select.Content>
				{#each LINK_LIFETIME_HOURS as hours (hours)}
					<Select.Item
						value={String(hours)}
						label={formatLinkLifetime($locale, hours)}
						data-link-lifetime-option={hours}
					>
						{formatLinkLifetime($locale, hours)}
					</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Field.Description>{$LL.organization.dashboard.linkLifetimeDescription()}</Field.Description>
	</Field.Field>

	{#snippet actions()}
		<Button type="button" variant="outline" disabled={isMaking} onclick={() => onOpenChange(false)}>
			{$LL.common.actions.cancel()}
		</Button>
		<Button type="submit" disabled={isMaking}>
			<LinkIcon class="size-4" />
			{isMaking ? $LL.common.actions.working() : $LL.organization.dashboard.makeLink()}
		</Button>
	{/snippet}
</FormSurface>
