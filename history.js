import {
    callPopup,
    characters,
    eventSource,
    generateQuietPrompt,
    getChatsFromFiles,
    getPastCharacterChats,
    getRequestHeaders,
    this_chid
} from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';
import {
    getGroupPastChats,
    renameGroupChat,
    selected_group
} from '../../../group-chats.js';
import { debounce, onlyUnique, timestampToMoment } from '../../../utils.js';
import { extensionFolderPath, extensionName } from './index.js';

async function displayPastChats() {
    function getRelativeTimeCategory(date) {
        const today = moment().startOf('day');
        const yesterday = moment().subtract(1, 'days').startOf('day');
        const thisWeek = moment().subtract(1, 'weeks').startOf('week');
        const thisMonth = moment().startOf('month');
        const thisYear = moment().startOf('year');

        switch (true) {
            case date.isSame(today, 'day'):
                return 'Today';
            case date.isSame(yesterday, 'day'):
                return 'Yesterday';
            case date.isAfter(thisWeek):
                return 'This Week';
            case date.isSame(thisMonth, 'month'):
                return 'This Month';
            case date.isSame(thisYear, 'year'):
                return date.format('MMMM');
            default:
                return date.format('MMMM YYYY');
        }
    }

    function sortByTimeCategory(a, b) {
        const categories = ['Today', 'Yesterday', 'This Week', 'This Month'];
        const aCat = getRelativeTimeCategory(timestampToMoment(a.last_mes));
        const bCat = getRelativeTimeCategory(timestampToMoment(b.last_mes));

        switch (true) {
            case (categories.includes(aCat) && categories.includes(bCat)):
                return categories.indexOf(aCat) - categories.indexOf(bCat);
            case categories.includes(aCat):
                return -1;
            case categories.includes(bCat):
                return 1;
            default:
                return moment(aCat, 'MMMM YYYY').isAfter(moment(bCat, 'MMMM YYYY')) ? -1 : 1;
        }
    }

    const $select_chat = document.querySelector('#select_chat_div');
    const $select_chat_search = document.querySelector('#select_chat_search input');

    $select_chat.replaceChildren();
    $select_chat_search.value = '';

    const data = await (selected_group ? getGroupPastChats(selected_group) : getPastCharacterChats());

    if (!data) {
        toastr.error('Could not load chat data. Try reloading the page.');
        return;
    }

    const rawChats = await getChatsFromFiles(data, selected_group);

    const chatsByCategory = {
        Today: [],
        Yesterday: [],
        'This Week': [],
        'This Month': [],
    };

    data.forEach(chat => {
        const lastMesDate = timestampToMoment(chat.last_mes);
        const category = getRelativeTimeCategory(lastMesDate);
        if (!Array.isArray(chatsByCategory[category])) {
            chatsByCategory[category] = [];
        }
        chatsByCategory[category].push(chat);
    });

    document.querySelector('#load_select_chat_div').style.display = 'none';

    const displayChats = (searchQuery) => {
        $select_chat.replaceChildren();

        Object.entries(chatsByCategory)
            .filter(([cat, chats]) => chats.length > 0)
            .sort(([aCat, aChats], [bCat, bChats]) => {
                const a = aChats[0];
                const b = bChats[0];
                if (!a.last_mes || !b.last_mes) return 0;
                return sortByTimeCategory(a, b);
            })
            .forEach(([category, chats]) => {
                $select_chat.insertAdjacentHTML('beforeend', `<h5 class=chat-category>${category}</h5>`);

                const filteredData = chats.filter(chat => {
                    const chatContent = rawChats[chat['file_name']];

                    function makeQueryFragments(query) {
                        return query.trim().split(/\s+/).map(str => str.trim().toLowerCase()).filter(onlyUnique);;
                    }

                    function matchFragments(fragments, text) {
                        if (!text) {
                            return false;
                        }

                        return fragments.every(item => text.includes(item));
                    }

                    const fragments = makeQueryFragments(searchQuery);

                    return chatContent && Object.values(chatContent).some(message => matchFragments(fragments, message?.mes?.toLowerCase()));
                });

                console.debug(filteredData);
                for (const value of filteredData.values()) {
                    let strlen = 300;
                    let mes = value['mes'];

                    if (mes !== undefined) {
                        if (mes.length > strlen) {
                            mes = '...' + mes.substring(mes.length - strlen);
                        }
                        const fileName = value['file_name'];
                        const template = document.querySelector('#past_chat_template .select_chat_block_wrapper').cloneNode(true);
                        const select_chat_info = template.querySelector('.select_chat_info');
                        const select_chat_block_mes = template.querySelector('.select_chat_block_mes');
                        select_chat_info.parentNode.removeChild(select_chat_info);
                        select_chat_block_mes.parentNode.removeChild(select_chat_block_mes);
                        template.querySelector('.select_chat_block').setAttribute('file_name', fileName);
                        template.querySelector('.select_chat_block_filename').textContent = fileName;
                        template.querySelector('.PastChat_cross').setAttribute('file_name', fileName);

                        $select_chat.append(template);

                        if (characters[this_chid]['chat'] === fileName.toString().replace('.jsonl', '')) {
                            $select_chat.querySelector('.select_chat_block:last-child').setAttribute('highlight', true);
                        }

                        $select_chat.querySelectorAll('.select_chat_block_filename.select_chat_block_filename_item').forEach((filename) => {
                            filename.textContent = filename.textContent.replace('.jsonl', '');
                        });
                    };
                }
            });
    }

    displayChats('');

    const debouncedDisplay = debounce((searchQuery) => { displayChats(searchQuery); }, 300);

    $select_chat_search.replaceWith($select_chat_search.cloneNode())

    document.querySelector('#select_chat_search input').addEventListener('input', () => {
        debouncedDisplay(document.querySelector('#select_chat_search input').value);
    });
}

