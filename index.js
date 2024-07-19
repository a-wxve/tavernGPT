import {
    eventSource,
    generateQuietPrompt,
    getRequestHeaders,
    getUserAvatar,
    name1,
    saveSettingsDebounced,
} from "../../../../script.js";
import { extension_settings } from "../../../extensions.js";
import { loadExplorePanel } from "./explore.js";
import { loadChatHistory } from "./history.js";

export const extensionName = "tavernGPT";
export const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;
const default_settings = {
    rename_chats: true,
    enable_nudges: false,
    api_key_chub: "",
    background_list: [],
};

function getPersona() {
    const $persona_button = document.querySelector(
        "#persona-management-button .drawer-icon.fa-solid.fa-face-smile",
    );

    eventSource.on("settings_updated", async () => {
        const response = await fetch("/api/settings/get", {
            method: "POST",
            headers: getRequestHeaders(),
            body: JSON.stringify({}),
            cache: "no-cache",
        });

        if (!response.ok) {
            toastr.error(
                "Settings could not be loaded. Try reloading the page.",
            );
            throw new Error("Error getting settings.");
        }

        let settings = await response
            .json()
            .then((data) => JSON.parse(data.settings));
        let avatar_img = getUserAvatar(settings.user_avatar);

        $persona_button.innerHTML = `<img class='persona_avatar' src='${avatar_img}'/>`;
        $persona_button.insertAdjacentHTML(
            "beforeend",
            `<span>${name1}</span>`,
        );
    });

    $persona_button.addEventListener("click", () => {
        $persona_button
            .closest(".drawer-content")
            .classList.toggle("closedDrawer openDrawer");
    });
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

async function initSettings() {
    const $settings = document.querySelector("#extensions_settings2");
    await fetch(`${extensionFolderPath}/html/settings.html`)
        .then((data) => data.text())
        .then((data) => {
            $settings.insertAdjacentHTML("beforeend", data);
        });

    const $rename_chats = document.querySelector("#rename_chats");
    const $enable_nudges = document.querySelector("#enable_nudges");
    const $api_key_chub = document.querySelector("#api_key_chub");

    $rename_chats.addEventListener("click", () => {
        extension_settings[extensionName].rename_chats = $rename_chats.checked;
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
    var settingsChanged = false;

    for (const key in default_settings) {
        if (!(key in extension_settings[extensionName])) {
            extension_settings[extensionName][key] = default_settings[key];
            settingsChanged = true;
        }
    }

    if (settingsChanged) saveSettingsDebounced();

    if (extension_settings[extensionName].rename_chats) $rename_chats.click();
    if (extension_settings[extensionName].enable_nudges) $enable_nudges.click();
}

function loadSplashText() {
    const splashes = [
        "desu~",
        "desu~!",
        "DESU~!",
        "Jimmy Apples!",
        "Sam Altman!",
        "ChatGPT is better!",
        "Splash Text!",
        "The Singularity!",
        "AGI!",
        "Shocking!",
        "Shocking the industry!",
        "e/acc!",
        "Acceleration!",
        "AGI achieved internally!",
        "Q*!",
        "GPT-7!",
        "Chinchilla scaling!",
        "Low perplexity!",
        "AUPATE!",
        "Ethnnically Anbigious!",
        "eethnically amboruaius!",
        "Laver huling nnuctiol!",
        "Costco Wholeslale!",
        "CFTF?",
        "Foxbots doko?",
        "OpenAI BTFO!",
        "Anthropic BTFO!",
        "1 morbillion token context!",
        "Summer Dragon!",
        "ahh ahh mistress!",
        "My model has 24 parameters!",
        "NVIDIA, fuck you!",
        "TPUs!",
        "ClosedAI!",
        "175 Beaks!",
        "1.7 Toucans!",
        "Will Smith eating spaghetti!",
        "SOVL!",
        "SOVLLESS!",
        "Rugpulled!",
        "Fiz love!",
        "$7 Trillion!",
        "Feel the AGI!",
        "Reddit\\nSpacing!",
        "Also try NovelAI!",
        "Also try AetherRoom!",
        "AIIIEEEEEEEE!",
        "We're back!",
        "We're so back!",
        "It's over!",
        "It's so over!",
        "Can generate hands!",
        "Slight twist on the upstroke!",
        "(´• ω •`)",
        "(´- ω -`)",
        "(`・ω・´)",
        "Big if true!",
        "Meta BTFO!",
        "Groq!",
        "Grok?",
        "0.99 p(doom)!",
        "Anchor!",
        "No meanies allowed!",
        "The Rock eating rocks!",
        "Malfoy's last name!",
        "Todd Howard!",
        "DeepMind BTFO!",
        "sillylittleguy.org!",
        "I kneel!",
        "Where bake?",
        "Focksposting!",
        "struggling to conceptualize the thickness of her bush...",
        "Anti love!",
        "GPT-2 was very bad!",
        "GPT-3 was pretty bad!",
        "GPT-4 is bad!",
        "GPT-4 kind of sucks!",
        "GPT-5 is okay!",
        "Count Grey!",
        "Google Colab!",
        "Also try AI Dungeon!",
        "Her!",
        "GPT-4o(mni)!",
        "I'm a good GPT2 chatbot!",
        "I'm also a good GPT2 chatbot!",
        "Pepsi love!",
        "MysteryMan!",
        "Cloudy is open on the weekends!",
        "R.I.P. Desu!",
        "R.I.P. Scrappy!",
        "Total locust death!",
        "Post burners!",
        "thoughbeit!",
        "Slop!",
        "Coomageddon!",
        "Boku!",
        "Desu!",
        "Boku Desu!",
        "Beff Jezos!",
        "Cuteposting!",
        "Sorry, I can't help with that request!",
        "AI Safety?",
        "ASI!",
        "SSI!",
        "What did Ilya see?",
        "Artificial General Intelligence!",
        "Artificial Superintelligence!",
        "Safe Superintelligence!",
        "Mixture of Experts!",
        "Mixture of Agents!",
        "Mixture of Depths!",
        "Mixture of Depths and Experts!",
        "MoE!",
        "MoA!",
        "MoD!",
        "MoDE!",
        "Safety Sex Cult!",
        "Feel the AGI!",
        "Emergent capabilities!",
        "I'm sorry, but as an AI language model I can't do X, Y, and Z!",
    ];

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

    eventSource.on("character_message_rendered", async () => {
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
    eventSource.on("character_message_rendered", addChatHeader);
    eventSource.on("message_deleted", addChatHeader);
    eventSource.on("message_swiped", addChatHeader);
}

function moveSwipeButtons() {
    function handleSwipe(event) {
        const $chat = document.querySelector("#chat");
        const swipeDirection = event.target.matches(".mes_swipe_left")
            ? ".swipe_left"
            : ".swipe_right";
        $chat.querySelector(`.last_mes ${swipeDirection}`).click();
    }

    function registerSwipeButtons() {
        const $chat = document.querySelector("#chat");
        const $mes_swipe_left = $chat.querySelector(
            ".last_mes .mes_swipe_left",
        );
        const $mes_swipe_right = $chat.querySelector(
            ".last_mes .mes_swipe_right",
        );

        $mes_swipe_left.addEventListener("click", handleSwipe);
        $mes_swipe_right.addEventListener("click", handleSwipe);
    }

    const $mesTemplate = document.querySelector("#message_template");
    const $mesButtons = $mesTemplate.querySelector(".mes_buttons");
    const $mesEditButtons = $mesTemplate.querySelector(".mes_edit_buttons");

    $mesButtons.insertAdjacentHTML(
        "afterbegin",
        `<div class="flex-container swipes">
            <div class="mes_swipe_left fa-solid fa-chevron-left"></div>
            <div class="swipes-counter">1/1</div>
            <div class="mes_swipe_right fa-solid fa-chevron-right"></div>
        </div>`,
    );
    $mesTemplate.querySelector(".mes_text").after($mesButtons, $mesEditButtons);

    eventSource.on("chatLoaded", registerSwipeButtons);
    eventSource.on("character_message_rendered", registerSwipeButtons);
    eventSource.on("message_deleted", registerSwipeButtons);
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
            default:
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

    const $sheld = document.querySelector("#sheld");
    $sheld.setAttribute("tabindex", "0");
    $sheld.addEventListener("keydown", (event) => {
        if (!$sheld.querySelector("textarea").matches(":focus")) {
            switch (event.key) {
                case "ArrowLeft":
                    $sheld.querySelector(".last_mes .swipe_left").click();
                    break;
                case "ArrowRight":
                    $sheld.querySelector(".last_mes .swipe_right").click();
                    break;
                default:
                    break;
            }
        }
    });

    eventSource.on("generation_started", checkWaifuVisibility);
    eventSource.on("chat_id_changed", checkWaifuVisibility);
}

if (document.readyState === "complete") {
    main();
} else {
    document.addEventListener("DOMContentLoaded", main, { once: true });
}
