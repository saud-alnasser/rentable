<script lang="ts">
	/**
	 * The sidebar's provider, its rail, and both of the controls that fold it.
	 *
	 * Scaffolding rather than a test. The provider is what creates the state everything here reads,
	 * so none of it can be rendered on its own, and `Sidebar.Root` is what decides between the two
	 * presentations. Which one it draws comes from a media query the test supplies: wide is the
	 * rail, narrow is the drawer, and the drawer is the only place two of the seventeen keys appear.
	 */
	import * as Sidebar from '#lib/primitive/sidebar/index.js';
</script>

<Sidebar.Provider>
	<Sidebar.Root />
	<Sidebar.Rail />
	<Sidebar.Trigger />
</Sidebar.Provider>
