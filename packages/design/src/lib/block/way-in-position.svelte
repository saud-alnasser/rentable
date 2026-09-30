<script lang="ts">
	/**
	 * Where a step sits in the path it is on: "step 1 of 2".
	 *
	 * **One treatment for every path that has a position**, which is the first run and the join
	 * (effort 843, requirement 4). A small muted line above the title, no bar and no dots: it is
	 * read first, and the title stays the largest thing under the mark. The welcome, the wall and the
	 * no-workspace screen have no position, and the way-in surface draws none for them.
	 *
	 * **The words arrive with the numbers.** The caller counts the steps, so the caller resolves the
	 * phrase ([[rules/frontend]], *Ask who knows the number*): a key in the design contract would be a
	 * phrase the package never has a number of its own for. `at` and `of` still cross, because the
	 * surface reads them for which way a step change runs.
	 */
	let {
		at,
		of,
		label
	}: {
		/** the step, counted from one. */
		at: number;
		/** how many steps the path has. */
		of: number;
		/** the line itself, in the reader's words, already counted: "step 1 of 2". */
		label: string;
	} = $props();
</script>

<p class="text-xs text-muted-foreground" data-way-in-position data-at={at} data-of={of}>
	{label}
</p>
