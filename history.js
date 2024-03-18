import {
    callPopup,
    characters,
    eventSource,
    generateQuietPrompt,
    getChatsFromFiles,
    getPastCharacterChats,
    getRequestHeaders,
    getThumbnailUrl,
    this_chid
} from '../../../../script.js';
import { getContext } from '../../../extensions.js';
import {
    getGroupAvatar,
    getGroupPastChats,
    renameGroupChat,
    selected_group
} from '../../../group-chats.js';
import { debounce, delay, onlyUnique, sortMoments, timestampToMoment } from '../../../utils.js';
import { extensionFolderPath } from './index.js';

async function displayPastChats() {
    function getCurrentChatDetails() {
        if (!characters[this_chid] && !selected_group) {
            return { sessionName: '', group: null, characterName: '', avatarImgURL: '' };
        }

        const group = selected_group ? groups.find(x => x.id === selected_group) : null;
        const currentChat = selected_group ? group?.chat_id : characters[this_chid]['chat'];
        const displayName = selected_group ? group?.name : characters[this_chid].name;
        const avatarImg = selected_group ? group?.avatar_url : getThumbnailUrl('avatar', characters[this_chid]['avatar']);
        return { sessionName: currentChat, group: group, characterName: displayName, avatarImgURL: avatarImg };
    }

    function getRelativeTimeCategory(date) {
        const today = moment().startOf('day');
        const yesterday = moment().subtract(1, 'days').startOf('day');
        const thisWeek = moment().subtract(1, 'weeks').startOf('week');
        const thisMonth = moment().startOf('month');
        const thisYear = moment().startOf('year');

        if (date.isSame(today, 'day')) {
            return 'Today';
        } else if (date.isSame(yesterday, 'day')) {
            return 'Yesterday';
        } else if (date.isAfter(thisWeek)) {
            return 'This Week';
        } else if (date.isSame(thisMonth, 'month')) {
            return 'This Month';
        } else if (date.isSame(thisYear, 'year')) {
            return date.format('MMMM');
        } else {
            return date.format('MMMM YYYY');
        }
    }

    function sortByTimeCategory(a, b) {
        const categories = ['Today', 'Yesterday', 'This Week', 'This Month'];
        const aCat = getRelativeTimeCategory(timestampToMoment(a.last_mes));
        const bCat = getRelativeTimeCategory(timestampToMoment(b.last_mes));

        if (categories.includes(aCat) && categories.includes(bCat)) {
            return categories.indexOf(aCat) - categories.indexOf(bCat);
        } else if (categories.includes(aCat)) {
            return -1;
        } else if (categories.includes(bCat)) {
            return 1;
        } else {
            return moment(aCat, 'MMMM YYYY').isAfter(moment(bCat, 'MMMM YYYY')) ? -1 : 1;
        }
    }


    function getCategoryHeader(category) {
        const header = $('<h3 class=chat-category></h3>');
        header.text(category);
        return header;
    }

    $('#select_chat_div').empty();
    $('#select_chat_search').val('').off('input');

    const data = await (selected_group ? getGroupPastChats(selected_group) : getPastCharacterChats());

    if (!data) {
        toastr.error('Could not load chat data. Try reloading the page.');
        return;
    }

    const chatDetails = getCurrentChatDetails();
    const group = chatDetails.group;
    const currentChat = chatDetails.sessionName;
    const displayName = chatDetails.characterName;
    const avatarImg = chatDetails.avatarImgURL;

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
    $('#load_select_chat_div').css('display', 'none');
    $('#ChatHistoryCharName').text(`${displayName}'s `);

    const displayChats = (searchQuery) => {
        $('#select_chat_div').empty();  // Clear the current chats before appending filtered chats

        Object.entries(chatsByCategory)
            .filter(([cat, chats]) => chats.length > 0)
            .sort(([aCat, aChats], [bCat, bChats]) => {
                const a = aChats[0];
                const b = bChats[0];
                if (!a.last_mes || !b.last_mes) return 0;
                return sortByTimeCategory(a, b);
            })
            .forEach(([category, chats]) => {
                $('#select_chat_div').append(getCategoryHeader(category));

                const filteredData = chats.filter(chat => {
                    const fileName = chat['file_name'];
                    const chatContent = rawChats[fileName];

                    function makeQueryFragments(query) {
                        let fragments = query.trim().split(/\s+/).map(str => str.trim().toLowerCase()).filter(onlyUnique);
                        return fragments;
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
                        const fileSize = value['file_size'];
                        const fileName = value['file_name'];
                        const chatItems = rawChats[fileName].length;
                        const timestamp = timestampToMoment(value['last_mes']).format('lll');
                        const template = $('#past_chat_template .select_chat_block_wrapper').clone();
                        template.find('.select_chat_block').attr('file_name', fileName);
                        template.find('.avatar img').attr('src', avatarImg);
                        template.find('.select_chat_block_filename').text(fileName);
                        template.find('.chat_file_size').text(`(${fileSize},`);
                        template.find('.chat_messages_num').text(`${chatItems}💬)`);
                        template.find('.select_chat_block_mes').text(mes);
                        template.find('.PastChat_cross').attr('file_name', fileName);
                        template.find('.chat_messages_date').text(timestamp);

                        if (selected_group) {
                            template.find('.avatar img').replaceWith(getGroupAvatar(group));
                        }

                        $('#select_chat_div').append(template);

                        if (currentChat === fileName.toString().replace('.jsonl', '')) {
                            $('#select_chat_div').find('.select_chat_block:last').attr('highlight', true);
                        }
                    };
                }
            });
    }

    displayChats('');

    const debouncedDisplay = debounce((searchQuery) => { displayChats(searchQuery); }, 300);

    // Define the search input listener
    $('#select_chat_search').on('input', function() {
        const searchQuery = $(this).val();
        debouncedDisplay(searchQuery);
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
        const prompt = 'Generate a name for this chat in as few words as possible. Avoid including special characters, words like "chat", or the user\'s name.';
        let newName = await generateQuietPrompt(prompt, false, false);
        newName = newName.toString().replace(/^'((?:\\'|[^'])*)'$/, '$1');

        const body = {
            is_group: !!selected_group,
            avatar_url: characters[this_chid]?.avatar,
            original_file: `${old_filename}.jsonl`,
            renamed_file: `${newName}.jsonl`,
        };

        try {
            const response = await fetch('/api/chats/rename', {
                method: 'POST',
                body: JSON.stringify(body),
                headers: getRequestHeaders(),
            });

            if (!response.ok) {
                throw new Error('Unsuccessful request.');
            }

            const data = await response.json();

            if (data.error) {
                throw new Error('Server returned an error.');
            }

            if (selected_group) {
                await renameGroupChat(
                    selected_group,
                    old_filename,
                    newName
                );
            } else {
                if (characters[this_chid].chat == old_filename) {
                    characters[this_chid].chat = newName;
                }
                $('#selected_chat_pole').val(characters[this_chid].chat);
            }

            await delay(250);
            $('#option_select_chat').trigger('click');
            $('#options').hide();
        } catch {
            await delay(500);
            await callPopup(
                'An error has occurred. Chat was not renamed.',
                'text'
            );
        }
    }
}

export async function history() {
    const historyHTML = await $.get(`${extensionFolderPath}/history.html`);
    $('#top-settings-holder').append(historyHTML);

    $('#shadow_select_chat_popup').remove();

    $(
        '.options-content #option_select_chat, .options-content #option_start_new_chat, .options-content #option_close_chat'
    ).css('display', 'none');

    $('#new_chat').on('click', function() {
        $('.options-content #option_start_new_chat').trigger('click');
    });
    $('#close_chat').on('click', function() {
        $('.options-content #option_close_chat').trigger('click');
    });

    eventSource.on('chatLoaded', async () => {
        await displayPastChats();
        await renameChat();
    });
}
