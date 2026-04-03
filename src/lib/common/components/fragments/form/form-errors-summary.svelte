<script lang="ts">
	import { Callout } from '$lib/common/components/fragments/callout';
	import { cn } from '$lib/common/utils/tailwind.js';

	let {
		class: className,
		errors
	}: {
		class?: string;
		errors?: unknown;
	} = $props();

	const collectMessages = (value: unknown): string[] => {
		if (!value) return [];

		if (typeof value === 'string') {
			return value.trim() ? [value] : [];
		}

		if (Array.isArray(value)) {
			return value.flatMap(collectMessages);
		}

		if (typeof value === 'object') {
			return Object.values(value as Record<string, unknown>).flatMap(collectMessages);
		}

		return [];
	};

	let messages = $derived.by(() => Array.from(new Set(collectMessages(errors))));
</script>

{#if messages.length > 0}
	<Callout
		variant="error"
		role="alert"
		aria-live="polite"
		class={cn('rounded-xl border-destructive/25 bg-destructive/5 px-4 py-3', className)}
	>
		<ul class="list-disc space-y-1 ps-5 text-sm leading-6">
			{#each messages as message (message)}
				<li>{message}</li>
			{/each}
		</ul>
	</Callout>
{/if}
