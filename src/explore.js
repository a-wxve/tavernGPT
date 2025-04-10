import { update } from 'node-persist';
import { DOMPurify } from '../../../../../lib.js';
import {
    event_types,
    eventSource,
    getOneCharacter,
    getRequestHeaders,
    messageFormatting,
    printCharactersDebounced,
    processDroppedFiles,
    this_chid,
} from '../../../../../script.js';
import { debounce_timeout } from '../../../../constants.js';
import { callGenericPopup, POPUP_TYPE } from '../../../../popup.js';
import { debounce } from '../../../../utils.js';
import { extensionFolderPath, tavernGPT_settings } from './index.js';

let characters = [];
let totalCharactersLoaded = 0;
let characterPaths = new Set();
let isLoading = false;
const downloadQueue = [];
let isProcessingQueue = false;
const BUTTON_STATE = {
    READY_DOWNLOAD: 'ready_download',
    READY_UPDATE: 'ready_update',
    IN_QUEUE: 'in_queue',
    DOWNLOADING: 'downloading',
    DONE: 'done',
    ERROR: 'error',
};
const searchElements = lazyLoadSearchOptions({
    searchWrapper: '#list-and-search-wrapper',
    characterList: '#list-and-search-wrapper .character-list',
    searchButton: '#characterSearchButton',
    resetButton: '#resetSearchButton',
    searchTerm: '#characterSearchInput',
    creator: '#creatorSearch',
    namespace: '#namespace',
    includedTags: '#includedTags',
    excludedTags: '#excludedTags',
    nsfw: '#nsfwCheckbox',
    itemsPerPage: '#itemsPerPage',
    sort: '#sortOrder',
    sortAscending: '#sortDirection',
    page: '#pageNumber',
});

function lazyLoadSearchOptions(selectorMap) {
    const cache = {};
    return new Proxy(cache, {
        get(target, name) {
            if (!(name in target)) {
                if (selectorMap[name]) {
                    target[name] = document.querySelector(selectorMap[name]);
                } else {
                    throw new Error(`Selector for '${String(name)}' is not defined!`);
                }
            }
            return target[name];
        },
    });
}

function updateButtonState(fullPath, state, errorMessage = '') {
    const buttons = document.querySelectorAll(`.download-btn[data-path="${fullPath}"]`);

    buttons.forEach(button => {
        if (!(button instanceof HTMLElement)) {
            console.error(`Invalid button element for path: ${fullPath}`);
            return;
        }

        const parentElement = button.closest('.character-list-item, .chub-popup');
        if (!(parentElement instanceof HTMLElement)) {
            console.error(`Invalid parent element element for button: ${fullPath}`);
            return;
        }

        if (state === BUTTON_STATE.READY_UPDATE || state === BUTTON_STATE.DONE) {
            parentElement.dataset.downloaded = 'true';
        } else if (state === BUTTON_STATE.READY_DOWNLOAD) {
            parentElement.dataset.downloaded = 'false';
        }

        switch (state) {
            case BUTTON_STATE.READY_DOWNLOAD:
                button.innerHTML = `
                        <i class="fa-solid fa-cloud-arrow-down"></i>
                        <span data-i18n="Download">Download</span>
                    `;
                break;
            case BUTTON_STATE.READY_UPDATE:
                button.innerHTML = `
                        <i class="fa-solid fa-file-circle-check"></i>
                        <span data-i18n="Update">Update</span>
                    `;
                break;
            case BUTTON_STATE.IN_QUEUE:
                button.innerHTML = `
                        <i class="fa-solid fa-check-to-slot"></i>
                        <span data-i18n="Added to queue">Added to queue</span>
                    `;
                break;
            case BUTTON_STATE.DOWNLOADING:
                button.innerHTML = `
                        <i class="fa-solid fa-spinner fa-spin-pulse"></i>
                        <span data-i18n="Downloading">Downloading...</span>
                    `;
                break;
            case BUTTON_STATE.DONE:
                button.innerHTML = `
                        <i class="fa-solid fa-check"></i>
                        <span data-i18n="Done">Done</span>
                    `;
                setTimeout(() => {
                    updateButtonState(fullPath, BUTTON_STATE.READY_UPDATE);
                }, 5000);
                break;
            case BUTTON_STATE.ERROR:
                button.innerHTML = `
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <span data-i18n="Error">Error</span>
                    `;
                button.title = errorMessage;
                setTimeout(() => {
                    updateButtonState(fullPath,
                        characterPaths.has(fullPath) ?
                            BUTTON_STATE.READY_UPDATE :
                            BUTTON_STATE.READY_DOWNLOAD,
                    );
                }, 5000);
                break;
        }
    });
}

