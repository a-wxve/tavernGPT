import {
    eventSource,
    generateQuietPrompt,
    getRequestHeaders, getUserAvatar,
    name1,
    saveSettingsDebounced
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { initExplorePanel } from './explore.js';
import { loadChatHistory } from './history.js';

export const extensionName = 'tavernGPT';
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {};

function getPersona() {
    const $persona_button = document.querySelector('#persona-management-button .drawer-icon.fa-solid.fa-face-smile');

    eventSource.on('settings_updated', async () => {
        const response = await fetch('/api/settings/get', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
            cache: 'no-cache',
        });

        if (!response.ok) {
            toastr.error('Settings could not be loaded. Try reloading the page.');
            throw new Error('Error getting settings.');
        }

        let settings = await response.json().then(data => JSON.parse(data.settings));
        let avatar_img = getUserAvatar(settings.user_avatar);

        $persona_button.innerHTML = `<img class='persona_avatar' src='${avatar_img}'/>`;
        $persona_button.insertAdjacentHTML('beforeend', `<span> ${name1}</span>`);
    });

    $persona_button.addEventListener('click', () => {
        $persona_button.closest('.drawer-content').classList.toggle('closedDrawer openDrawer');
    });
}

function toggleSidebar() {
    const $settings_holder = document.querySelector('#top-settings-holder');
    $settings_holder.insertAdjacentHTML('beforeend', `
        <button id='closeSidebar'>
            <div class='arrow1'></div><div class='arrow2'></div>
        </button>
    `);

    $settings_holder.addEventListener('click', (event) => {
        if (event.target.matches('#closeSidebar')) {
            $settings_holder.classList.toggle('collapsed');
        }
    });
}

async function initSettings() {
    const $settings = document.querySelector('#extensions_settings2');
    await fetch(`${extensionFolderPath}/html/settings.html`).then(data => data.text()).then(data => {
        $settings.insertAdjacentHTML('beforeend', data);
    });
    const $rename_chats = document.querySelector('#rename_chats');
    const $enable_nudges = document.querySelector('#enable_nudges');

    $settings.addEventListener('click', (event) => {
        switch (true) {
            case event.target.matches($rename_chats):
                extension_settings[extensionName].rename_chats = $rename_chats.checked;
            case event.target.matches($enable_nudges):
                extension_settings[extensionName].enable_nudges = $enable_nudges.checked;
            default: break;
        }
        saveSettingsDebounced();
    });

    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    }

    switch (true) {
        case $rename_chats.checked:
            $rename_chats.dispatchEvent(new MouseEvent('click'));
        case $enable_nudges.checked:
            $enable_nudges.dispatchEvent(new MouseEvent('click'));
        default: return;
    }
}

function loadSplashText() {
    const splashes = ['desu~', 'desu~!', 'DESU~!', 'Jimmy Apples!', 'Sam Altman!', 'ChatGPT is better!', 'Splash Text!', 'The Singularity!', 'AGI!', 'Shocking!', 'Shocking the industry!', 'e/acc!', 'Acceleration!', 'AGI achieved internally!', 'Q*!', 'GPT-7!', 'Chinchilla scaling!', 'Low perplexity!', 'AUPATE!', 'Ethnnically Anbigious!', 'eethnically amboruaius!', 'Laver huling nnuctiol!', 'Costco Wholeslale!', 'CFTF?', 'Foxbots doko?', 'OpenAI BTFO!', 'Anthropic BTFO!', '1 billion token context!', 'Summer Dragon!', 'ahh ahh mistress!', 'My model has 24 parameters!', 'NVIDIA, fuck you!', 'TPUs!', 'ClosedAI!', '175 Beaks!', '1.7 Toucans!', 'Will Smith eating spaghetti!', 'SOVL!', 'SOVLLESS!', 'Rugpulled!', 'Fiz love!', '$7 Trillion!', 'Feel the AGI!', 'Reddit\\nSpacing!', 'Also try NovelAI!', 'Also try AetherRoom!', 'AIIIEEEEEEEE!', 'We\'re back!', 'We\'re so back!', 'It\'s over!', 'It\'s so over!', 'Can generate hands!', 'Slight twist on the upstroke!', '(´• ω •`) ', '(´- ω -`) ', '(\`・ω・\´) ', 'Big if true!', 'Meta BTFO!', 'Groq!', 'Grok?', '0.99 p(doom)!', 'Anchor!', 'No meanies allowed!', 'The Rock eating rocks!', 'Malfoy\'s last name!', 'Todd Howard!', 'DeepMind BTFO!', 'sillylittleguy.org!', 'I kneel!', 'Where bake?', 'Focksposting!', 'struggling to conceptualize the thickness of her bush...', 'Anti love!', 'GPT-2 was very bad!', 'GPT-3 was pretty bad!', 'GPT-4 is bad!', 'GPT-4 kind of sucks!', 'GPT-5 is okay!', 'Count Grey!', 'Google Colab!', 'Also try AI Dungeon!'];

    function setSplashText() {
        if (!!document.querySelector('#version_display_welcome')) {
            document.querySelector('#version_display_welcome').insertAdjacentHTML('afterend', `<p id="splash">Loading...</p>`);

            const $splash = document.querySelector('#splash')
            $splash.innerHTML = splashes[Math.floor(Math.random() * splashes.length)];
            $splash.addEventListener('click', () => {
                $splash.innerHTML = splashes[Math.floor(Math.random() * splashes.length)];
            });

        } else {
            setTimeout(setSplashText, 540);
        }
    }

    setSplashText();
}

