<script lang="ts">
	/**
	 * One menu row in a folded sidebar, with a tooltip on it.
	 *
	 * Scaffolding rather than a test. `open={false}` is what folds the sidebar, and a folded
	 * sidebar is the only state in which the tooltip is shown at all: expanded, the row already
	 * carries its own label and the tooltip is suppressed.
	 */
	import * as Sidebar from '#lib/primitive/sidebar/index.js';
</script>

<Sidebar.Provider open={false}>
	<Sidebar.Menu>
		<Sidebar.MenuItem>
			<Sidebar.MenuButton tooltipContent="a hint">an item</Sidebar.MenuButton>
		</Sidebar.MenuItem>
	</Sidebar.Menu>
</Sidebar.Provider>