async function updateCharacterPaths() {
    const response = await fetch('/api/characters/all', {
        method: 'POST',
        headers: getRequestHeaders(),
    });

    if (!response.ok) {
        console.error('Failed to get existing characters');
        return;
    }

    const characters = await response.json();
    characterPaths.clear();
    characters
        .filter(character => character.data?.extensions?.chub?.full_path)
        .forEach(character => characterPaths.add(character.data.extensions.chub.full_path));

    if (characterPaths.size === 0) {
        toastr.warning('Please make sure lazyLoadCharacters is set to false in config.yaml. Character download buttons will be broken.', 'No character paths found!');
    }
}

function downloadCharacter(input) {
    const character = characters.find(char => char.fullPath === input.trim());
    const tagline = character?.tagline || '';
    const name = character?.name || input.trim();

    downloadQueue.push({
        fullPath: input.trim(),
        tagline,
        name,
    });

    updateButtonState(input.trim(), BUTTON_STATE.IN_QUEUE);

    if (isProcessingQueue) {
        toastr.info(`${name} added to download queue (${downloadQueue.length} in queue).`);
    } else {
        processDownloadQueue();
    }
}

async function processDownloadQueue() {
    if (downloadQueue.length === 0) {
        isProcessingQueue = false;
        return;
    }

    isProcessingQueue = true;
    const { fullPath, tagline, name } = downloadQueue.shift();
    const timestamp = Date.now();
    const isUpdate = characterPaths.has(fullPath);

    updateButtonState(fullPath, BUTTON_STATE.DOWNLOADING);
    toastr.info(`${isUpdate ? 'Updating' : 'Downloading'} ${name}...`);

    const url = `https://www.chub.ai/characters/${fullPath}`;
    const request = await fetch('/api/content/importURL', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ url }),
    });

    if (!request.ok) {
        const errorMessage = isUpdate ? 'Update failed' : 'Download failed';

        console.error(
            'Custom content import failed',
            request.status,
            request.statusText,
        );
        updateButtonState(fullPath, BUTTON_STATE.ERROR, errorMessage);
        toastr.error(
            'Click to go to the character page',
            errorMessage,
            { onclick: () => window.open(url, '_blank') },
        );
        processDownloadQueue();
        return;
    }

    const data = await request.blob();
    const customContentType = request.headers.get('X-Custom-Content-Type');
    if (customContentType !== 'character') {
        console.error('Unknown content type', customContentType);
        updateButtonState(fullPath, BUTTON_STATE.ERROR, 'Unknown content type');
        toastr.error('Unknown content type', customContentType);
        return false;
    }

    const fileName = request.headers
        .get('Content-Disposition')
        .split('filename=')[1]
        .replace(/"/g, '');
    const file = new File([data], fileName, { type: data.type });

    processDroppedFiles([file])
        .then(async () => {
            await updateMostRecentCharacter(timestamp, tagline, fullPath);
            characterPaths.add(fullPath);
            updateButtonState(fullPath, BUTTON_STATE.DONE);
        })
        .catch((error) => {
            console.error('Error processing dropped files:', error);
            updateButtonState(fullPath, BUTTON_STATE.ERROR, error.message);
            toastr.error(error, 'Error processing dropped files');
        })
        .finally(() => {
            processDownloadQueue();
        });
}

/**
 * Updates the creator notes of the most recently added character (after the given timestamp)
 * @param {number} timestamp - The timestamp to compare against
 * @param {string} tagline - The tagline to add to creator notes
 * @param {string} fullPath - The full path to the character on chub.ai
 * @returns {Promise<void>}
 */
