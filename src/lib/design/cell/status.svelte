<script lang="ts">
	import { Badge } from '$lib/design/primitive/badge';
	import { LL } from '$lib/i18n/i18n-svelte';
	import type { TranslationFunctions } from '$lib/i18n/i18n-types';

	type StatusName = keyof TranslationFunctions['common']['status'];

	/**
	 * A status, as every list renders one: the translated name in a badge whose variant is
	 * fixed by what the status means rather than by the list showing it.
	 */
	let { status }: { status: StatusName } = $props();

	// blue is the state colour, so it marks what is running and destructive marks what
	// failed; everything settled or not yet started reads quieter than both.
	const variants: Record<StatusName, 'default' | 'secondary' | 'destructive' | 'outline'> = {
		active: 'default',
		occupied: 'default',
		scheduled: 'secondary',
		vacant: 'secondary',
		expired: 'secondary',
		defaulted: 'destructive',
		overdue: 'destructive',
		terminated: 'destructive',
		fulfilled: 'outline'
	};
</script>

<Badge variant={variants[status]} class="capitalize">{$LL.common.status[status]()}</Badge>
