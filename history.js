import { moment } from '../../../../lib.js';
import {
    characters,
    doNewChat,
    event_types,
    eventSource,
    generateQuietPrompt,
    getRequestHeaders,
    openCharacterChat,
    replaceCurrentChat,
    saveCharacterDebounced,
    saveSettingsDebounced,
    this_chid,
} from '../../../../script.js';
import { debounce_timeout } from '../../../constants.js';
import { getContext } from '../../../extensions.js';
import {
    deleteGroupChat,
    groups,
    openGroupChat,
    renameGroupChat,
    selected_group,
} from '../../../group-chats.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';
import { ToolManager } from '../../../tool-calling.js';
import { debounce, timestampToMoment } from '../../../utils.js';
import { extensionFolderPath, tavernGPT_settings } from './index.js';

const group = selected_group
    ? groups.find((x) => x.id === selected_group)
    : null;
const timeIDs = new Map([
    ['Today', 0],
    ['Yesterday', 1],
    ['Last 7 Days', 2],
    ['Last 30 Days', 3],
]);
let renamePromptListeners = [];

function getTimeCategory(date) {
    const today = moment().startOf('day');
    const timeCategories = {
        'Today': () => date.isSame(today, 'day'),
        'Yesterday': () => date.isSame(moment(today).subtract(1, 'days'), 'day'),
        'Last 7 Days': () =>
            date.isAfter(moment(today).subtract(7, 'days').startOf('day')),
        'Last 30 Days': () =>
            date.isAfter(moment(today).subtract(30, 'days').startOf('day')),
    };

    for (const [category, condition] of Object.entries(timeCategories)) {
        if (condition()) return category;
    }

    return date.isSame(today, 'year') ? date.format('MMMM') : date.format('MMMM YYYY');
}

function sortTimeCategories(a, b) {
    const aCat = getTimeCategory(timestampToMoment(a.last_mes));
    const bCat = getTimeCategory(timestampToMoment(b.last_mes));

    const aOrder = timeIDs.get(aCat);
    const bOrder = timeIDs.get(bCat);

    if (aOrder !== undefined && bOrder !== undefined) {
        return aOrder - bOrder;
    }

    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;

    return moment(aCat, 'MMMM YYYY').isAfter(moment(bCat, 'MMMM YYYY')) ? -1 : 1;
}

async function displayChats(searchQuery) {
    const $selectChat = document.querySelector('#select_chat_div');

    const response = await fetch('/api/chats/search', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            query: searchQuery,
            avatar_url: selected_group
                ? null
                : characters[this_chid].avatar,
            group_id: selected_group || null,
        }),
    });

    if (!response.ok) {
        console.error('/api/chats/search fetch failed: ', response.status, response.statusText);
        toastr.error(`${response.status} ${response.statusText}`, 'Failed to fetch chats');
        return;
    }

    const data = await response.json();

    const chatCategories = {};
    for (const [category] of timeIDs) {
        chatCategories[category] = [];
    }

    data.forEach((chat) => {
        const lastMesDate = timestampToMoment(chat.last_mes);
        const category = getTimeCategory(lastMesDate);
        if (!Array.isArray(chatCategories[category])) {
            chatCategories[category] = [];
        }
        chatCategories[category].push(chat);
    });

    $selectChat.replaceChildren();

    Object.entries(chatCategories)
        .filter(([, chats]) => chats.length > 0)
        .sort(([, aChats], [, bChats]) => {
            const a = aChats[0];
            const b = bChats[0];
            if (!a.last_mes || !b.last_mes) return 0;
            return sortTimeCategories(a, b);
        })
        .forEach(([category, chats]) => {
            if (chats.length > 0) {
                $selectChat.insertAdjacentHTML(
                    'beforeend',
                    `<h5 class=chat-category>${category}</h5>`,
                );
            }

            for (const chat of chats) {
                const template = document
                    .querySelector(
                        '#past_chat_template .select_chat_block_wrapper',
                    )
                    .cloneNode(true);

                if (!(template instanceof Element)) return;

                template
                    .querySelector('.select_chat_block')
                    .setAttribute('file_name', chat.file_name);
                template.querySelector(
                    '.select_chat_block_filename',
                ).textContent = chat.file_name.replace('.jsonl', '');
                template
                    .querySelector('.PastChat_cross')
                    .setAttribute('file_name', chat.file_name);

                const selectedChatFileName = `${selected_group ? group?.chat_id : characters[this_chid].chat}.jsonl`;
                if (chat.file_name === selectedChatFileName) {
                    template
                        .querySelector('.select_chat_block')
                        .setAttribute('highlight', 'true');
                }

                $selectChat.append(template);
            }
        });
}