async function updateMostRecentCharacter(timestamp, tagline, fullPath) {
    const response = await fetch('/api/characters/all', {
        method: 'POST',
        headers: getRequestHeaders(),
    });

    if (!response.ok) {
        console.error(`Failed to get character list: ${response.status} ${response.statusText}`);
        updateButtonState(fullPath, BUTTON_STATE.ERROR, response.statusText);
        toastr.error(`${response.status} ${response.statusText}`, 'Failed to get character list');
        return;
    }

    const allCharacters = await response.json();

    const recentCharacters = allCharacters.filter(char => char.date_added > timestamp);

    if (recentCharacters.length === 0) {
        const errorMessage = 'Could not identify the imported character';
        console.error(errorMessage);
        updateButtonState(fullPath, BUTTON_STATE.ERROR, errorMessage);
        toastr.error(errorMessage);
        return;
    }

    recentCharacters.sort((a, b) => b.date_added - a.date_added);
    const targetCharacter = recentCharacters[0];

    const updateResponse = await fetch('/api/characters/merge-attributes', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            avatar: targetCharacter.avatar,
            data: {
                creator_notes: tagline,
                extensions: {
                    chub: {
                        full_path: fullPath,
                    },
                },
            },
        }),
    });

    if (!updateResponse.ok) {
        console.error(`Failed to update ${targetCharacter.name}:`, updateResponse.status, updateResponse.statusText);
        updateButtonState(fullPath, BUTTON_STATE.ERROR, updateResponse.statusText);
        toastr.error(`${updateResponse.status} ${updateResponse.statusText}`, `Failed to update ${targetCharacter.name}`);
        return;
    }

    await getOneCharacter(targetCharacter.avatar);
    await eventSource.emit(event_types.CHARACTER_EDITED, {
        detail: { id: this_chid, character: characters[this_chid] },
    });
    printCharactersDebounced();
}

function generateTagsHTML(tags) {
    const includedTagsValue = searchElements.includedTags.value.toLowerCase();
    const includedTags = includedTagsValue.split(',').map(tag => tag.trim());

    const tagsHTML = tags.map(tag => {
        const isIncluded = includedTags.includes(tag.toLowerCase());
        const tagClass = isIncluded ? 'tag included' : 'tag';
        return `<span class="${tagClass}">${tag}</span>`;
    }).join('');

    return tagsHTML;
}

function generateDownloadHTML(fullPath) {
    const isDownloaded = characterPaths.has(fullPath);
    const title = isDownloaded ? 'Already downloaded' : '';
    const icon = isDownloaded ? 'fa-file-circle-check' : 'fa-cloud-arrow-down';
    const text = isDownloaded ? 'Update' : 'Download';

    const downloadHTML = `
        <div class="menu_button menu_button_icon download-btn" title="${title}" data-path="${fullPath}">
            <i class="fa-solid ${icon}"></i>
            <span data-i18n="${text}">${text}</span>
        </div>
    `;

    return downloadHTML;
}

function generateCharacterListItem(character, index) {
    const htmlString = `
        <div class="character-list-item" data-index="${index}" data-downloaded="${characterPaths.has(character.fullPath)}">
            <div class="thumbnail">
                <img src="${character.avatar}">
                ${generateDownloadHTML(character.fullPath)}
            </div>
            <div class="info">
                <div class="name">${character.name}</div>
                <div class="subtitle">
                    <div class="creator">@${character.creator}</div>
                    <div class="favorites">
                        <i class="fa-solid fa-heart" style="color: hotpink"></i>
                        <span>${character.numfavorites} favorites</span>
                    </div>
                </div>
                <div class="tagline">${character.tagline}</div>
                <div class="tags">
                    ${generateTagsHTML(character.tags)}
                </div>
            </div>
        </div>
    `;

    const fragment = document.createRange().createContextualFragment(htmlString);
    return fragment;
}

