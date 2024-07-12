import { getRequestHeaders, processDroppedFiles } from "../../../../script.js";
import { debounce_timeout } from "../../../constants.js";
import { extension_settings } from "../../../extensions.js";
import { debounce, delay } from "../../../utils.js";
import { extensionFolderPath, extensionName } from "./index.js";

async function setupExplorePanel() {
    async function getCharacter(fullPath) {
        let response = await fetch(
            "https://api.chub.ai/api/characters/download",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    fullPath: fullPath,
                    format: "tavern",
                    version: "main",
                }),
            },
        );

        if (!response.ok) {
            console.log(
                `Request failed for ${fullPath}, trying backup endpoint`,
            );
            response = await fetch(
                `https://avatars.charhub.io/avatars/${fullPath}/avatar.webp`,
                {
                    method: "GET",
                    headers: {
                        "Content-Type": "application/json",
                    },
                },
            );
        }

        let data = await response.blob();
        return data;
    }

    async function downloadCharacter(input) {
        const url = `https://www.chub.ai/characters/${input.trim()}`;
        console.debug("Custom content import started for", url);

        let request = null;
        request = await fetch("/api/content/importURL", {
            method: "POST",
            headers: getRequestHeaders(),
            body: JSON.stringify({ url }),
        });

        if (!request.ok) {
            toastr.info(
                "Click to go to the character page",
                "Custom content import failed",
                { onmousedown: () => window.open(url, "_blank") },
            );
            console.error(
                "Custom content import failed",
                request.status,
                request.statusText,
            );
            return;
        }

        const data = await request.blob();
        const customContentType = request.headers.get("X-Custom-Content-Type");
        const fileName = request.headers
            .get("Content-Disposition")
            .split("filename=")[1]
            .replace(/"/g, "");
        const file = new File([data], fileName, { type: data.type });

        switch (customContentType) {
            case "character":
                processDroppedFiles([file]);
                break;
            default:
                toastr.warning("Unknown content type");
                console.error("Unknown content type", customContentType);
                break;
        }
    }

    async function fetchCharacters(
        {
            searchTerm,
            namespace,
            creator,
            includeTags,
            excludeTags,
            nsfw,
            sort,
            findCount,
            page = 1,
        },
        reset,
        callback,
    ) {
        const $characterList = document.querySelector(
            "#list-and-search-wrapper .character-list",
        );

        $characterList.classList.add("searching");

        console.log("Search options:", options);
        toastr.info(`Searching...`);

        searchTerm = searchTerm
            ? `search=${searchTerm.replace(/ /g, "+")}&`
            : "";
        creator = creator ? `&username=${creator}` : "";
        sort = sort || "download_count";

        let url = `https://api.chub.ai/api/${namespace}/`;
        url += `search?${searchTerm}`;
        url += `&namespace=${namespace}`;
        url += `${creator}`;
        url += `&first=${findCount}`;
        url += `&page=${page}`;
        url += `&sort=${sort}`;
        url += `&asc=false`;
        url += `&include_forks=true`;
        url += `&venus=true&chub=true`;
        url += `&nsfw=${nsfw}&nsfl=${nsfw}`;
        url += `&nsfw_only=false`;
        url += `&require_images=false`;
        url += `&require_example_dialogues=false`;
        url += `&require_alternate_greetings=false`;
        url += `&require_custom_prompt=false`;
        url += `&require_lore=false`;
        url += `&require_lore_embedded=false`;
        url += `&require_lore_linked=false`;

        includeTags = includeTags.filter((tag) => tag.length > 0);
        if (includeTags && includeTags.length > 0) {
            url += `&topics=${encodeURIComponent(includeTags.join(",").slice(0, 100))}`;
        }
        excludeTags = excludeTags.filter((tag) => tag.length > 0);
        if (excludeTags && excludeTags.length > 0) {
            url += `&excludetopics=${encodeURIComponent(excludeTags.join(",").slice(0, 100))}`;
        }

        const chubApiKey = extension_settings[extensionName].api_key_chub;
        let searchData = await fetch(url, {
            headers: {
                "CH-API-KEY": chubApiKey,
                samwise: chubApiKey,
            },
        }).then((data) => data.json());

        const characters = [];

        let characterPromises = searchData.nodes.map((node) =>
            getCharacter(node.fullPath),
        );
        let characterBlobs = await Promise.all(characterPromises);

        characterBlobs.forEach((character, i) => {
            let imageUrl = URL.createObjectURL(character);
            characters.push({
                url: imageUrl,
                description:
                    searchData.nodes[i].tagline || "No description found.",
                name: searchData.nodes[i].name,
                fullPath: searchData.nodes[i].fullPath,
                tags: searchData.nodes[i].topics,
                creator: searchData.nodes[i].fullPath.split("/")[0],
            });
        });

        $characterList.classList.remove("searching");

        if (characters && characters.length > 0) {
            const characterHTML = characters
                .map(generateCharacterListItem)
                .join("");

            if (reset) {
                $characterList.innerHTML = characterHTML;
                $characterList.scrollTop = 0;
            } else {
                $characterList.insertAdjacentHTML("beforeend", characterHTML);
            }

            $characterList
                .querySelectorAll(".download-btn")
                .forEach((button) => {
                    button.addEventListener("click", () => {
                        downloadCharacter(button.getAttribute("data-path"));
                    });
                });

            $characterList.querySelectorAll(".tag").forEach((tag) => {
                const $included = document.querySelector("#includeTags");
                const tagText = tag.innerHTML.toLowerCase();

                tag.addEventListener("click", (event) => {
                    if (tag.classList.contains("included")) {
                        tag.classList.remove("included");
                        $included.value = $included.value
                            .split(",")
                            .map((tags) => tags.trim())
                            .filter((tags) => tags !== tagText)
                            .join(", ");
                    } else {
                        $included.value += `${tagText}, `;
                    }
                    search(event, true);
                });
            });

            $characterList.querySelectorAll(".creator").forEach((creator) => {
                const $searchWrapper = document.querySelector(
                    "#list-and-search-wrapper",
                );
                const $searchTerm = $searchWrapper.querySelector(
                    "#characterSearchInput",
                );
                const $creatorSearch =
                    $searchWrapper.querySelector("#creatorSearch");
                const $tags = $searchWrapper.querySelector("#includeTags");
                const $excludedTags =
                    $searchWrapper.querySelector("#excludeTags");
                const username = creator.innerHTML.toLowerCase().split(" ")[1];

                creator.addEventListener("click", (event) => {
                    $searchTerm.value = "";
                    $creatorSearch.value = `${username}`;
                    $tags.value = "";
                    $excludedTags.value = "";
                    search(event, true);
                });
            });
        } else {
            toastr.info("No characters found.");
        }

        if (callback && typeof callback === "function") {
            callback();
        }
    }

    function generateCharacterListItem(character, index) {
        return `
            <div class="character-list-item" data-index="${index}">
                <img class="thumbnail" src="${character.url}">
                <div class="info">
                    <a href="https://chub.ai/characters/${character.fullPath}" target="_blank"><div class="name">${character.name || "Default Name"}</a>
                    <span class="creator">by ${character.creator}</span>
                    <div data-path="${character.fullPath}" class="menu_button download-btn fa-solid fa-cloud-arrow-down faSmallFontSquareFix"></div>
                </div>
                <div class="description">${character.description}</div>
                <div class="tags">${character.tags
                    .map((tag) =>
                        document
                            .querySelector("#includeTags")
                            .value.includes(tag.toLowerCase())
                            ? `<span class="tag included">${tag}</span>`
                            : `<span class="tag">${tag}</span>`,
                    )
                    .join("")}</div>
                </div>
            </div>
        `;
    }

    function search(event, reset, callback) {
        if (
            event.type === "keydown" &&
            event.key !== "Enter" &&
            event.target.id !== "includeTags" &&
            event.target.id !== "excludeTags"
        ) {
            return;
        }
        const $searchWrapper = document.querySelector(
            "#list-and-search-wrapper",
        );

        const fetchCharactersDebounced = debounce(
            (options, reset, callback) =>
                fetchCharacters(options, reset, callback),
            debounce_timeout.standard,
        );
        console.log("Search event:", event);

        const splitAndTrim = (str) => {
            str = str.trim();
            if (!str.includes(",")) {
                return [str];
            }
            return str.split(",").map((tag) => tag.trim());
        };

        const searchTerm = $searchWrapper.querySelector(
            "#characterSearchInput",
        ).value;
        const creator = $searchWrapper.querySelector("#creatorSearch").value;
        const namespace = $searchWrapper.querySelector("#namespace").value;
        const includeTags = splitAndTrim(
            $searchWrapper.querySelector("#includeTags").value,
        );
        const excludeTags = splitAndTrim(
            $searchWrapper.querySelector("#excludeTags").value,
        );
        const nsfw = $searchWrapper.querySelector("#nsfwCheckbox").checked;
        const findCount = $searchWrapper.querySelector("#findCount").value;
        const sort = $searchWrapper.querySelector("#sortOrder").value;
        let page = $searchWrapper.querySelector("#pageNumber").value;

        fetchCharactersDebounced(
            {
                searchTerm,
                namespace,
                creator,
                includeTags,
                excludeTags,
                nsfw,
                findCount,
                sort,
                page,
            },
            reset,
            callback,
        );
    }

    function searchHandler(event) {
        const $pageNumber = document.querySelector("#pageNumber");
        switch (true) {
            case event.target.matches("#pageUpButton"):
                $pageNumber.value = Math.max(
                    1,
                    parseInt($pageNumber.value.toString()) + 1,
                );
                search(event, false);
                break;
            case event.target.matches("#pageDownButton"):
                $pageNumber.value = Math.max(
                    1,
                    parseInt($pageNumber.value.toString()) - 1,
                );
                search(event, false);
                break;
            default:
                $pageNumber.value = 1;
                search(event, true);
                break;
        }
    }

    let isLoading = false;
    function infiniteScroll(event) {
        if (isLoading) return;
        const $characterList = document.querySelector(
            "#list-and-search-wrapper .character-list",
        );
        const $pageNumber = document.querySelector("#pageNumber");
        const scrollThreshold = 100;

        const distanceFromBottom =
            $characterList.scrollHeight -
            ($characterList.scrollTop + $characterList.clientHeight);

        if (distanceFromBottom <= scrollThreshold) {
            isLoading = true;
            $pageNumber.value = Math.max(
                1,
                parseInt($pageNumber.value.toString()) + 1,
            );
            search(event, false, () => {
                isLoading = false;
            });
        }
    }

    function popupImageHandler(event) {
        const $characterList = document.querySelector(
            "#list-and-search-wrapper .character-list",
        );

        if (event.target.tagName === "IMG") {
            const image = event.target;

            if (popupImage) {
                $characterList.removeChild(popupImage);
                popupImage = null;
                return;
            }

            const rect = image.getBoundingClientRect();

            popupImage = image.cloneNode(true);
            popupImage.style.position = "absolute";
            popupImage.style.top = `${rect.top + window.scrollY}px`;
            popupImage.style.left = `${rect.left + window.scrollX}px`;
            popupImage.style.zIndex = "99999";
            popupImage.style.objectFit = "contain";

            $characterList.appendChild(popupImage);

            event.stopPropagation();
        }
    }

    const infiniteScrollDebounced = debounce(
        (event) => infiniteScroll(event),
        debounce_timeout.quick,
    );
    let popupImage = null;

    const $searchWrapper = document.querySelector("#list-and-search-wrapper");
    const $characterList = $searchWrapper.querySelector(".character-list");
    const $pageNumber = $searchWrapper.querySelector("#pageNumber");

    $searchWrapper
        .querySelectorAll(
            "#characterSearchInput, #creatorSearch, #namespace, #includeTags, #excludeTags, #findCount, #sortOrder, #nsfwCheckbox",
        )
        .forEach((element) => {
            element.addEventListener("change", searchHandler);
        });

    $searchWrapper
        .querySelector("#characterSearchButton")
        .addEventListener("click", searchHandler);

    $characterList.addEventListener("scroll", infiniteScrollDebounced);
    $characterList.addEventListener("click", popupImageHandler);

    $characterList.scrollTop = 0;
    $pageNumber.value = 1;
}

