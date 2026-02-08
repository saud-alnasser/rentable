import { invoke } from '@tauri-apps/api/core';

/**
 * any tauri commands that are available to the API.
 */
export const tauri = {
	example: {
		greet: (name: string) => invoke<string>('greet', { name })
	},
	window: {
		show: () => invoke<void>('window_show')
	},
	db: {
		exists: () => invoke<boolean>('db_does_exist'),
		ready: () => invoke<boolean>('db_is_ready'),
		connect: () => invoke<void>('db_connect'),
		disconnect: () => invoke<void>('db_disconnect'),
		purge: () => invoke<void>('db_purge')
	}
};