function generateCharacterPopup(character) {
    const generateStarsHTML = (rating) => {
        let starsHTML = '';
        for (let i = 0; i < Math.floor(rating); i++) {
            starsHTML += '<i class="fa-solid fa-star" style="color: gold"></i>';
        }

        if (rating % 1 >= 0.5) {
            starsHTML += '<i class="fa-solid fa-star-half-stroke" style="color: gold"></i>';
        }

        return starsHTML;
    };

    const popupHTML = `<div class="flex-container chub-popup" data-downloaded="${characterPaths.has(character.fullPath)}">
            <div>
                <div>
                    <img src="${character.url}" alt="${character.name}" width="360">
                    ${generateDownloadHTML(character.fullPath)}
                </div>
                <div class="chub-text-align">
                    <i class="fa-solid fa-cake-candles"></i>
                    <span>
                        Created ${new Date(character.createdAt).toLocaleDateString()} by
                        <strong class="creator">@${character.creator}</strong>
                    </span>
                </div>
                <div class="chub-text-align">
                    <i class="fa-solid fa-calendar-days"></i>
                    <span>Last Updated ${new Date(character.lastActivityAt).toLocaleString()}</span>
                </div>
                <div class="chub-info">
                    <div class="chub-text-align">
                        ${generateStarsHTML(character.rating)}
                        <span>${character.numRatings} ratings</span>
                    </div>
                    <div class="chub-text-align">
                        <i class="fa-solid fa-heart" style="color: hotpink"></i>
                        <span>${character.numfavorites} favorites</span>
                    </div>
                    <div class="chub-text-align">
                        <i class="fa-solid fa-download"></i>
                        <span>${character.downloadCount} downloads</span>
                    </div>
                    <div class="chub-text-align">
                        <i class="fa-solid fa-book"></i>
                        <span>${character.numTokens} tokens</span>
                    </div>
                </div>
            </div>
            <div class="chub-padding">
                <div>
                    <h3><a href="https://www.chub.ai/characters/${character.fullPath}" target="_blank" rel="noopener noreferrer">${character.name}</a></h3>
                </div>
                <p class="tags">
                    ${generateTagsHTML(character.tags)}
                </p>
                <div class="chub-text-align">
                    <strong>${character.tagline}</strong>
                    <hr>
                    ${messageFormatting(character.description, character.name, false, false, null)}
                </div>
            </div>
        </div>
        `;

    callGenericPopup(popupHTML, POPUP_TYPE.DISPLAY, '', {
        wider: true,
    });

    document.querySelector('.chub-popup').addEventListener('click', handleCharacterClick);
}

/**
* Fetches a character from the primary API, falling back to the backup if needed
* @param {Object} character - Character node data from search results
* @returns {Promise<{success: boolean, data: Blob?, error: string?}>} - Promise resolving to result object
*/
async function fetchCharacterData(character) {
    const endpoint = 'https://api.chub.ai/api/characters/download';
    const backupEndpoint = `https://avatars.charhub.io/avatars/${character.fullPath}/avatar.webp`;

    const headers = new Headers({
        'Content-Type': 'application/json',
    });

    const primaryResponse = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            fullPath: character.fullPath,
            format: 'tavern',
            version: 'main',
        }),
    });

    if (primaryResponse.ok) {
        const blob = await primaryResponse.blob();
        return { success: true, data: blob, error: null };
    }

    console.warn('Primary API failed for', character.fullPath, ':', primaryResponse.status, primaryResponse.statusText);
    toastr.warning(
        `Using backup source for ${character.name || character.fullPath}`,
        'API Fallback',
    );

    const backupResponse = await fetch(backupEndpoint, {
        method: 'GET',
        headers: headers,
    });

    if (backupResponse.ok) {
        const blob = await backupResponse.blob();
        return { success: true, data: blob, error: null };
    }

    const errorMessage = `Failed to fetch character "${character.name || character.fullPath}" from both primary and backup sources`;
    console.error(errorMessage, backupResponse.status, backupResponse.statusText);
    return { success: false, data: null, error: errorMessage };
}

function updateCharacterList(characters, reset = false) {
    if (reset) {
        searchElements.characterList.innerHTML = '';
        searchElements.characterList.scrollTop = 0;
    }

    const fragment = document.createDocumentFragment();
    characters.forEach((character, index) => {
        const characterElement = generateCharacterListItem(
            character,
            totalCharactersLoaded + index,
        );
        fragment.appendChild(characterElement);
    });

    searchElements.characterList.appendChild(fragment);

    totalCharactersLoaded += characters.length;
}

