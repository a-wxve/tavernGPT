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

        const data = await response.json();
        let settings = JSON.parse(data.settings);

        let avatar_img = getUserAvatar(settings.user_avatar);
        $('#persona-management-button .drawer-icon.fa-solid.fa-face-smile').html(
            `<img class='persona_avatar' src='${avatar_img}'/>`).append(`<span> ${name1}</span>`
            );
    });

    $('#persona-management-button .drawer-icon.fa-solid.fa-face-smile > *').on('click', function() {
        $(this).closest('.drawer').find('.drawer-content').toggleClass('closedDrawer openDrawer');
    });
}

function toggleSidebar() {
    const settingsHolder = $('#top-settings-holder');
    const closeHTML = `
        <button class='closeSidebar'>
            <div class='arrow1'></div><div class='arrow2'></div>
        </button>
    `;
    settingsHolder.append(closeHTML);

    $('.closeSidebar').on('click', () => {
        settingsHolder.toggleClass('collapsed');
    });
}

async function initSettings() {
    const settingsHTML = await $.get(`${extensionFolderPath}/settings.html`);
    $('#extensions_settings2').append(settingsHTML);

    function loadSettings() {
        extension_settings[extensionName] = extension_settings[extensionName] || {};
        if (Object.keys(extension_settings[extensionName]).length === 0) {
            Object.assign(extension_settings[extensionName], defaultSettings);
        }

        $('#rename_chats').prop('checked', extension_settings[extensionName].rename_chats).trigger('input');
        $('#enable_nudges').prop('checked', extension_settings[extensionName].enable_nudges).trigger('input');
    }

    $('#rename_chats').on('click', (event) => {
        const value = Boolean($(event.target).prop('checked'));
        extension_settings[extensionName].rename_chats = value;
        saveSettingsDebounced();
    });

    $('#enable_nudges').on('click', (event) => {
        const value = Boolean($(event.target).prop('checked'));
        extension_settings[extensionName].enable_nudges = value;
        saveSettingsDebounced();
    });

    loadSettings();
}

function loadSplashText() {
    const splashes = ['desu~', 'desu~!', 'DESU~!', 'Jimmy Apples!', 'Sam Altman!', 'ChatGPT is better!', 'Splash Text!', 'The Singularity!', 'AGI!', 'Shocking!', 'Shocking the industry!', 'e/acc!', 'Acceleration!', 'AGI achieved internally!', 'Q*!', 'GPT-7!', 'Chinchilla scaling!', 'Low perplexity!', 'AUPATE!', 'Ethnnically Anbigious!', 'eethnically amboruaius!', 'Laver huling nnuctiol!', 'Costco Wholeslale!', 'CFTF?', 'Foxbots doko?', 'OpenAI BTFO!', 'Anthropic BTFO!', '1 billion token context!', 'Summer Dragon!', 'ahh ahh mistress!', 'My model has 24 parameters!', 'NVIDIA, fuck you!', 'TPUs!', 'ClosedAI!', '175 Beaks!', '1.7 Toucans!', 'Will Smith eating spaghetti!', 'SOVL!', 'SOVLLESS!', 'Rugpulled!', 'Fiz love!', '$7 Trillion!', 'Feel the AGI!', 'Reddit\\nSpacing!', 'Also try NovelAI!', 'Also try AetherRoom!', 'AIIIEEEEEEEE!', 'We\'re back!', 'We\'re so back!', 'It\'s over!', 'It\'s so over!', 'Can generate hands!', 'Slight twist on the upstroke!', '(´• ω •`) ', '(´- ω -`) ', '(\`・ω・\´) ', 'Big if true!', 'Meta BTFO!', 'Groq!', 'Grok?', '0.99 p(doom)!', 'Anchor!', 'No meanies allowed!', 'The Rock eating rocks!', 'Malfoy\'s last name!', 'Todd Howard!', 'DeepMind BTFO!', 'sillylittleguy.org!', 'I kneel!', 'Where bake?', 'Focksposting!', 'struggling to conceptualize the thickness of her bush...', 'Anti love!', 'GPT-2 was very bad!', 'GPT-3 was pretty bad!', 'GPT-4 is bad!', 'GPT-4 kind of sucks!', 'GPT-5 is okay!', 'Count Grey!', 'Google Colab!', 'Also try AI Dungeon!'];

    function setSplashText() {
        if ($('#version_display_welcome').length) {
            $('#version_display_welcome').after('<p id="splash">Loading...</p>');
            $('#splash').html(splashes[Math.floor(Math.random() * splashes.length)]);
            $('#splash').on('click', function() {
                $('#splash').html(splashes[Math.floor(Math.random() * splashes.length)]);
            });
        } else {
            setTimeout(checkAndSet, 540);
        }
    }

    setSplashText();
}

