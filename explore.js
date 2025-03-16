import { slideToggle } from '../../../../lib.js';
import {
    animation_duration,
    getRequestHeaders,
    processDroppedFiles,
} from '../../../../script.js';
import { debounce_timeout } from '../../../constants.js';
import { POPUP_TYPE, callGenericPopup } from '../../../popup.js';
import { debounce } from '../../../utils.js';
import { extensionFolderPath, tavernGPT_settings } from './index.js';

let characters = [];
let totalCharactersLoaded = 0;
let isLoading = false;

async function downloadCharacter(input) {
    const url = `https://www.chub.ai/characters/${input.trim()}`;
    toastr.info(`Downloading ${input}...`);

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
            processDroppedFiles([file]);
            break;
        default:
            toastr.warning('Unknown content type');
            console.error('Unknown content type', customContentType);
            break;
    }
}

function generateCharacterListItem(character, index) {
    const includedTagsValue = document.querySelector('#includeTags').value.toLowerCase();
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
                <div data-path="${character.fullPath}" class="menu_button menu_button_icon download-btn wide100p">
                    <i class="fa-solid fa-cloud-arrow-down"></i>
                    <span data-i18n="Download">Download</span>
                </div>
            </div>
            <div class="info">
                <div class="name">${character.name}
                    <span class="creator">by ${character.creator}</span>
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
    const includedTagsValue = document.querySelector('#includeTags').value.toLowerCase();
    const includedTags = includedTagsValue.split(',').map(tag => tag.trim());

    const tagsHTML = character.tags.map(tag => {
        const isIncluded = includedTags.includes(tag.toLowerCase());
        const tagClass = isIncluded ? 'tag included' : 'tag';
        return `<span class="${tagClass}">${tag}</span>`;
    }).join('');

    const generateStarHTML = (rating) => {
        let starsHTML = '';
        for (let i = 0; i < Math.floor(rating); i++) {
            starsHTML += '<i class="fa-solid fa-star"></i>';
        }

        if (rating % 1 >= 0.5) {
            starsHTML += '<i class="fa-solid fa-star-half-stroke"></i>';
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
                    ${generateStarHTML(character.rating)} ${character.rating}/5
                </div>
                <div class="chub-text-align">
                    <i class="fa-solid ${character.rating > 3 ? 'fa-thumbs-up' : 'fa-thumbs-down'}"></i>
                    <span>${character.numRatings} ratings</span>
                </div>
                <div class="chub-text-align">
                    <i class="fa-solid fa-star"></i>
                    <span>${character.starCount} stars</span>
                </div>
                <div class="chub-text-align">
                    <i class="fa-solid fa-heart"></i>
                    <span>${character.numfavorites} favorites</span>
                </div>
            </div>
            <div class="chub-padding">
                <div>
                    <h3><a href="https://www.characterhub.org/characters/${character.fullPath}" target="_blank" rel="noopener noreferrer">${character.name}</a></h3>
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
    }).then(() => {
        document
            .querySelector('.chub-popup')
            .addEventListener('click', (event) => {
                const downloadButton =
                    event.target.closest('.download-btn');
                if (downloadButton) {
                    downloadCharacter(
                        downloadButton.getAttribute('data-path'),
                    );
                }
            });
    });
}

function updateCharacterList(characters, reset = false) {
    const $characterList = document.querySelector(
        '#list-and-search-wrapper .character-list',
    );

    if (reset) {
        $characterList.innerHTML = '';
        $characterList.scrollTop = 0;
    }

    const fragment = document.createDocumentFragment();
    characters.forEach((character, index) => {
        const characterElement = generateCharacterListItem(
            character,
            totalCharactersLoaded + index,
        );
        fragment.appendChild(characterElement);
    });

    $characterList.appendChild(fragment);

    totalCharactersLoaded += characters.length;
}

