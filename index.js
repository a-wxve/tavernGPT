import { eventSource, displayPastChats, getUserAvatar, getRequestHeaders, name1, getThumbnailUrl, getEntitiesList, generateQuietPrompt, characters, this_chid, reloadCurrentChat, callPopup } from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { getGroupAvatar, groups, renameGroupChat, selected_group } from '../../../group-chats.js';
import { delay } from '../../../utils.js';

const extensionName = 'Extension-TavernGPT';
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

async function loadFavorites() {
    const favHTML = await $.get(`${extensionFolderPath}/favorites.html`);
    $('#top-settings-holder').append(favHTML);

    const entities = getEntitiesList({ doFilter: false });
    const container = $('#top-settings-holder .hotswap2');
    const template = $('#hotswap_template2 .hotswapAvatar');

    const promises = [];
    const newContainer = container.clone();
    newContainer.empty();

    for (const entity of entities) {
        const isFavorite = entity.item.fav || entity.item.fav == 'true';

        if (!isFavorite) {
            continue;
        }

        const isCharacter = entity.type === 'character';
        const isGroup = entity.type === 'group';

        const grid = isGroup ? entity.id : '';
        const chid = isCharacter ? entity.id : '';

        let slot = template.clone();
        slot.toggleClass('character_select', isCharacter);
        slot.toggleClass('group_select', isGroup);
        slot.attr('grid', isGroup ? grid : '');
        slot.attr('chid', isCharacter ? chid : '');
        slot.data('id', isGroup ? grid : chid);

        if (isGroup) {
            const group = groups.find(x => x.id === grid);
            const avatar = getGroupAvatar(group);
            $(slot).find('img').replaceWith(avatar);
            $(slot).attr('title', group.name);
        }

        if (isCharacter) {
            const imgLoadPromise = new Promise((resolve) => {
                const avatarUrl = getThumbnailUrl('avatar', entity.item.avatar);
                $(slot).find('img').attr('src', avatarUrl).on('load', resolve);
                $(slot).attr('title', entity.item.avatar);
            });

            // if the image doesn't load in 500ms, resolve the promise anyway
            promises.push(Promise.race([imgLoadPromise, delay(500)]));
        }

        $(slot).css('cursor', 'pointer');
        newContainer.append(slot);
    }

    await Promise.allSettled(promises);
    container.replaceWith(newContainer);
}

async function loadHistory() {
    async function renameChat() {
        const old_filename = characters[this_chid].chat;
        const context = getContext();

        function matchesTimePattern(string) {
            const regexPattern = /@\d\dh\s?\d\dm\s?\d\ds(\d{1,3}ms)?/;
            return regexPattern.test(string);
        }

        if (matchesTimePattern(old_filename) && context.chat.length !== 1) {
            const prompt = 'Generate a short name for this chat in less than 6 words.';
            let newName = await generateQuietPrompt(prompt, false, false);
            newName = newName.toString().replace(/^"((?:\\"|[^"])*)"$/, '$1');


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
                    await renameGroupChat(selected_group, old_filename, newName);
                }
                else {
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
                await callPopup('An error has occurred. Chat was not renamed.', 'text');
            }
        }
    }

    const historyHTML = await $.get(`${extensionFolderPath}/history.html`);
    $('#top-settings-holder').append(historyHTML);

    $('#shadow_select_chat_popup').remove();

    $('.options-content #option_select_chat, .options-content #option_start_new_chat, .options-content #option_close_chat').css('display', 'none');

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
    $('#persona-management-button .drawer-icon.fa-solid.fa-face-smile').html(`<img class='persona_avatar' src='${avatar_img}'/>`);
    $('#persona-management-button .drawer-icon.fa-solid.fa-face-smile').append(`<span> ${name1}</span>`);

    $('#persona-management-button .drawer-icon.fa-solid.fa-face-smile > *').on('click', function () {
        $(this).closest('.drawer').find('.drawer-content').toggleClass('closedDrawer openDrawer');
    });
}

function closeSidebar() {
    const closeHTML = `<button class="closeSidebar">
                            <div class="arrow1"></div>
                            <div class="arrow2"></div>
                        </button>`;
    $('#top-settings-holder').append(closeHTML);

    $('.closeSidebar').on('click', function() {
        if (!$('#top-settings-holder').hasClass('collapsed')) {
            $('#top-settings-holder, #sheld').addClass('collapsed');
        }
        else {
            $('#top-settings-holder, #sheld').removeClass('collapsed');
        }
    });
}

jQuery(async () => {
    $(loadFavorites);
    $(loadHistory);
    $(getPersona);
    $(closeSidebar);
});
