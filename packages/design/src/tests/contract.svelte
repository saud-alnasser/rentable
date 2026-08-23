<script lang="ts">
	/**
	 * The subject the direction half of the contract is proved against, and not part of the
	 * interface.
	 *
	 * **It is a fixture rather than a packaged component because there is not yet a packaged
	 * component that reads a direction.** Every family that sets `dir` on the element it renders
	 * still reads it from this application's own locale metadata, and the ten that need nothing
	 * else from a locale cross on #779; the first of those to arrive is what should replace this.
	 * Until then the alternative is not covering the direction at all, and it is one of the two
	 * things this whole move puts at risk.
	 *
	 * It sits in this `tests/` directory rather than beside `probe.svelte` because what it covers
	 * is a module of the package rather than the runner itself, and a test here lives under the
	 * directory it covers.
	 */
	import { useDesignContract } from '#lib/strings.js';

	const contract = useDesignContract();
</script>

<p data-testid="contract" dir={contract.direction}>{contract.strings.loading}</p>
