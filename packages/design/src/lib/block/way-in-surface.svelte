<script lang="ts">
	import BackControl from '#lib/block/back-control.svelte';
	import WayInPosition from '#lib/block/way-in-position.svelte';
	import { reducesMotion } from '#lib/reduces-motion.js';
	import { useDesignContract } from '#lib/strings.js';
	import { holdWayInMotion } from '#lib/way-in-transition.js';
	import MarkIcon from '@lucide/svelte/icons/eclipse';
	import { tick, untrack, type Snippet } from 'svelte';

	/**
	 * The surface of the way in: every step before the application, from the welcome to the wall.
	 *
	 * **It is the window's content area laid out as a setup pane, not a card** (effort 843,
	 * requirement 1). The mark, the title and one line under it head a column of one measure, the
	 * step's own controls follow in the same column, and its actions close it. There is no box, no
	 * shadow and no ring: the window is the frame. The failures keep `standalone-surface.svelte`,
	 * which is a card on purpose; [[rules/interface]] under *Application surfaces* says which screen
	 * takes which.
	 *
	 * **It owns every slot, so no step can place one differently.** A step hands in its title, its
	 * line, its controls, its actions, whether it has a way back and where it is in its path, and
	 * this block decides where each of them goes.
	 *
	 * **The column is placed from the top, never centred**, at `max(5rem, 20vh)`. Centred, the mark
	 * and the title would ride up and down as a step's controls change height; from the top they
	 * hold still, which is what makes a step change read as the contents changing rather than as a
	 * new screen. The human asked for that room twice when the look was judged on screen
	 * ([[efforts/843-the-way-in-and-the-workspace-control-read-as-apple-would/evidence/prototypes/the-look-of-the-way-in]]).
	 *
	 * **Back is the shared control, 1rem in from the content area's top-start corner**, and only
	 * where `back` is handed in. The content area's corner rather than the column's: on a narrow
	 * window an arrow at the column's corner floats in the middle of it.
	 *
	 * **A change of `step` runs a same-document view transition in the reading direction.** The mark
	 * and the contents are each named (`way-in-mark`, `way-in-content`), so the mark holds still and
	 * only the contents cross: the outgoing slide toward where reading starts and fade, the incoming
	 * arrive from where it ends, and back runs it the other way. It is the *pane swap carries its
	 * direction* row of [[rules/frontend]] *Motion*. The transition is feature-detected, and where it
	 * is missing, or reduced motion is on, the new step is simply drawn. A step the caller hands back
	 * to, where neither back nor the position says so, is marked `returning` and runs back too.
	 *
	 * **The direction on the root is this block's only while its own transition runs.** A route
	 * crossing writes the same two things, and the screen being left unmounts its surface in the
	 * middle of one, so an unmount takes off only what this surface's transition put there.
	 *
	 * **The old step is frozen before it is replaced**, because the step's contents belong to the
	 * caller. A caller changes its own state and hands in a new `step`; by the time the browser takes
	 * its first snapshot, the caller's controls already show the next step. So when the key changes,
	 * this block copies the outgoing contents, before they are redrawn, into an inert layer over the
	 * live ones, and the transition's update removes that layer. The live controls are never hidden,
	 * so a caller focusing the next step's first field is not refused.
	 */
	let {
		step,
		title,
		centred = false,
		named = false,
		description,
		position,
		back,
		returning = false,
		busy = false,
		children,
		actions,
		foot
	}: {
		/** which step this is. A change runs the transition. */
		step: string;
		/**
		 * what this step is, in a few words. Every step has one; the loading that follows the way in
		 * has none, since it asks nothing, and draws only the mark over its body.
		 */
		title?: string;
		/**
		 * whether the title is a name, the product's on the welcome or the organization's on the
		 * wall, drawn as it is written rather than raised to sentence case.
		 */
		named?: boolean;
		/**
		 * whether the column sits in the middle of the window rather than from the top: the loading,
		 * which asks nothing and changes no step, so nothing has to hold still for it (at the human's
		 * word on 2026-10-01, who found the bar after the way in sitting high).
		 */
		centred?: boolean;
		/** one line under the title. */
		description?: string;
		/**
		 * where the step sits in its path, drawn as a small line above the title. Nothing is drawn
		 * without it, which is the welcome, the wall and the no-workspace screen.
		 */
		position?: { at: number; of: number; label: string };
		/** the way to the step before, drawn as the shared back control. None without it. */
		back?: { label: string; onclick: () => void };
		/**
		 * whether this step is one the reader is handed back to rather than one they moved on to,
		 * where neither the back control nor the position says so: a form handed back with a
		 * refusal on it, after the wait it was submitted into. The change into it runs back.
		 */
		returning?: boolean;
		/** whether the application is working rather than waiting for the reader. */
		busy?: boolean;
		/** the step's own controls. */
		children?: Snippet;
		/** the step's actions: its one prominent button first, then any quiet ones. */
		actions?: Snippet;
		/** what stays at the foot of every step: the language and appearance control. */
		foot?: Snippet;
	} = $props();

	const contract = useDesignContract();

	/** the frozen copy of the outgoing step is laid over the live one, on the page's own ground. */
	const FROZEN = 'pointer-events-none absolute inset-x-0 top-0 min-h-full bg-background';

	let content: HTMLElement | undefined = $state();
	let live: HTMLElement | undefined = $state();

	// what the transition is measured against. Not state: nothing draws from them.
	let shown = untrack(() => step);
	let shownAt = untrack(() => position?.at);
	let goingBack = false;
	let running: { frozen: HTMLElement; transition: ViewTransition; release: () => void } | null =
		null;

	/** a copy of the outgoing step that looks the same and cannot be reached. */
	function freeze(node: HTMLElement) {
		const frozen = node.cloneNode(true) as HTMLElement;

		// what was typed is a property rather than an attribute, and a copy carries attributes.
		const typed = node.querySelectorAll('input, textarea, select');
		const copied = frozen.querySelectorAll('input, textarea, select');

		typed.forEach((field, index) => {
			const copy = copied[index] as HTMLInputElement | undefined;

			if (copy) {
				copy.value = (field as HTMLInputElement).value;
				copy.checked = (field as HTMLInputElement).checked;
			}
		});

		// an id twice in the document, or a radio named twice, would reach the live controls.
		for (const element of [frozen, ...frozen.querySelectorAll('[id], [name]')]) {
			element.removeAttribute('id');
			element.removeAttribute('name');
		}

		frozen.className = FROZEN;
		frozen.setAttribute('inert', '');
		frozen.setAttribute('aria-hidden', 'true');
		frozen.setAttribute('data-way-in-frozen', '');

		return frozen;
	}

	/** end this surface's own transition, if one is running, and nothing anybody else started. */
	function settle() {
		if (!running) return;

		running.frozen.remove();
		running.release();
		running = null;
	}

	/**
	 * Run the step change inside a view transition, or let it draw directly.
	 *
	 * Called before the new step is drawn, so the copy is of the old one. The copy goes over the live
	 * contents at once and the browser snapshots it at the next frame; the update takes it away, and
	 * the new snapshot is the live step underneath.
	 */
	function change(next: string, at: number | undefined, handedBack: boolean) {
		const from = shownAt;

		shownAt = at;

		if (next === shown) {
			return;
		}

		shown = next;

		const backwards =
			goingBack || handedBack || (at !== undefined && from !== undefined && at < from);

		goingBack = false;

		if (
			!content ||
			!live ||
			typeof document.startViewTransition !== 'function' ||
			reducesMotion()
		) {
			return;
		}

		// a step changed while the last one was still crossing: that one ends where it is.
		running?.transition.skipTransition();
		settle();

		// forward in a left-to-right reading is 1: the outgoing leave toward the start, the
		// incoming arrive from the end. Arabic and back each turn it round.
		const shift = (contract.direction === 'rtl' ? -1 : 1) * (backwards ? -1 : 1);
		const frozen = freeze(live);

		// the one node here Svelte does not own: it goes after the live contents, which Svelte never
		// moves, and it is gone once the transition's update has run. A template draws what it says
		// and this is a copy of what the caller drew, so no template could draw it.
		// eslint-disable-next-line svelte/no-dom-manipulating
		content.append(frozen);

		const release = holdWayInMotion(shift);
		const transition = document.startViewTransition(() => {
			frozen.remove();
		});
		const current = { frozen, transition, release };

		running = current;

		const done = () => {
			if (running === current) {
				settle();
			}
		};

		void transition.finished.then(done, done);
	}

	// `pre`, so it runs before the caller's contents are redrawn for the new step.
	$effect.pre(() => {
		const next = step;
		const at = position?.at;
		const handedBack = returning;

		untrack(() => change(next, at, handedBack));
	});

	$effect(() => () => {
		running?.transition.skipTransition();
		settle();
	});

	function goBack() {
		goingBack = true;
		back?.onclick();

		// a back that changed no step leaves nothing behind for the next change to read.
		void tick().then(() => (goingBack = false));
	}
