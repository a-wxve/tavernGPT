import {
    chat as chatContext,
    eventSource,
    event_types,
    getUserAvatar,
    name1,
    saveSettingsDebounced,
    user_avatar,
} from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';
import { power_user } from '../../../../power-user.js';
import { ExplorePanel } from './explore.js';
import { ChatHistory } from './history.js';
import { monkeyPatch } from './monkeypatch.js';
import { splashes } from './splashes.js';

export const extensionName = 'tavernGPT';
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
export let tavernGPT_settings = extension_settings[extensionName];

const default_settings = {
    rename_chats: true,
    rename_method: 'system',
    api_key_chub: '',
    background_list: [],
};

async function initSettings() {
    const settings = document.querySelector('#extensions_settings2');

    const response = await fetch(`${extensionFolderPath}/html/settings.html`);
    const html = await response.text();
    settings.insertAdjacentHTML('beforeend', html);

    tavernGPT_settings = tavernGPT_settings || {};

    let settingsChanged = false;
    for (const key in default_settings) {
        if (key in tavernGPT_settings) return;

        tavernGPT_settings[key] = default_settings[key];
        settingsChanged = true;
    }

    for (const key in tavernGPT_settings) {
        if (key in default_settings) return;

        delete tavernGPT_settings[key];
        settingsChanged = true;
        console.log(`Removed obsolete setting: ${key} from ${extensionName}`);
    }

    if (settingsChanged) saveSettingsDebounced();

    const rename_chats = settings.querySelector('#rename_chats');
    const rename_method_container = settings.querySelector(
        '.rename_method_container',
    );
    const rename_method_function = settings.querySelector(
        '#rename_method_function',
    );
    const rename_method_system = settings.querySelector(
        '#rename_method_system',
    );
    const api_key_chub = settings.querySelector('#api_key_chub');
    const api_key_chub_show = settings.querySelector('#api_key_chub_show');

    if (tavernGPT_settings.rename_chats) {
        rename_chats.setAttribute('checked', 'true');
        if (rename_method_container instanceof HTMLElement) {
            rename_method_container.style.display = 'block';
        }
    }

    if (tavernGPT_settings.rename_method === 'function') {
        rename_method_function.setAttribute('checked', 'true');
    } else {
        rename_method_system.setAttribute('checked', 'true');
    }

    if (tavernGPT_settings.api_key_chub) {
        api_key_chub.setAttribute('value', tavernGPT_settings.api_key_chub);
    }

    rename_chats.addEventListener('click', () => {
        tavernGPT_settings.rename_chats = rename_chats.getAttribute('checked');
        if (rename_method_container instanceof HTMLElement) {
            const checked = rename_chats.getAttribute('checked') === 'true';
            rename_method_container.style.display = checked ? 'block' : 'none';
        }
        saveSettingsDebounced();
    });

    rename_method_container.addEventListener('click', (event) => {
        switch (event.target) {
            case rename_method_function:
                tavernGPT_settings.rename_method = 'function';
                saveSettingsDebounced();
                break;
            case rename_method_system:
                tavernGPT_settings.rename_method = 'system';
                saveSettingsDebounced();
                break;
        }
    });

    api_key_chub.addEventListener('change', () => {
        tavernGPT_settings.api_key_chub = api_key_chub.getAttribute('value');
        saveSettingsDebounced();
    });

    api_key_chub_show.addEventListener('click', (event) => {
        if (!(event.currentTarget instanceof HTMLElement)) return;

        const eyeIcon = event.currentTarget;
        const isPassword = api_key_chub.getAttribute('type') === 'password';

        api_key_chub.setAttribute('type', isPassword ? 'text' : 'password');
        eyeIcon.classList.toggle('fa-eye', isPassword);
        eyeIcon.classList.toggle('fa-eye-slash', !isPassword);
    });
}

function setPersona() {
    const personaIcon = document.querySelector(
        '#persona-management-button .drawer-icon.fa-solid.fa-face-smile',
    );

    let lastAvatar, lastName;
    const updatePersona = (avatar, name) => {
        if (avatar === lastAvatar && name === lastName) return;

        lastAvatar = avatar;
        lastName = name;

        const img = document.createElement('img');
        img.className = 'persona_avatar';
        img.src = avatar;

        const span = document.createElement('span');
        span.textContent = name;

        personaIcon.replaceChildren(img, span);

        Array.from(personaIcon.children).forEach((child) => {
            if (child instanceof HTMLElement) child.style.pointerEvents = 'none';
        });
    };

    eventSource.on(event_types.SETTINGS_UPDATED, () => {
        updatePersona(getUserAvatar(user_avatar), name1);
    });

    updatePersona(getUserAvatar(user_avatar), name1);
}

