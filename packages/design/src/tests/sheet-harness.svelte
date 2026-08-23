<script lang="ts">
	/**
	 * A sheet, open, with no side asked for.
	 *
	 * Scaffolding rather than a test. The absent `side` is the point: a sheet given one uses it,
	 * and a sheet given none arrives at the trailing edge of the reading direction, which is the
	 * second thing this family reads the contract for.
	 */
	import * as Sheet from '#lib/primitive/sheet/index.js';
</script>

<Sheet.Root open>
	<Sheet.Content>
		<Sheet.Title>a title</Sheet.Title>
		<Sheet.Description>a description</Sheet.Description>
	</Sheet.Content>
</Sheet.Root>
