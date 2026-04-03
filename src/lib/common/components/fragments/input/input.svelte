<script lang="ts">
	import { cn, type WithElementRef } from '$lib/common/utils/tailwind.js';
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'flex h-10 w-full min-w-0 rounded-2xl border border-border/70 bg-background/60 px-3.5 pt-2 text-sm font-medium shadow-sm ring-offset-background backdrop-blur-md transition-[background-color,border-color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground/80 hover:border-border hover:bg-background/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/20 dark:hover:bg-input/35',
			'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
			'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'flex h-10 w-full min-w-0 rounded-2xl border border-border/70 bg-background/60 px-3.5 py-2 text-sm shadow-sm ring-offset-background backdrop-blur-md transition-[background-color,border-color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground/80 hover:border-border hover:bg-background/80 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/20 dark:hover:bg-input/35',
			'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
			'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
