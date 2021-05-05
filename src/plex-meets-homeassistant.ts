/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-env browser */
import { HomeAssistant } from 'custom-card-helpers';
import _ from 'lodash';
import Plex from './modules/Plex';
import { escapeHtml } from './modules/utils';
import { CSS_STYLE } from './const';

class PlexMeetsHomeAssistant extends HTMLElement {
	plexProtocol: 'http' | 'https' = 'http';

	movieElems: any = [];

	detailElem: HTMLElement | undefined = undefined;

	data: Record<string, any> = {};

	config: Record<string, any> = {};

	requestTimeout = 3000;

	loading = false;

	maxCount: false | number = false;

	playSupported = false;

	error = '';

	content: any;

	previousPositions: Array<any> = [];

	set hass(hass: HomeAssistant) {
		if (!this.content) {
			this.playSupported =
				hass.states[this.config.entity_id] &&
				hass.states[this.config.entity_id].attributes &&
				hass.states[this.config.entity_id].attributes.adb_response !== undefined;

			this.error = '';
			if (!this.loading) {
				this.loadInitialData(hass);
			}
		}
	}

	loadInitialData = async (hass: HomeAssistant): Promise<void> => {
		this.loading = true;
		this.renderPage(hass);

		const plex = new Plex(this.config.ip, this.config.port, this.config.token, this.plexProtocol);
		try {
			const [plexInfo, plexSections] = await Promise.all([plex.getServerInfo(), plex.getSectionsData()]);
			// eslint-disable-next-line @typescript-eslint/camelcase
			this.data.serverID = plexInfo;
			_.forEach(plexSections, section => {
				this.data[section.title1] = section.Metadata;
			});

			if (this.data[this.config.libraryName] === undefined) {
				this.error = `Library name ${this.config.libraryName} does not exist.`;
			}

			this.loading = false;
			this.render(hass);
		} catch (err) {
			// todo: proper timeout here
			this.error = `Plex server did not respond.<br/>Details of the error: ${escapeHtml(err.message)}`;
			this.renderPage(hass);
		}
	};

	render = (hass: HomeAssistant): void => {
		this.previousPositions = [];

		// todo: find a better way to detect resize...
		setInterval(() => {
			if (this.movieElems.length > 0) {
				let renderNeeded = false;
				if (this.previousPositions.length === 0) {
					for (let i = 0; i < this.movieElems.length; i += 1) {
						this.previousPositions[i] = {};
						this.previousPositions[i].top = this.movieElems[i].parentElement.offsetTop;
						this.previousPositions[i].left = this.movieElems[i].parentElement.offsetLeft;
					}
				}
				for (let i = 0; i < this.movieElems.length; i += 1) {
					if (
						this.previousPositions[i] &&
						this.movieElems[i].dataset.clicked !== 'true' &&
						(this.previousPositions[i].top !== this.movieElems[i].parentElement.offsetTop ||
							this.previousPositions[i].left !== this.movieElems[i].parentElement.offsetLeft)
					) {
						renderNeeded = true;
						this.previousPositions = [];
					}
				}
				if (renderNeeded) {
					this.renderPage(hass);
				}
			}
		}, 100);

		this.renderPage(hass);
	};

	renderPage = (hass: HomeAssistant): void => {
		if (this) this.innerHTML = '';
		const card = document.createElement('ha-card');
		// card.header = this.config.libraryName;
		this.content = document.createElement('div');
		this.content.style.padding = '16px 16px 100px';

		this.content.innerHTML = '';
		if (this.error !== '') {
			this.content.innerHTML = `Error: ${this.error}`;
		} else if (this.data[this.config.libraryName] && this.data[this.config.libraryName].length === 0) {
			this.content.innerHTML = `Library ${escapeHtml(this.config.libraryName)} has no items.`;
		} else if (this.loading) {
			this.content.style.padding = '16px 16px 16px';
			this.content.innerHTML =
				'<div style="display: flex; align-items: center; justify-content: center;"><div class="lds-ring"><div></div><div></div><div></div><div></div></div></div>';
		}

		card.appendChild(this.content);
		this.appendChild(card);

		let count = 0;

		const contentbg = document.createElement('div');
		contentbg.className = 'contentbg';
		this.content.appendChild(contentbg);

		this.detailElem = document.createElement('div');
		this.detailElem.className = 'detail';
		this.detailElem.innerHTML =
			"<h1></h1><h2></h2><span class='metaInfo'></span><span class='detailDesc'></span><div class='clear'></div>";

		if (this.playSupported) {
			this.detailElem.innerHTML += "<span class='detailPlayAction'></span>";
		}

		this.content.appendChild(this.detailElem);

		// todo: figure out why timeout is needed here and do it properly
		setTimeout(() => {
			contentbg.addEventListener('click', () => {
				this.hideBackground();
				this.minimizeAll();
			});
		}, 1);
		if (this.data[this.config.libraryName]) {
			// eslint-disable-next-line consistent-return
			_.forEach(this.data[this.config.libraryName], (movieData: Record<string, any>) => {
				if (!this.maxCount || count < this.maxCount) {
					count += 1;
					this.content.appendChild(this.getMovieElement(movieData, hass, this.data.server_id));
				} else {
					return true;
				}
			});
		}
		const endElem = document.createElement('div');
		endElem.className = 'clear';
		this.content.appendChild(endElem);

		this.calculatePositions();
		this.loadCustomStyles();
	};

