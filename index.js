import {
    eventSource,
    event_types,
    generateQuietPrompt,
    user_avatar,
    getUserAvatar,
    name1,
    saveSettingsDebounced,
} from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";
import { loadExplorePanel } from "./explore.js";
import { loadChatHistory } from "./history.js";
import { splashes } from "./splashes.js";

export const extensionName = "tavernGPT";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const default_settings = {
    rename_chats: true,
    rename_method: "function",
    enable_nudges: false,
    api_key_chub: "",
    background_list: [],
};

function getPersona() {
    const $persona_icon = document.querySelector(
        "#persona-management-button .drawer-icon.fa-solid.fa-face-smile",
    );

    let lastAvatar = "";
    let lastName = "";
    const updatePersona = (avatar, name) => {
        if (avatar !== lastAvatar || name !== lastName) {
            const newHTML = `<img class='persona_avatar' src='${avatar}'/><span>${name}</span>`;
            if ($persona_icon.innerHTML !== newHTML) {
                $persona_icon.innerHTML = newHTML;
                lastAvatar = avatar;
                lastName = name;
            }
            $persona_icon.childNodes.forEach((element) => {
                element.style.pointerEvents = "none";
            });
        }
    };

    eventSource.on(event_types.SETTINGS_UPDATED, () => {
        updatePersona(getUserAvatar(user_avatar), name1);
    });

    updatePersona(getUserAvatar(user_avatar), name1);
}

function toggleSidebar() {
    const $settings_holder = document.querySelector("#top-settings-holder");
    $settings_holder.insertAdjacentHTML(
        "beforeend",
        `<button id='sidebarToggle'>
            <div class='arrow1'></div>
            <div class='arrow2'></div>
        </button>`,
    );

    document.querySelector("#sidebarToggle").addEventListener("click", () => {
        $settings_holder.classList.toggle("collapsed");
        document.querySelector("#sheld").classList.toggle("collapsed");
    });
}

function scrollToBottom() {
    const $chat = document.querySelector("#chat");

    $chat.insertAdjacentHTML(
        "afterend",
        `<div id="scrollToBottom">
            <i class="fa-2xl fa-solid fa-circle-arrow-down"></i>
        </div>`,
    );

    const $scrollButton = document.querySelector("#scrollToBottom");
    $scrollButton.style.display = "none";

    const checkScroll = () => {
        const atBottom =
            $chat.scrollHeight - $chat.scrollTop - $chat.clientHeight < 50;
        $scrollButton.style.display = atBottom ? "none" : "block";
    };

    $chat.addEventListener("scroll", checkScroll);
    $scrollButton.addEventListener("click", () => {
        $chat.scrollTo({
            top: $chat.scrollHeight,
            behavior: "smooth",
        });
    });
}

async function initSettings() {
    const $settings = document.querySelector("#extensions_settings2");
    await fetch(`${extensionFolderPath}/html/settings.html`)
        .then((data) => data.text())
        .then((data) => {
            $settings.insertAdjacentHTML("beforeend", data);
        });

    const $rename_chats = $settings.querySelector("#rename_chats");
    const $rename_method_container = $settings.querySelector(
        ".rename_method_container",
    );
    const $rename_method_function = $settings.querySelector(
        "#rename_method_function",
    );
    const $rename_method_system = $settings.querySelector(
        "#rename_method_system",
    );
    const $enable_nudges = $settings.querySelector("#enable_nudges");
    const $api_key_chub = $settings.querySelector("#api_key_chub");

    $rename_chats.addEventListener("click", () => {
        extension_settings[extensionName].rename_chats = $rename_chats.checked;
        $rename_method_container.style.display = $rename_chats.checked
            ? "block"
            : "none";
        saveSettingsDebounced();
    });

    $rename_method_function.addEventListener("click", () => {
        extension_settings[extensionName].rename_method = "function";
        saveSettingsDebounced();
    });

    $rename_method_system.addEventListener("click", () => {
        extension_settings[extensionName].rename_method = "system";
        saveSettingsDebounced();
    });

    $enable_nudges.addEventListener("click", () => {
        extension_settings[extensionName].enable_nudges =
            $enable_nudges.checked;

        if (extension_settings[extensionName].enable_nudges) {
            initNudgeUI();
        } else {
            document.querySelector("#nudges").style.display = "none";
        }

        saveSettingsDebounced();
    });

    $api_key_chub.addEventListener("change", () => {
        extension_settings[extensionName].api_key_chub = $api_key_chub.value;
        saveSettingsDebounced();
    });

    extension_settings[extensionName] = extension_settings[extensionName] || {};
    let settingsChanged = false;

    for (const key in default_settings) {
        if (!(key in extension_settings[extensionName])) {
            extension_settings[extensionName][key] = default_settings[key];
            settingsChanged = true;
        }
    }

    if (settingsChanged) saveSettingsDebounced();

    if (extension_settings[extensionName].rename_chats) {
        $rename_chats.checked = true;
        $rename_method_container.style.display = "block";
    }

    if (extension_settings[extensionName].rename_method === "function") {
        $rename_method_function.checked = true;
    } else {
        $rename_method_system.checked = true;
    }

    if (extension_settings[extensionName].enable_nudges)
        $enable_nudges.checked = true;
}

