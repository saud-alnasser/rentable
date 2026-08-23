<script lang="ts">
	/**
	 * Ten pages, with the three controls that render a string between them.
	 *
	 * Scaffolding rather than a test. The count is what makes the ellipsis appear at all, and the
	 * ellipsis is the only place `morePages` is rendered.
	 */
	import * as Pagination from '#lib/primitive/pagination/index.js';
</script>

<Pagination.Root count={100} perPage={10}>
	<Pagination.Content>
		<Pagination.Item><Pagination.Previous /></Pagination.Item>
		<Pagination.Item><Pagination.Ellipsis /></Pagination.Item>
		<Pagination.Item><Pagination.Next /></Pagination.Item>
	</Pagination.Content>
</Pagination.Root>
