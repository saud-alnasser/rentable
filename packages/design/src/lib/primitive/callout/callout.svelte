<script lang="ts" module>
	import { cn } from '#lib/tailwind.js';
	import { tone as toneClasses, type Tone } from '#lib/tone.js';
	import type { HTMLAttributes } from 'svelte/elements';

	export type CalloutProps = HTMLAttributes<HTMLDivElement> & {
		/**
		 * what kind of thing this is saying. The application's one vocabulary — see
		 * `#lib/tone.ts`.
		 *
		 * *It was `variant` and it was this primitive's own four names, two of which drew raw
		 * palette colours that answered to Tailwind rather than to this application.*
		 */
		tone?: Tone;
	};
</script>

<script lang="ts">
	let { class: className, tone = 'neutral', children, ...restProps }: CalloutProps = $props();

	const parts = $derived(toneClasses({ tone }));
</script>

<div
	class={cn('rounded-md border p-3 text-sm', parts.edge(), parts.wash(), parts.text(), className)}
	{...restProps}
>
	{@render children?.()}
</div>
