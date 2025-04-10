import { DOMPurify } from '../../../../../../lib';
import { default_avatar, getEntitiesList } from '../../../../../../script';
import { getGroupAvatar } from '../../../../../group-chats';
import { INTERACTABLE_CONTROL_CLASS } from '../../../../../keyboard';
import { getUserAvatar } from '../../../../../personas';

let cachedFavorites = null;

export function getCachedThumbnail(type, file) {
    const url = `/thumbnail?type=${type}&file=${encodeURIComponent(file)}`;

    caches.open('thumbnail-cache').then(cache => {
        cache.match(url).then(cachedResponse => {
            if (!cachedResponse) {
                fetch(url).then(response => {
                    cache.put(url, response.clone());
                }).catch(() => { });
            }
        });
    });

    return url;
}

async function patchedBuildAvatarList(blockElement, entities, { templateID = 'inline_avatar_template', empty = true, interactable = false, highlight = true } = {}) {
    console.log('Running PATCHED buildAvatarList');

    const templateNode = document.querySelector(`#${templateID} .avatar`);
    if (!templateNode) {
        console.error('Avatar template not found:', `#${templateID} .avatar`);
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const entity of entities) {
        const id = entity.id;
        const avatarNode = templateNode.cloneNode(true);
        if (!(avatarNode instanceof HTMLElement)) {
            console.error('Avatar template not an HTMLElement.');
            return;
        }

        let this_avatar = default_avatar;
        if (entity.item.avatar && entity.item.avatar !== 'none') {
            this_avatar = getCachedThumbnail('avatar', entity.item.avatar);
        }

        avatarNode.dataset.type = entity.type;
        avatarNode.dataset.chid = id;

        const img = avatarNode.querySelector('img');
        img.setAttribute('src', this_avatar);
        img.setAttribute('alt', entity.item.name || '');
        avatarNode.setAttribute('title', `[Character] ${entity.item.name}\nFile: ${entity.item.avatar}`);

        if (highlight) {
            const isFav = entity.item.fav === true || entity.item.fav === 'true';
            avatarNode.classList.toggle('is_fav', isFav);
            const favInput = avatarNode.querySelector('.ch_fav');
            if (favInput instanceof HTMLInputElement) favInput.value = entity.item.fav;
        }

        if (entity.type === 'group') {
            const grpTemplateContent = getGroupAvatar(entity.item);
            if (!(grpTemplateContent instanceof HTMLElement)) return;
            avatarNode.innerHTML = '';
            avatarNode.setAttribute('class', grpTemplateContent.getAttribute('class'));
            avatarNode.appendChild(grpTemplateContent.firstChild);
            avatarNode.dataset.grid = id;
            avatarNode.removeAttribute('data-chid');
            avatarNode.setAttribute('title', `[Group] ${entity.item.name}`);
        } else if (entity.type === 'persona') {
            avatarNode.dataset.pid = id;
            avatarNode.removeAttribute('data-chid');
            img.setAttribute('src', getUserAvatar(entity.item.avatar));
            avatarNode.setAttribute('title', `[Persona] ${entity.item.name}\nFile: ${entity.item.avatar}`);
        }

        if (interactable) {
            avatarNode.classList.add(INTERACTABLE_CONTROL_CLASS);
            avatarNode.classList.toggle('character_select', entity.type === 'character');
            avatarNode.classList.toggle('group_select', entity.type === 'group');
        }

        fragment.appendChild(avatarNode);
    }

    if (empty) blockElement.innerHTML = '';
    blockElement.appendChild(fragment);
}

export function patchedFavsToHotswap() {
    console.log('Running PATCHED favsToHotswap');

    const displayEmptyFavsMessage = (container) => {
        container.innerHTML =
            `<small>
                <span>
                    <i class="fa-solid fa-star"></i>&nbsp;${DOMPurify.sanitize(container.getAttribute('no_favs'))}
                </span>
            </small>`;
    };

    const entities = getEntitiesList({ doFilter: false });
    const hotswapContainer = document.querySelector('#right-nav-panel .hotswap');

    const favorites = entities.filter(x => x.item.fav || x.item.fav == 'true');
    const currentFavorites = favorites.map(entity => entity.id).sort();

    if (cachedFavorites === null) {
        console.warn('First run or cache cleared. Performing full favorites build.');

        if (favorites.length === 0) {
            displayEmptyFavsMessage(hotswapContainer);
            cachedFavorites = [];
            return;
        }

        patchedBuildAvatarList(hotswapContainer, favorites, {
            empty: true, interactable: true, highlight: false,
        });
        cachedFavorites = currentFavorites;

        return;
    }

    const cachedSet = new Set(cachedFavorites);
    const currentSet = new Set(currentFavorites);

    const addedIDs = currentFavorites.filter(id => !cachedSet.has(id));
    const removedIDs = cachedFavorites.filter(id => !currentSet.has(id));

    if (removedIDs.length > 0) {
        console.log('Removals detected. Performing full favorites rebuild.');

        if (currentFavorites.length === 0) {
            displayEmptyFavsMessage(hotswapContainer);
        } else {
            patchedBuildAvatarList(hotswapContainer, currentFavorites, {
                empty: true, interactable: true, highlight: false,
            });
        }

        cachedFavorites = currentFavorites;
    } else if (addedIDs.length > 0) {
        console.log(`Additions detected (${addedIDs.length} new). Appending only.`);
        const newEntities = favorites.filter(entity => addedIDs.includes(entity.id));
        patchedBuildAvatarList(hotswapContainer, newEntities, {
            empty: false, interactable: true, highlight: false,
        });
        cachedFavorites = currentFavorites;
    } else {
        console.log('Favorites list hasn\'t changed. Skipping DOM modifications.');
    }
}
