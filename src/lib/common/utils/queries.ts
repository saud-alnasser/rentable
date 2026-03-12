import { TRPCError } from '@trpc/server';
import { toast } from 'svelte-sonner';

type ToastMessage = string | (() => string);

export type MutationOptions = {
	toast?: {
		success?: ToastMessage;
		error?: boolean | ToastMessage;
		unexpected?: ToastMessage;
	};
};

function resolveToastMessage(message: ToastMessage) {
	return typeof message === 'function' ? message() : message;
}

export function onMutationSuccess(opts: MutationOptions) {
	if (opts.toast?.success) {
		toast.success(resolveToastMessage(opts.toast.success));
	}
}

export function onMutationError(opts: MutationOptions, e: Error) {
	if (e instanceof TRPCError && e.code === 'BAD_REQUEST') {
		if (opts.toast?.error === true) {
			toast.error(e.message);
		} else if (opts.toast?.error) {
			toast.error(resolveToastMessage(opts.toast.error));
		}
	} else {
		if (opts.toast?.unexpected) {
			toast.error(resolveToastMessage(opts.toast.unexpected));
		}
	}
}
