<script lang="ts">
	/**
	 * The command palette, open.
	 *
	 * Scaffolding rather than a test. It is opened here rather than through a trigger because its
	 * title and description are what the test reads, and `bits-ui` instantiates nothing until the
	 * dialog is open.
	 */
	import * as Command from '#lib/primitive/command/index.js';
</script>

<Command.Dialog open>
	<Command.List>
		<Command.Empty>nothing</Command.Empty>
	</Command.List>
</Command.Dialog>
