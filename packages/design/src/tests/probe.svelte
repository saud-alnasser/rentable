<script lang="ts">
	/**
	 * The subject the test runner is proved against, and not part of the interface.
	 *
	 * It sits under `src/tests/` rather than `src/lib/` for a reason the export map decides:
	 * `package.json` maps `./*` onto `./src/lib/*`, so anything under the library directory is
	 * importable by every consumer of this package. Scaffolding that claims not to be part of
	 * the interface has to be somewhere the interface cannot reach.
	 *
	 * It is deliberately kept rather than deleted once real components arrive. A runner whose
	 * only subjects are the components under active development reports each of its own faults
	 * as a fault in whatever was being edited at the time.
	 */
	let { label, count = 0 }: { label: string; count?: number } = $props();

	const rendered = $derived(count > 0 ? `${label} (${count})` : label);
</script>

<p data-testid="probe">{rendered}</p>