function addSidebarToggle() {
    const settingsHolder = document.querySelector('#top-settings-holder');
    const sheld = document.querySelector('#sheld');

    const toggleButton = document.createElement('button');
    toggleButton.id = 'sidebarToggle';

    const arrow1 = document.createElement('div');
    arrow1.className = 'arrow1';
    const arrow2 = document.createElement('div');
    arrow2.className = 'arrow2';

    toggleButton.append(arrow1, arrow2);

    toggleButton.addEventListener('click', () => {
        settingsHolder.classList.toggle('collapsed');
        sheld.classList.toggle('collapsed');
    });

    settingsHolder.append(toggleButton);
}

function addScrollButton() {
    const chat = document.querySelector('#chat');

    const scrollButton = document.createElement('div');
    scrollButton.id = 'scrollToBottom';

    const span = document.createElement('span');
    span.textContent = 'Scroll to bottom';

    const icon = document.createElement('i');
    icon.className = 'fa-xl fa-solid fa-circle-chevron-down';

    scrollButton.append(span, icon);
    chat.after(scrollButton);

    let checking = false;
    const checkScrollPosition = () => {
        const hasScrollbar = chat.scrollHeight > chat.clientHeight;
        const currentHeight = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
        const atBottom = hasScrollbar ? currentHeight < 50 : true;

        atBottom ? scrollButton.classList.remove('show') : scrollButton.classList.add('show');
        checking = false;
    };

    const formSheld = document.getElementById('form_sheld');
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const newHeight = entry.contentRect.height;

            scrollButton.style.bottom = `${newHeight + 25}px`;
        }
    });
    resizeObserver.observe(formSheld);

    chat.addEventListener('scroll', () => {
        if (checking) return;

        checking = true;
        requestAnimationFrame(checkScrollPosition);
    });

    scrollButton.addEventListener('click', () => {
        chat.scrollTo({
            top: chat.scrollHeight,
            behavior: 'smooth',
        });
    });
}

