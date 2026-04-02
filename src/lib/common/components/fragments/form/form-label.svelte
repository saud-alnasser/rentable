<script lang="ts">
	import { Label } from '$lib/common/components/fragments/label/index.js';
	import { cn, type WithoutChild } from '$lib/common/utils/tailwind.js';
	import * as FormPrimitive from 'formsnap';

	let {
		ref = $bindable(null),
		children,
		class: className,
		...restProps
	}: WithoutChild<FormPrimitive.LabelProps> = $props();
</script>

<FormPrimitive.Label {...restProps} bind:ref>
	{#snippet child({ props })}
		<Label
			{...props}
			data-slot="form-label"
			class={cn(
				'text-[0.72rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase data-[fs-error]:text-destructive',
				className
			)}
		>
			{@render children?.()}
		</Label>
	{/snippet}
</FormPrimitive.Label>