</script>

<div class="relative flex min-h-full flex-1 flex-col" data-way-in-surface>
	{#if back}
		<div class="absolute start-4 top-4" data-way-in-back>
			<BackControl onclick={goBack} label={back.label} />
		</div>
	{/if}

	<!-- placed from the top so the mark and the title hold still when a step changes height; the
	     loading, which has no steps, sits in the middle. -->
	<div
		class="mx-auto flex w-full max-w-sm flex-1 flex-col px-4 {centred
			? 'justify-center py-8'
			: 'pt-[max(5rem,20vh)] pb-8'}"
		role={busy ? 'status' : undefined}
		aria-busy={busy || undefined}
	>
		<!-- larger than the tile the rail and the startup screen draw: on the way in the mark is the
		     only picture on the screen, and the look was judged at this size. -->
		<div
			class="way-in-mark mx-auto flex size-14 shrink-0 items-center justify-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground"
			data-way-in-mark
		>
			<MarkIcon class="size-7" />
		</div>

		<div bind:this={content} class="way-in-content relative mt-6" data-way-in-content>
			<div bind:this={live}>
				{#if title}
					<div class="flex flex-col items-center gap-2 text-center">
						{#if position}
							<WayInPosition at={position.at} of={position.of} label={position.label} />
						{/if}
						<!-- isolated, because on the wall the title is the organization's name, which is the
						     reader's own words and keeps its own order in the other direction. -->
						<h1
							class="text-2xl font-semibold {named ? '' : 'first-letter:uppercase'}"
							data-way-in-title
						>
							<bdi>{title}</bdi>
						</h1>
						{#if description}
							<p class="text-sm text-muted-foreground" data-way-in-description>{description}</p>
						{/if}
					</div>
				{/if}

				{#if children}
					<div class="{title ? 'mt-8' : ''} text-start" data-way-in-body>
						{@render children()}
					</div>
				{/if}

				{#if actions}
					<div class="mt-8 flex flex-col gap-3 *:w-full" data-way-in-actions>
						{@render actions()}
					</div>
				{/if}
			</div>
		</div>

		{#if foot}
			<div class="mt-auto flex justify-center pt-8" data-way-in-foot>
				{@render foot()}
			</div>
		{/if}
	</div>
</div>

<style>
	/* each is named so a step change, and a route change between two screens of the way in, moves
	   only what changed: the mark is the same image on both sides and holds still. The names are
	   the same on every screen, and the token layer's reduced-motion block covers them. */
	.way-in-mark {
		view-transition-name: way-in-mark;
	}

	.way-in-content {
		view-transition-name: way-in-content;
	}

	/* everything else a step change moves, the window around the column and the mark's box, takes
	   the vocabulary rather than the browser's own quarter second. Behind `:where` so it weighs
	   nothing against the two named rules under it. */
	:global(:where(html[data-way-in-motion])::view-transition-group(*)),
	:global(:where(html[data-way-in-motion])::view-transition-old(*)),
	:global(:where(html[data-way-in-motion])::view-transition-new(*)) {
		animation-duration: var(--duration-base);
		animation-timing-function: var(--ease-move);
	}

	/* the outgoing step leaves toward where reading starts and the incoming arrives from where it
	   ends; `--way-in-shift` is 1 or -1, set for the length of the transition, and carries both the
	   reading direction and whether this was back. */
	:global(::view-transition-old(way-in-content)) {
		animation: way-in-leave var(--duration-base) var(--ease-exit) both;
	}

	:global(::view-transition-new(way-in-content)) {
		animation: way-in-arrive var(--duration-base) var(--ease-enter) both;
	}

	@keyframes -global-way-in-leave {
		to {
			opacity: 0;
			transform: translateX(calc(var(--way-in-shift, 1) * -2rem));
		}
	}

	@keyframes -global-way-in-arrive {
		from {
			opacity: 0;
			transform: translateX(calc(var(--way-in-shift, 1) * 2rem));
		}
	}
</style>
