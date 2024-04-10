import { getRequestHeaders, processDroppedFiles } from '../../../../script.js';
import { debounce, delay } from '../../../utils.js';
import { extensionFolderPath } from './index.js';

export async function explore() {
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

    function updateCharacterListInView(characters) {
        $('.character-list').html(characters.map(generateCharacterListItem).join(''));
        $('.character-list').scrollTop(0);
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
            //includeTags = makeTagPermutations(includeTags);
            includeTags = includeTags.join(',').slice(0, 100);
            url += `&tags=${encodeURIComponent(includeTags)}`;
        }
        excludeTags = excludeTags.filter(tag => tag.length > 0);
        if (excludeTags && excludeTags.length > 0) {
            //excludeTags = makeTagPermutations(excludeTags);
            excludeTags = excludeTags.join(',').slice(0, 100);
            url += `&exclude_tags=${encodeURIComponent(excludeTags)}`;
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
        $('.character-list').addClass('searching');

        console.log('Searching for characters...', options);
        const characters = await fetchCharactersBySearch(options);

        $('.character-list').removeClass('searching');

        return characters;
    }

    async function executeCharacterSearch(options) {
        let characters = [];
        characters = await searchCharacters(options).catch();

        if (characters && characters.length > 0) {
            console.log('Updating character list....');
            updateCharacterListInView(characters);
        } else {
            console.log('No characters found.');
            $('.character-list').html('<div class="no-characters-found">No characters found.</div>');
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

    async function displayCharactersInListViewPopup() {
        let clone = null;

        $('.character-list').off().on('click', function(event) {
            if (event.target.tagName === 'IMG') {
                const image = event.target;

                if (clone) {
                    document.body.removeChild(clone);
                    clone = null;
                    return;
                }

                const rect = image.getBoundingClientRect();

                clone = image.cloneNode(true);
                if (clone instanceof HTMLElement) {
                    clone.style.position = 'absolute';
                    clone.style.top = `${rect.top + window.scrollY}px`;
                    clone.style.left = `${rect.left + window.scrollX}px`;
                    clone.style.transform = 'scale(4)';
                    clone.style.zIndex = '99999';
                    clone.style.objectFit = 'contain';
                }

                document.body.appendChild(clone);

                // Prevent this click event from reaching the document's click listener
                event.stopPropagation();
            }
        });

        $(document).on('click', function handler() {
            if (clone) {
                document.body.removeChild(clone);
                clone = null;
            }
        });

        $('.character-list').off().on('click', async function(event) {
            if (event.target.classList.contains('download-btn')) {
                downloadCharacter(event.target.getAttribute('data-path'));
            }
        });

        const executeCharacterSearchDebounced = debounce((options) => executeCharacterSearch(options), 750);

        const handleSearch = async function(e) {
            console.log('handleSearch', e);
            if (e.type === 'keydown' && e.key !== 'Enter' && e.target.id !== 'includeTags' && e.target.id !== 'excludeTags') {
                return;
            }

            const splitAndTrim = (str) => {
                str = str.trim(); // Trim the entire string first
                if (!str.includes(',')) {
                    return [str];
                }
                return str.split(',').map(tag => tag.trim());
            };

            console.log($('#includeTags').val());

            const searchTerm = $('#characterSearchInput').val();
            const includeTags = splitAndTrim($('#includeTags').val());
            const excludeTags = splitAndTrim($('#excludeTags').val());
            const nsfw = $('#nsfwCheckbox').val();
            const findCount = $('#findCount').val();
            const sort = $('#sortOrder').val();
            let page = $('#pageNumber').val();

            executeCharacterSearchDebounced({
                searchTerm,
                includeTags,
                excludeTags,
                nsfw,
                findCount,
                sort,
                page
            });
        };

        $('#characterSearchInput').off().on('change', handleSearch);
        $('#characterSearchButton').off().on('click', handleSearch);

        $('#includeTags').off().on('keyup', function(e) {
            $('#pageNumber').val(1);
            handleSearch(e);
        });
        $('#excludeTags').off().on('keyup', function(e) {
            $('#pageNumber').val(1);
            handleSearch(e);
        });

        $('#findCount').off().on('change', handleSearch);
        $('#sortOrder').off().on('change', handleSearch);
        $('#nsfwCheckbox').off().on('change', handleSearch);
        $('#pageNumber').off().on('change', handleSearch);

        $('#pageUpButton').off().on('click', function(e) {
            $('#pageNumber').val(Math.max(1, parseInt($('#pageNumber').val().toString()) + 1));
            handleSearch(e);
        }
        );
        $('#pageDownButton').off().on('click', function(e) {
            $('#pageNumber').val(Math.max(1, parseInt($('#pageNumber').val().toString()) - 1));
            handleSearch(e);
        }
        );
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

    $('#explore-button .drawer-toggle').on('click', async function() {
        var icon = $(this).find('.drawer-icon');
        var drawer = $(this).parent().find('.drawer-content');
        if (drawer.hasClass('resizing')) { return; }
        var drawerOpen = $(this).parent().find('.drawer-content').hasClass('openDrawer');

        if (!drawerOpen) {
            await displayCharactersInListViewPopup();

            $('.openDrawer').not('.pinnedOpen').addClass('resizing').slideToggle(200, 'swing', async function() {
                await delay(50);
                $(this).closest('.drawer-content').removeClass('resizing');
            });
            $('.openIcon').toggleClass('closedIcon openIcon');
            $('.openDrawer').not('.pinnedOpen').toggleClass('closedDrawer openDrawer');

            icon.toggleClass('openIcon closedIcon');
            drawer.toggleClass('openDrawer closedDrawer');

            $(this).closest('.drawer').find('.drawer-content').addClass('resizing').slideToggle(200, 'swing', async function() {
                await delay(50);
                $(this).closest('.drawer-content').removeClass('resizing');
            });

            $('#characterSearchButton').trigger('click');

        } else if (drawerOpen) {
            icon.toggleClass('closedIcon openIcon');

            $('.openDrawer').not('.pinnedOpen').addClass('resizing').slideToggle(200, 'swing', async function() {
                await delay(50); $(this).closest('.drawer-content').removeClass('resizing');
            });

            drawer.toggleClass('closedDrawer openDrawer');
        }
    });
}
