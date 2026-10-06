<script lang="ts">
	/**
	 * The undo pair as the frame registers it, and, where the test asks for one, a sheet standing
	 * open over the page with a button inside it holding the focus.
	 *
	 * Scaffolding rather than a test: it is drawn as the screen of `#tests/palette-harness.svelte`,
	 * which brings the application's one listener and the palette, and a sheet cannot be written in
	 * a `.ts` file.
	 */
	import { UndoShortcut } from '$lib/undo/ui';
	import * as Sheet from '@rentable/design/primitive/sheet/index.js';

	let { sheet = false }: { sheet?: boolean } = $props();
</script>

<UndoShortcut />

{#if sheet}
	<Sheet.Root open>
		<Sheet.Content>
			<Sheet.Header>
				<Sheet.Title>a form</Sheet.Title>
				<Sheet.Description>over the page</Sheet.Description>
			</Sheet.Header>
			<button type="button" data-covering-button>save</button>
		</Sheet.Content>
	</Sheet.Root>
{/if}
