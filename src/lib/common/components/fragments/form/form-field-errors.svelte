<script lang="ts">
	import { Callout } from '$lib/common/components/fragments/callout';
	import { cn, type WithoutChild } from '$lib/common/utils/tailwind.js';
	import * as FormPrimitive from 'formsnap';

	let {
		ref = $bindable(null),
		class: className,
		errorClasses,
		children: childrenProp,
		...restProps
	}: WithoutChild<FormPrimitive.FieldErrorsProps> & {
		errorClasses?: string | undefined | null;
	} = $props();
</script>

<FormPrimitive.FieldErrors
	bind:ref
	class={cn('text-sm font-medium text-destructive', className)}
	{...restProps}
>
	{#snippet children({ errors, errorProps })}
		{#if childrenProp}
			{@render childrenProp({ errors, errorProps })}
		{:else if errors.length > 0}
			<Callout variant="error">
				{#each errors as error (error)}
					<div {...errorProps} class={cn(errorClasses)}>{error}</div>
				{/each}
			</Callout>
		{/if}
	{/snippet}
</FormPrimitive.FieldErrors>
