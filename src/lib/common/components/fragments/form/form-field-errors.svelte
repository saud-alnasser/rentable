<script lang="ts">
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
	class={cn('space-y-1 text-sm text-destructive', className)}
	{...restProps}
>
	{#snippet children({ errors, errorProps })}
		{#if childrenProp}
			{@render childrenProp({ errors, errorProps })}
		{:else if errors.length > 0}
			{#each errors as error (error)}
				<div {...errorProps} class={cn('leading-5 font-medium', errorClasses)}>{error}</div>
			{/each}
		{/if}
	{/snippet}
</FormPrimitive.FieldErrors>