/**
* Fetches a character from the primary API, falling back to the backup if needed
* @param {Object} node - Character node data from search results
* @returns {Promise<{success: boolean, data: Blob|null, error: string|null}>} - Promise resolving to result object
*/
async function fetchCharacterData(node) {
    const endpoint = 'https://api.chub.ai/api/characters/download';
    const backupEndpoint = `https://avatars.charhub.io/avatars/${node.fullPath}/avatar.webp`;
    const requestBody = {
        fullPath: node.fullPath,
        format: 'tavern',
        version: 'main',
    };

    const primaryResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    if (primaryResponse.ok) {
        const blob = await primaryResponse.blob();
        return { success: true, data: blob, error: null };
    }

    console.warn(`Primary API failed for ${node.fullPath}: ${primaryResponse.status}`);
    toastr.warning(
        `Using backup source for ${node.name || node.fullPath}`,
        'API Fallback',
    );

    const backupResponse = await fetch(backupEndpoint, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (backupResponse.ok) {
        const blob = await backupResponse.blob();
        return { success: true, data: blob, error: null };
    }

    const errorMessage = `Failed to fetch character "${node.name || node.fullPath}" from both primary and backup sources`;
    console.error(errorMessage, backupResponse.status);
    return { success: false, data: null, error: errorMessage };
}

async function fetchCharacters(searchOptions, reset, callback) {
    if (reset) {
        characters = [];
        totalCharactersLoaded = 0;
    }

    const $characterList = document.querySelector(
        '#list-and-search-wrapper .character-list',
    );

    $characterList.classList.add('searching');

    console.log('Search options:', searchOptions);
    toastr.info('Searching...');

    const searchParams = new URLSearchParams();
    if (searchOptions.searchTerm) {
        searchParams.append('search', searchOptions.searchTerm);
    }
    if (searchOptions.creator) {
        searchParams.append('username', searchOptions.creator);
    }
    searchParams.append('sort', searchOptions.sort || 'download_count');
    searchParams.append('namespace', searchOptions.namespace);
    searchParams.append('first', searchOptions.findCount);
    searchParams.append('page', searchOptions.page || 1);
    searchParams.append('asc', 'false');
    searchParams.append('include_forks', 'true');
    searchParams.append('venus', 'true');
    searchParams.append('chub', 'true');
    searchParams.append('nsfw', searchOptions.nsfw);
    searchParams.append('nsfl', searchOptions.nsfw);
    searchParams.append('nsfw_only', 'false');
    searchParams.append('require_images', 'false');
    searchParams.append('require_example_dialogues', 'false');
    searchParams.append('require_alternate_greetings', 'false');
    searchParams.append('require_custom_prompt', 'false');
    searchParams.append('require_lore', 'false');
    searchParams.append('require_lore_embedded', 'false');
    searchParams.append('require_lore_linked', 'false');

    const includeTags = searchOptions.includeTags.filter((tag) => tag.length > 0);
    if (includeTags.length > 0) {
        searchParams.append('topics', includeTags.join(',').slice(0, 100));
    }

    const excludeTags = searchOptions.excludeTags.filter((tag) => tag.length > 0);
    if (excludeTags.length > 0) {
        searchParams.append('excludetopics', excludeTags.join(',').slice(0, 100));
    }

    const url = `https://api.chub.ai/api/${searchOptions.namespace}/search?${searchParams.toString()}`;

    const chubApiKey = tavernGPT_settings.api_key_chub;
    let searchData = await fetch(url, {
        headers: {
            'CH-API-KEY': chubApiKey,
            samwise: chubApiKey,
        },
    }).then((data) => data.json());

    const characterPromises = searchData.nodes.map(node => fetchCharacterData(node));
    const characterResults = await Promise.all(characterPromises);

    const sanitize = (text) => {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    const newCharacters = [];
    characterResults.forEach((result, index) => {
        const node = searchData.nodes[index];

        if (result.success) {
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
                starCount: node.starCount,
                lastActivityAt: node.lastActivityAt,
                createdAt: node.createdAt,
                numTokens: node.nTokens,
                numfavorites: node.n_favorites,
                rating: node.rating,
                numRatings: node.ratingCount,
            });
        } else {
            console.error(`Failed to load character ${node.fullPath}:`, result.error);
            toastr.error(`Could not load "${node.name || node.fullPath}"`, 'Character Load Error');
        }
    });
    characters.push(...newCharacters);

    $characterList.classList.remove('searching');

    if (newCharacters && newCharacters.length > 0) {
        updateCharacterList(newCharacters, reset);
    } else {
        toastr.error('No characters found.');
    }

    if (callback && typeof callback === 'function') {
        callback();
    }
}