async function initNudgeUI() {
    if (extension_settings[extensionName].enable_nudges) {
        await fetch(`${extensionFolderPath}/html/nudges.html`).then(data => data.text()).then(data => {
            document.querySelector('#form_sheld').insertAdjacentHTML('afterbegin', data);
        });
        const $nudges = document.querySelector('#nudges');

        eventSource.on('generation_ended', () => {
            eventSource.on('message_received', async () => {
                const prompt = 'Generate 4 one line replies from {{user}}\'s point of view using the chat history so far as a guideline for {{user}}\'s writing style in JSON format with the keys "prompt1", "prompt2", "prompt3", and "prompt4". Be sure to "quote" dialogue. Output only the JSON without any additional commentary.';
                let nudges = await generateQuietPrompt(prompt, false, false).then(data => JSON.parse(data));

                $nudges.querySelectorAll('.nudge_button').forEach((button, index) => {
                    if (nudges[`prompt${index + 1}`]) {
                        let prompt = nudges[`prompt${index + 1}`];
                        button.insertAdjacentHTML('beforeend', `<span id="nudge_prompt">${prompt}</span>`);
                    }
                })

                $nudges.style.display = 'grid';
            })
        });

        $nudges.querySelector('#nudge_prompt').addEventListener('click', (event) => {
            event.preventDefault();
            let prompt = event.target.textContent;
            document.querySelector('#send_textarea').value = prompt;
            $nudges.style.display = 'none';
        })
    }
}

function setMobileUI() {
    const $sheld = document.querySelector('#sheld')
    $sheld.insertAdjacentHTML('afterbegin', `<div class="flex-container" id="chat_header"></div>`);

    function addChatHeader() {
        const $chat_header = $sheld.querySelector('#chat_header');
        const $last_mes = $sheld.querySelector('.last_mes');

        $chat_header.replaceChildren();
        let avatarImg = $last_mes.querySelector('.avatar').cloneNode();
        let charName = $last_mes.querySelector('.ch_name').cloneNode();
        let mesID = $last_mes.querySelector('.mesIDDisplay').cloneNode();
        let mesTimer = $last_mes.querySelector('.mes_timer').cloneNode();
        let tokenCount = $last_mes.querySelector('.tokenCounterDisplay').cloneNode();

        $chat_header.append(avatarImg, charName);
        $chat_header.querySelector('.ch_name').append(mesID, mesTimer, tokenCount);
    }

    eventSource.on('chatLoaded', addChatHeader);
    eventSource.on('character_message_rendered', addChatHeader);
    eventSource.on('message_deleted', addChatHeader);
}

function addSwipeButtons() {
    document.querySelector('#message_template .mes_buttons').insertAdjacentHTML('afterbegin', `
        <div class="mes_swipe_left fa-solid fa-chevron-left"></div>
        <div class="swipes-counter">1/1</div>
        <div class="mes_swipe_right fa-solid fa-chevron-right"></div>
    `);

    function registerSwipeButtons() {
        const $last_mes = document.querySelector('#chat').querySelector('.last_mes')
        $last_mes.querySelector('.mes_buttons').removeEventListener('click', () => { })
        $last_mes.querySelector('.mes_buttons').addEventListener('click', (event) => {
            const swipeDirection = event.target.classList.contains('mes_swipe_left') ? '.swipe_left' : '.swipe_right';
            $last_mes.querySelector(swipeDirection).dispatchEvent(new MouseEvent('click'));
        });
    }

    eventSource.on('chatLoaded', registerSwipeButtons);
    eventSource.on('character_message_rendered', registerSwipeButtons);
    eventSource.on('message_deleted', registerSwipeButtons);
}

function main() {
    initSettings();
    loadChatHistory();
    getPersona();
    initExplorePanel();
    toggleSidebar();
    initNudgeUI();
    loadSplashText();
    addSwipeButtons();

    if (window.matchMedia('only screen and ((max-width: 768px))').matches) {
        setMobileUI();
    }


    const $sheld = document.querySelector('#sheld');
    $sheld.append(document.querySelector('#expression-wrapper .expression-holder'));
    $sheld.setAttribute('tabindex', '0');
    $sheld.addEventListener('keydown', (event) => {
        switch (event.which) {
            case 37:
                if (!$sheld.querySelector('textarea').matches(':focus')) {
                    $sheld.querySelector('.last_mes .swipe_left').dispatchEvent(new MouseEvent('click'));
                }
            case 39:
                if (!$sheld.querySelector('textarea').matches(':focus')) {
                    $sheld.querySelector('.last_mes .swipe_right').dispatchEvent(new MouseEvent('click'));
                }
            default: return;
        }
    });
}

if (document.readyState !== 'loading') {
    main();
} else {
    document.addEventListener('DOMContentLoaded', main);
}
