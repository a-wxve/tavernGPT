import {
    eventSource,
    generateQuietPrompt,
    getRequestHeaders,
    getUserAvatar,
    name1,
    saveSettingsDebounced,
} from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';
import { explore } from './explore.js';
import { history } from './history.js';

export const extensionName = 'tavernGPT';
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const defaultSettings = {};

async function persona() {
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

function sidebarToggle() {
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

async function settings() {
    const settingsHTML = await $.get(`${extensionFolderPath}/settings.html`);
    $('#extensions_settings2').append(settingsHTML);

    async function loadSettings() {
        extension_settings[extensionName] = extension_settings[extensionName] || {};
        if (Object.keys(extension_settings[extensionName]).length === 0) {
            Object.assign(extension_settings[extensionName], defaultSettings);
        }

        $('#rename_chats').prop('checked', extension_settings[extensionName].rename_chats).trigger('input');
        $('#enable_nudges').prop('checked', extension_settings[extensionName].enable_nudges).trigger('input');
    }

    $('#rename_chats').on('click', function(e) {
        const value = Boolean($(e.target).prop('checked'));
        extension_settings[extensionName].rename_chats = value;
        saveSettingsDebounced();
    });

    $('#enable_nudges').on('click', function(e) {
        const value = Boolean($(e.target).prop('checked'));
        extension_settings[extensionName].enable_nudges = value;
        saveSettingsDebounced();
    });

    loadSettings();
}

function splashText() {
    var splashes = ['desu~', 'desu~!', 'DESU~!', 'Jimmy Apples!', 'Sam Altman!', 'ChatGPT is better!', 'Splash Text!', 'The Singularity!', 'AGI!', 'Shocking!', 'Shocking the industry!', 'e/acc!', 'Acceleration!', 'AGI achieved internally!', 'Q*!', 'GPT-7!', 'Chinchilla scaling!', 'Low perplexity!', 'AUPATE!', 'Ethnnically Anbigious!', 'eethnically amboruaius!', 'Laver huling nnuctiol!', 'Costco Wholeslale!', 'CFTF?', 'Foxbots doko?', 'GPT BTFO!', 'Claude BTFO!', '1 billion token context!', 'Summer Dragon!', 'ahh ahh mistress!', 'My model has 24 parameters!', 'NVIDIA, fuck you!', 'TPUs!', 'ClosedAI!', '175 Beaks!', '1.7 Toucans!', 'Will Smith eating spaghetti!', 'SOVL!', 'SOVLLESS!', 'Rugpulled!', 'Fiz love!', '$7 Trillion!', 'Feel the AGI!', 'Reddit\\nSpacing!', 'Also try NovelAI!', 'Also try AetherRoom!', 'AIIIEEEEEEEE!', 'We\'re back!', 'We\'re so back!', 'It\'s over!', 'It\'s so over!', 'Can generate hands!', 'Slight twist on the upstroke!', '(´• ω •`) ', '(´- ω -`) ', '(\`・ω・\´) ', 'Big if true!'];

    function checkAndSet() {
        if ($('#version_display_welcome').length) {
            $('#version_display_welcome').after('<p id="splash">Loading...</p>');
            $('#splash').html(splashes[Math.floor(Math.random() * splashes.length)]);
            $('#splash').on('click', function() {
                $('#splash').html(splashes[Math.floor(Math.random() * splashes.length)]);
            });
        } else {
            setTimeout(checkAndSet, 50);
        }
    }

    checkAndSet();
}

async function nudges() {
    if (extension_settings[extensionName].enable_nudges) {
        const nudgeHTML = await $.get(`${extensionFolderPath}/nudges.html`);
        $('#form_sheld').prepend(nudgeHTML);

        eventSource.on('generation_ended', async () => {
            eventSource.on('message_received', async () => {
                const prompt = 'Generate 4 one line replies from {{user}}\'s point of view using the chat history so far as a guideline for {{user}}\'s writing style in JSON format with the keys "prompt1", "prompt2", "prompt3", and "prompt4". Be sure to "quote" dialogue. Output only the JSON without any additional commentary.';
                let nudgesString = await generateQuietPrompt(prompt, false, false);
                console.log(nudgesString);
                var nudges = JSON.parse(nudgesString);

                $('.nudge_button').each(function(index) {
                    if (nudges['prompt' + (index + 1)]) {
                        let prompt = nudges['prompt' + (index + 1)];
                        $(this).append('<span id="nudge_prompt">' + prompt + '</span>');
                    }
                });

                $('.nudge-container').css('display', 'grid');
            })
        });

        $('#nudge_prompt').on('click', async (e) => {
            e.preventDefault();
            var prompt = $(e.target).text();
            console.log(prompt)
            $('#send_textarea').val(prompt);
            $('.nudge-container').css('display', 'none');
        })
    }
}

jQuery(async () => {
    $(settings);
    $(history);
    $(persona);
    $(explore);
    $(sidebarToggle);
    $(nudges);
    $(splashText);
    $('.expression-holder').appendTo('#sheld');

    $('#sheld').attr('tabindex', '0');
    $('#sheld').on('keydown', function(e) {
        e.preventDefault();
        switch (e.which) {
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