function loadSplashText() {
    function setSplashText() {
        if (!!document.querySelector("#version_display_welcome")) {
            document
                .querySelector("#version_display_welcome")
                .insertAdjacentHTML("afterend", '<p id="splash"></p>');

            const $splash = document.querySelector("#splash");
            $splash.innerHTML =
                splashes[Math.floor(Math.random() * splashes.length)];
            $splash.addEventListener("click", () => {
                $splash.innerHTML =
                    splashes[Math.floor(Math.random() * splashes.length)];
            });
        } else {
            setTimeout(setSplashText, 500);
        }
    }

    setSplashText();
}

async function initNudgeUI() {
    await fetch(`${extensionFolderPath}/html/nudges.html`)
        .then((data) => data.text())
        .then((data) => {
            document
                .querySelector("#form_sheld")
                .insertAdjacentHTML("afterbegin", data);
        });
    const $nudges = document.querySelector("#nudges");

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, async () => {
        const prompt = `Generate 4 one line replies from {{user}}'s point of view using the chat history so far as a guideline for {{user}}'s writing style in JSON format with the keys "prompt1", "prompt2", "prompt3", and "prompt4". Be sure to "quote" dialogue. Output only the JSON without any additional commentary.`;
        let nudges = await generateQuietPrompt(prompt, false, false).then(
            (data) => JSON.parse(data),
        );

        $nudges.style.display = "grid";

        $nudges.querySelectorAll(".nudge_button").forEach((button, index) => {
            if (nudges[`prompt${index + 1}`]) {
                let prompt = nudges[`prompt${index + 1}`];
                button.insertAdjacentHTML(
                    "beforeend",
                    `<span id="nudge_prompt">${prompt}</span>`,
                );
                button
                    .querySelector("#nudge_prompt")
                    .addEventListener("click", (event) => {
                        document.querySelector("#send_textarea").value =
                            event.target.textContent;
                        $nudges.style.display = "none";
                    });
            }
        });
    });
}

function setMobileUI() {
    function addChatHeader() {
        const $chat_header = $sheld.querySelector("#chat_header");
        const $last_mes = $sheld.querySelector(".last_mes");

        $chat_header.replaceChildren();
        let avatarImg = $last_mes.querySelector(".avatar").cloneNode(true);
        let charName = $last_mes.querySelector(".ch_name").cloneNode(true);
        let mesID = $last_mes.querySelector(".mesIDDisplay").cloneNode(true);
        let mesTimer = $last_mes.querySelector(".mes_timer").cloneNode(true);
        let tokenCount = $last_mes
            .querySelector(".tokenCounterDisplay")
            .cloneNode(true);

        $chat_header.append(avatarImg, charName);
        $chat_header
            .querySelector(".ch_name")
            .append(mesID, mesTimer, tokenCount);
    }

    const $sheld = document.querySelector("#sheld");
    $sheld.insertAdjacentHTML(
        "afterbegin",
        '<div class="flex-container" id="chat_header"></div>',
    );

    eventSource.on("chatLoaded", addChatHeader);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, addChatHeader);
    eventSource.on(event_types.MESSAGE_DELETED, addChatHeader);
    eventSource.on(event_types.MESSAGE_SWIPED, addChatHeader);
}

function moveSwipeButtons() {
    const $chat = document.querySelector("#chat");

    const $mesTemplate = document.querySelector("#message_template");
    const $mesButtons = $mesTemplate.querySelector(".mes_buttons");
    const $mesEditButtons = $mesTemplate.querySelector(".mes_edit_buttons");

    const handleSwipe = (event, direction) => {
        event.stopPropagation();
        event.preventDefault();
        $chat.querySelector(`.last_mes .swipe_${direction}`).click();
    };

    $mesButtons.insertAdjacentHTML(
        "afterbegin",
        `<div class="flex-container swipes">
            <div class="mes_swipe_left fa-solid fa-chevron-left"></div>
            <div class="swipes-counter">1/1</div>
            <div class="mes_swipe_right fa-solid fa-chevron-right"></div>
        </div>`,
    );
    $mesTemplate.querySelector(".mes_text").after($mesButtons, $mesEditButtons);

    $chat.addEventListener("click", (event) => {
        const target = event.target;

        //TODO: automatically swipe on message edit
        if (target.matches(".mes_swipe_left")) {
            handleSwipe(event, "left");
        } else if (target.matches(".mes_swipe_right")) {
            handleSwipe(event, "right");
        }
    });

    document.addEventListener("keydown", (event) => {
        const activeElement = document.activeElement;
        const lastUserMes =
            parseInt($chat.querySelector(".last_mes").getAttribute("mesid")) -
            1;

        if (!activeElement.matches("textarea, input, [contenteditable]")) {
            switch (event.key) {
                case "ArrowLeft":
                    handleSwipe(event, "left");
                    break;
                case "ArrowRight":
                    handleSwipe(event, "right");
                    break;
                case "ArrowUp":
                    $chat
                        .querySelector(`.mes[mesid="${lastUserMes}"] .mes_edit`)
                        .click();
                    break;
            }
        }
    });
}

