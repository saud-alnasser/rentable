<script lang="ts">
	import * as InputGroup from '#lib/primitive/input-group/index.js';
	import { reducesMotion } from '#lib/reduces-motion.js';
	import { useDesignContract } from '#lib/strings.js';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeClosedIcon from '@lucide/svelte/icons/eye-closed';
	import KeyRoundIcon from '@lucide/svelte/icons/key-round';
	import type { HTMLInputAttributes } from 'svelte/elements';

	/**
	 * A password field, with an eye at its trailing end that shows what was typed while it is held.
	 *
	 * **Only while held.** The field draws dots and a closed eye at rest. Pressing and holding the
	 * eye, or holding Space on it, draws the characters and opens the eye; letting go draws dots
	 * again. It never stays open: a release anywhere in the window, a cancelled press, the eye
	 * losing focus and the window losing focus all close it. There is no toggle, so nothing is left
	 * on screen by somebody who walked away (effort 851, requirements 19 and 20).
	 *
	 * **Holding it does not disturb the field** (requirement 21). The press is prevented by default,
	 * so focus and the caret stay where they were; the selection is put back after each change of
	 * type, and a pointer hold hands focus back to the field on release, so typing continues there.
	 * A held Space keeps focus on the eye, where the keyboard put it.
	 *
	 * **The eye is a `type="button"`**, so it is never a form's default button, and Enter in the
	 * field still submits its form through the form's own submit button.
	 *
	 * **Its name is the contract's `showPassword`**, the same word on every field that draws the
	 * block, so no caller hands it in. No tooltip: while held, a tooltip would cover the field it is
	 * revealing, and the name is carried by `aria-label`.
	 *
	 * `class` goes to the group, so a bare field passes its height and a dialog field the inset
	 * control; everything else goes to the input. That is what keeps it working as the direct child
	 * of `Form.Control`, which hands its control nothing.
	 */
	let {
		value = $bindable(),
		ref = $bindable(null),
		disabled = false,
		lead = false,
		class: className,
		...rest
	}: Omit<HTMLInputAttributes, 'type' | 'value' | 'files' | 'class' | 'disabled' | 'children'> & {
		value?: string;
		/** the input element, for a caller that puts the cursor in it. */
		ref?: HTMLInputElement | null;
		disabled?: boolean;
		/** whether the field leads with the password's key glyph, as the dialog fields do. */
		lead?: boolean;
		/** the group's classes: its height, or the inset control. */
		class?: string;
	} = $props();

	const contract = useDesignContract();

	let held = $state(false);
	/** a field disabled in the middle of a hold draws dots again. */
	const shown = $derived(held && !disabled);
	/** what started the hold, so a pointer hold alone hands focus back to the field. */
	let heldBy: 'pointer' | 'key' | null = null;
	/** the field's selection when the hold began, put back after each change of type. */
	let selection: [number | null, number | null] = [null, null];
	/** the reader asked for less motion, read at the press, so the glyphs swap without crossing. */
	let holdsStill = $state(false);

	function show(by: 'pointer' | 'key') {
		if (disabled || held) return;

		selection = [ref?.selectionStart ?? null, ref?.selectionEnd ?? null];
		holdsStill = reducesMotion();
		heldBy = by;
		held = true;
		restore();
	}

	function hide() {
		if (!held) return;

		const byPointer = heldBy === 'pointer';
		held = false;
		heldBy = null;
		if (byPointer) ref?.focus();
		restore();
	}

	/**
	 * puts the caret back once the type has changed, since a browser may move it then. Only in a
	 * focused field: setting a selection can focus the field in WebKit, which would take focus off
	 * the eye in the middle of a held Space.
	 */
	function restore() {
		const [start, end] = selection;
		if (start === null || end === null) return;

		// after the flush that changes the type, which was queued first.
		queueMicrotask(() => {
			if (!ref || document.activeElement !== ref) return;
			if (ref.selectionStart !== start || ref.selectionEnd !== end) {
				ref.setSelectionRange(start, end);
			}
		});
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0) return;

		// the press would otherwise move focus to the eye and take the caret out of the field.
		event.preventDefault();
		show('pointer');
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key !== ' ') return;

		// a held key repeats; the first press is the hold, and Space must not also click the eye.
		event.preventDefault();
		if (event.repeat) return;
		show('key');
	}

	function onkeyup(event: KeyboardEvent) {
		if (event.key !== ' ') return;

		event.preventDefault();
		hide();
	}

	/** the crossing between the two glyphs, or none where the reader asked for less motion. */
	const crossing = $derived(
		holdsStill
			? ''
			: 'transition-[opacity,scale] duration-quick ease-move motion-reduce:transition-none'
	);
</script>

<svelte:window onpointerup={hide} onpointercancel={hide} onblur={hide} />

<InputGroup.Root
	class={className}
	data-disabled={disabled ? 'true' : undefined}
	data-password-input
>
	{#if lead}
		<InputGroup.Addon>
			<KeyRoundIcon />
		</InputGroup.Addon>
	{/if}
	<InputGroup.Input {...rest} bind:ref bind:value type={shown ? 'text' : 'password'} {disabled} />
	<InputGroup.Addon align="inline-end">
		<InputGroup.Button
			type="button"
			size="icon-xs"
			aria-label={contract.strings.showPassword}
			{disabled}
			class="text-muted-foreground"
			data-password-eye={shown ? 'open' : 'closed'}
			{onpointerdown}
			onmousedown={(event: MouseEvent) => event.preventDefault()}
			{onkeydown}
			{onkeyup}
			onblur={hide}
		>
			<span class="grid size-4 place-items-center" aria-hidden="true">
				<EyeClosedIcon
					class="col-start-1 row-start-1 size-4 {crossing} {shown
						? 'scale-75 opacity-0'
						: 'scale-100 opacity-100'}"
					data-password-eye-glyph="closed"
				/>
				<EyeIcon
					class="col-start-1 row-start-1 size-4 {crossing} {shown
						? 'scale-100 opacity-100'
						: 'scale-75 opacity-0'}"
					data-password-eye-glyph="open"
				/>
			</span>
		</InputGroup.Button>
	</InputGroup.Addon>
</InputGroup.Root>
