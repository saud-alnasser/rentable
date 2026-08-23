<script lang="ts">
	/**
	 * A dialog, open, with the title and description a dialog is required to carry.
	 *
	 * Scaffolding rather than a test. Both are supplied by this fixture rather than by the
	 * contract, because they belong to whatever opens a dialog; what the contract supplies is the
	 * close control's name and the reading direction, and those are what the test reads.
	 */
	import * as Dialog from '#lib/primitive/dialog/index.js';
</script>

<Dialog.Root open>
	<Dialog.Content>
		<Dialog.Title>a title</Dialog.Title>
		<Dialog.Description>a description</Dialog.Description>
	</Dialog.Content>
</Dialog.Root>
