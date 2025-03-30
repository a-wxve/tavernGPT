import { DOMPurify, slideToggle } from '../../../../lib.js';
import {
    event_types,
    eventSource,
    getOneCharacter,
    getRequestHeaders,
    getSlideToggleOptions,
    printCharactersDebounced,
    processDroppedFiles,
    this_chid,
} from '../../../../script.js';
import { debounce_timeout } from '../../../constants.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import { debounce } from '../../../utils.js';
import { extensionFolderPath, tavernGPT_settings } from './index.js';

let characters = [];
let totalCharactersLoaded = 0;
let isLoading = false;
const downloadQueue = [];
let isProcessingQueue = false;
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

async function downloadCharacter(input) {
    const character = characters.find(char => char.fullPath === input.trim());
    const tagline = character?.tagline || '';

    downloadQueue.push({
        path: input.trim(),
        tagline,
    });

    if (!isProcessingQueue) {
        processDownloadQueue();
    }
}

async function processDownloadQueue() {
    if (downloadQueue.length === 0) {
        isProcessingQueue = false;
        return;
    }

    isProcessingQueue = true;
    const { path, tagline } = downloadQueue.shift();
    const timestamp = Date.now();

    const url = `https://www.chub.ai/characters/${path}`;
    toastr.info(`Downloading ${path}...`);

    const request = await fetch('/api/content/importURL', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ url }),
    });

    if (!request.ok) {
        toastr.info(
            'Click to go to the character page',
            'Custom content import failed',
            { onclick: () => window.open(url, '_blank') },
        );
        console.error(
            'Custom content import failed',
            request.status,
            request.statusText,
        );
        processDownloadQueue();
        return;
    }

    const data = await request.blob();
    const customContentType = request.headers.get('X-Custom-Content-Type');
    const fileName = request.headers
        .get('Content-Disposition')
        .split('filename=')[1]
        .replace(/"/g, '');
    const file = new File([data], fileName, { type: data.type });

    switch (customContentType) {
        case 'character':
            processDroppedFiles([file])
                .then(async () => {
                    if (tagline) {
                        await updateMostRecentCharacter(timestamp, tagline);
                    }
                })
                .catch((error) => {
                    console.error('Error processing dropped files:', error);
                    toastr.error(error, 'Error processing dropped files');
                })
                .finally(() => {
                    processDownloadQueue();
                });
            break;
        default:
            console.error('Unknown content type', customContentType);
            toastr.error('Unknown content type', customContentType);
            processDownloadQueue();
            break;
    }
}

/**
 * Updates the creator notes of the most recently added character (after the given timestamp)
 * @param {number} timestamp - The timestamp to compare against
 * @param {string} tagline - The tagline to add to creator notes
 * @returns {Promise<void>}
 */
async function updateMostRecentCharacter(timestamp, tagline) {
    const response = await fetch('/api/characters/all', {
        method: 'POST',
        headers: getRequestHeaders(),
    });

    if (!response.ok) {
        console.error(`Failed to get character list: ${response.status} ${response.statusText}`);
        toastr.error(`${response.status} ${response.statusText}`, 'Failed to get character list');
        return;
    }

    const allCharacters = await response.json();

    const recentCharacters = allCharacters.filter(char => char.date_added > timestamp);

    if (recentCharacters.length === 0) {
        console.error('No recently added characters found');
        toastr.error('Could not identify the imported character');
        return;
    }

    recentCharacters.sort((a, b) => b.date_added - a.date_added);
    const targetCharacter = recentCharacters[0];

    const updateResponse = await fetch('/api/characters/edit-attribute', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            avatar_url: targetCharacter.avatar,
            ch_name: targetCharacter.name,
            field: 'creator_notes',
            value: tagline,
        }),
        cache: 'no-cache',
    });

    if (!updateResponse.ok) {
        console.error('Failed to update character notes:', updateResponse.status, updateResponse.statusText);
        toastr.error(`${updateResponse.status} ${updateResponse.statusText}`, `Failed to add tagline to ${targetCharacter.name}`);
        return;
    }

    await getOneCharacter(targetCharacter.avatar);
    await eventSource.emit(event_types.CHARACTER_EDITED, {
        detail: { id: this_chid, character: characters[this_chid] },
    });
    printCharactersDebounced();
}