async function renameChat() {
    const old_filename = characters[this_chid].chat;
    const context = getContext();

    function matchesTimePattern(string) {
        const regexPattern = /@\d\dh\s?\d\dm\s?\d\ds(\d{1,3}ms)?/;
        return regexPattern.test(string);
    }

    if (matchesTimePattern(old_filename) && context.chat.length > 2) {
        const prompt = 'Generate a name for this chat in as few words as possible. Avoid including special characters, words like "chat", or the user\'s name. Only output the chat name.';
        var new_filename = await generateQuietPrompt(prompt, false, false);
        new_filename = new_filename.toString().replace(/^'((?:\\'|[^'])*)'$/, '$1').substring(0, 90);

        const body = {
            is_group: !!selected_group,
            avatar_url: characters[this_chid]?.avatar,
            original_file: `${old_filename}.jsonl`,
            renamed_file: `${new_filename}.jsonl`,
        };

        try {
            await fetch('/api/chats/rename', {
                method: 'POST',
                body: JSON.stringify(body),
                headers: getRequestHeaders(),
            }).catch(() => {
                throw new Error('Unsuccessful request.')
            });

            if (selected_group) {
                await renameGroupChat(selected_group, old_filename, new_filename);
            } else {
                if (characters[this_chid].chat == old_filename) {
                    characters[this_chid].chat = new_filename;
                }
                document.querySelector('#selected_chat_pole').value = characters[this_chid].chat;
            }

            await displayPastChats();
        } catch {
            await callPopup('An error has occurred. Chat was not renamed.', 'text');
        }
    }
}

export async function loadChatHistory() {
    const $settings_holder = document.querySelector('#top-settings-holder')
    await fetch(`${extensionFolderPath}/html/history.html`).then(data => data.text()).then(data => {
        $settings_holder.insertAdjacentHTML('beforeend', data);
    });

    document.querySelector('#shadow_select_chat_popup').parentNode.removeChild(shadow_select_chat_popup);

    document.querySelectorAll('#option_select_chat, #option_start_new_chat, #option_close_chat').forEach(element => {
        element.style.display = 'none'
    });

    $settings_holder.querySelector('#new_chat').addEventListener('click', () => {
        document.querySelector('#option_start_new_chat').click();
    });
    $settings_holder.querySelector('#close_chat').addEventListener('click', () => {
        document.querySelector('#option_close_chat').click();
    });

    eventSource.on('chatLoaded', async () => {
        await displayPastChats();
        if (extension_settings[extensionName].rename_chats) {
            await renameChat();
        }
    });
}
