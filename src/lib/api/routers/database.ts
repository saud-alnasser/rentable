import { tauri } from '$lib/api/tauri';
import { procedure, router } from '$lib/api/trpc';

export default router({
	exists: procedure.public.query(async () => {
		return tauri.db.exists();
	}),
	ready: procedure.public.query(async () => {
		return tauri.db.ready();
	}),
	connect: procedure.public.query(async () => {
		await tauri.db.connect();
	}),
	disconnect: procedure.public.query(async () => {
		await tauri.db.disconnect();
	}),
	purge: procedure.public.query(async () => {
		await tauri.db.purge();
	})
});