function search(event, reset, callback) {
    if (
        event.type === 'keydown' &&
        event.key !== 'Enter' &&
        event.target.id !== 'includeTags' &&
        event.target.id !== 'excludeTags'
    ) {
        return;
    }
    const $searchWrapper = document.querySelector(
        '#list-and-search-wrapper',
    );

    const fetchCharactersDebounced = debounce(
        (options, reset, callback) =>
            fetchCharacters(options, reset, callback),
        debounce_timeout.standard,
    );

    const splitAndTrim = (str) => {
        str = str.trim();
        if (!str.includes(',')) {
            return [str];
        }
        return str.split(',').map((tag) => tag.trim());
    };

    const searchTerm = $searchWrapper.querySelector(
        '#characterSearchInput',
    ).value;
    const creator = $searchWrapper.querySelector('#creatorSearch').value;
    const namespace = $searchWrapper.querySelector('#namespace').value;
    const includeTags = splitAndTrim(
        $searchWrapper.querySelector('#includeTags').value,
    );
    const excludeTags = splitAndTrim(
        $searchWrapper.querySelector('#excludeTags').value,
    );
    const nsfw = $searchWrapper.querySelector('#nsfwCheckbox').checked;
    const findCount = $searchWrapper.querySelector('#findCount').value;
    const sort = $searchWrapper.querySelector('#sortOrder').value;
    const page = $searchWrapper.querySelector('#pageNumber').value;

    fetchCharactersDebounced(
        {
            searchTerm,
            namespace,
            creator,
            includeTags,
            excludeTags,
            nsfw,
            findCount,
            sort,
            page,
        },
        reset,
        callback,
    );
}

function infiniteScroll(event) {
    if (isLoading) return;

    const $characterList = document.querySelector(
        '#list-and-search-wrapper .character-list',
    );
    const $pageNumber = document.querySelector('#pageNumber');
    const scrollThreshold = 50;

    const distanceFromBottom =
        $characterList.scrollHeight -
        ($characterList.scrollTop + $characterList.clientHeight);

    if (distanceFromBottom <= scrollThreshold) {
        isLoading = true;
        $pageNumber.value = Math.max(
            1,
            parseInt($pageNumber.value.toString()) + 1,
        );
        search(event, false, () => {
            isLoading = false;
        });
    }
}

function handleCharacterClick(event) {
    const $searchWrapper = document.querySelector('#list-and-search-wrapper');
    const $pageNumber = $searchWrapper.querySelector('#pageNumber');

    const target = event.target;
    const nameClicked = target.matches('.name');
    const avatarClicked = target.matches('.thumbnail img');
    const downloadButtonClicked = target.closest('.download-btn');
    const tagClicked = target.matches('.tag');
    const creatorClicked = target.matches('.creator');

    if (nameClicked || avatarClicked) {
        const index = parseInt(
            target
                .closest('.character-list-item')
                .getAttribute('data-index'),
        );
        generateCharacterPopup(characters[index]);
    } else if (downloadButtonClicked) {
        downloadCharacter(downloadButtonClicked.getAttribute('data-path'));
    } else if (tagClicked) {
        const $tags = $searchWrapper.querySelector('#includeTags');
        const tagText = target.textContent.toLowerCase();

        if (target.classList.contains('included')) {
            target.classList.remove('included');
            $tags.value = $tags.value
                .split(',')
                .map((tags) => tags.trim())
                .filter((tags) => tags !== tagText)
                .join(', ');
        } else {
            $tags.value += `${tagText}, `;
        }

        $pageNumber.value = 1;

        search(event, true);
    } else if (creatorClicked) {
        const username = target.textContent.toLowerCase().split(' ')[1];
        const $searchTerm = $searchWrapper.querySelector(
            '#characterSearchInput',
        );
        const $creatorSearch =
            $searchWrapper.querySelector('#creatorSearch');
        const $tags = $searchWrapper.querySelector('#includeTags');
        const $excludedTags = $searchWrapper.querySelector('#excludeTags');
        const $sortOrder = $searchWrapper.querySelector('#sortOrder');

        $searchTerm.value = '';
        $creatorSearch.value = `${username}`;
        $tags.value = '';
        $excludedTags.value = '';
        $pageNumber.value = 1;
        $sortOrder.value = 'download_count';

        search(event, true);
    }
}

