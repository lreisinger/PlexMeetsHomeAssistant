import { HomeAssistant } from 'custom-card-helpers';
import Plex from './Plex';

class PlayController {
	entity: string;

	hass: HomeAssistant;

	plex: Plex;

	constructor(hass: HomeAssistant, plex: Plex, entity: string) {
		this.hass = hass;
		this.plex = plex;
		this.entity = entity;
	}

	play = async (mediaID: number): Promise<void> => {
		const serverID = await this.plex.getServerID();
		const command = `am start -a android.intent.action.VIEW 'plex://server://${serverID}/com.plexapp.plugins.library/library/metadata/${mediaID}'`;

		this.hass.callService('androidtv', 'adb_command', {
			// eslint-disable-next-line @typescript-eslint/camelcase
			entity_id: this.entity,
			command
		});
	};

	isPlaySupported = (): boolean => {
		return (
			this.hass.states[this.entity] &&
			this.hass.states[this.entity].attributes &&
			this.hass.states[this.entity].attributes.adb_response !== undefined
		);
	};
}

export default PlayController;