/**
* Builds the search URL from the search options and fetches characters from the chub search API
* @param {Object} searchOptions - Search options
* @param {boolean} resetCharacterList - Whether we should clear the character list
* @param {boolean} resetLoadStatus - Whether we should reset the loading status
* @returns {Promise<void>}
*/
async function fetchCharacters(searchOptions, resetCharacterList, resetLoadStatus = false) {
    if (resetCharacterList) {
        await updateCharacterPaths();
        characters = [];
        totalCharactersLoaded = 0;
    }

    searchElements.characterList.classList.add('searching');

    console.log('Search options:', searchOptions);
    toastr.info('Searching...');

    const searchParams = new URLSearchParams();
    if (searchOptions.searchTerm) {
        searchParams.append('search', searchOptions.searchTerm);
    }
    if (searchOptions.creator) {
        searchParams.append('username', searchOptions.creator);
    }
    searchParams.append('first', searchOptions.itemsPerPage);
    searchParams.append('sort', searchOptions.sort || 'download_count');
    searchParams.append('namespace', searchOptions.namespace);
    searchParams.append('page', searchOptions.page || 1);
    searchParams.append('asc', searchOptions.sortAscending);
    searchParams.append('include_forks', 'true');
    searchParams.append('venus', 'true');
    searchParams.append('chub', 'true');
    searchParams.append('nsfw', searchOptions.nsfw);
    searchParams.append('nsfl', searchOptions.nsfw);

    const includedTags = searchOptions.includedTags.filter((tag) => tag.length > 0);
    if (includedTags.length > 0) {
        searchParams.append('tags', includedTags.join(',').slice(0, 100));
    }

    const excludedTags = searchOptions.excludedTags.filter((tag) => tag.length > 0);
    if (excludedTags.length > 0) {
        searchParams.append('exclude_tags', excludedTags.join(',').slice(0, 100));
    }

    const chubApiKey = tavernGPT_settings.api_key_chub;
    const response = await fetch(`https://gateway.chub.ai/search?${String(searchParams)}`, {
        method: 'GET',
        headers: new Headers({
            'CH-API-KEY': chubApiKey,
            samwise: chubApiKey,
        }),
    });
    const searchResults = await response.json();

    const characterPromises = searchResults.data.nodes.map(node => fetchCharacterData(node));
    const characterResults = await Promise.all(characterPromises);

    const sanitize = (text) => {
        if (!text) return '';

        return DOMPurify.sanitize(text, {
            ALLOWED_TAGS: [],
            ALLOWED_ATTR: [],
        });
    };

    const newCharacters = [];
    characterResults.forEach((result, index) => {
        const node = searchResults.data.nodes[index];

        if (!result.success) {
            console.error(`Failed to load character ${node.fullPath}:`, result.error);
            toastr.error(`Could not load "${node.name || node.fullPath}"`, 'Character Load Error');
            return;
        }

        let imageUrl = URL.createObjectURL(result.data);
        newCharacters.push({
            url: imageUrl,
            avatar: node.avatar_url,
            description: node.description,
            tagline: sanitize(node.tagline),
            name: node.name,
            fullPath: node.fullPath,
            tags: node.topics,
            creator: node.fullPath.split('/')[0],
            downloadCount: node.starCount,
            lastActivityAt: node.lastActivityAt,
            createdAt: node.createdAt,
            numTokens: node.nTokens,
            numfavorites: node.n_favorites,
            rating: node.rating,
            numRatings: node.ratingCount,
        });
    });
    characters.push(...newCharacters);

    if (newCharacters.length > 0) {
        if (searchElements.characterList.classList.contains('error')) {
            searchElements.characterList.classList.remove('error');
            searchElements.characterList.replaceChildren();
        }
        updateCharacterList(newCharacters, resetCharacterList);
        searchElements.characterList.classList.remove('searching', 'loading');
    } else {
        searchElements.characterList.classList.remove('searching', 'loading');
        searchElements.characterList.classList.add('error');
        searchElements.characterList.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span data-i18n="No characters found.">No characters found.</span>
        `;
    }

    if (resetLoadStatus) isLoading = false;
}

/**
* Gets the search options from the search input fields and initializes the search
* @param {Event} event - The event that triggered the search
* @param {boolean} resetCharacterList - Whether we should clear the character list
* @param {boolean?} resetLoadStatus - Whether we should reset the loading status
* @returns {void}
*/
function search(event, resetCharacterList, resetLoadStatus) {
    if (event instanceof KeyboardEvent && event.target instanceof HTMLElement) {
        if (event.type === 'keydown' &&
            event.key !== 'Enter' &&
            event.target.id !== 'includedTags' &&
            event.target.id !== 'excludedTags') {
            return;
        }
    }

    const fetchCharactersDebounced = debounce(
        (options, resetCharacterList, resetLoadStatus) =>
            fetchCharacters(options, resetCharacterList, resetLoadStatus),
        debounce_timeout.standard,
    );

    const splitTags = (str) => {
        str = str.trim();
        if (!str.includes(',')) return [str];
        return str.split(',').map((tag) => tag.trim());
    };

    const options = [
        'searchTerm',
        'namespace',
        'creator',
        'includedTags',
        'excludedTags',
        'nsfw',
        'itemsPerPage',
        'sort',
        'sortAscending',
        'page',
    ];
    const searchOptions = {};
    for (const option of options) {
        switch (option) {
            case 'includedTags':
            case 'excludedTags':
                searchOptions[option] = splitTags(searchElements[option].value);
                break;
            case 'nsfw':
                searchOptions[option] = searchElements[option].checked;
                break;
            default:
                searchOptions[option] = searchElements[option].value;
        }
    }

    fetchCharactersDebounced(searchOptions, resetCharacterList, resetLoadStatus);
}

function infiniteScroll(event) {
    if (isLoading) return;
    if (totalCharactersLoaded < searchElements.itemsPerPage.value) return;

    const triggerDistance = 50;
    const characterList = searchElements.characterList;
    const currentPosition = characterList.scrollTop + characterList.clientHeight;
    const remainingDistance = characterList.scrollHeight - currentPosition;

    if (remainingDistance <= triggerDistance) {
        isLoading = true;
        searchElements.page.value = Number(searchElements.page.value) + 1;
        search(event, false, true);
    }
}

async function handleCharacterClick(event) {
    const target = event.target;
    const downloadButtonClicked = target.matches('.download-btn') || target.parentNode.matches('.download-btn');
    const popupCloseButton = target.closest('dialog')?.querySelector('.popup-button-close');

    switch (true) {
        case target.matches('.name'):
        case target.matches('.thumbnail img'): {
            const index = Number(
                target
                    .closest('.character-list-item')
                    .dataset.index,
            );
            generateCharacterPopup(characters[index]);
            break;
        }
        case downloadButtonClicked: {
            const downloadBtn = target.closest('.download-btn');
            if (!downloadBtn) return;

            const characterPath = downloadBtn.dataset.path;
            const isDownloaded = characterPaths.has(characterPath);

            if (isDownloaded) {
                const confirmed = await callGenericPopup('<h3>This character is already downloaded.</h3>Would you like to update it?', POPUP_TYPE.CONFIRM);

                if (!confirmed) {
                    return;
                }
            }

            if (popupCloseButton) popupCloseButton.click();

            downloadCharacter(characterPath);
            break;
        }
        case target.matches('.tag'): {
            if (popupCloseButton) popupCloseButton.click();

            const tags = searchElements.includedTags;
            const tagText = target.textContent.toLowerCase();

            if (target.classList.contains('included')) {
                target.classList.remove('included');
                tags.value = tags.value
                    .split(',')
                    .map((tags) => tags.trim())
                    .filter((tags) => tags !== tagText)
                    .join(', ');
            } else {
                tags.value += `${tagText}, `;
            }

            searchElements.creator.value = '';
            searchElements.page.value = 1;
            searchElements.sort.value = 'trending';

            search(event, true, false);
            break;
        }
        case target.matches('.creator'): {
            if (popupCloseButton) popupCloseButton.click();

            searchElements.searchTerm.value = '';
            searchElements.creator.value = target.textContent.toLowerCase().replace('@', '');
            searchElements.includedTags.value = '';
            searchElements.excludedTags.value = '';
            searchElements.page.value = 1;
            searchElements.sort.value = 'created_at';

            search(event, true, false);
            break;
        }
    }
}

function setupExplorePanel() {
    const elements = [
        'searchTerm',
        'namespace',
        'creator',
        'includedTags',
        'excludedTags',
        'nsfw',
        'itemsPerPage',
        'sort',
        'sortAscending',
        'page',
    ];
    for (const element of elements) {
        searchElements[element].addEventListener('change', (event) => {
            searchElements.page.value = 1;
            search(event, true, false);
        });
    }

    searchElements.searchButton.addEventListener('click', (event) => {
        searchElements.page.value = 1;
        search(event, true, false);
    });

    searchElements.resetButton.addEventListener('click', (event) => {
        searchElements.searchWrapper
            .querySelectorAll('input, select')
            .forEach((element) => {
                switch (element.type) {
                    case 'checkbox':
                        element.checked = element.defaultChecked;
                        break;
                    case 'select-one': {
                        const defaultOption = Array.from(element.options).find(
                            option => option.defaultSelected,
                        );
                        element.value = defaultOption ? defaultOption.value : element.options[0].value;
                        break;
                    }
                    default:
                        element.value = element.defaultValue;
                }
            });
        search(event, true, false);
    });

    const infiniteScrollDebounced = debounce((event) => infiniteScroll(event), debounce_timeout.quick);

    searchElements.characterList.addEventListener('scroll', infiniteScrollDebounced);
    searchElements.characterList.addEventListener('click', handleCharacterClick);
}

export async function loadExplorePanel() {
    const response = await fetch(`${extensionFolderPath}/html/explore.html`);
    const html = await response.text();
    document.querySelector('#top-settings-holder').insertAdjacentHTML('beforeend', html);
    setupExplorePanel();
}