async function setupExplorePanel() {
    const $searchWrapper = document.querySelector('#list-and-search-wrapper');
    const $characterList = $searchWrapper.querySelector('.character-list');
    const $pageNumber = $searchWrapper.querySelector('#pageNumber');

    $searchWrapper
        .querySelectorAll(
            '#characterSearchInput, #creatorSearch, #namespace, #includeTags, #excludeTags, #findCount, #sortOrder, #nsfwCheckbox',
        )
        .forEach((element) => {
            element.addEventListener('change', (event) => {
                $pageNumber.value = 1;
                search(event, true);
            });
        });

    $searchWrapper
        .querySelector('#characterSearchButton')
        .addEventListener('click', (event) => {
            $pageNumber.value = 1;
            search(event, true);
        });

    $searchWrapper
        .querySelector('#resetSearchButton')
        .addEventListener('click', (event) => {
            $searchWrapper
                .querySelectorAll('input, select')
                .forEach((element) => {
                    switch (element.type) {
                        case 'checkbox':
                            element.checked = element.defaultChecked;
                            break;
                        case 'select-one':
                            element.value = Array.from(element.options).find(
                                (option) => option.defaultSelected,
                            ) || element.options[0];
                            break;
                        default:
                            element.value = element.defaultValue;
                    }
                });
            search(event, true);
        });

    const infiniteScrollDebounced = debounce((event) => infiniteScroll(event), debounce_timeout.quick);

    $characterList.addEventListener('scroll', (event) => infiniteScrollDebounced(event));
    $characterList.addEventListener('click', handleCharacterClick);
}

export async function loadExplorePanel() {
    let exploreFirstOpen = true;
    const $top_settings_holder = document.querySelector('#top-settings-holder');

    await fetch(`${extensionFolderPath}/html/explore.html`)
        .then((data) => data.text())
        .then((html) => {
            $top_settings_holder.insertAdjacentHTML('beforeend', html);
        });
    setupExplorePanel();

    const $explore_toggle = document.querySelector(
        '#explore-button .drawer-toggle',
    );
    $explore_toggle.addEventListener('click', () => {
        const icon = $explore_toggle.querySelector('.drawer-icon');
        const drawer =
            $explore_toggle.parentNode.querySelector('.drawer-content');
        const drawerOpen = drawer.classList.contains('openDrawer');

        if (drawer.classList.contains('resizing')) return;

        if (!drawerOpen) {
            $top_settings_holder
                .querySelectorAll('.openDrawer')
                .forEach((element) => {
                    if (!element.classList.contains('pinnedOpen')) {
                        element.classList.add('resizing');
                    }
                    slideToggle(element, {
                        miliseconds: animation_duration * 1.5,
                        transitionFunction: 'ease-in',
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
                miliseconds: animation_duration * 1.5,
                transitionFunction: 'ease-in',
                onAnimationEnd: (element) => {
                    element.classList.remove('resizing');
                },
            });

            icon.classList.replace('closedIcon', 'openIcon');
            drawer.classList.replace('closedDrawer', 'openDrawer');

            if (exploreFirstOpen) {
                drawer.querySelector('#characterSearchButton').click();
                exploreFirstOpen = false;
            }
        } else if (drawerOpen) {
            icon.classList.replace('openIcon', 'closedIcon');

            drawer.classList.add('resizing');
            slideToggle(drawer, {
                miliseconds: animation_duration * 1.5,
                transitionFunction: 'ease-in',
                onAnimationEnd: (element) => {
                    element.classList.remove('resizing');
                },
            });

            drawer.classList.replace('openDrawer', 'closedDrawer');
        }
    });
}
