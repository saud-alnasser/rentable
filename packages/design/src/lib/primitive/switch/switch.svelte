<script lang="ts">
	import { cn, type WithoutChildrenOrChild } from '#lib/tailwind.js';
	import { Switch as SwitchPrimitive } from 'bits-ui';

	/**
	 * A switch, at one of three sizes.
	 *
	 * **The thumb slides toward the end of the line**, so in Arabic it rests on the right and
	 * slides left when the switch is on ([[rules/frontend]], *i18n*: a switch is on the mirror
	 * list). A translate is physical, so the `rtl:` variant runs it the other way; the direction
	 * is the document's, which `DesignProvider` sets on every surface it draws.
	 *
	 * **`sm` is the mini switch** Apple's Human Interface Guidelines give a subordinate setting
	 * under a primary one (*Toggles*): the thumb is a step smaller and the track as much narrower,
	 * so the thumb still travels its own width less the two pixels of border.
	 *
	 * **`lg` is the switch a row stands on**, where the switch is the one control of a tile and
	 * the thing the reader came to turn: a workspace's page draws one per member (effort 846,
	 * ticket 49, at the human's word that the switch "needs to be a better looking"). It is nearer
	 * the proportions Apple draws a toggle at, the thumb travelling the track less its own width and
	 * the two pixels of border.
	 */
	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		size = 'default',
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
		size?: 'default' | 'sm' | 'lg';
	} = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	data-size={size}
	class={cn(
		'peer inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input/80',
		size === 'sm' ? 'h-3.5 w-6' : size === 'lg' ? 'h-6 w-11' : 'h-[1.15rem] w-8',
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class={cn(
			'pointer-events-none block rounded-full bg-background ring-0 transition-transform data-[state=checked]:bg-primary-foreground data-[state=unchecked]:translate-x-0 data-[state=unchecked]:bg-foreground',
			size === 'lg'
				? 'size-5 data-[state=checked]:translate-x-[calc(100%+2px)] rtl:data-[state=checked]:-translate-x-[calc(100%+2px)]'
				: 'data-[state=checked]:translate-x-[calc(100%-2px)] rtl:data-[state=checked]:-translate-x-[calc(100%-2px)]',
			size === 'sm' ? 'size-3' : size === 'default' ? 'size-4' : undefined
		)}
	/>
</SwitchPrimitive.Root>