	calculatePositions = (): void => {
		// todo: figure out why interval is needed here and do it properly
		const setLeftOffsetsInterval = setInterval(() => {
			this.movieElems = this.getElementsByClassName('movieElem');
			for (let i = 0; i < this.movieElems.length; i += 1) {
				if (this.movieElems[i].offsetLeft === 0) {
					break;
				} else {
					clearInterval(setLeftOffsetsInterval);
				}
				this.movieElems[i].style.left = `${this.movieElems[i].offsetLeft}px`;
				this.movieElems[i].dataset.left = this.movieElems[i].offsetLeft;
				this.movieElems[i].style.top = `${this.movieElems[i].offsetTop}px`;
				this.movieElems[i].dataset.top = this.movieElems[i].offsetTop;
			}
		}, 100);
	};

	minimizeAll = (): void => {
		for (let i = 0; i < this.movieElems.length; i += 1) {
			if (this.movieElems[i].dataset.clicked === 'true') {
				this.movieElems[i].style.width = `${CSS_STYLE.width}px`;
				this.movieElems[i].style.height = `${CSS_STYLE.height}px`;
				this.movieElems[i].style['z-index'] = 1;
				this.movieElems[i].style.position = 'absolute';
				this.movieElems[i].style.left = `${this.movieElems[i].dataset.left}px`;
				this.movieElems[i].style.top = `${this.movieElems[i].dataset.top}px`;
				setTimeout(() => {
					this.movieElems[i].dataset.clicked = false;
				}, 500);
			}
		}
		this.hideDetails();
	};

	hideDetails = (): void => {
		const doc = document.documentElement;
		const top = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
		if (this.detailElem) {
			this.detailElem.style.top = `${top - 1000}px`;
			this.detailElem.style.color = 'rgba(255,255,255,0)';
			this.detailElem.style.zIndex = '0';
			this.detailElem.style.visibility = 'hidden';
		}
	};

	showDetails = (data: any): void => {
		const doc = document.documentElement;
		const top = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
		if (this.detailElem) {
			this.detailElem.style.transition = '0s';
			this.detailElem.style.top = `${top - 1000}px`;
			console.log(this.detailElem.style.top);

			setTimeout(() => {
				if (this.detailElem) {
					this.detailElem.style.visibility = 'visible';
					this.detailElem.style.transition = '0.7s';
					this.detailElem.style.top = `${top}px`;

					this.detailElem.children[0].innerHTML = escapeHtml(data.title);
					this.detailElem.children[1].innerHTML = escapeHtml(data.year);
					this.detailElem.children[2].innerHTML = `${(data.duration !== undefined
						? `<span class='minutesDetail'>${Math.round(
								parseInt(escapeHtml(data.duration), 10) / 60 / 1000
						  )} min</span>`
						: '') +
						(data.contentRating !== undefined
							? `<span class='contentRatingDetail'>${escapeHtml(data.contentRating)}</span>`
							: '') +
						(data.rating !== undefined
							? `<span class='ratingDetail'>${data.rating < 5 ? '&#128465;' : '&#11088;'}&nbsp;${escapeHtml(
									data.rating
							  )}</span>`
							: '')}<div class='clear'></div>`;
					this.detailElem.children[3].innerHTML = escapeHtml(data.summary);
					if (data.type === 'movie') {
						(this.detailElem.children[5] as HTMLElement).style.visibility = 'visible';
						this.detailElem.children[5].innerHTML = 'Play';
					} else {
						(this.detailElem.children[5] as HTMLElement).style.visibility = 'hidden';
					}

					this.detailElem.style.color = 'rgba(255,255,255,1)';
					this.detailElem.style.zIndex = '4';
				}
			}, 200);
		}
	};

	showBackground = (): void => {
		const contentbg = this.getElementsByClassName('contentbg');
		(contentbg[0] as HTMLElement).style.zIndex = '2';
		(contentbg[0] as HTMLElement).style.backgroundColor = 'rgba(0,0,0,0.9)';
	};