async function overrideChatButtons(event) {
    const chatBlock = event.target.closest('.select_chat_block');

    if (!chatBlock) return;

    const stopEvent = (event) => {
        event.stopPropagation();
        event.preventDefault();
    };

    const target = event.target;
    const shouldOpen = !target.matches('.renameChatButton, .exportRawChatButton, .exportChatButton, .PastChat_cross');
    const shouldRename = target.matches('.renameChatButton');
    const shouldDelete = target.matches('.PastChat_cross');

    if (shouldOpen) {
        stopEvent(event);

        const filename = chatBlock
            .getAttribute('file_name')
            .replace('.jsonl', '');

        selected_group
            ? await openGroupChat(selected_group, filename)
            : await openCharacterChat(filename);
    } else if (shouldRename) {
        stopEvent(event);
        const oldFilename = chatBlock.getAttribute('file_name');
        const newFilename = await callGenericPopup(
            'Enter a new name for this chat:',
            POPUP_TYPE.INPUT,
        );

        if (!newFilename) return;

        const result = await renameChat(oldFilename, String(newFilename));
        if (!result.success) {
            console.error(`Failed to rename chat: ${result.error}`);
            toastr.error(`Failed to rename chat: ${result.error}`);
            return;
        }
    } else if (shouldDelete) {
        stopEvent(event);

        const chatToDelete = chatBlock.getAttribute('file_name');
        const confirmed = await callGenericPopup(
            'Are you sure you want to delete this chat?',
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Delete', cancelButton: 'Cancel' },
        );

        if (!confirmed) {
            console.error(`Error deleting ${chatToDelete}: User did not confirm.`);
            toastr.error(`Error deleting ${chatToDelete}: User did not confirm.`);
            return;
        }

        const deleteChat = selected_group
            ? () => deleteGroupChat(selected_group, chatToDelete)
            : () =>
                fetch('/api/chats/delete', {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({
                        chatfile: chatToDelete,
                        avatar_url: characters[this_chid].avatar,
                    }),
                });

        const response = await deleteChat().catch((error) => {
            console.error(`Error deleting ${chatToDelete}:`, error);
            toastr.error(error, `Error deleting ${chatToDelete}:`);
            return null;
        });

        if (!response) return;

        if (!selected_group) {
            const name = chatToDelete.replace('.jsonl', '');

            if (name === characters[this_chid].chat) {
                await replaceCurrentChat();
            }

            await eventSource.emit(event_types.CHAT_DELETED, name);
        }
    }
}

/**
 * Renames a chat file, returning a result object
 * @param {string} oldFilename - Original chat filename
 * @param {string} newFilename - New chat filename
 * @returns {Promise<{success: boolean, data: any, error: string|null}>} - Result object
 */
async function renameChat(oldFilename, newFilename) {
    const response = await fetch('/api/chats/rename', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({
            is_group: !!selected_group,
            avatar_url: characters[this_chid]?.avatar,
            original_file: `${oldFilename}.jsonl`,
            renamed_file: `${newFilename}.jsonl`,
        }),
    });

    if (!response.ok) {
        return {
            success: false,
            data: null,
            error: `Failed to rename chat: ${response.status} ${response.statusText}`,
        };
    }

    if (selected_group) {
        await renameGroupChat(selected_group, oldFilename, newFilename);
    } else {
        if (characters[this_chid].chat == oldFilename) {
            characters[this_chid].chat = newFilename;
            document.querySelector('#selected_chat_pole').setAttribute('value', characters[this_chid].chat);
            saveCharacterDebounced();
        }
    }

    displayChats('');

    return {
        success: true,
        data: { oldFilename, newFilename },
        error: null,
    };
}

function cleanupRenamePromptListeners() {
    renamePromptListeners.forEach((listener) => {
        const { event, callback } = listener;
        eventSource.removeListener(event, callback);
    });
    renamePromptListeners = [];
}

