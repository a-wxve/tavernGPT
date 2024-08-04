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
    saveCharacterDebounced,
    this_chid,
} from "../../../../script.js";
import { debounce_timeout } from "../../../constants.js";
import { extension_settings, getContext } from "../../../extensions.js";
import {
    getGroupPastChats,
    groups,
    openGroupChat,
    renameGroupChat,
    selected_group,
} from "../../../group-chats.js";
import { debounce, onlyUnique, timestampToMoment } from "../../../utils.js";
import { extensionFolderPath, extensionName } from "./index.js";

const group = selected_group
    ? groups.find((x) => x.id === selected_group)
    : null;

function getRelativeTimeCategory(date) {
    const today = moment().startOf("day");
    const yesterday = moment().subtract(1, "days").startOf("day");
    const thisWeek = moment().subtract(1, "weeks").startOf("week");
    const thisMonth = moment().startOf("month");
    const thisYear = moment().startOf("year");

    switch (true) {
        case date.isSame(today, "day"):
            return "Today";
        case date.isSame(yesterday, "day"):
            return "Yesterday";
        case date.isAfter(thisWeek):
            return "This Week";
        case date.isSame(thisMonth, "month"):
            return "This Month";
        case date.isSame(thisYear, "year"):
            return date.format("MMMM");
        default:
            return date.format("MMMM YYYY");
    }
}

function sortByTimeCategory(a, b) {
    const categories = ["Today", "Yesterday", "This Week", "This Month"];
    const aCat = getRelativeTimeCategory(timestampToMoment(a.last_mes));
    const bCat = getRelativeTimeCategory(timestampToMoment(b.last_mes));

    switch (true) {
        case categories.includes(aCat) && categories.includes(bCat):
            return categories.indexOf(aCat) - categories.indexOf(bCat);
        case categories.includes(aCat):
            return -1;
        case categories.includes(bCat):
            return 1;
        default:
            return moment(aCat, "MMMM YYYY").isAfter(moment(bCat, "MMMM YYYY"))
                ? -1
                : 1;
    }
}

async function displayChats(searchQuery) {
    const $select_chat = document.querySelector("#select_chat_div");

    const data = await (selected_group
        ? getGroupPastChats(selected_group)
        : getPastCharacterChats());

    if (!data) {
        toastr.error("Could not load chat data. Try reloading the page.");
        return;
    }

    const rawChats = await getChatsFromFiles(data, selected_group);

    const chatsByCategory = {
        Today: [],
        Yesterday: [],
        "This Week": [],
        "This Month": [],
    };

    data.forEach((chat) => {
        const lastMesDate = timestampToMoment(chat.last_mes);
        const category = getRelativeTimeCategory(lastMesDate);
        if (!Array.isArray(chatsByCategory[category])) {
            chatsByCategory[category] = [];
        }
        chatsByCategory[category].push(chat);
    });

    $select_chat.replaceChildren();
    Object.entries(chatsByCategory)
        .filter(([, chats]) => chats.length > 0)
        .sort(([, aChats], [, bChats]) => {
            const a = aChats[0];
            const b = bChats[0];
            if (!a.last_mes || !b.last_mes) return 0;
            return sortByTimeCategory(a, b);
        })
        .forEach(([category, chats]) => {
            $select_chat.insertAdjacentHTML(
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
                let strlen = 300;
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
                    const select_chat_info =
                        template.querySelector(".select_chat_info");
                    const select_chat_block_mes = template.querySelector(
                        ".select_chat_block_mes",
                    );
                    select_chat_info.parentNode.removeChild(select_chat_info);
                    select_chat_block_mes.parentNode.removeChild(
                        select_chat_block_mes,
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

                    $select_chat.append(template);

                    $select_chat
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

async function renameChat() {
    const old_filename = selected_group
        ? group?.chat_id
        : characters[this_chid].chat;
    const context = getContext();

    function matchesTimePattern(string) {
        const regexPattern = /@\d\dh\s?\d\dm\s?\d\ds(\d{1,3}ms)?/;
        return regexPattern.test(string);
    }

    if (matchesTimePattern(old_filename) && context.chat.length > 2) {
        const prompt =
            'Generate a unique name for this chat in as few words as possible. Avoid including special characters, words like "chat", or the user\'s name. Only output the chat name.';
        let new_filename = await generateQuietPrompt(prompt, false, false);
        new_filename = new_filename
            .toString()
            .replace(/^'((?:\\'|[^'])*)'$/, "$1")
            .substring(0, 90);

        try {
            await fetch("/api/chats/rename", {
                method: "POST",
                headers: getRequestHeaders(),
                body: JSON.stringify({
                    is_group: !!selected_group,
                    avatar_url: characters[this_chid]?.avatar,
                    original_file: `${old_filename}.jsonl`,
                    renamed_file: `${new_filename}.jsonl`,
                }),
            });

            if (selected_group) {
                await renameGroupChat(
                    selected_group,
                    old_filename,
                    new_filename,
                );
            } else {
                if (characters[this_chid].chat == old_filename) {
                    characters[this_chid].chat = new_filename;
                }

                document.querySelector("#selected_chat_pole").value =
                    characters[this_chid].chat;

                document.querySelector(
                    `.select_chat_block[highlight="true"] .select_chat_block_filename.select_chat_block_filename_item`,
                ).textContent = new_filename;

                saveCharacterDebounced();
            }
        } catch {
            toastr.error("An error occurred. Chat was not renamed.");
        }
    } else if (matchesTimePattern(old_filename)) {
        eventSource.once(event_types.GENERATE_AFTER_DATA, () => {
            if (extension_settings[extensionName].rename_chats) renameChat();
        });
    }
}

export async function loadChatHistory() {
    //TODO: override rename and delete buttons too
    const openChat = async (event) => {
        const target = event.target.closest(".select_chat_block");
        if (
            target &&
            !event.target.matches(
                ".renameChatButton, .exportRawChatButton, .exportChatButton, .PastChat_cross",
            )
        ) {
            event.stopImmediatePropagation();
            event.preventDefault();

            const filename = target
                .getAttribute("file_name")
                .replace(".jsonl", "");
            if (selected_group) {
                await openGroupChat(selected_group, filename);
            } else {
                await openCharacterChat(filename);
            }
        }
    };

    const searchChats = debounce((searchQuery) => {
        displayChats(searchQuery);
    }, debounce_timeout.short);

    document
        .querySelector("#shadow_select_chat_popup")
        .parentNode.removeChild(shadow_select_chat_popup);

    const $settings_holder = document.querySelector("#top-settings-holder");
    await fetch(`${extensionFolderPath}/html/history.html`)
        .then((data) => data.text())
        .then((data) => {
            $settings_holder.insertAdjacentHTML("beforeend", data);
        });

    $settings_holder.addEventListener("click", openChat, true);

    $settings_holder
        .querySelector("#new_chat")
        .addEventListener("click", () => {
            doNewChat({ deleteCurrentChat: false });
        });

    $settings_holder
        .querySelector("#select_chat_search input")
        .addEventListener("input", (event) => {
            searchChats(event.target.value);
        });

    eventSource.on(event_types.CHAT_CHANGED, async () => {
        await displayChats("");
        if (extension_settings[extensionName].rename_chats) renameChat();
    });
}
