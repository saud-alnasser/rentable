<script lang="ts">
	/**
	 * A dropdown menu held open with one radio group of two rows, the first chosen.
	 *
	 * Scaffolding rather than a test. A radio item reads the group its root sets and draws only
	 * inside an open menu, so it cannot be rendered on its own; `indicator` is handed to both rows,
	 * and left out when the test leaves it out, so the default is what a test sees then.
	 */
	import * as DropdownMenu from '#lib/primitive/dropdown-menu/index.js';

	let { indicator }: { indicator?: 'dot' | 'check' } = $props();
</script>

<DropdownMenu.Root open>
	<DropdownMenu.Trigger>places</DropdownMenu.Trigger>
	<DropdownMenu.Content>
		<DropdownMenu.RadioGroup value="north">
			{#if indicator}
				<DropdownMenu.RadioItem value="north" {indicator}>north</DropdownMenu.RadioItem>
				<DropdownMenu.RadioItem value="south" {indicator}>south</DropdownMenu.RadioItem>
			{:else}
				<DropdownMenu.RadioItem value="north">north</DropdownMenu.RadioItem>
				<DropdownMenu.RadioItem value="south">south</DropdownMenu.RadioItem>
			{/if}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