function generateCharacterListItem(character, index) {
    const includedTagsValue = searchElements.includedTags.value.toLowerCase();
    const includedTags = includedTagsValue.split(',').map(tag => tag.trim());

    const tagsHTML = character.tags.map(tag => {
        const isIncluded = includedTags.includes(tag.toLowerCase());
        const tagClass = isIncluded ? 'tag included' : 'tag';
        return `<span class="${tagClass}">${tag}</span>`;
    }).join('');

    const htmlString = `
        <div class="character-list-item" data-index="${index}">
            <div class="thumbnail">
                <img src="${character.avatar}">
                <div data-path="${character.fullPath}" class="menu_button menu_button_icon download-btn">
                    <i class="fa-solid fa-cloud-arrow-down"></i>
                    <span data-i18n="Download">Download</span>
                </div>
            </div>
            <div class="info">
                <div class="name">${character.name}</div>
                <div class="subtitle">
                    <div class="creator">${character.creator}</div>
                    <div class="favorites">
                        <i class="fa-solid fa-heart" style="color: hotpink"></i>
                        <span>${character.numfavorites} favorites</span>
                    </div>
                </div>
                <div class="tagline">${character.tagline}</div>
                <div class="tags">${tagsHTML}</div>
            </div>
        </div>
    `;

    const fragment = document.createRange().createContextualFragment(htmlString);
    return fragment;
}

async function generateCharacterPopup(character) {
    const includedTagsValue = searchElements.includedTags.value.toLowerCase();
    const includedTags = includedTagsValue.split(',').map(tag => tag.trim());

    const tagsHTML = character.tags.map(tag => {
        const isIncluded = includedTags.includes(tag.toLowerCase());
        const tagClass = isIncluded ? 'tag included' : 'tag';
        return `<span class="${tagClass}">${tag}</span>`;
    }).join('');

    const generateStarHTML = (rating) => {
        let starsHTML = '';
        for (let i = 0; i < Math.floor(rating); i++) {
            starsHTML += '<i class="fa-solid fa-star" style="color: gold"></i>';
        }

        if (rating % 1 >= 0.5) {
            starsHTML += '<i class="fa-solid fa-star-half-stroke" style="color: gold"></i>';
        }

        return starsHTML;
    };

    const popupHTML = `<div class="flex-container chub-popup">
            <div>
                <img src="${character.url}" alt="${character.name}" width="360">
                <div data-path="${character.fullPath}" class="menu_button menu_button_icon download-btn wide100p">
                    <i class="fa-solid fa-cloud-arrow-down"></i>
                    <span data-i18n="Download">Download</span>
                </div>
                <div class="chub-text-align">
                    ${generateStarHTML(character.rating)}
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
            </div>
            <div class="chub-padding">
                <div>
                    <h3><a href="https://www.chub.ai/characters/${character.fullPath}" target="_blank" rel="noopener noreferrer">${character.name}</a></h3>
                    <h5>by ${character.creator}</h5>
                </div>
                <div class="chub-text-align">
                    <p>${character.tagline}</p>
                    <p>${character.description}</p>
                </div>
                <p class="tags">
                ${tagsHTML}
                </p>
                <p class="chub-nowrap">
                    <i class="fa-solid fa-book"></i>
                    <span>${character.numTokens} tokens</span>
                    <i class="fa-solid fa-cake-candles"></i>
                    <span>Created ${new Date(character.createdAt).toLocaleDateString()}</span>
                    <i class="fa-solid fa-pen-nib"></i>
                    <span>Last Updated ${new Date(character.lastActivityAt).toLocaleDateString()}</span>
                </p>
            </div>
        </div>
        `;

    await callGenericPopup(popupHTML, POPUP_TYPE.DISPLAY, '', {
        wider: true,
        allowVerticalScrolling: true,
    });

    document.querySelector('.chub-popup').addEventListener('click', (event) => {
        if (!(event.target instanceof HTMLElement)) return;
        const downloadButton = event.target.closest('.download-btn');
        if (!downloadButton) return;
        downloadCharacter(downloadButton.getAttribute('data-path'));
    });
}

