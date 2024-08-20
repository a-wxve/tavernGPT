import {
    characters,
    doNewChat,
    event_types,
    eventSource,
    generateQuietPrompt,
    getChatsFromFiles,
    getPastCharacterChats,
    getRequestHeaders,
    openCharacterChat,
    replaceCurrentChat,
    saveCharacterDebounced,
    this_chid,
} from "../../../../script.js";
import { debounce_timeout } from "../../../constants.js";
import { extension_settings, getContext } from "../../../extensions.js";
import {
    deleteGroupChat,
    getGroupPastChats,
    groups,
    openGroupChat,
    renameGroupChat,
    selected_group,
} from "../../../group-chats.js";
import { callGenericPopup, POPUP_TYPE } from "../../../popup.js";
import { debounce, onlyUnique, timestampToMoment } from "../../../utils.js";
import { extensionFolderPath, extensionName } from "./index.js";

const group = selected_group
    ? groups.find((x) => x.id === selected_group)
    : null;
const timeCategories = new Map([
    ["Today", 0],
    ["Yesterday", 1],
    ["This Week", 2],
    ["This Month", 3],
]);

function getTimeCategory(date) {
    const today = moment().startOf("day");
    const timeCategories = {
        Today: () => date.isSame(today, "day"),
        Yesterday: () => date.isSame(moment(today).subtract(1, "days"), "day"),
        "This Week": () =>
            date.isAfter(moment(today).subtract(1, "weeks").startOf("week")),
        "This Month": () => date.isSame(today, "month"),
    };

    for (const [category, condition] of Object.entries(timeCategories)) {
        if (condition()) return category;
    }

    return date.isSame(today, "year")
        ? date.format("MMMM")
        : date.format("MMMM YYYY");
}

function sortTimeCategories(a, b) {
    const aCat = getTimeCategory(timestampToMoment(a.last_mes));
    const bCat = getTimeCategory(timestampToMoment(b.last_mes));

    const aOrder = timeCategories.get(aCat);
    const bOrder = timeCategories.get(bCat);

    if (aOrder !== undefined && bOrder !== undefined) {
        return aOrder - bOrder;
    }

    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;

    return moment(aCat, "MMMM YYYY").isAfter(moment(bCat, "MMMM YYYY"))
        ? -1
        : 1;
}

async function displayChats(searchQuery) {
    const $selectChat = document.querySelector("#select_chat_div");

    const data = await (selected_group
        ? getGroupPastChats(selected_group)
        : getPastCharacterChats());

    if (!data) {
        toastr.error("Could not load chat data. Try reloading the page.");
        return;
    }

    const rawChats = await getChatsFromFiles(data, selected_group);

    const chatCategories = {};
    for (const [category, _] of timeCategories) {
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
            $selectChat.insertAdjacentHTML(
                "beforeend",
                `<h5 class=chat-category>${category}</h5>`,
            );

            const filteredData = chats.filter((chat) => {
                const chatContent = rawChats[chat["file_name"]];

                const fragments = searchQuery
                    .trim()
                    .split(/\s+/)
                    .map((str) => str.trim().toLowerCase())
                    .filter(onlyUnique);

                return (
                    chatContent &&
                    Object.values(chatContent).some((message) =>
                        fragments.every((item) =>
                            message?.mes?.toLowerCase().includes(item),
                        ),
                    )
                );
            });

            for (const value of filteredData.values()) {
                const strlen = 300;
                let mes = value["mes"];

                if (mes !== undefined) {
                    if (mes.length > strlen) {
                        mes = "..." + mes.substring(mes.length - strlen);
                    }
                    const fileName = value["file_name"];
                    const template = document
                        .querySelector(
                            "#past_chat_template .select_chat_block_wrapper",
                        )
                        .cloneNode(true);
                    const selectChatInfo =
                        template.querySelector(".select_chat_info");
                    const selectChatBlockMes = template.querySelector(
                        ".select_chat_block_mes",
                    );
                    selectChatInfo.parentNode.removeChild(selectChatInfo);
                    selectChatBlockMes.parentNode.removeChild(
                        selectChatBlockMes,
                    );
                    template
                        .querySelector(".select_chat_block")
                        .setAttribute("file_name", fileName);
                    template.querySelector(
                        ".select_chat_block_filename",
                    ).textContent = fileName;
                    template
                        .querySelector(".PastChat_cross")
                        .setAttribute("file_name", fileName);

                    const selectedChatFileName = `${selected_group ? group?.chat_id : characters[this_chid].chat}.jsonl`;
                    if (fileName === selectedChatFileName) {
                        template
                            .querySelector(".select_chat_block")
                            .setAttribute("highlight", true);
                    }

                    $selectChat.append(template);

                    $selectChat
                        .querySelectorAll(
                            ".select_chat_block_filename.select_chat_block_filename_item",
                        )
                        .forEach((filename) => {
                            filename.textContent = filename.textContent.replace(
                                ".jsonl",
                                "",
                            );
                        });
                }
            }
        });
}