function randomizeBackground() {
    const $background_menu = document.querySelector("#logo_block");

    document
        .querySelector("#background_template .bg_example")
        .insertAdjacentHTML(
            "beforeend",
            `<input type="checkbox" title="Add to randomization list" class="bg_button bg_randomizer" tabindex="0"></div>`,
        );

    $background_menu.addEventListener("click", () => {
        const backgroundList =
            extension_settings[extensionName].background_list;
        $background_menu
            .querySelectorAll(".bg_randomizer")
            .forEach((background) => {
                if (
                    backgroundList.includes(
                        background.parentNode.getAttribute("bgfile"),
                    )
                ) {
                    background.setAttribute("checked", "true");
                }
            });
    });

    $background_menu.addEventListener("click", (event) => {
        const backgroundList =
            extension_settings[extensionName].background_list;
        if (event.target.matches(".bg_randomizer")) {
            event.stopPropagation();
            const filename = event.target.parentNode.getAttribute("bgfile");
            backgroundList.includes(filename)
                ? backgroundList.splice(backgroundList.indexOf(filename), 1)
                : backgroundList.push(filename);
            saveSettingsDebounced();
        }
    });

    if (!extension_settings[extensionName].background_list) return;

    const backgroundList = extension_settings[extensionName].background_list;
    const idx = Math.floor(Math.random() * backgroundList.length) || 0;
    const backgroundURL = `backgrounds/${backgroundList[idx]}`;
    fetch(backgroundURL)
        .then(() => {
            document.querySelector("#bg1").style.backgroundImage =
                `url(${backgroundURL})`;
        })
        .catch(() => {
            console.log(`Background ${backgroundURL} could not be set`);
        });
}

function main() {
    function checkWaifuVisibility() {
        const $waifuImage = document.querySelector("#expression-image");
        const $sheld = document.querySelector("#sheld");

        if (
            $waifuImage.getAttribute("src") !== "" &&
            !document.querySelector("body").classList.contains("waifuMode")
        ) {
            $sheld.classList.add("shifted");
        } else if ($sheld.classList.contains("shifted")) {
            $sheld.classList.remove("shifted");
        }
    }

    initSettings();
    randomizeBackground();
    getPersona();
    toggleSidebar();
    scrollToBottom();
    loadExplorePanel();
    loadChatHistory();
    moveSwipeButtons();
    loadSplashText();

    if (window.matchMedia("only screen and ((max-width: 768px))").matches) {
        setMobileUI();
    }

    const $settingsDrawerToggle = document.querySelector("#ai-config-button");
    $settingsDrawerToggle.insertAdjacentHTML(
        "beforeend",
        '<i class="fa-solid fa-chevron-down inline-drawer-icon"></i>',
    );

    const $characterPopup = document.querySelector("#character_popup");
    const $rightNavPanel = document.querySelector("#right-nav-panel");
    const $rightNavPin = $rightNavPanel.querySelector("#rm_button_panel_pin");
    $rightNavPanel
        .querySelector("#advanced_div")
        .addEventListener("click", () => {
            if ($rightNavPin.checked == false) $rightNavPin.click();
        });
    $characterPopup.addEventListener("keydown", (event) => {
        switch (event.key) {
            case "Escape":
                if ($rightNavPin.checked == true) $rightNavPin.click();
                break;
        }
    });
    $characterPopup
        .querySelector("#character_cross")
        .addEventListener("click", () => {
            if ($rightNavPin.checked == true) $rightNavPin.click();
        });

    $characterPopup.querySelector("#mes_example_div").remove();
    fetch(`${extensionFolderPath}/html/example_mes.html`)
        .then((data) => data.text())
        .then((data) => {
            $rightNavPanel
                .querySelector("#form_create")
                .insertAdjacentHTML("beforeend", data);
        });

    eventSource.on(event_types.GENERATION_STARTED, checkWaifuVisibility);
    eventSource.on(event_types.CHAT_CHANGED, checkWaifuVisibility);
}

main();
