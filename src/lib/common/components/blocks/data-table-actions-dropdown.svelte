<script lang="ts">
	import { Button } from '$lib/common/components/fragments/button';
	import * as DropdownMenu from '$lib/common/components/fragments/dropdown-menu';
	import { cn } from '$lib/common/utils/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import EllipsisIcon from '@lucide/svelte/icons/ellipsis';
	import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

	type IconComponent = typeof EllipsisIcon;

	type ActionItem = DropdownMenuPrimitive.ItemProps & {
		type?: 'item';
		label: string;
		icon?: IconComponent;
		variant?: 'default' | 'destructive';
		inset?: boolean;
		key?: string;
	};

	type ActionLabel = {
		type: 'label';
		label: string;
		inset?: boolean;
		key?: string;
	};

	type ActionSeparator = {
		type: 'separator';
		key?: string;
	};

	type ActionEntry = ActionItem | ActionLabel | ActionSeparator;

	let {
		actions,
		menuLabel = undefined
	}: {
		actions: ActionEntry[];
		menuLabel?: string | null;
	} = $props();

	const resolvedMenuLabel = $derived(
		menuLabel === undefined ? $LL.common.actions.actions() : menuLabel
	);

	const getActionKey = (action: ActionEntry, index: number) => {
		if (action.type === 'separator') {
			return `separator:${action.key ?? index}`;
		}

		return `${action.type ?? 'item'}:${action.key ?? action.label}`;
	};

	const getItemClass = (action: ActionItem) => cn('capitalize', action.class ?? '');

	const getItemProps = (action: ActionItem): DropdownMenuPrimitive.ItemProps => {
		const {
			type: _type,
			label: _label,
			icon: _icon,
			variant: _variant,
			inset: _inset,
			key: _key,
			class: _class,
			...itemProps
		} = action;

		return itemProps;
	};
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="icon-sm"
				class="relative rounded-full border border-border/60 bg-background/70 p-0 shadow-sm backdrop-blur-sm transition-[background-color,border-color,box-shadow] hover:border-border hover:bg-accent/70"
			>
				<span class="sr-only">{$LL.common.actions.openMenu()}</span>
				<EllipsisIcon class="size-4" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="min-w-[14rem]">
		{#if resolvedMenuLabel}
			<DropdownMenu.Label>{resolvedMenuLabel}</DropdownMenu.Label>
			<DropdownMenu.Separator />
		{/if}
		{#each actions as action, index (getActionKey(action, index))}
			{#if action.type === 'separator'}
				<DropdownMenu.Separator />
			{:else if action.type === 'label'}
				<DropdownMenu.Label inset={action.inset}>{action.label}</DropdownMenu.Label>
			{:else}
				<DropdownMenu.Item
					{...getItemProps(action)}
					inset={action.inset}
					variant={action.variant}
					onclick={(e) => action.onclick?.(e)}
					class={getItemClass(action)}
				>
					{#if action.icon}
						{@const Icon = action.icon}
						<Icon class="size-4" />
					{/if}
					<span class="min-w-0 flex-1 truncate">{action.label}</span>
				</DropdownMenu.Item>
			{/if}
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
