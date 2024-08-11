import { getRequestHeaders, processDroppedFiles } from "../../../../script.js";
import { debounce_timeout } from "../../../constants.js";
import { extension_settings } from "../../../extensions.js";
import { POPUP_TYPE, callGenericPopup } from "../../../popup.js";
import { debounce, delay } from "../../../utils.js";
import { extensionFolderPath, extensionName } from "./index.js";

async function setupExplorePanel() {
    let characters = [];
    let totalCharactersLoaded = 0;
    let isLoading = false;

    async function downloadCharacter(input) {
        const url = `https://www.chub.ai/characters/${input.trim()}`;
        toastr.info(`Downloading ${input}...`);

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

    function generateCharacterListItem(character, index) {
        return `
            <div class="character-list-item" data-index="${index}">
                <div class="thumbnail">
                    <img src="${character.avatar}">
                    <div data-path="${character.fullPath}" class="menu_button menu_button_icon download-btn wide100p">
                        <i class="fa-solid fa-cloud-arrow-down"></i>
                        <span data-i18n="Download">Download</span>
                    </div>
                </div>
                <div class="info">
                    <div class="name">${character.name || "Default Name"}
                    <span class="creator">by ${character.creator}</span>
                </div>
                <div class="tagline">${character.tagline}</div>
                <div class="tags">
                ${character.tags
                    .map((tag) =>
                        document
                            .querySelector("#includeTags")
                            .value.includes(tag.toLowerCase())
                            ? `<span class="tag included">${tag}</span>`
                            : `<span class="tag">${tag}</span>`,
                    )
                    .join("")}
                </div>
                </div>
            </div>
        `;
    }

    async function generateCharacterPopup(character) {
        const generateStarRating = (rating) => {
            const fullStars = Math.floor(rating);
            const halfStar = rating % 1 >= 0.5 ? 1 : 0;

            let starsHTML = "";
            for (let i = 0; i < fullStars; i++) {
                starsHTML += '<i class="fa-solid fa-star"></i>';
            }

            if (halfStar) {
                starsHTML += '<i class="fa-solid fa-star-half-stroke"></i>';
            }

            return starsHTML;
        };

        const popupHTML = `<div class="flex-container chub-popup">
                <div>
                    <img src="${character.url}" alt="${character.name}">
                    <div data-path="${character.fullPath}" class="menu_button menu_button_icon download-btn wide100p">
                        <i class="fa-solid fa-cloud-arrow-down"></i>
                        <span data-i18n="Download">Download</span>
                    </div>
                    <div class="chub-text-align">
                        ${generateStarRating(character.rating)} ${character.rating}/5
                    </div>
                    <div class="chub-text-align">
                        <i class="fa-solid ${character.rating > 3 ? `fa-thumbs-up` : `fa-thumbs-down`}"></i>
                        <span>${character.numRatings} ratings</span>
                    </div>
                    <div class="chub-text-align">
                        <i class="fa-solid fa-star"></i>
                        <span>${character.starCount} stars</span>
                    </div>
                    <div class="chub-text-align">
                        <i class="fa-solid fa-heart"></i>
                        <span>${character.numfavorites} favorites</span>
                    </div>
                </div>
                <div class="chub-padding">
                    <div>
                        <h3>${character.name}</h3>
                        <h5>by ${character.creator}</h5>
                    </div>
                    <div class="chub-text-align">
                        <p>${character.tagline}</p>
                        <p>${character.description}</p>
                    </div>
                    <p class="tags">
                    ${character.tags
                        .map((tag) =>
                            document
                                .querySelector("#includeTags")
                                .value.includes(tag.toLowerCase())
                                ? `<span class="tag included">${tag}</span>`
                                : `<span class="tag">${tag}</span>`,
                        )
                        .join("")}
                    </p>
                    <p class="chub-nowrap">
                        <i class="fa-solid fa-book"></i>
                        <span>${character.numTokens} tokens</span>
                        <i class="fa-solid fa-cake-candles"></i>
                        <span>Created ${new Date(character.createdAt).toLocaleDateString()}</span>
                        <i class="fa-solid fa-pen-nib"></i>
                        <span>Last Updated ${new Date(character.lastActivityAt).toLocaleDateString()}</span>
                    </p>
                </div>
            </div>
            `;

        await callGenericPopup(popupHTML, POPUP_TYPE.DISPLAY, "", {
            wider: true,
            allowVerticalScrolling: true,
        }).then(
            document
                .querySelector(".chub-popup")
                .addEventListener("click", (event) => {
                    const downloadButton =
                        event.target.closest(".download-btn");
                    if (downloadButton) {
                        downloadCharacter(
                            downloadButton.getAttribute("data-path"),
                        );
                    }
                }),
        );
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
        if (reset) {
            characters = [];
            totalCharactersLoaded = 0;
        }

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

        const newCharacters = [];
        let characterPromises = searchData.nodes.map(
            async (node) =>
                await fetch("https://api.chub.ai/api/characters/download", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        fullPath: node.fullPath,
                        format: "tavern",
                        version: "main",
                    }),
                })
                    .catch(async () => {
                        toastr.warning(
                            `CHub API request failed, trying backup endpoint...`,
                        );
                        return await fetch(
                            `https://avatars.charhub.io/avatars/${node.fullPath}/avatar.webp`,
                            {
                                method: "GET",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                            },
                        );
                    })
                    .then((response) => response.blob()),
        );
        let characterBlobs = await Promise.all(characterPromises);

        characterBlobs.forEach((character, i) => {
            let imageUrl = URL.createObjectURL(character);
            newCharacters.push({
                url: imageUrl,
                avatar: searchData.nodes[i].avatar_url,
                description: searchData.nodes[i].description,
                tagline: searchData.nodes[i].tagline || "No tagline found.",
                name: searchData.nodes[i].name,
                fullPath: searchData.nodes[i].fullPath,
                tags: searchData.nodes[i].topics,
                creator: searchData.nodes[i].fullPath.split("/")[0],
                starCount: searchData.nodes[i].starCount,
                lastActivityAt: searchData.nodes[i].lastActivityAt,
                createdAt: searchData.nodes[i].createdAt,
                numTokens: searchData.nodes[i].nTokens,
                numfavorites: searchData.nodes[i].n_favorites,
                rating: searchData.nodes[i].rating,
                numRatings: searchData.nodes[i].ratingCount,
            });
        });
        characters.push(...newCharacters);

        $characterList.classList.remove("searching");

        if (newCharacters && newCharacters.length > 0) {
            const characterHTML = newCharacters
                .map((character, index) =>
                    generateCharacterListItem(
                        character,
                        totalCharactersLoaded + index,
                    ),
                )
                .join("");

            if (reset) {
                $characterList.innerHTML = characterHTML;
                $characterList.scrollTop = 0;
            } else {
                $characterList.insertAdjacentHTML("beforeend", characterHTML);
            }

            totalCharactersLoaded += newCharacters.length;
        } else {
            toastr.error("No characters found.");
        }

        if (callback && typeof callback === "function") {
            callback();
        }
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

    function infiniteScroll(event) {
        if (isLoading) return;
        const $characterList = document.querySelector(
            "#list-and-search-wrapper .character-list",
        );
        const $pageNumber = document.querySelector("#pageNumber");
        const scrollThreshold = 50;

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

    function handleCharacterClick(event) {
        const target = event.target;
        const nameClicked = target.matches(".name");
        const avatarClicked = target.matches(".thumbnail img");
        const downloadButtonClicked = target.closest(".download-btn");
        const tagClicked = target.matches(".tag");
        const creatorClicked = target.matches(".creator");

        if (nameClicked || avatarClicked) {
            const index = parseInt(
                target
                    .closest(".character-list-item")
                    .getAttribute("data-index"),
            );
            generateCharacterPopup(characters[index]);
        } else if (downloadButtonClicked) {
            downloadCharacter(downloadButtonClicked.getAttribute("data-path"));
        } else if (tagClicked) {
            const $tags = $searchWrapper.querySelector("#includeTags");
            const tagText = target.textContent.toLowerCase();

            if (target.classList.contains("included")) {
                target.classList.remove("included");
                $tags.value = $tags.value
                    .split(",")
                    .map((tags) => tags.trim())
                    .filter((tags) => tags !== tagText)
                    .join(", ");
            } else {
                $tags.value += `${tagText}, `;
            }

            $pageNumber.value = 1;
            search(event, true);
        } else if (creatorClicked) {
            const username = target.textContent.toLowerCase().split(" ")[1];
            const $searchTerm = $searchWrapper.querySelector(
                "#characterSearchInput",
            );
            const $creatorSearch =
                $searchWrapper.querySelector("#creatorSearch");
            const $tags = $searchWrapper.querySelector("#includeTags");
            const $excludedTags = $searchWrapper.querySelector("#excludeTags");

            $searchTerm.value = "";
            $creatorSearch.value = `${username}`;
            $tags.value = "";
            $excludedTags.value = "";
            $pageNumber.value = 1;
            search(event, true);
        }
    }

    const infiniteScrollDebounced = debounce(
        (event) => infiniteScroll(event),
        debounce_timeout.quick,
    );

    const $searchWrapper = document.querySelector("#list-and-search-wrapper");
    const $characterList = $searchWrapper.querySelector(".character-list");
    const $pageNumber = $searchWrapper.querySelector("#pageNumber");

    $searchWrapper
        .querySelectorAll(
            "#characterSearchInput, #creatorSearch, #namespace, #includeTags, #excludeTags, #findCount, #sortOrder, #nsfwCheckbox",
        )
        .forEach((element) => {
            element.addEventListener("change", (event) => {
                $pageNumber.value = 1;
                search(event, true);
            });
        });

    $searchWrapper
        .querySelector("#characterSearchButton")
        .addEventListener("click", (event) => {
            $pageNumber.value = 1;
            search(event, true);
        });

    $characterList.addEventListener("scroll", infiniteScrollDebounced);
    $characterList.addEventListener("click", handleCharacterClick);
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
