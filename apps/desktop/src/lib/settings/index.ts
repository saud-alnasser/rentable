/**
 * THE SETTINGS' ENTRY
 *
 * what another concept may import of the settings area: how one of its sections, and a record in
 * one, is addressed, which is how a feature contributing a section links to it, its host port, and
 * what the composition root hands a settings section it draws, and the keys of this machine's
 * settings, which a write elsewhere that changes them refreshes.
 */
export { keys as settingsKeys } from './keys';
export {
	RECORD_PARAM,
	recordOf,
	ROLE_PARAM,
	THE_SETTINGS_AREA,
	withSection,
	WORKSPACE_PARAM
} from './section';
export type { SettingsHost } from './host';
export type { SettingsSurfaceContributions } from './settings';
