import { TRPCError } from '@trpc/server';
import { toast } from 'svelte-sonner';

export type MutationOptions = {
	toast?: {
		success?: string;
		error?: boolean | string;
		unexpected?: string;
	};
};

export function onMutationSuccess(opts: MutationOptions) {
	if (opts.toast?.success) {
		toast.success(opts.toast.success);
	}
}

export function onMutationError(opts: MutationOptions, e: Error) {
	if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
		if (opts.toast?.error === true) {
			toast.error(e.message);
		} else if (typeof opts.toast?.error === 'string') {
			toast.error(opts.toast.error);
		}
	} else {
		if (opts.toast?.unexpected) {
			toast.error(opts.toast.unexpected);
		}
	}
}
