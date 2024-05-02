import { getRequestHeaders, processDroppedFiles } from '../../../../script.js';
import { debounce, delay } from '../../../utils.js';
import { extensionFolderPath } from './index.js';

export async function initExplorePanel() {
    const exploreHTML = await $.get(`${extensionFolderPath}/explore.html`);
    $('#top-settings-holder').append(exploreHTML);

    let chubCharacters = [];

    async function downloadCharacter(input) {
        const url = input.trim();
        console.debug('Custom content import started', url);

        let request = null;
        request = await fetch('/api/content/importURL', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ url }),
        });

        if (!request.ok) {
            toastr.info('Click to go to the character page', 'Custom content import failed', { onclick: () => window.open(`https://www.chub.ai/characters/${url}`, '_blank') });
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

    function updateCharacterListInView(characters, reset) {
        const $characterList = $('.character-list', '#list-and-search-wrapper');

        if (reset) {
            $characterList.html(characters.map(generateCharacterListItem).join('')).scrollTop(0);
        } else {
            $characterList.append(characters.map(generateCharacterListItem).join(''));
        }
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

        let searchResponse = await fetch(url);

        let searchData = await searchResponse.json();

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

    async function searchCharacters(options) {
        const $characterList = $('.character-list', '#list-and-search-wrapper');

        $characterList.addClass('searching');

        console.log('Searching for characters...', options);
        const characters = await fetchCharactersBySearch(options);

        $characterList.removeClass('searching');

        return characters;
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

    function displayCharactersInListViewPopup() {
        const $characterList = $('.character-list', '#list-and-search-wrapper');
        const $pageNumber = $('#pageNumber');

        $characterList.scrollTop(0)
        $pageNumber.val(1);

        let popupImage = null;

        $characterList.off().on('click', (event) => {
            if (event.target.tagName === 'IMG') {
                const image = event.target;

                if (popupImage) {
                    document.body.removeChild(popupImage);
                    popupImage = null;
                    return;
                }

                const rect = image.getBoundingClientRect();

                popupImage = image.cloneNode(true);
                if (popupImage instanceof HTMLElement) {
                    popupImage.style.position = 'absolute';
                    popupImage.style.top = `${rect.top + window.scrollY}px`;
                    popupImage.style.left = `${rect.left + window.scrollX}px`;
                    popupImage.style.transform = 'scale(4)';
                    popupImage.style.zIndex = '99999';
                    popupImage.style.objectFit = 'contain';
                }

                document.body.appendChild(popupImage);

                event.stopPropagation();
            }
        });

        $(document).on('click', () => {
            if (popupImage) {
                document.body.removeChild(popupImage);
                popupImage = null;
            }
        });

        $characterList.off().on('click', (event) => {
            if (event.target.classList.contains('download-btn')) {
                downloadCharacter(event.target.getAttribute('data-path'));
            }
        });

        const handleSearch = (event, reset) => {
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

            const searchTerm = $('#characterSearchInput').val();
            const includeTags = splitAndTrim($('#includeTags').val());
            const excludeTags = splitAndTrim($('#excludeTags').val());
            const nsfw = $('#nsfwCheckbox').val();
            const findCount = $('#findCount').val();
            const sort = $('#sortOrder').val();
            let page = $pageNumber.val();

            debounce(searchCharacters({
                searchTerm,
                includeTags,
                excludeTags,
                nsfw,
                findCount,
                sort,
                page
            }).then((characters) => {
                if (characters && characters.length > 0) {
                    updateCharacterListInView(characters, reset);
                } else {
                    $characterList.html('<div class="no-characters-found">No characters found.</div>');
                }
            }).catch((error) => {
                console.error('Error searching characters:', error);
            }), 750);
        }

        const infiniteScroll = debounce((event) => {
            if ($characterList.scrollTop() + $characterList.innerHeight() >= $characterList[0].scrollHeight - 100) {
                toastr.info('Loading more characters...')
                $pageNumber.val(Math.max(1, parseInt($pageNumber.val().toString()) + 1));
                handleSearch(event, false);
            }
        }, 1000);
        $characterList.on('scroll', infiniteScroll);

        $('#characterSearchButton').on('click', (event) => {
            handleSearch(event, true);
        });

        $('#characterSearchInput, #includeTags, #excludeTags, #findCount, #sortOrder, #nsfwCheckbox').on('change', (event) => {
            $pageNumber.val(1);
            handleSearch(event, true);
        });

        $('#pageUpButton').on('click', (event) => {
            $pageNumber.val(Math.max(1, parseInt($pageNumber.val().toString()) + 1));
            handleSearch(event, true);
        });

        $('#pageDownButton').on('click', (event) => {
            $pageNumber.val(Math.max(1, parseInt($pageNumber.val().toString()) - 1));
            handleSearch(event, true);
        });
    }

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

    $('.drawer-toggle', '#explore-button').on('click', function() {
        var icon = $(this).find('.drawer-icon');
        var drawer = $(this).parent().find('.drawer-content');
        if (drawer.hasClass('resizing')) {
            return;
        }
        var drawerOpen = $(this).parent().find('.drawer-content').hasClass('openDrawer');

        if (!drawerOpen) {
            displayCharactersInListViewPopup();

            $('.openDrawer', '#explore-button').not('.pinnedOpen').addClass('resizing').slideToggle(200, 'swing', async function() {
                await delay(50);
                $(this).closest('.drawer-content').removeClass('resizing');
            });
            $('.openIcon', '#explore-button').toggleClass('closedIcon openIcon');
            $('.openDrawer', '#explore-button').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');

            icon.toggleClass('openIcon closedIcon');
            drawer.toggleClass('openDrawer closedDrawer');

            $(this).closest('.drawer').find('.drawer-content').addClass('resizing').slideToggle(200, 'swing', async function() {
                await delay(50);
                $(this).closest('.drawer-content').removeClass('resizing');
            });

            $('#characterSearchButton').trigger('click');

        } else if (drawerOpen) {
            icon.toggleClass('closedIcon openIcon');

            $('.openDrawer', '#explore-button').not('.pinnedOpen').addClass('resizing').slideToggle(200, 'swing', async function() {
                await delay(50);
                $(this).closest('.drawer-content').removeClass('resizing');
            });

            drawer.toggleClass('closedDrawer openDrawer');
        }
    });
}
