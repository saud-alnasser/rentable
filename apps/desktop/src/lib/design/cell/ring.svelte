<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	// one geometry at both sizes: the viewBox scales with the element, so the arc keeps its
	// weight against its radius rather than being redrawn thicker for the larger reading.
	const ring = tv({
		slots: {
			arc: '-rotate-90',
			figure: 'absolute inset-0 flex items-center justify-center leading-none tabular-nums'
		},
		variants: {
			size: {
				row: { arc: 'size-9', figure: 'text-[10px] font-medium' },
				// the hero reading gives ground on a narrow window: three of these at full size
				// fill a short one on their own, leaving no room for what they sit above.
				hero: { arc: 'size-16 sm:size-24', figure: 'text-base font-semibold sm:text-lg' }
			}
		},
		defaultVariants: { size: 'row' }
	});

	export type RingSize = NonNullable<VariantProps<typeof ring>['size']>;
</script>

<script lang="ts">
	import { cn } from '@rentable/design/tailwind.js';
	import { onMount } from 'svelte';

	/**
	 * A proportion as an arc carrying its own figure.
	 *
	 * A ratio is what a number states worst, so anything that reads as *this much of that* is
	 * drawn rather than written: the arc gives the shape at a glance and the figure at its
	 * centre gives the reading.
	 *
	 * The treatment is deliberately empty of meaning. What the proportion is *of* — money
	 * collected, units held — belongs to whoever renders it, and so does the accessible text:
	 * this draws a silent shape, and a caller that leaves it unnamed has left it unreadable.
	 */
	let {
		value,
		total,
		size = 'row',
		figure,
		class: className
	}: {
		value: number;
		total: number;
		/** How large the arc reads: a row's treatment, or a figure the screen leads with. */
		size?: RingSize;
		/**
		 * What prints at the centre, where the percentage is not the interesting number.
		 * Defaults to the proportion as a whole percentage.
		 */
		figure?: string;
		class?: string;
	} = $props();

	const RADIUS = 14;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	const fraction = $derived(total > 0 ? Math.min(Math.max(value / total, 0), 1) : 0);
	const percent = $derived(Math.round(fraction * 100));
	const isSettled = $derived(fraction >= 1);

	// the ring fills from nothing to its value once, when the data it describes arrives — a
	// trigger rather than a loop. `mounted` holds it at zero for the first frame so there is
	// something to transition from; reduced motion is gated on the transition itself.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});
	const shown = $derived(mounted ? fraction : 0);

	// the sign is worth its width at the size the screen leads with and is noise at a row's,
	// where the arc around the number already says the number is a proportion.
	const defaultFigure = $derived(size === 'hero' ? `${percent}%` : `${percent}`);

	const styles = $derived(ring({ size }));
</script>

<span class={cn('relative inline-flex shrink-0 items-center', className)}>
	<!-- a rotation rather than a mirrored fill: an arc starting at twelve o'clock reads the
	     same way round in both locales, where a bar filling from one edge does not. -->
	<svg viewBox="0 0 36 36" class={styles.arc()} aria-hidden="true">
		<circle
			cx="18"
			cy="18"
			r={RADIUS}
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			class="text-foreground/12"
		/>
		<circle
			cx="18"
			cy="18"
			r={RADIUS}
			fill="none"
			stroke="currentColor"
			stroke-width="3"
			stroke-linecap="round"
			stroke-dasharray={CIRCUMFERENCE}
			stroke-dashoffset={CIRCUMFERENCE * (1 - shown)}
			class={cn(
				'motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700 motion-safe:ease-out',
				isSettled ? 'text-foreground' : 'text-primary'
			)}
		/>
	</svg>
	<span class={styles.figure()} aria-hidden="true">{figure ?? defaultFigure}</span>
</span>
