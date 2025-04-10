import { slideToggle } from '../../../../../../lib.js';
import { getSlideToggleOptions } from '../../../../../../script.js';
import { patchedFavsToHotswap } from './util.js';

export async function patchedDoNavbarIconClick(event) {
    console.log('Running PATCHED doNavbarIconClick');

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

    const finishResize = (element) => {
        element.classList.remove('resizing');
    };

    const openDrawerCallback = (element) => {
        finishResize(element);

        if (!(element === drawer)) return;
        switch (drawerID) {
            case 'right-nav-panel':
                patchedFavsToHotswap();
                element.style.display = 'flex';
                break;
            case 'explore-block':
                if (!element.dataset.initialized) {
                    element.querySelector('#characterSearchButton').click();
                    element.dataset.initialized = true;
                }
                break;
        }
    };

    const closeDrawerCallback = finishResize;

    const closeOtherDrawers = () => {
        const otherOpenDrawers = document.querySelectorAll('.openDrawer:not(.pinnedOpen)');
        otherOpenDrawers.forEach((otherDrawer) => {
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
        });
    };

    if (!drawerOpen) {
        closeOtherDrawers();

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
            if (!(textareas.length > 0)) return;
            requestAnimationFrame(() => {
                console.log('requestAnimationFrame: Setting textarea heights');
                textareas.forEach((textarea, index) => {
                    if (!(textarea instanceof HTMLTextAreaElement)) return;
                    textarea.style.height = 'auto';
                    textarea.style.height = (textarea.scrollHeight + 3) + 'px';
                });
            });
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
            closeOtherDrawers();
        }

        setState(drawer, false);
    }
}