function loadSplashText() {
    const getRandomSplash = () =>
        splashes[Math.floor(Math.random() * splashes.length)];

    const observer = new MutationObserver((_, observer) => {
        const welcomeElement = document.querySelector(
            '#version_display_welcome',
        );

        if (!welcomeElement || !(welcomeElement instanceof HTMLElement)) return;

        observer.disconnect();

        const desiredTop = welcomeElement.offsetTop + welcomeElement.offsetHeight / 2;
        const welcomeRightEdge = welcomeElement.offsetLeft + welcomeElement.offsetWidth;

        const splashWrapper = document.createElement('div');
        splashWrapper.id = 'splash-wrapper';
        splashWrapper.style.top = `${desiredTop}px`;
        splashWrapper.style.left = `${welcomeRightEdge}px`;

        const splashText = document.createElement('span');
        splashText.id = 'splash';
        splashText.textContent = getRandomSplash();
        splashWrapper.append(splashText);

        welcomeElement.after(splashWrapper);

        splashText.addEventListener('click', () => {
            splashText.textContent = getRandomSplash();
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => observer.disconnect(), 10000);
}

function addChatHeader() {
    const sheld = document.querySelector('#sheld');
    const addChatHeader = () => {
        const chatHeader = sheld.querySelector('#chat_header');
        const last_mes = sheld.querySelector('.last_mes');

        const avatarImg = last_mes.querySelector('.avatar').cloneNode(true);
        const charName = last_mes.querySelector('.ch_name').cloneNode(true);
        const mesID = last_mes.querySelector('.mesIDDisplay').cloneNode(true);
        const mesTimer = last_mes.querySelector('.mes_timer').cloneNode(true);
        const tokenCount = last_mes
            .querySelector('.tokenCounterDisplay')
            .cloneNode(true);

        avatarImg.addEventListener('click', () => {
            const avatar = last_mes.querySelector('.avatar');
            if (avatar instanceof HTMLElement) avatar.click();
        });

        charName.appendChild(mesID);
        charName.appendChild(mesTimer);
        charName.appendChild(tokenCount);

        chatHeader.replaceChildren(avatarImg, charName);
    };

    // const body = document.body;

    // const classes = ['bubblechat', 'hideChatAvatars'];
    // for (const className of classes) {
    //     if (!body.classList.contains(className)) body.classList.add(className);
    // }

    const chatHeader = document.createElement('div');
    chatHeader.id = 'chat_header';
    chatHeader.className = 'flex-container';
    sheld.prepend(chatHeader);

    const events = [
        'chatLoaded',
        event_types.CHARACTER_MESSAGE_RENDERED,
        event_types.MESSAGE_DELETED,
        event_types.MESSAGE_SWIPED,
    ];
    events.forEach(event => eventSource.on(event, addChatHeader));

}

function moveSwipeButtons() {
    const chat = document.querySelector('#chat');
    const mesTemplate = document.querySelector('#message_template');
    const mesButtons = mesTemplate.querySelector('.mes_buttons');
    const mesEditButtons = mesTemplate.querySelector('.mes_edit_buttons');

    const handleSwipe = (event, direction) => {
        event.stopPropagation();
        event.preventDefault();
        const swipeButton = chat.querySelector(`.last_mes .swipe_${direction}`);
        if (swipeButton instanceof HTMLElement) swipeButton.click();
    };

    const container = document.createElement('div');
    container.className = 'flex-container swipes';

    const swipeLeft = document.createElement('div');
    swipeLeft.className = 'mes_button mes_swipe_left fa-solid fa-chevron-left';

    const swipeRight = document.createElement('div');
    swipeRight.className = 'mes_button mes_swipe_right fa-solid fa-chevron-right';

    const counter = document.createElement('span');
    counter.className = 'swipes-counter';
    counter.textContent = '1/1';

    container.append(swipeLeft, counter, swipeRight);
    mesButtons.prepend(container);

    mesTemplate.querySelector('.mes_text').after(mesButtons, mesEditButtons);

    // TODO: append new message content as a swipe (?)
    let mesText;
    chat.addEventListener('click', (event) => {
        if (!(event.target instanceof HTMLElement)) return;

        const target = event.target;
        const lastUserMes =
            Number(chat.querySelector('.last_mes').getAttribute('mesid')) -
            1;

        if (target.matches('.mes_swipe_left')) {
            handleSwipe(event, 'left');
        } else if (target.matches('.mes_swipe_right')) {
            handleSwipe(event, 'right');
        } else if (target.matches(`.mes[mesid="${lastUserMes}"] .mes_edit`)) {
            mesText = chat[lastUserMes]['mes'];
            if (power_user.trim_spaces) mesText = mesText.trim();
        }
    });

    document.addEventListener('keydown', (event) => {
        const activeElement = document.activeElement;
        const isTextInput = activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement;
        const inputEmpty = isTextInput ? activeElement.value.trim().length === 0 : true;
        const inputFocused = activeElement.matches('textarea, input, [contenteditable]');

        if ((isTextInput && !inputEmpty) || inputFocused) return;

        switch (event.key) {
            case 'ArrowLeft':
                handleSwipe(event, 'left');
                break;
            case 'ArrowRight':
                handleSwipe(event, 'right');
                break;
            case 'ArrowUp': {
                const lastUserMesID =
                    Number(chat.querySelector('.last_mes').getAttribute('mesid')) -
                    1;
                const mesEdit = chat.querySelector(`.mes[mesid="${lastUserMesID}"] .mes_edit`);
                if (mesEdit instanceof HTMLElement) mesEdit.click();
                break;
            }
        }
    });

    eventSource.on(event_types.MESSAGE_UPDATED, (mes_id) => {
        const idMatch = Number(chat.querySelector('.last_mes').getAttribute('mesid')) === Number(mes_id) + 1;
        const mesTextChanged = chatContext[mes_id]['mes'] !== mesText;

        if (!(idMatch && mesTextChanged)) return;

        eventSource.once(event_types.GENERATE_AFTER_DATA, () => {
            const swipeRight = chat.querySelector('.last_mes .swipe_right');
            if (swipeRight instanceof HTMLElement) swipeRight.click();
        });
    });
}

function loadBackgroundImage() {
    const backgroundMenu = document.querySelector('#logo_block');
    const backgroundList = tavernGPT_settings.background_list;

    const bgInput = document.createElement('input');
    bgInput.type = 'checkbox';
    bgInput.title = 'Add to randomization list';
    bgInput.className = 'bg_randomizer';
    bgInput.tabIndex = 0;
    bgInput.style.alignSelf = 'end';

    document
        .querySelector('#background_template .bg_example')
        .append(bgInput);

    const randomizeBackground = () => {
        const idx = Math.floor(Math.random() * backgroundList.length) || 0;
        const backgroundURL = `backgrounds/${backgroundList[idx]}`;
        fetch(backgroundURL)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
                return response;
            })
            .then(() => {
                const bg = document.querySelector('#bg1');
                if (bg instanceof HTMLElement) bg.style.backgroundImage = `url(${backgroundURL})`;
            })
            .catch((error) => {
                console.error(`Background ${backgroundURL} could not be set:`, error);
                console.warn(`Removing ${backgroundList[idx]} from background list...`);
                backgroundList.splice(idx, 1);
                saveSettingsDebounced();
                randomizeBackground();
            });
    };

    backgroundMenu.addEventListener('click', () => {
        backgroundMenu
            .querySelectorAll('.bg_randomizer')
            .forEach((background) => {
                const bgfile = background.parentElement.getAttribute('bgfile');
                if (backgroundList.includes(bgfile)) background.setAttribute('checked', 'true');
            });
    }, { once: true });

    backgroundMenu.addEventListener('click', (event) => {
        if (!(event.target instanceof HTMLElement)) return;
        if (!event.target.matches('.bg_randomizer')) return;

        event.stopPropagation();
        const filename = event.target.parentElement.getAttribute('bgfile');
        backgroundList.includes(filename)
            ? backgroundList.splice(backgroundList.indexOf(filename), 1)
            : backgroundList.push(filename);
        saveSettingsDebounced();
    });

    randomizeBackground();
}

function setWaifuShift() {
    const checkWaifuVisibility = () => {
        const hasImage = document.querySelector('#expression-image').getAttribute('src') !== '';
        const hasWaifuMode = document.body.classList.contains('waifuMode');
        document.querySelector('#sheld').classList.toggle('shifted', hasImage && !hasWaifuMode);
    };

    const events = [
        event_types.GENERATION_STARTED,
        event_types.CHAT_CHANGED,
    ];
    events.forEach(event => eventSource.on(event, checkWaifuVisibility));
}

async function setDesktopUI() {
    const drawerArrow = document.createElement('i');
    drawerArrow.className = 'fa-solid fa-chevron-down inline-drawer-icon';
    document.querySelector('#ai-config-button').append(drawerArrow);

    const characterPopup = document.querySelector('#character_popup');
    const rightNavPanel = document.querySelector('#right-nav-panel');
    const rightNavPin = rightNavPanel.querySelector('#rm_button_panel_pin');

    const clickHandler = (event) => {
        if (!(rightNavPin instanceof HTMLInputElement)) return;

        switch (event.target.id) {
            case 'advanced_div':
                if (rightNavPin.checked === false) rightNavPin.click();
                break;
            case 'character_cross':
                if (rightNavPin.checked === true) rightNavPin.click();
                break;
        }
    };

    rightNavPanel
        .querySelector('#advanced_div')
        .addEventListener('click', clickHandler);

    characterPopup
        .querySelector('#character_cross')
        .addEventListener('click', clickHandler);

    characterPopup.addEventListener('keydown', (event) => {
        if (!(event instanceof KeyboardEvent)) return;

        switch (event.key) {
            case 'Escape':
                clickHandler();
                break;
        }
    });

    document.querySelector('#shadow_select_chat_popup').remove();

    const renameButton = document.querySelector('#past_chat_template .renameChatButton');
    const buttonContainer = document.querySelector('#select_chat_name_wrapper > div.flex-container.gap10px.alignItemsCenter > div.flex-container.gap10px');
    const exportButton = buttonContainer.querySelector('.exportRawChatButton');
    buttonContainer.insertBefore(renameButton, exportButton);
}

async function editUI() {
    document.querySelector('#mes_example_div').remove();

    const formCreate = document.querySelector('#form_create');
    const response = await fetch(`${extensionFolderPath}/html/example_mes.html`);
    const html = await response.text();
    formCreate.insertAdjacentHTML('beforeend', html);
    formCreate.querySelector('#firstmessage_textarea').setAttribute('rows', '6');

    // get rid of bogus webkit scrollbar styling
    // weird mobile styles too
    const stylesheets = Array.from(document.styleSheets);
    const webkitStyles = stylesheets.find(sheet => sheet.href && sheet.href.includes('style.css'));

    const rulesToDelete = Array.from(webkitStyles.cssRules)
        .map((rule, index) => ({ rule, index }))
        .filter(({ rule }) => rule.cssText.includes('::-webkit-scrollbar'));
    rulesToDelete.reverse().forEach(({ index }) => webkitStyles.deleteRule(index));

    if (window.matchMedia('(width > 768px)').matches) {
        const mobileStyles = stylesheets.find(sheet => sheet.href && sheet.href.includes('mobile-styles.css'));
        stylesheets.splice(stylesheets.indexOf(mobileStyles), 1);
    }
}

async function main() {
    await initSettings();

    editUI();
    setPersona();
    addScrollButton();
    moveSwipeButtons();

    await ExplorePanel();
    loadSplashText();
    monkeyPatch();

    loadBackgroundImage();
    setWaifuShift();

    addChatHeader();
    if (!window.matchMedia('(width > 768px)').matches) return;

    setDesktopUI();
    await ChatHistory();
    addSidebarToggle();
}

main();
