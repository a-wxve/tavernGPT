import { DOMPurify, slideToggle } from '../../../../../lib.js';
import { default_avatar, getEntitiesList, getSlideToggleOptions, getThumbnailUrl, getUserAvatar } from '../../../../../script.js';
import { getGroupAvatar } from '../../../../group-chats.js';
import { INTERACTABLE_CONTROL_CLASS } from '../../../../keyboard.js';

let cachedFavorites = null;

function patchedBuildAvatarList(blockElement, entities, { templateID = 'inline_avatar_template', empty = true, interactable = false, highlight = true } = {}) {
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
            this_avatar = getThumbnailUrl('avatar', entity.item.avatar);
        }

        avatarNode.setAttribute('data-type', entity.type);
        avatarNode.setAttribute('data-chid', id);

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
            if (grpTemplateContent instanceof HTMLElement) {
                avatarNode.innerHTML = '';
                avatarNode.setAttribute('class', grpTemplateContent.getAttribute('class'));
                while (grpTemplateContent.firstChild) {
                    avatarNode.appendChild(grpTemplateContent.firstChild);
                }
                avatarNode.setAttribute('data-grid', id);
                avatarNode.removeAttribute('data-chid');
                avatarNode.setAttribute('title', `[Group] ${entity.item.name}`);
            }
        } else if (entity.type === 'persona') {
            avatarNode.setAttribute('data-pid', id);
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

    if (empty) {
        blockElement.innerHTML = '';
    }

    blockElement.appendChild(fragment);
}

function patchedFavsToHotswap() {
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

async function patchedDoNavbarIconClick(event) {
    event.stopImmediatePropagation();
    console.log('Running PATCHED doNavbarIconClick');

    const topSettingsHolder = document.querySelector('#top-settings-holder');
    const target = event.currentTarget;
    const parentDrawer = target.closest('.drawer');
    const icon = target.querySelector('.drawer-icon');
    const drawer = parentDrawer.querySelector('.drawer-content');

    if (!parentDrawer || !icon || !drawer) return;
    if (!(drawer instanceof HTMLElement)) return;
    if (drawer.classList.contains('resizing')) return;

    const drawerID = drawer.id;
    const drawerOpen = drawer.classList.contains('openDrawer');
    const drawerPinned = drawer.classList.contains('pinnedOpen');

    const setState = (element, isOpen) => {
        if (element.matches('.drawer-icon')) {
            element.classList.remove('openIcon', 'closedIcon');
            element.classList.add(isOpen ? 'openIcon' : 'closedIcon');
        } else if (element.matches('.drawer-content')) {
            element.classList.remove('openDrawer', 'closedDrawer');
            element.classList.add(isOpen ? 'openDrawer' : 'closedDrawer');
        }
    };

    const closeOtherDrawers = (otherDrawer) => {
        if (!(otherDrawer instanceof HTMLElement)) return;

        const otherParent = otherDrawer.closest('.drawer');
        const otherIcon = otherParent.querySelector('.drawer-icon');

        setState(otherIcon, false);
        otherDrawer.classList.add('resizing');

        slideToggle(otherDrawer, {
            ...getSlideToggleOptions(),
            onAnimationEnd: (element) => {
                closeDrawerCallback(element);
            },
        });

        setState(otherDrawer, false);
    };

    const finishResize = (element) => {
        element.classList.remove('resizing');
    };

    const openDrawerCallback = (element) => {
        finishResize(element);

        if (element === drawer && drawerID === 'right-nav-panel') {
            patchedFavsToHotswap();
            element.style.display = 'flex';
        } else if (element === drawer && drawerID === 'explore-block') {
            if (!element.dataset.initialized) {
                element.querySelector('#characterSearchButton').click();
                element.dataset.initialized = true;
            }
        }
    };

    const closeDrawerCallback = finishResize;

    if (!drawerOpen) {
        const otherOpenDrawers = topSettingsHolder.querySelectorAll('.openDrawer:not(.pinnedOpen)');
        otherOpenDrawers.forEach((otherDrawer) => closeOtherDrawers(otherDrawer));

        setState(icon, true);
        drawer.classList.add('resizing');

        slideToggle(drawer, {
            ...getSlideToggleOptions(),
            onAnimationEnd: (element) => {
                openDrawerCallback(element);
            },
        });

        setState(drawer, true);

        if (!CSS.supports('field-sizing', 'content')) {
            const textareas = drawer.querySelectorAll('textarea.autoSetHeight');
            if (textareas.length > 0) {
                requestAnimationFrame(() => {
                    console.log('requestAnimationFrame: Setting textarea heights');
                    textareas.forEach((textarea, index) => {
                        if (!(textarea instanceof HTMLTextAreaElement)) return;
                        textarea.style.height = 'auto';
                        textarea.style.height = (textarea.scrollHeight + 3) + 'px';
                    });
                });
            }
        }
    } else if (drawerOpen) {
        setState(icon, false);
        drawer.classList.add('resizing');

        if (drawerPinned) {
            slideToggle(drawer, {
                ...getSlideToggleOptions(),
                onAnimationEnd: (element) => {
                    closeDrawerCallback(element);
                },
            });
        } else {
            const otherOpenDrawers = topSettingsHolder.querySelectorAll('.openDrawer:not(.pinnedOpen)');
            otherOpenDrawers.forEach((otherDrawer) => closeOtherDrawers(otherDrawer));
        }

        setState(drawer, false);
    }
}

export function monkeyPatchDrawerToggle() {
    console.log('Applying drawer toggle patch...');
    const allDrawers = document.querySelectorAll('.drawer-toggle');
    allDrawers.forEach(element => {
        $(element).off('click');
        element.addEventListener('click', patchedDoNavbarIconClick);
    });
    console.log(`Patched click listener added to ${allDrawers.length} elements.`);
}