	hideBackground = (): void => {
		const contentbg = this.getElementsByClassName('contentbg');
		(contentbg[0] as HTMLElement).style.zIndex = '1';
		(contentbg[0] as HTMLElement).style.backgroundColor = 'rgba(0,0,0,0)';
	};

	getMovieElement = (data: any, hass: HomeAssistant, serverID: string): HTMLDivElement => {
		const thumbURL = `${this.plexProtocol}://${this.config.ip}:${this.config.port}/photo/:/transcode?width=${CSS_STYLE.expandedWidth}&height=${CSS_STYLE.expandedHeight}&minSize=1&upscale=1&url=${data.thumb}&X-Plex-Token=${this.config.token}`;

		const container = document.createElement('div');
		container.className = 'container';
		container.style.width = `${CSS_STYLE.width}px`;
		container.style.height = `${CSS_STYLE.height + 30}px`;

		const movieElem = document.createElement('div');
		movieElem.className = 'movieElem';

		movieElem.style.width = `${CSS_STYLE.width}px`;
		movieElem.style.height = `${CSS_STYLE.height}px`;
		movieElem.style.backgroundImage = `url('${thumbURL}')`;
		if (!this.playSupported) {
			movieElem.style.cursor = 'pointer';
		}

		const self = this;
		movieElem.addEventListener('click', function handleClick() {
			if (this.dataset.clicked === 'true') {
				self.hideDetails();
				this.style.width = `${CSS_STYLE.width}px`;
				this.style.height = `${CSS_STYLE.height}px`;
				this.style.zIndex = '1';
				this.style.top = `${this.dataset.top}px`;
				this.style.left = `${this.dataset.left}px`;

				setTimeout(() => {
					this.dataset.clicked = 'false';
				}, 500);

				self.hideBackground();
			} else {
				self.minimizeAll();
				self.showDetails(data);
				const doc = document.documentElement;
				const top = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
				self.showBackground();
				this.style.width = `${CSS_STYLE.expandedWidth}px`;
				this.style.height = `${CSS_STYLE.expandedHeight}px`;
				this.style.zIndex = '3';
				this.style.left = '16px';
				this.style.top = `${top + 16}px`;
				this.dataset.clicked = 'true';
			}
		});

		const playButton = this.getPlayButton();
		const interactiveArea = document.createElement('div');
		interactiveArea.className = 'interactiveArea';
		if (this.playSupported) {
			interactiveArea.append(playButton);
		}

		movieElem.append(interactiveArea);

		playButton.addEventListener('click', event => {
			event.stopPropagation();
			const keyParts = data.key.split('/');
			const movieID = keyParts[3];
			const command = `am start -a android.intent.action.VIEW 'plex://server://${serverID}/com.plexapp.plugins.library/library/metadata/${movieID}'`;

			console.log(command);
			// eslint-disable-next-line @typescript-eslint/camelcase
			const { entity_id } = this.config;
			hass.callService('androidtv', 'adb_command', {
				// eslint-disable-next-line @typescript-eslint/camelcase
				entity_id,
				command
			});
		});

		const titleElem = document.createElement('div');
		titleElem.innerHTML = escapeHtml(data.title);
		titleElem.className = 'titleElem';
		titleElem.style.marginTop = `${CSS_STYLE.height}px`;

		const yearElem = document.createElement('div');
		yearElem.innerHTML = escapeHtml(data.year);
		yearElem.className = 'yearElem';

		container.appendChild(movieElem);
		container.appendChild(titleElem);
		container.appendChild(yearElem);

		return container;
	};

