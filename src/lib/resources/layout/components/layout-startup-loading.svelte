<script lang="ts">
	import { Spinner } from '$lib/common/components/fragments/spinner';
	import { LL } from '$lib/i18n/i18n-svelte';
</script>

<div class="flex min-h-full flex-1 items-center justify-center p-1">
	<div class="flex flex-col items-center gap-3">
		<Spinner class="size-8 text-muted-foreground" />
		<p class="text-sm text-muted-foreground">{$LL.common.messages.loadingApp()}</p>
	</div>
</div>