/**
* Fetches a character from the primary API, falling back to the backup if needed
* @param {Object} node - Character node data from search results
* @returns {Promise<{success: boolean, data: Blob?, error: string?}>} - Promise resolving to result object
*/
async function fetchCharacterData(node) {
    const endpoint = 'https://api.chub.ai/api/characters/download';
    const backupEndpoint = `https://avatars.charhub.io/avatars/${node.fullPath}/avatar.webp`;

    const headers = new Headers({
        'Content-Type': 'application/json',
    });

    const primaryResponse = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            fullPath: node.fullPath,
            format: 'tavern',
            version: 'main',
        }),
    });

    if (primaryResponse.ok) {
        const blob = await primaryResponse.blob();
        return { success: true, data: blob, error: null };
    }

    console.warn('Primary API failed for', node.fullPath, ':', primaryResponse.status, primaryResponse.statusText);
    toastr.warning(
        `Using backup source for ${node.name || node.fullPath}`,
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

    const errorMessage = `Failed to fetch character "${node.name || node.fullPath}" from both primary and backup sources`;
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

    if (newCharacters && newCharacters.length > 0) {
        updateCharacterList(newCharacters, resetCharacterList);
    } else {
        toastr.error('No characters found.');
    }

    searchElements.characterList.classList.remove('searching');

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

    const scrollThreshold = 50;
    const distanceFromBottom = searchElements.characterList.scrollHeight - (searchElements.characterList.scrollTop + searchElements.characterList.clientHeight);

    if (distanceFromBottom <= scrollThreshold) {
        isLoading = true;
        searchElements.page.value = Number(searchElements.page.value) + 1;
        search(event, false, true);
    }
}

function handleCharacterClick(event) {
    const target = event.target;
    const nameClicked = target.matches('.name');
    const avatarClicked = target.matches('.thumbnail img');
    const downloadButtonClicked = target.closest('.download-btn');
    const tagClicked = target.matches('.tag');
    const creatorClicked = target.matches('.creator');

    switch (true) {
        case nameClicked:
        case avatarClicked: {
            const index = Number(
                target
                    .closest('.character-list-item')
                    .getAttribute('data-index'),
            );
            generateCharacterPopup(characters[index]);
            break;
        }
        case downloadButtonClicked:
            downloadCharacter(downloadButtonClicked.getAttribute('data-path'));
            break;
        case tagClicked: {
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

            searchElements.page.value = 1;

            search(event, true, false);
            break;
        }
        case creatorClicked:
            searchElements.searchTerm.value = '';
            searchElements.creator.value = target.textContent.toLowerCase();
            searchElements.includedTags.value = '';
            searchElements.excludedTags.value = '';
            searchElements.page.value = 1;
            searchElements.sort.value = 'created_at';

            search(event, true, false);
            break;
    }
}

async function setupExplorePanel() {
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
    let exploreFirstOpen = true;
    const $top_settings_holder = document.querySelector('#top-settings-holder');

    const response = await fetch(`${extensionFolderPath}/html/explore.html`);
    const html = await response.text();
    $top_settings_holder.insertAdjacentHTML('beforeend', html);
    setupExplorePanel();

    const $explore_toggle = document.querySelector(
        '#explore-button .drawer-toggle',
    );
    $explore_toggle.addEventListener('click', () => {
        const icon = $explore_toggle.querySelector('.drawer-icon');
        const drawer =
            $explore_toggle.parentNode.querySelector('.drawer-content');
        const drawerOpen = drawer.classList.contains('openDrawer');

        if (!(drawer instanceof HTMLElement)) return;
        if (drawer.classList.contains('resizing')) return;

        if (!drawerOpen) {
            $top_settings_holder
                .querySelectorAll('.openDrawer')
                .forEach((element) => {
                    if (!(element instanceof HTMLElement)) return;
                    if (!element.classList.contains('pinnedOpen')) {
                        element.classList.add('resizing');
                    }
                    slideToggle(element, {
                        ...getSlideToggleOptions(),
                        onAnimationEnd: (element) => {
                            element
                                .closest('.drawer-content')
                                .classList.remove('resizing');
                        },
                    });
                });

            if (
                $top_settings_holder.querySelector(
                    '.drawer:has(.openIcon):has(.openDrawer)',
                )
            ) {
                $top_settings_holder
                    .querySelector('.openIcon')
                    .classList.replace('openIcon', 'closedIcon');
                $top_settings_holder
                    .querySelector('.openDrawer')
                    .classList.replace('openDrawer', 'closedDrawer');
            }

            drawer.classList.add('resizing');
            slideToggle(drawer, {
                ...getSlideToggleOptions(),
                onAnimationEnd: (element) => {
                    element.classList.remove('resizing');
                },
            });

            icon.classList.replace('closedIcon', 'openIcon');
            drawer.classList.replace('closedDrawer', 'openDrawer');

            if (exploreFirstOpen) {
                searchElements.searchButton.click();
                exploreFirstOpen = false;
            }
        } else if (drawerOpen) {
            icon.classList.replace('openIcon', 'closedIcon');

            drawer.classList.add('resizing');
            slideToggle(drawer, {
                ...getSlideToggleOptions(),
                onAnimationEnd: (element) => {
                    element.classList.remove('resizing');
                },
            });

            drawer.classList.replace('openDrawer', 'closedDrawer');
        }
    });
}