export async function loadExplorePanel() {
    let exploreFirstOpen = true;
    await fetch(`${extensionFolderPath}/html/explore.html`)
        .then((data) => data.text())
        .then((data) => {
            document
                .querySelector("#top-settings-holder")
                .insertAdjacentHTML("beforeend", data);
        });
    setupExplorePanel();

    const $explore_toggle = document.querySelector(
        "#explore-button .drawer-toggle",
    );
    $explore_toggle.addEventListener("click", () => {
        const icon = $explore_toggle.querySelector(".drawer-icon");
        const drawer =
            $explore_toggle.parentNode.querySelector(".drawer-content");
        const drawerOpen = drawer.classList.contains("openDrawer");

        if (drawer.classList.contains("resizing")) return;

        if (!drawerOpen) {
            //need jQuery here for .slideToggle(), otherwise panel breaks
            $(".openDrawer")
                .not(".pinnedOpen")
                .addClass("resizing")
                .slideToggle(200, "swing", async () => {
                    await delay(50);
                    $(".drawer-content.resizing").removeClass("resizing");
                });

            if (
                document.querySelector(
                    ".drawer:has(.openIcon):has(.openDrawer)",
                )
            ) {
                document
                    .querySelector(".openIcon")
                    .classList.replace("openIcon", "closedIcon");
                document
                    .querySelector(".openDrawer")
                    .classList.replace("openDrawer", "closedDrawer");
            }

            $(drawer)
                .addClass("resizing")
                .slideToggle(200, "swing", async () => {
                    await delay(50);
                    $(drawer).removeClass("resizing");
                });

            icon.classList.replace("closedIcon", "openIcon");
            drawer.classList.replace("closedDrawer", "openDrawer");

            if (exploreFirstOpen) {
                drawer.querySelector("#characterSearchButton").click();
                exploreFirstOpen = false;
            }
        } else if (drawerOpen) {
            icon.classList.replace("openIcon", "closedIcon");

            $(drawer)
                .addClass("resizing")
                .slideToggle(200, "swing", async () => {
                    await delay(50);
                    $(drawer).removeClass("resizing");
                });

            drawer.classList.replace("openDrawer", "closedDrawer");
        }
    });
}