async function initNudgeUI() {
    if (extension_settings[extensionName].enable_nudges) {
        const nudgeHTML = await $.get(`${extensionFolderPath}/nudges.html`);
        $('#form_sheld').prepend(nudgeHTML);

        eventSource.on('generation_ended', async () => {
            eventSource.on('message_received', async () => {
                const prompt = 'Generate 4 one line replies from {{user}}\'s point of view using the chat history so far as a guideline for {{user}}\'s writing style in JSON format with the keys "prompt1", "prompt2", "prompt3", and "prompt4". Be sure to "quote" dialogue. Output only the JSON without any additional commentary.';
                let nudgesString = await generateQuietPrompt(prompt, false, false);
                console.log(nudgesString);
                let nudges = JSON.parse(nudgesString);

                $('.nudge_button').each(function(index) {
                    if (nudges[`prompt${index + 1}`]) {
                        let prompt = nudges[`prompt${index + 1}`];
                        $(this).append(`<span id="nudge_prompt">${prompt}</span>`);
                    }
                });

                $('.nudge-container').css('display', 'grid');
            })
        });

        $('#nudge_prompt').on('click', (event) => {
            event.preventDefault();
            let prompt = $(event.target).text();
            console.log(prompt)
            $('#send_textarea').val(prompt);
            $('.nudge-container').css('display', 'none');
        })
    }
}

function setMobileUI() {
    $('#sheld').prepend(`<div class="flex-container" id="chat_header"></div>`);

    function addChatHeader() {
        const chat_header = $('#chat_header');
        const last_mes = $('.last_mes');

        chat_header.empty();
        let avatarImg = last_mes.find('.avatar').clone();
        let charName = last_mes.find('.ch_name').clone();
        let mesID = last_mes.find('.mesIDDisplay').clone();
        let mesTimer = last_mes.find('.mes_timer').clone();
        let tokenCount = last_mes.find('.tokenCounterDisplay').clone();

        chat_header.append(avatarImg, charName);
        $('#chat_header .ch_name').append(mesID, mesTimer, tokenCount);
    }

    eventSource.on('chatLoaded', addChatHeader);
    eventSource.on('character_message_rendered', addChatHeader);
    eventSource.on('message_deleted', addChatHeader);
}

function addSwipeButtons() {
    const swipeButtonsHTML = `
        <div class="mes_swipe_left fa-solid fa-chevron-left"></div>
        <div class="swipes-counter">1/1</div>
        <div class="mes_swipe_right fa-solid fa-chevron-right"></div>
        `;
    $('#message_template .mes_buttons').prepend(swipeButtonsHTML);

    function registerSwipeButtons() {
        $('.mes_swipe_left').on('click', () => {
            $('.last_mes .swipe_left').trigger('click');
        });
        $('.mes_swipe_right').on('click', () => {
            $('.last_mes .swipe_right').trigger('click');
        });
    }

    eventSource.on('chatLoaded', registerSwipeButtons);
    eventSource.on('character_message_rendered', registerSwipeButtons);
    eventSource.on('message_deleted', registerSwipeButtons);
}

jQuery(() => {
    $(initSettings);
    $(loadChatHistory);
    $(getPersona);
    $(initExplorePanel);
    $(toggleSidebar);
    $(initNudgeUI);
    $(loadSplashText);
    $(addSwipeButtons);

    if (window.matchMedia('only screen and ((max-width: 768px))').matches) {
        $(setMobileUI);
    }

    $('.expression-holder').appendTo('#sheld');

    const sheld = $('#sheld');
    sheld.attr('tabindex', '0');
    sheld.on('keydown', (event) => {
        switch (event.which) {
            case 37:
                if (!$('textarea').is(':focus')) {
                    $('.last_mes .swipe_left').trigger('click');
                    break;
                }
            case 39:
                if (!$('textarea').is(':focus')) {
                    $('.last_mes .swipe_right').trigger('click');
                    break;
                }
            default: return;
        }
    });
});
