<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	const presentation = tv({
		base: 'fixed z-50 flex flex-col gap-0 overflow-hidden bg-card shadow-xl ring-1 ring-foreground/10 ease-out data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
		variants: {
			weight: {
				light:
					'top-1/2 left-1/2 max-h-[calc(100vh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl animation-duration-200 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 md:max-w-lg',
				heavy:
					'inset-y-0 end-0 h-full w-full animation-duration-300 data-[state=closed]:slide-out-to-end data-[state=open]:slide-in-from-end md:max-w-lg'
			}
		}
	});

	/** How much form there is — the only thing a form says about how it should be presented. */
	export type FormWeight = NonNullable<VariantProps<typeof presentation>['weight']>;

	/**
	 * Every control in a form, cut into the surface rather than sitting on top of it.
	 *
	 * The hover fill is here because each control primitive brings its own, and without one of
	 * ours the well repaints to its pre-inset colour under the pointer.
	 *
	 * **The two `aria-invalid` rules are load-bearing and must not be dropped.** The
	 * transparent border above outranks the `aria-invalid:border-destructive` every control
	 * primitive already carries, so an invalid field silently loses its mark without them
	 * restated here — and `button` declares the destructive ring colour with no ring width, so
	 * the controls built on one would otherwise be the only invalid fields in a form with no
	 * ring at all. Anything that restyles a control's border inherits this trap.
	 */
	export const insetControl =
		'border-transparent bg-foreground/5 shadow-[inset_0_2px_4px_rgb(0_0_0/0.14)] hover:bg-foreground/8 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20';
</script>

<script lang="ts">
	import * as Dialog from '@rentable/design/primitive/dialog/index.js';
	import { LL, locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import XIcon from '@lucide/svelte/icons/x';
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import type { Action } from 'svelte/action';

	/**
	 * The surface every create and edit form opens on.
	 *
	 * It owns the panel, the form element and the three bands inside it — a header carrying the
	 * title, a scrolling body, and a footer holding the actions — so a form supplies its fields
	 * and its buttons and nothing else.
	 *
	 * **What it presents as is the form's weight, not the window's**: a heavy form is an edge
	 * sheet, a light one a centred panel, and below `md` either fills the width it has. The two
	 * presentations are one element differing in CSS rather than two components swapped, so
	 * crossing the breakpoint mid-form unmounts nothing — the typed values, the validation
	 * errors, the scroll position and the focus all survive because none of them is ever
	 * recreated. The sheet enters from the inline-end edge and the panel from its own centre;
	 * both mirror with the locale.
	 */
	let {
		open,
		onOpenChange,
		weight,
		title,
		description,
		enhance,
		children,
		actions
	}: {
		open: boolean;
		onOpenChange: (value: boolean) => void;
		/** How much form there is. Declared rather than measured: measuring it would make the
		 * surface reflow while the user types. */
		weight: FormWeight;
		/** Names the record being created or edited. */
		title: string;
		/** Optional line under the title, for a form whose purpose is not obvious from it. */
		description?: string;
		/** The form's submit handler, applied to the form element as an action. */
		enhance: Action<HTMLFormElement>;
		/** The fields, laid out by the form. */
		children: Snippet;
		/** The buttons, rendered in the footer in the order given. */
		actions: Snippet;
	} = $props();
</script>

<Dialog.Root bind:open={() => open, onOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay />
		<!-- the panel is bits-ui's own rather than the dialog or sheet primitive's: all three wrap
		     the same component, but those two fix a position and an entry animation where this one
		     computes both, and class merging cannot take an animation back off. -->
		<DialogPrimitive.Content
			data-slot="form-surface"
			dir={localesMetadata[$locale].direction}
			class={presentation({ weight })}
		>
			<!-- novalidate: the browser cannot express a rule that normalizes before it matches, so
			     its constraint check would refuse a stored value that the form is able to repair.
			     validation is the schema's, and its messages are the translated ones. -->
			<form method="POST" use:enhance novalidate class="flex min-h-0 flex-1 flex-col">
				<div class="flex flex-col gap-2 border-b border-border/60 bg-muted/10 px-5 py-4">
					<Dialog.Title class="capitalize">{title}</Dialog.Title>
					{#if description}
						<Dialog.Description>{description}</Dialog.Description>
					{/if}
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
					{@render children()}
				</div>

				<div
					class="mt-auto flex flex-col gap-2 border-t border-border/60 bg-muted/10 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3"
				>
					{@render actions()}
				</div>
			</form>

			<Dialog.Close
				class="absolute end-4 top-4 rounded-full bg-secondary p-1.5 opacity-80 transition-[opacity,background-color] hover:bg-accent hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden disabled:pointer-events-none"
			>
				<XIcon class="size-4" />
				<span class="sr-only">{$LL.common.ui.close()}</span>
			</Dialog.Close>
		</DialogPrimitive.Content>
	</Dialog.Portal>
</Dialog.Root>