async function overrideChatButtons(event) {
    const stopEvent = (event) => {
        event.stopPropagation();
        event.preventDefault();
    };
    const chatBlock = event.target.closest(".select_chat_block");

    if (
        chatBlock &&
        !event.target.matches(
            ".renameChatButton, .exportRawChatButton, .exportChatButton, .PastChat_cross",
        )
    ) {
        stopEvent(event);

        const filename = chatBlock
            .getAttribute("file_name")
            .replace(".jsonl", "");

        selected_group
            ? await openGroupChat(selected_group, filename)
            : await openCharacterChat(filename);

        chatBlock.parentNode.parentNode
            .querySelector(`.select_chat_block[highlight="true"]`)
            .removeAttribute("highlight");
        chatBlock.setAttribute("highlight", true);
    } else if (chatBlock && event.target.matches(".renameChatButton")) {
        stopEvent(event);
        renameChat(true, chatBlock);
    } else if (chatBlock && event.target.matches(".PastChat_cross")) {
        stopEvent(event);

        const chatToDelete = chatBlock.getAttribute("file_name");
        const confirmed = await callGenericPopup(
            "Are you sure you want to delete this chat?",
            POPUP_TYPE.CONFIRM,
            "",
            { okButton: "Delete", cancelButton: "Cancel" },
        );

        if (confirmed) {
            const deleteChat = selected_group
                ? () => deleteGroupChat(selected_group, chatToDelete)
                : () =>
                      fetch("/api/chats/delete", {
                          method: "POST",
                          headers: getRequestHeaders(),
                          body: JSON.stringify({
                              chatfile: chatToDelete,
                              avatar_url: characters[this_chid].avatar,
                          }),
                      });

            const response = await deleteChat().catch((error) => {
                console.error(`Error deleting ${chatToDelete}:`, error);
                toastr.error("An error occurred. Chat was not deleted.");
                return null;
            });

            if (response) {
                if (!selected_group) {
                    const name = chatToDelete.replace(".jsonl", "");

                    if (name === characters[this_chid].chat) {
                        chat_metadata = {};
                        await replaceCurrentChat();
                    }

                    await eventSource.emit(event_types.CHAT_DELETED, name);
                }

                chatBlock.remove();
            }
        } else {
            return;
        }
    }
}

async function renameChat(auto = false, chatBlock = null) {
    let oldFilename = selected_group
        ? group?.chat_id
        : characters[this_chid].chat;
    let newFilename;
    const context = getContext();

    const matchesTimePattern = (string) => {
        const regexPattern = /@\d\dh\s?\d\dm\s?\d\ds(\d{1,3}ms)?/;
        return regexPattern.test(string);
    };

    if (auto && matchesTimePattern(oldFilename) && context.chat.length > 2) {
        const prompt =
            'Generate a unique name for this chat in as few words as possible. Avoid including special characters, words like "chat", or the user\'s name. Only output the chat name.';
        newFilename = await generateQuietPrompt(prompt, false, false);
        newFilename = newFilename
            .toString()
            .replace(/^'((?:\\'|[^'])*)'$/, "$1")
            .substring(0, 90);
    } else if (auto && matchesTimePattern(oldFilename)) {
        eventSource.once(event_types.GENERATE_AFTER_DATA, () => {
            debounce(() => {
                renameChat(true);
            }, debounce_timeout.relaxed);
        });
    } else if (!auto && chatBlock) {
        oldFilename = chatBlock.getAttribute("file_name");
        newFilename = await callGenericPopup(
            "Enter a new name for this chat:",
            POPUP_TYPE.INPUT,
        );
    }

    if (newFilename) {
        const response = await fetch("/api/chats/rename", {
            method: "POST",
            headers: getRequestHeaders(),
            body: JSON.stringify({
                is_group: !!selected_group,
                avatar_url: characters[this_chid]?.avatar,
                original_file: `${oldFilename}.jsonl`,
                renamed_file: `${newFilename}.jsonl`,
            }),
        }).catch((error) => {
            console.error(`Error renaming ${oldFilename}:`, error);
            toastr.error("An error occurred. Chat was not renamed.");
            return null;
        });

        if (response) {
            if (selected_group) {
                await renameGroupChat(selected_group, oldFilename, newFilename);
            } else {
                if (characters[this_chid].chat == oldFilename) {
                    characters[this_chid].chat = newFilename;
                    document.querySelector("#selected_chat_pole").value =
                        characters[this_chid].chat;
                    saveCharacterDebounced();
                }
            }

            const filenameElement = chatBlock
                ? chatBlock.querySelector(
                      ".select_chat_block_filename.select_chat_block_filename_item",
                  )
                : document.querySelector(
                      `.select_chat_block[highlight="true"] .select_chat_block_filename.select_chat_block_filename_item`,
                  );
            if (filenameElement) filenameElement.textContent = newFilename;
        }
    }
}

export async function loadChatHistory() {
    let lastCharacterLoaded;

    const searchChats = debounce((searchQuery) => {
        displayChats(searchQuery);
    }, debounce_timeout.short);

    document.querySelector("#shadow_select_chat_popup").remove();

    const $settingsHolder = document.querySelector("#top-settings-holder");
    await fetch(`${extensionFolderPath}/html/history.html`)
        .then((data) => data.text())
        .then((data) => {
            $settingsHolder.insertAdjacentHTML("beforeend", data);
        });

    $settingsHolder.addEventListener("click", overrideChatButtons, true);

    $settingsHolder.querySelector("#new_chat").addEventListener("click", () => {
        doNewChat({ deleteCurrentChat: false });
        //TODO: extract chat history template creation into function
        //and manually add the new chat to the history
        displayChats("");
    });

    $settingsHolder
        .querySelector("#select_chat_search input")
        .addEventListener("input", (event) => {
            searchChats(event.target.value);
        });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        if (characters[this_chid] !== lastCharacterLoaded) {
            lastCharacterLoaded = characters[this_chid];
            displayChats("");
        }
        if (extension_settings[extensionName].rename_chats) renameChat(true);
    });
}
