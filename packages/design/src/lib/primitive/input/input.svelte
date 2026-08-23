<script lang="ts">
	import { cn, type WithElementRef } from '#lib/tailwind.js';
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
			'flex h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 pt-1 text-base font-medium transition-[background-color,border-color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground/80 hover:bg-input/60 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
			'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
			'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
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
			'flex h-8 w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-2.5 py-1 text-base transition-[background-color,border-color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground/80 hover:bg-input/60 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
			'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
			'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
