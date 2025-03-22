import {
    chat,
    eventSource,
    event_types,
    getUserAvatar,
    name1,
    saveSettingsDebounced,
    user_avatar,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { power_user } from '../../../power-user.js';
import { loadExplorePanel } from './explore.js';
import { loadChatHistory } from './history.js';
import { splashes } from './splashes.js';

export const extensionName = 'tavernGPT';
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
export var tavernGPT_settings = extension_settings[extensionName];

const default_settings = {
    rename_chats: true,
    rename_method: 'system',
    api_key_chub: '',
    background_list: [],
};

function getPersona() {
    const $persona_icon = document.querySelector(
        '#persona-management-button .drawer-icon.fa-solid.fa-face-smile',
    );

    let lastAvatar = '';
    let lastName = '';

    const updatePersona = (avatar, name) => {
        if (avatar === lastAvatar && name === lastName) return;

        const newHTML = `<img class='persona_avatar' src='${avatar}'/><span>${name}</span>`;
        if ($persona_icon.innerHTML !== newHTML) {
            $persona_icon.innerHTML = newHTML;
            lastAvatar = avatar;
            lastName = name;
        }

        Array.from($persona_icon.children).forEach((child) => {
            child.style.pointerEvents = 'none';
        });
    };

    updatePersona(getUserAvatar(user_avatar), name1);

    eventSource.on(event_types.SETTINGS_UPDATED, () => {
        updatePersona(getUserAvatar(user_avatar), name1);
    });
}

function toggleSidebar() {
    const $settings_holder = document.querySelector('#top-settings-holder');
    const $sheld = document.querySelector('#sheld');

    const toggleButton = document.createElement('button');
    toggleButton.id = 'sidebarToggle';

    const arrow1 = document.createElement('div');
    arrow1.className = 'arrow1';
    const arrow2 = document.createElement('div');
    arrow2.className = 'arrow2';

    toggleButton.appendChild(arrow1);
    toggleButton.appendChild(arrow2);

    toggleButton.addEventListener('click', () => {
        $settings_holder.classList.toggle('collapsed');
        $sheld.classList.toggle('collapsed');
    });

    $settings_holder.appendChild(toggleButton);
}

function scrollToBottom() {
    const $chat = document.querySelector('#chat');

    const scrollButton = document.createElement('div');
    scrollButton.id = 'scrollToBottom';

    const span = document.createElement('span');
    span.textContent = 'Scroll to bottom';

    const icon = document.createElement('i');
    icon.className = 'fa-xl fa-solid fa-circle-chevron-down';

    scrollButton.appendChild(span);
    scrollButton.appendChild(icon);
    scrollButton.style.visibility = 'hidden';

    $chat.after(scrollButton);

    let checking = false;
    const checkScrollPosition = () => {
        const hasScrollbar = $chat.scrollHeight > $chat.clientHeight;
        const atBottom = hasScrollbar
            ? $chat.scrollHeight - $chat.scrollTop - $chat.clientHeight < 50
            : true;

        scrollButton.style.visibility = atBottom ? 'hidden' : 'visible';
        checking = false;
    };

    $chat.addEventListener('scroll', () => {
        if (!checking) {
            checking = true;
            requestAnimationFrame(checkScrollPosition);
        }
    });

    scrollButton.addEventListener('click', () => {
        $chat.scrollTo({
            top: $chat.scrollHeight,
            behavior: 'smooth',
        });
    });
}

async function initSettings() {
    const $settings = document.querySelector('#extensions_settings2');
    await fetch(`${extensionFolderPath}/html/settings.html`)
        .then((data) => data.text())
        .then((html) => {
            $settings.insertAdjacentHTML('beforeend', html);
        });

    const $rename_chats = $settings.querySelector('#rename_chats');
    const $rename_method_container = $settings.querySelector(
        '.rename_method_container',
    );
    const $rename_method_function = $settings.querySelector(
        '#rename_method_function',
    );
    const $rename_method_system = $settings.querySelector(
        '#rename_method_system',
    );
    const $api_key_chub = $settings.querySelector('#api_key_chub');

    tavernGPT_settings = tavernGPT_settings || {};

    let settingsChanged = false;

    for (const key in default_settings) {
        if (!(key in tavernGPT_settings)) {
            tavernGPT_settings[key] = default_settings[key];
            settingsChanged = true;
        }
    }

    for (const key in tavernGPT_settings) {
        if (!(key in default_settings)) {
            delete tavernGPT_settings[key];
            settingsChanged = true;
            console.log(
                `Removed obsolete setting: ${key} from ${extensionName}`,
            );
        }
    }

    if (settingsChanged) saveSettingsDebounced();

    if (tavernGPT_settings.rename_chats) {
        $rename_chats.checked = true;
        $rename_method_container.style.display = 'block';
    }

    if (tavernGPT_settings.rename_method === 'function') {
        $rename_method_function.checked = true;
    } else {
        $rename_method_system.checked = true;
    }

    if (tavernGPT_settings.api_key_chub) {
        $api_key_chub.value = tavernGPT_settings.api_key_chub;
    }

    $rename_chats.addEventListener('click', () => {
        tavernGPT_settings.rename_chats = $rename_chats.checked;
        $rename_method_container.style.display = $rename_chats.checked
            ? 'block'
            : 'none';
        saveSettingsDebounced();
    });

    $rename_method_container.addEventListener('click', (event) => {
        switch (event.target) {
            case $rename_method_function:
                tavernGPT_settings.rename_method = 'function';
                saveSettingsDebounced();
                break;
            case $rename_method_system:
                tavernGPT_settings.rename_method = 'system';
                saveSettingsDebounced();
                break;
        }
    });

    $api_key_chub.addEventListener('change', () => {
        tavernGPT_settings.api_key_chub = $api_key_chub.value;
        saveSettingsDebounced();
    });

    $api_key_chub.nextElementSibling.addEventListener('click', (event) => {
        const eyeIcon = event.currentTarget;
        const isPassword = $api_key_chub.getAttribute('type') === 'password';

        $api_key_chub.setAttribute('type', isPassword ? 'text' : 'password');
        eyeIcon.classList.toggle('fa-eye', isPassword);
        eyeIcon.classList.toggle('fa-eye-slash', !isPassword);
    });

}

function loadSplashText() {
    const getRandomSplash = () =>
        splashes[Math.floor(Math.random() * splashes.length)];

    const observer = new MutationObserver((_, observer) => {
        const welcomeElement = document.querySelector(
            '#version_display_welcome',
        );

        if (welcomeElement) {
            observer.disconnect();

            const splashText = document.createElement('p');
            splashText.id = 'splash';

            splashText.textContent = getRandomSplash();

            welcomeElement.after(splashText);

            splashText.addEventListener('click', () => {
                splashText.textContent = getRandomSplash();
            });
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => observer.disconnect(), 10000);
}

function setMobileUI() {
    const addChatHeader = () => {
        const $chat_header = $sheld.querySelector('#chat_header');
        const $last_mes = $sheld.querySelector('.last_mes');

        $chat_header.replaceChildren();
        let avatarImg = $last_mes.querySelector('.avatar').cloneNode(true);
        let charName = $last_mes.querySelector('.ch_name').cloneNode(true);
        let mesID = $last_mes.querySelector('.mesIDDisplay').cloneNode(true);
        let mesTimer = $last_mes.querySelector('.mes_timer').cloneNode(true);
        let tokenCount = $last_mes
            .querySelector('.tokenCounterDisplay')
            .cloneNode(true);

        $chat_header.append(avatarImg, charName);
        $chat_header
            .querySelector('.ch_name')
            .append(mesID, mesTimer, tokenCount);
    };

    const $sheld = document.querySelector('#sheld');
    $sheld.insertAdjacentHTML(
        'afterbegin',
        '<div class="flex-container" id="chat_header"></div>',
    );

    eventSource.on('chatLoaded', addChatHeader);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, addChatHeader);
    eventSource.on(event_types.MESSAGE_DELETED, addChatHeader);
    eventSource.on(event_types.MESSAGE_SWIPED, addChatHeader);
}

function moveSwipeButtons() {
    let mesText;

    const $chat = document.querySelector('#chat');

    const $mesTemplate = document.querySelector('#message_template');
    const $mesButtons = $mesTemplate.querySelector('.mes_buttons');
    const $mesEditButtons = $mesTemplate.querySelector('.mes_edit_buttons');

    const handleSwipe = (event, direction) => {
        event.stopPropagation();
        event.preventDefault();
        $chat.querySelector(`.last_mes .swipe_${direction}`).click();
    };

    $mesButtons.insertAdjacentHTML(
        'afterbegin',
        `<div class="flex-container swipes">
            <div class="mes_swipe_left fa-solid fa-chevron-left"></div>
            <div class="swipes-counter">1/1</div>
            <div class="mes_swipe_right fa-solid fa-chevron-right"></div>
        </div>`,
    );
    $mesTemplate.querySelector('.mes_text').after($mesButtons, $mesEditButtons);

    $chat.addEventListener('click', (event) => {
        const target = event.target;

        switch (true) {
            case target.matches('.mes_swipe_left'):
                handleSwipe(event, 'left');
                break;
            case target.matches('.mes_swipe_right'):
                handleSwipe(event, 'right');
                break;
            case target.matches(`.mes[mesid="${lastUserMes}"] .mes_edit`): {
                const lastUserMes =
                    parseInt($chat.querySelector('.last_mes').getAttribute('mesid')) -
                    1;
                mesText = chat[lastUserMes]['mes'];

                if (power_user.trim_spaces) {
                    mesText = mesText.trim();
                }
            }
        }
    });

    document.addEventListener('keydown', (event) => {
        const activeElement = document.activeElement;
        const lastUserMes =
            parseInt($chat.querySelector('.last_mes').getAttribute('mesid')) -
            1;

        if (!activeElement.matches('textarea, input, [contenteditable]')) {
            switch (event.key) {
                case 'ArrowLeft':
                    handleSwipe(event, 'left');
                    break;
                case 'ArrowRight':
                    handleSwipe(event, 'right');
                    break;
                case 'ArrowUp': {
                    const lastUserMes =
                        parseInt($chat.querySelector('.last_mes').getAttribute('mesid')) -
                        1;
                    $chat
                        .querySelector(`.mes[mesid="${lastUserMes}"] .mes_edit`)
                        .click();
                    break;
                }
            }
        }
    });


    eventSource.on(event_types.MESSAGE_UPDATED, (mes_id) => {
        const idMatch = parseInt($chat.querySelector('.last_mes').getAttribute('mesid')) == parseInt(mes_id) + 1;
        const mesTextChanged = chat[mes_id]['mes'] !== mesText;

        if (idMatch && mesTextChanged) {
            eventSource.once(event_types.GENERATE_AFTER_DATA, () => {
                $chat.querySelector('.last_mes .swipe_right').click();
            });
        }
    });
}

function randomizeBackground() {
    const $background_menu = document.querySelector('#logo_block');

    document
        .querySelector('#background_template .bg_example')
        .insertAdjacentHTML(
            'beforeend',
            '<input type="checkbox" title="Add to randomization list" class="bg_button bg_randomizer" tabindex="0"></input>',
        );

    $background_menu.addEventListener('click', () => {
        const backgroundList = tavernGPT_settings.background_list;
        $background_menu
            .querySelectorAll('.bg_randomizer')
            .forEach((background) => {
                if (
                    backgroundList.includes(
                        background.parentNode.getAttribute('bgfile'),
                    )
                ) {
                    background.setAttribute('checked', 'true');
                }
            });
    });

    $background_menu.addEventListener('click', (event) => {
        const backgroundList = tavernGPT_settings.background_list;
        if (event.target.matches('.bg_randomizer')) {
            event.stopPropagation();
            const filename = event.target.parentNode.getAttribute('bgfile');
            backgroundList.includes(filename)
                ? backgroundList.splice(backgroundList.indexOf(filename), 1)
                : backgroundList.push(filename);
            saveSettingsDebounced();
        }
    });

    if (!tavernGPT_settings.background_list) return;

    const backgroundList = tavernGPT_settings.background_list;
    const idx = Math.floor(Math.random() * backgroundList.length) || 0;
    const backgroundURL = `backgrounds/${backgroundList[idx]}`;
    fetch(backgroundURL)
        .then((response) => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response;
        })
        .then(() => {
            document.querySelector('#bg1').style.backgroundImage =
                `url(${backgroundURL})`;
        })
        .catch((error) => {
            console.error(`Background ${backgroundURL} could not be set:`, error);
            console.warn(`Removing ${backgroundList[idx]} from background list...`);
            backgroundList.splice(idx, 1);
            saveSettingsDebounced();
        });
}

function setWaifuShift() {
    const checkWaifuVisibility = () => {
        const $waifuImage = document.querySelector('#expression-image');
        const $sheld = document.querySelector('#sheld');

        if (
            $waifuImage.getAttribute('src') !== '' &&
            !document.querySelector('body').classList.contains('waifuMode')
        ) {
            $sheld.classList.add('shifted');
        } else if ($sheld.classList.contains('shifted')) {
            $sheld.classList.remove('shifted');
        }
    };

    eventSource.on(event_types.GENERATION_STARTED, checkWaifuVisibility);
    eventSource.on(event_types.CHAT_CHANGED, checkWaifuVisibility);
}

async function fixUI() {
    const $settingsDrawerToggle = document.querySelector('#ai-config-button');
    const drawerArrow = document.createElement('i');
    drawerArrow.classList.add('fa-solid', 'fa-chevron-down', 'inline-drawer-icon');
    $settingsDrawerToggle.appendChild(drawerArrow);

    const $characterPopup = document.querySelector('#character_popup');
    const $rightNavPanel = document.querySelector('#right-nav-panel');
    const $rightNavPin = $rightNavPanel.querySelector('#rm_button_panel_pin');
    $rightNavPanel
        .querySelector('#advanced_div')
        .addEventListener('click', () => {
            if ($rightNavPin.checked == false) $rightNavPin.click();
        });
    $characterPopup.addEventListener('keydown', (event) => {
        switch (event.key) {
            case 'Escape':
                if ($rightNavPin.checked == true) $rightNavPin.click();
                break;
        }
    });
    $characterPopup
        .querySelector('#character_cross')
        .addEventListener('click', () => {
            if ($rightNavPin.checked == true) $rightNavPin.click();
        });

    $characterPopup.querySelector('#mes_example_div').remove();
    await fetch(`${extensionFolderPath}/html/example_mes.html`)
        .then((data) => data.text())
        .then((html) => {
            $rightNavPanel
                .querySelector('#form_create')
                .insertAdjacentHTML('beforeend', html);
        });
}

function main() {
    // stage 1: core initialization
    initSettings();

    // stage 2: core UI
    fixUI();
    loadExplorePanel();
    loadChatHistory();

    // stage 3: layout shift
    randomizeBackground();
    setWaifuShift();

    // stage 4: interactive elements
    getPersona();
    toggleSidebar();
    scrollToBottom();
    moveSwipeButtons();

    // stage 5: decorative elements
    loadSplashText();

    // stage 6: mobile
    if (window.matchMedia('only screen and ((max-width: 768px))').matches) {
        setMobileUI();
    }
}

main();