	loadCustomStyles = (): void => {
		const style = document.createElement('style');

		style.textContent = `
          .detailPlayAction {
            top: 10px;
            color: rgb(15 17 19);
            font-weight: bold;
            padding: 5px 10px;
            border-radius: 5px;
            cursor: pointer;
            position: relative;
            background: orange;
          }
          .ratingDetail {
            background: #ffffff24;
            padding: 5px 10px;
            border-radius: 5px;
          }
          .contentRatingDetail {
            background: #ffffff24;
            padding: 5px 10px;
            border-radius: 5px;
            margin-right: 10px;
          }
          .clear {
            clear:both;
          }
          .minutesDetail {
            background: #ffffff24;
            padding: 5px 10px;
            border-radius: 5px;
            margin-right: 10px;
          }
          .detail .metaInfo {
            display: block;
            margin-bottom: 15px;
          }
          .detail h2 {
            text-overflow: ellipsis; 
            white-space: nowrap; 
            overflow: hidden;
            position: relative;
            margin: 5px 0px 10px 0px;
            font-size: 16px;
          } 
          .detail h1 {
            text-overflow: ellipsis; 
            white-space: nowrap; 
            overflow: hidden;
            position: relative;
            padding: 5px 0px;
            margin: 16px 0 10px 0;
          }
          .detail {
            visibility: hidden;
          }
          .detailDesc {
    
          }
          .lds-ring {
            display: inline-block;
            position: relative;
            width: 80px;
            height: 80px;
          }
          .lds-ring div {
            box-sizing: border-box;
            display: block;
            position: absolute;
            width: 64px;
            height: 64px;
            margin: 8px;
            border: 8px solid orange;
            border-radius: 50%;
            animation: lds-ring 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
            border-color: orange transparent transparent transparent;
          }
          .lds-ring div:nth-child(1) {
            animation-delay: -0.45s;
          }
          .lds-ring div:nth-child(2) {
            animation-delay: -0.3s;
          }
          .lds-ring div:nth-child(3) {
            animation-delay: -0.15s;
          }
          @keyframes lds-ring {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }      
          .detail {
            position: absolute;
            left: 247px;
            width: calc(100% - 267px);
            z-index: 4;
            transition: 0.5s;
            color: rgba(255,255,255,0);
          }
          .contentbg {
            position: absolute;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0);
            z-index: 0;
            transition: 0.5s;
            left: 0;
            top: 0;
          }
          .yearElem {
            color:hsla(0,0%,100%,.45);
            position: relative;
          }
          .titleElem {
            text-overflow: ellipsis; 
            white-space: nowrap; 
            overflow: hidden;
            position: relative;
          }
          .movieElem {
            margin-bottom:5px;
            background-repeat: no-repeat; 
            background-size: contain; 
            border-radius: 5px;
            transition: 0.5s;
            position: absolute;
            z-index: 1;
          }
          .container {
            z-index: 1;
            float:left;
            margin-bottom: 20px;
            margin-right: 10px;
            transition: 0.5s;
          }
          .interactiveArea {
            position: relative;
            width: 100%;
            height: 100%;
            transition: 0.5s;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .interactiveArea:hover {
            background: rgba(0,0,0,0.3);
          }
          button[name="playButton"] {
            width: 40px;
            height: 40px;
            border: 2px solid white;
            border-radius: 100%;
            margin: auto;
            cursor: pointer;
            transition: 0.2s;
          }
          button[name="playButton"]:hover {
            background: orange !important;
            border: 2px solid orange !important;
          }
          button[name="playButton"]:focus {
            outline: 0;
            background: orange !important;
            border: 2px solid orange !important;
            box-shadow: 0 0 0 3px orange !important;
          }
          
          button[name="playButton"]::after {
            content: '';
            display: inline-block;
            position: relative;
            top: 1px;
            left: 2px;
            border-style: solid;
            border-width: 6px 0 6px 12px;
            border-color: transparent transparent transparent white;
            transition: 0.2s;
          } 
    
          .interactiveArea button[name="playButton"] {
            background: rgba(0,0,0,0.0);
            border: 2px solid rgba(255,255,255,0.0);
          }
    
          .interactiveArea:hover button[name="playButton"] {
            background: rgba(0,0,0,0.4);
            border: 2px solid rgba(255,255,255,1);
          }
    
          .interactiveArea button[name="playButton"]:after {
            border-color: transparent transparent transparent rgba(255,255,255,0);
          }
    
          .interactiveArea:hover button[name="playButton"]:after {
            border-color: transparent transparent transparent rgba(255,255,255,1);
          }
      
          button[name="playButton"]:hover:after {
            border-color: transparent transparent transparent black !important;
          }
      
          button[name="playButton"]:focus:after {
            border-color: transparent transparent transparent black !important;
          }`;

		this.appendChild(style);
	};

	getPlayButton = (): HTMLButtonElement => {
		const playButton = document.createElement('button');
		playButton.name = 'playButton';

		return playButton;
	};

	// todo: define custom type
	setConfig = (config: any): void => {
		this.plexProtocol = 'http';
		if (!config.entity_id) {
			throw new Error('You need to define an entity_id');
		}
		if (!config.token) {
			throw new Error('You need to define a token');
		}
		if (!config.ip) {
			throw new Error('You need to define a ip');
		}
		if (!config.port) {
			throw new Error('You need to define a port');
		}
		if (!config.libraryName) {
			throw new Error('You need to define a libraryName');
		}
		this.config = config;
		if (config.protocol) {
			this.plexProtocol = config.protocol;
		}
		if (config.maxCount) {
			this.maxCount = config.maxCount;
		}
	};

	getCardSize = (): number => {
		return 3;
	};
}

customElements.define('plex-meets-homeassistant', PlexMeetsHomeAssistant);