async function setupSystemPromptRename() {
    cleanupRenamePromptListeners();

    const renameIfNeeded = async () => {
        const context = getContext();
        const oldFilename = selected_group
            ? group?.chat_id
            : characters[this_chid]?.chat;

        const matchesTimePattern = (string) => {
            const regexPattern = /@\d\dh\s?\d\dm\s?\d\ds(\d{1,3}ms)?/;
            return regexPattern.test(string);
        };

        if (matchesTimePattern(oldFilename) && context.chat.length > 2) {
            const prompt =
                'Generate a unique name for this chat in as few words as possible. Avoid including special characters, words like "chat", or the user\'s name. Only output the chat name.';
            let newFilename = await generateQuietPrompt(
                prompt,
                false,
                false,
            ).catch((error) => {
                console.error(`Error generating new filename: ${error}`);
                toastr.error(error, 'Error generating new filename');
            });

            if (!newFilename) return;

            newFilename = String(newFilename)
                .replace(/^'((?:\\'|[^'])*)'$/, '$1')
                .substring(0, 90);

            const result = await renameChat(oldFilename, newFilename);
            if (!result.success) {
                console.error(`Failed to rename chat: ${result.error}`);
                toastr.error(result.error, 'Failed to rename chat');
            }
        }
    };

    const renameCallback = debounce(
        () => renameIfNeeded(),
        debounce_timeout.short,
    );

    renamePromptListeners.push(
        {
            event: event_types.CHAT_CHANGED,
            callback: renameCallback,
        },
        {
            event: event_types.MESSAGE_RECEIVED,
            callback: renameCallback,
        },
    );

    eventSource.on(event_types.CHAT_CHANGED, renameCallback);
    eventSource.on(event_types.MESSAGE_RECEIVED, renameCallback);

    renameIfNeeded();
}

function registerRenameChatTool() {
    cleanupRenamePromptListeners();
    ToolManager.unregisterFunctionTool('renameChat');

    if (!ToolManager.isToolCallingSupported()) {
        console.warn(
            'Tool calling not supported, falling back to system prompt method.',
        );
        tavernGPT_settings.rename_method = 'system';
        saveSettingsDebounced();
        return setupSystemPromptRename();
    }

    ToolManager.registerFunctionTool({
        name: 'renameChat',
        displayName: 'Rename Chat',
        description:
            'Rename the current chat to a more descriptive title. Use this to change or create a name for the current conversation. If you see this tool, that means the chat needs to be renamed, so use it!',
        parameters: Object.freeze({
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            type: 'object',
            properties: {
                newName: {
                    type: 'string',
                    description:
                        'The new name for the chat. Should be concise, descriptive, and avoid special characters.',
                },
            },
            required: ['newName'],
        }),
        action: async ({ newName }) => {
            const oldFilename = selected_group
                ? group?.chat_id
                : characters[this_chid].chat;
            newName = String(newName)
                .replace(/^'((?:\\'|[^'])*)'$/, '$1')
                .substring(0, 90);

            const result = await renameChat(oldFilename, newName);

            return result.success
                ? `Chat successfully renamed to "${newName}".`
                : `Failed to rename the chat: ${result.error}`;
        },
        shouldRegister: () => {
            const context = getContext();
            const currentFilename = selected_group
                ? group?.chat_id
                : characters[this_chid]?.chat;

            const matchesTimePattern = (string) => {
                const regexPattern = /@\d\dh\s?\d\dm\s?\d\ds(\d{1,3}ms)?/;
                return regexPattern.test(string);
            };

            return (
                matchesTimePattern(currentFilename) && context.chat.length > 2
            );
        },
        stealth: true,
    });
}

export async function loadChatHistory() {
    let lastCharacterLoaded;
    const $settingsHolder = document.querySelector('#top-settings-holder');

    const searchChats = debounce((searchQuery) => {
        displayChats(searchQuery);
    }, debounce_timeout.short);

    const response = await fetch(`${extensionFolderPath}/html/history.html`);
    const html = await response.text();
    $settingsHolder.insertAdjacentHTML('beforeend', html);

    $settingsHolder.addEventListener('click', overrideChatButtons, true);

    $settingsHolder.querySelector('#new_chat').addEventListener('click', () => {
        doNewChat({ deleteCurrentChat: false });
        displayChats('');
    });

    $settingsHolder
        .querySelector('#select_chat_search input')
        .addEventListener('input', (event) => {
            if (event.target instanceof HTMLInputElement) {
                searchChats(event.target.value);
            }
        });

    if (tavernGPT_settings.rename_chats) {
        if (tavernGPT_settings.rename_method === 'function') {
            registerRenameChatTool();
        } else {
            setupSystemPromptRename();
        }
    }

    eventSource.on(event_types.CHAT_CHANGED, () => {
        if (characters[this_chid] !== lastCharacterLoaded) {
            lastCharacterLoaded = characters[this_chid];
            displayChats('');
        }
    });
}
