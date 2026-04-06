<script lang="ts" module>
	import { toggleVariants } from '$lib/common/components/fragments/toggle/index.js';
	import { getContext, setContext } from 'svelte';
	import type { VariantProps } from 'tailwind-variants';

	type ToggleVariants = VariantProps<typeof toggleVariants>;

	interface ToggleGroupContext extends ToggleVariants {
		spacing?: number;
	}

	export function setToggleGroupCtx(props: ToggleGroupContext) {
		setContext('toggleGroup', props);
	}

	export function getToggleGroupCtx() {
		return getContext<Required<ToggleGroupContext>>('toggleGroup');
	}
</script>

<script lang="ts">
	import { cn } from '$lib/common/utils/tailwind.js';
	import { locale } from '$lib/i18n/i18n-svelte';
	import { localesMetadata } from '$lib/i18n/i18n-translations-util';
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		size = 'default',
		spacing = 0,
		variant = 'default',
		...restProps
	}: ToggleGroupPrimitive.RootProps & ToggleVariants & { spacing?: number } = $props();

	setToggleGroupCtx({
		get variant() {
			return variant;
		},
		get size() {
			return size;
		},
		get spacing() {
			return spacing;
		}
	});
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<ToggleGroupPrimitive.Root
	bind:value={value as never}
	bind:ref
	data-slot="toggle-group"
	data-variant={variant}
	data-size={size}
	data-spacing={spacing}
	dir={localesMetadata[$locale].direction}
	style={`--gap: ${spacing}`}
	class={cn(
		'group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs',
		className
	)}
	{...restProps}
/>
