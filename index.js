import {
    callPopup,
    characters,
    displayPastChats,
    eventSource,
    generateQuietPrompt,
    getRequestHeaders,
    getUserAvatar,
    name1,
    processDroppedFiles,
    this_chid
} from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import {
    renameGroupChat,
    selected_group,
} from '../../../group-chats.js';
import { debounce, delay } from '../../../utils.js';

const extensionName = 'tavernGPT';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

async function loadHistory() {
    async function renameChat() {
        const old_filename = characters[this_chid].chat;
        const context = getContext();

        function matchesTimePattern(string) {
            const regexPattern = /@\d\dh\s?\d\dm\s?\d\ds(\d{1,3}ms)?/;
            return regexPattern.test(string);
        }

        if (matchesTimePattern(old_filename) && context.chat.length !== 1) {
            const prompt =
                'Generate a name for this chat in as few words as possible. Avoid including special characters, words like "chat", or the user\'s name.';
            let newName = await generateQuietPrompt(prompt, false, false);
            newName = newName.toString().replace(/^'((?:\\'|[^'])*)'$/, '$1');

            const body = {
                is_group: !!selected_group,
                avatar_url: characters[this_chid]?.avatar,
                original_file: `${old_filename}.jsonl`,
                renamed_file: `${newName}.jsonl`,
            };

            try {
                const response = await fetch('/api/chats/rename', {
                    method: 'POST',
                    body: JSON.stringify(body),
                    headers: getRequestHeaders(),
                });

                if (!response.ok) {
                    throw new Error('Unsuccessful request.');
                }

                const data = await response.json();

                if (data.error) {
                    throw new Error('Server returned an error.');
                }

                if (selected_group) {
                    await renameGroupChat(
                        selected_group,
                        old_filename,
                        newName,
                    );
                } else {
                    if (characters[this_chid].chat == old_filename) {
                        characters[this_chid].chat = newName;
                    }
                    $('#selected_chat_pole').val(characters[this_chid].chat);
                }

                await delay(250);
                $('#option_select_chat').trigger('click');
                $('#options').hide();
            } catch {
                await delay(500);
                await callPopup(
                    'An error has occurred. Chat was not renamed.',
                    'text',
                );
            }
        }
    }

    const historyHTML = await $.get(`${extensionFolderPath}/history.html`);
    $('#top-settings-holder').append(historyHTML);

    $('#shadow_select_chat_popup').remove();

    $(
        '.options-content #option_select_chat, .options-content #option_start_new_chat, .options-content #option_close_chat',
    ).css('display', 'none');

    $('#new_chat').on('click', function() {
        $('.options-content #option_start_new_chat').trigger('click');
    });
    $('#close_chat').on('click', function() {
        $('.options-content #option_close_chat').trigger('click');
    });

    eventSource.on('chatLoaded', async () => {
        await displayPastChats();
        await renameChat();
    });
}

async function getPersona() {
    eventSource.on('settings_updated', async () => {
        const response = await fetch('/api/settings/get', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
            cache: 'no-cache',
        });

        if (!response.ok) {
            toastr.error('Settings could not be loaded. Try reloading the page.');
            throw new Error('Error getting settings');
        }

        const data = await response.json();
        let settings = JSON.parse(data.settings);

        let user_avatar = settings.user_avatar;
        let avatar_img = getUserAvatar(user_avatar);
        $('#persona-management-button .drawer-icon.fa-solid.fa-face-smile').html(
            `<img class='persona_avatar' src='${avatar_img}'/>`,
        );
        $('#persona-management-button .drawer-icon.fa-solid.fa-face-smile').append(
            `<span> ${name1}</span>`,
        );
    });

    $('#persona-management-button .drawer-icon.fa-solid.fa-face-smile > *').on(
        'click',
        function() {
            $(this)
                .closest('.drawer')
                .find('.drawer-content')
                .toggleClass('closedDrawer openDrawer');
        },
    );
}

function closeSidebar() {
    const closeHTML = `<button class='closeSidebar'>
                              <div class='arrow1'></div>
                              <div class='arrow2'></div>
                          </button>`;
    $('#top-settings-holder').append(closeHTML);

    $('.closeSidebar').on('click', function() {
        if (!$('#top-settings-holder').hasClass('collapsed')) {
            $('#top-settings-holder, #sheld').addClass('collapsed');
        } else {
            $('#top-settings-holder, #sheld').removeClass('collapsed');
        }
    });
}

async function loadExplorer() {
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
        let characters = []
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
                clone.style.position = 'absolute';
                clone.style.top = `${rect.top + window.scrollY}px`;
                clone.style.left = `${rect.left + window.scrollX}px`;
                clone.style.transform = 'scale(4)';
                clone.style.zIndex = 99999;
                clone.style.objectFit = 'contain';

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

async function settings() {
    const settingsHTML = await $.get(`${extensionFolderPath}/settings.html`);
    $('#extensions_settings2').append(settingsHTML);

    $('#notificationSettings').on('click', function() {
        console.log('Requesting notif permit...');
        Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
                eventSource.on('message_received', (messageId) => {
                    // if (document.hasFocus()) return;

                    const context = getContext();
                    const message = context.chat[messageId];

                    if (!message || message.mes === '' || message.mes === '...' || message.is_user) return;

                    const avatar = message.force_avatar ?? `/thumbnail?type=avatar&file=${encodeURIComponent(context.characters[context.characterId]?.avatar)}`;

                    console.log('Sending notifications...')
                    const notification = new Notification(message.name, {
                        body: message.mes,
                        icon: location.origin + avatar,
                    });

                    notification.onclick = () => {
                        window.focus();
                    };

                    setTimeout(notification.close.bind(notification), 10000);
                });
            } else {
                console.warn('Notifications not allowed');
            }
        });
    });
}

jQuery(async () => {
    $(settings);
    $(loadHistory);
    $(getPersona);
    $(loadExplorer);
    $(closeSidebar);
    $('.expression-holder').appendTo('#sheld');
});
