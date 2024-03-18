import {
    eventSource,
    getRequestHeaders,
    getUserAvatar,
    name1
} from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import { explore } from './explore.js';
import { history } from './history.js';

const extensionName = 'tavernGPT';
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

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

    $('#notificationSettings').on('click', function() {
        console.log('Requesting notification permit...');
        Notification.requestPermission().then((permission) => {
            if (permission === 'granted') {
                eventSource.on('message_received', (messageId) => {
                    // if (document.hasFocus()) return;

                    const context = getContext();
                    const message = context.chat[messageId];

                    if (!message || message.mes === '' || message.mes === '...' || message.is_user) return;

                    const avatar = message.force_avatar ?? `/thumbnail?type=avatar&file=${encodeURIComponent(context.characters[context.characterId]?.avatar)}`;

                    console.log('Sending notifications...')
                    const notification = new Notification(message.name, {
                        body: message.mes,
                        icon: location.origin + avatar,
                    });

                    notification.onclick = () => {
                        window.focus();
                    };

                    setTimeout(notification.close.bind(notification), 10000);
                });
            } else {
                console.warn('Notifications not allowed.');
            }
        });
    });
}

function splashText() {
    var splashes = ['desu~', 'desu~!', 'DESU~!', 'Jimmy Apples!', 'Sam Altman!', 'ChatGPT is better!', 'Splash Text!', 'The Singularity!', 'AGI!', 'Shocking!', 'Shocking the industry!', 'e/acc!', 'Acceleration!', 'AGI achieved internally!', 'Q*!', 'GPT-7!', 'Chinchilla scaling!', 'Low perplexity!', 'AUPATE!', 'Ethnnically Anbigious!', 'eethnically amboruaius!', 'Laver huling nnuctiol!', 'Costco Wholeslale!', 'CFTF?', 'Foxbots doko?', 'GPT BTFO!', 'Claude BTFO!', '1 billion token context!', 'Summer Dragon!', 'ahh ahh mistress!', 'My model has 24 parameters!', 'NVIDIA, fuck you!', 'TPUs!', 'ClosedAI!', '175 Beaks!', '1.7 Toucans!', 'Will Smith eating spaghetti!', 'SOVL!', 'SOVLLESS!', 'Rugpulled!', 'Fiz love!', '$7 Trillion!', 'Feel the AGI!', 'Reddit\\nSpacing!', 'Also try NovelAI!', 'Also try AetherRoom!', 'AIIIEEEEEEEE!', 'We\'re back!', 'We\'re so back!', 'It\'s over!', 'It\'s so over!', 'Can generate hands!', 'Slight twist on the upstroke!', '(´• ω •`) ', '(´- ω -`) ', '(\`・ω・\´) ', 'Big if true!'];

    $("#version_display_welcome").after('<p id="subtitle">Loading...</p>');
    $('#subtitle').html($("#subtitle").html().replace("Loading...", splashes[Math.floor(Math.random() * splashes.length)]));
}

jQuery(async () => {
    $(settings);
    $(history);
    $(persona);
    $(explore);
    $(sidebarToggle);
    $(splashText);
    $('.expression-holder').appendTo('#sheld');
});
