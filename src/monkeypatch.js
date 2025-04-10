import { patchedDoNavbarIconClick } from './monkeypatch/navbar.js';

function monkeyPatchDrawerToggle() {
    console.log('Applying drawer toggle patch...');

    const allDrawers = document.querySelectorAll('.drawer-toggle');
    allDrawers.forEach(element => {
        $(element).off('click');
        element.addEventListener('click', patchedDoNavbarIconClick);
    });

    console.log(`Patched click listener added to ${allDrawers.length} elements.`);
}

export function monkeyPatch() {
    monkeyPatchDrawerToggle();
}
