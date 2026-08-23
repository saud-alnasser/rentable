<script lang="ts">
	import * as Sheet from '$lib/design/primitive/sheet/index.js';
	import { cn, type WithElementRef } from '@rentable/design/tailwind.js';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { SIDEBAR_WIDTH_DRAWER } from './constants.js';
	import { useSidebar } from './context.svelte.js';

	let {
		ref = $bindable(null),
		side = 'left',
		variant = 'sidebar',
		collapsible = 'offcanvas',
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		side?: 'left' | 'right';
		variant?: 'sidebar' | 'floating' | 'inset';
		collapsible?: 'offcanvas' | 'icon' | 'none';
	} = $props();

	const sidebar = useSidebar();
</script>

{#if collapsible === 'none'}
	<div
		class={cn(
			'flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground',
			className
		)}
		bind:this={ref}
		{...restProps}
	>
		{@render children?.()}
	</div>
{:else}
	<!-- this element carries the state both presentations are described by, so it renders at
	     every width and the presentation swaps inside it. `sidebar-inset` styles itself off it
	     as a previous sibling, and the drawer cannot be that sibling: its root is a dialog,
	     which emits no element and portals its content out of the layout entirely. -->
	<div
		bind:this={ref}
		class="group peer text-sidebar-foreground"
		data-state={sidebar.state}
		data-collapsible={sidebar.state === 'collapsed' ? collapsible : ''}
		data-variant={variant}
		data-side={side}
		data-slot="sidebar"
	>
		{#if sidebar.presentsAsDrawer}
			<Sheet.Root
				bind:open={() => sidebar.openDrawer, (v) => sidebar.setOpenDrawer(v)}
				{...restProps}
			>
				<Sheet.Content
					data-sidebar="sidebar"
					data-drawer="true"
					class="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
					style="--sidebar-width: {SIDEBAR_WIDTH_DRAWER};"
					{side}
				>
					<Sheet.Header class="sr-only">
						<Sheet.Title>{$LL.common.ui.sidebar()}</Sheet.Title>
						<Sheet.Description>{$LL.common.ui.mobileSidebarDescription()}</Sheet.Description>
					</Sheet.Header>
					<div class="flex h-full w-full flex-col">
						{@render children?.()}
					</div>
				</Sheet.Content>
			</Sheet.Root>
		{:else}
			<!-- This is what handles the sidebar gap on desktop -->
			<div
				data-slot="sidebar-gap"
				class={cn(
					'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
					'group-data-[collapsible=offcanvas]:w-0',
					'group-data-[side=right]:rotate-180',
					variant === 'floating' || variant === 'inset'
						? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
						: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)'
				)}
			></div>
			<div
				data-slot="sidebar-container"
				class={cn(
					'fixed inset-y-0 z-10 flex h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear',
					side === 'left'
						? 'start-0 group-data-[collapsible=offcanvas]:start-[calc(var(--sidebar-width)*-1)]'
						: 'end-0 group-data-[collapsible=offcanvas]:end-[calc(var(--sidebar-width)*-1)]',
					// Adjust the padding for floating and inset variants.
					variant === 'floating' || variant === 'inset'
						? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
						: 'group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-e group-data-[side=right]:border-s',
					className
				)}
				{...restProps}
			>
				<div
					data-sidebar="sidebar"
					data-slot="sidebar-inner"
					class="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm"
				>
					{@render children?.()}
				</div>
			</div>
		{/if}
	</div>
{/if}
