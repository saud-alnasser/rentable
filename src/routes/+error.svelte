<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex h-full w-full flex-col items-center justify-center gap-3">
	<h1>{page.status}: {page.error?.message}</h1>
</div>
