import { getRequestHeaders, processDroppedFiles } from '../../../../script.js';
import { debounce_timeout } from '../../../constants.js';
import { debounce, delay } from '../../../utils.js';
import { extensionFolderPath } from './index.js';

export async function initExplorePanel() {
    await fetch(`${extensionFolderPath}/html/explore.html`).then(data => data.text()).then(data => {
        document.querySelector('#top-settings-holder').insertAdjacentHTML('beforeend', data);
    });

    const searchCharactersDebounced = debounce((options, reset) => searchCharacters(options, reset), debounce_timeout.relaxed);
    const infiniteScrollDebounced = debounce((event) => infiniteScroll(event), debounce_timeout.relaxed);

    let chubCharacters = [];
    let popupImage = null;

    async function getCharacter(fullPath) {
        let response = await fetch(
            'https://api.chub.ai/api/characters/download',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fullPath: fullPath,
                    format: 'tavern',
                    version: 'main'
                }),
            }
        );

        if (!response.ok) {
            console.log(`Request failed for ${fullPath}, trying backup endpoint`);
            response = await fetch(
                `https://avatars.charhub.io/avatars/${fullPath}/avatar.webp`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                }
            );
        }
        let data = await response.blob();
        return data;
    }

    async function fetchCharactersBySearch({ searchTerm, includeTags, excludeTags, nsfw, sort, findCount, page = 1 }) {
        let first = findCount;
        let asc = false;
        let include_forks = true;
        let require_images = false;
        let require_custom_prompt = false;
        searchTerm = searchTerm ? `search=${encodeURIComponent(searchTerm)}&` : '';
        sort = sort || 'download_count';

        let url = `https://api.chub.ai/api/characters/search?${searchTerm}first=${first}&page=${page}&sort=${sort}&asc=${asc}&venus=true&include_forks=${include_forks}&nsfw=${nsfw}&require_images=${require_images}&require_custom_prompt=${require_custom_prompt}`;

        includeTags = includeTags.filter(tag => tag.length > 0);
        if (includeTags && includeTags.length > 0) {
            url += `&tags=${encodeURIComponent(includeTags.join(',').slice(0, 100))}`;
        }
        excludeTags = excludeTags.filter(tag => tag.length > 0);
        if (excludeTags && excludeTags.length > 0) {
            url += `&exclude_tags=${encodeURIComponent(excludeTags.join(',').slice(0, 100))}`;
        }

        let searchData = await fetch(url).then(data => data.json());

        chubCharacters = [];

        if (searchData.nodes.length === 0) {
            return chubCharacters;
        }
        let charactersPromises = searchData.nodes.map(node => getCharacter(node.fullPath));
        let characterBlobs = await Promise.all(charactersPromises);

        characterBlobs.forEach((character, i) => {
            let imageUrl = URL.createObjectURL(character);
            chubCharacters.push({
                url: imageUrl,
                description: searchData.nodes[i].tagline || 'Description here...',
                name: searchData.nodes[i].name,
                fullPath: searchData.nodes[i].fullPath,
                tags: searchData.nodes[i].topics,
                author: searchData.nodes[i].fullPath.split('/')[0],
            });
        });

        return chubCharacters;
    }

    async function searchCharacters(options, reset) {
        const $characterList = document.querySelector('#list-and-search-wrapper .character-list');

        $characterList.classList.add('searching');

        console.log('Searching for characters...', options);
        const characters = await fetchCharactersBySearch(options);

        $characterList.classList.remove('searching');

        if (characters && characters.length > 0) {
            const characterHTML = characters.map(generateCharacterListItem).join('')

            if (reset) {
                $characterList.innerHTML = characterHTML;
                $characterList.scrollTop = 0;
            } else {
                $characterList.insertAdjacentHTML('beforeend', characterHTML);
            }

            $characterList.querySelectorAll('.download-btn').forEach(button => {
                button.addEventListener('click', () => {
                    downloadCharacter(button.getAttribute('data-path'))
                });
            });
        } else {
            $characterList.innerHTML = '<div class="no-characters-found">No characters found.</div>';
        }
    }

    function generateCharacterListItem(character, index) {
        return `
            <div class="character-list-item" data-index="${index}">
                <img class="thumbnail" src="${character.url}">
                <div class="info">
                    <a href="https://chub.ai/characters/${character.fullPath}" target="_blank"><div class="name">${character.name || 'Default Name'}</a>
                    <a href="https://chub.ai/users/${character.author}" target="_blank">
                        <span class="author">by ${character.author}</span>
                    </a>
                    <div data-path="${character.fullPath}" class="menu_button download-btn fa-solid fa-cloud-arrow-down faSmallFontSquareFix"></div>
                </div>
                <div class="description">${character.description}</div>
                <div class="tags">${character.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>
                </div>
            </div>
        `;
    }

    async function downloadCharacter(input) {
        const url = `https://www.chub.ai/characters/${input.trim()}`;
        console.debug('Custom content import started', url);

        let request = null;
        request = await fetch('/api/content/importURL', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ url }),
        });

        if (!request.ok) {
            toastr.info('Click to go to the character page', 'Custom content import failed', { onclick: () => window.open(url, '_blank') });
            console.error('Custom content import failed', request.status, request.statusText);
            return;
        }

        const data = await request.blob();
        const customContentType = request.headers.get('X-Custom-Content-Type');
        const fileName = request.headers.get('Content-Disposition').split('filename=')[1].replace(/"/g, '');
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

    function handleSearch(event, reset) {
        console.log('handleSearch', event);
        if (event.type === 'keydown' && event.key !== 'Enter' && event.target.id !== 'includeTags' && event.target.id !== 'excludeTags') {
            return;
        }

        const splitAndTrim = (str) => {
            str = str.trim();
            if (!str.includes(',')) {
                return [str];
            }
            return str.split(',').map(tag => tag.trim());
        };

        const searchTerm = document.querySelector('#characterSearchInput').value;
        const includeTags = splitAndTrim(document.querySelector('#includeTags').value);
        const excludeTags = splitAndTrim(document.querySelector('#excludeTags').value);
        const nsfw = document.querySelector('#nsfwCheckbox').value;
        const findCount = document.querySelector('#findCount').value;
        const sort = document.querySelector('#sortOrder').value;
        let page = document.querySelector('#pageNumber').value;

        searchCharactersDebounced({
            searchTerm,
            includeTags,
            excludeTags,
            nsfw,
            findCount,
            sort,
            page
        }, reset);
    }

    function exploreSearchHandler(event) {
        const $pageNumber = document.querySelector('#pageNumber');
        switch (true) {
            case event.target.matches('#pageUpButton'):
                $pageNumber.value = Math.max(1, parseInt($pageNumber.value.toString()) + 1);
                handleSearch(event, false);
                break;
            case event.target.matches('#pageDownButton'):
                $pageNumber.value = Math.max(1, parseInt($pageNumber.value.toString()) - 1);
                handleSearch(event, false);
                break;
            default:
                $pageNumber.value = 1
                handleSearch(event, true);
                break;
        }
    }

    function infiniteScroll(event) {
        const $characterList = document.querySelector('#list-and-search-wrapper .character-list');
        const $pageNumber = document.querySelector('#pageNumber');

        if ($characterList.scrollHeight - Math.round($characterList.scrollTop) - 100 <= $characterList.clientHeight) {
            toastr.info('Loading more characters...')
            $pageNumber.value = Math.max(1, parseInt($pageNumber.value.toString()) + 1);
            handleSearch(event, false);
        }
    }

    function popupImageHandler(event) {
        const $characterList = document.querySelector('#list-and-search-wrapper .character-list');

        if (event.target.tagName === 'IMG') {
            const image = event.target;

            if (popupImage) {
                $characterList.removeChild(popupImage);
                popupImage = null;
                return;
            }

            const rect = image.getBoundingClientRect();

            popupImage = image.cloneNode(true);
            popupImage.style.position = 'absolute';
            popupImage.style.top = `${rect.top + window.scrollY}px`;
            popupImage.style.left = `${rect.left + window.scrollX}px`;
            popupImage.style.transform = 'scale(4)';
            popupImage.style.zIndex = '99999';
            popupImage.style.objectFit = 'contain';

            $characterList.appendChild(popupImage);

            event.stopPropagation();
        }
    }

    function displayCharactersInListViewPopup() {
        const $searchWrapper = document.querySelector('#list-and-search-wrapper')
        const $characterList = $searchWrapper.querySelector('.character-list');
        const $pageNumber = $searchWrapper.querySelector('#pageNumber');

        $characterList.addEventListener('click', popupImageHandler);
        $characterList.addEventListener('scroll', infiniteScrollDebounced);

        $searchWrapper.querySelectorAll('#characterSearchInput, #includeTags, #excludeTags, #findCount, #sortOrder, #nsfwCheckbox').forEach(element => {
            element.addEventListener('change', exploreSearchHandler);
        })

        $searchWrapper.querySelector('#characterSearchButton').addEventListener('click', exploreSearchHandler);
        $searchWrapper.querySelector('#pageUpButton').addEventListener('click', exploreSearchHandler);
        $searchWrapper.querySelector('#pageDownButton').addEventListener('click', exploreSearchHandler);

        $characterList.scrollTop = 0;
        $pageNumber.value = 1;
    }

    const $explore_toggle = document.querySelector('#explore-button .drawer-toggle');
    $explore_toggle.addEventListener('click', () => {
        let icon = $explore_toggle.querySelector('.drawer-icon');
        let drawer = $explore_toggle.parentNode.querySelector('.drawer-content');
        let drawerOpen = drawer.classList.contains('openDrawer');

        if (drawer.classList.contains('resizing')) {
            return;
        }

        if (!drawerOpen) {
            displayCharactersInListViewPopup();

            //need jQuery here for .slideToggle(), otherwise panel breaks
            $('#explore-button').parent().find('.openDrawer').not('.pinnedOpen').addClass('resizing').slideToggle(200, 'swing', async () => {
                $('.openIcon').toggleClass('openIcon closedIcon');
                $(this).not('.pinnedOpen').toggleClass('openDrawer closedDrawer');
                await delay(50);
                $(this).removeClass('resizing');
            });

            icon.classList.replace('closedIcon', 'openIcon');
            drawer.classList.replace('closedDrawer', 'openDrawer');

            $(drawer).addClass('resizing').slideToggle(200, 'swing', async () => {
                await delay(50);
                $(drawer).removeClass('resizing');
            });

            drawer.querySelector('#characterSearchButton').click();

        } else if (drawerOpen) {
            icon.classList.replace('openIcon', 'closedIcon');

            $(drawer).addClass('resizing').slideToggle(200, 'swing', async () => {
                await delay(50);
                $(drawer).removeClass('resizing');
            });

            drawer.classList.replace('openDrawer', 'closedDrawer');
        }
    });
}
