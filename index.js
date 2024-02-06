import { eventSource, displayPastChats, getUserAvatar, getRequestHeaders, name1, getThumbnailUrl, getEntitiesList } from '../../../../script.js';
import { getGroupAvatar, groups } from '../../../group-chats.js';
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

jQuery(async () => {
    $(loadFavorites);
    $(loadHistory);
    $(getPersona);
});
