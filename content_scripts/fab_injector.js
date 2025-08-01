// file: content_scripts/fab_injector.js
// Version: Differentiates Minimize "—" and Hard Close "X" panel actions.

(function() {
    const SCRIPT_SINGLETON_FLAG = '__fundingflock_FAB_PANEL_INITIALIZED_V2_4_MIN_MAX_DISTINCTION__';

    if (window[SCRIPT_SINGLETON_FLAG]) {
        return;
    }
    window[SCRIPT_SINGLETON_FLAG] = true;

    const FAB_ID = 'fundingflock-fab-container';
    const FAB_STORAGE_KEY_VERTICAL_POSITION = 'fundingflockFabVerticalPosition';
    const PANEL_HOST_ID = 'fundingflock-panel-host';
    const PANEL_IFRAME_ID = 'fundingflock-panel-iframe';
    const PANEL_CONTAINER_CLASS = 'fundingflock-panel-shell';
    const PANEL_CLOSE_BUTTON_ID = 'fundingflock-panel-close-btn'; // The 'X' button
    const PANEL_MINIMIZE_BUTTON_ID = 'fundingflock-panel-minimize-btn'; // The '—' button
    const PANEL_HEADER_ICON_ID = 'fundingflock-panel-header-icon';
    const PANEL_TITLE_ID = 'fundingflock-panel-title';
    const PANEL_MAIN_MENU_BUTTON_ID = 'fundingflock-panel-main-menu-btn';

    const AUTOFILL_TUTORIAL_FLAG_KEY = 'hasCompletedFirstRunTutorialV2';

    const DEFAULT_PANEL_WIDTH = '420px';
    const TAILOR_RESUME_PANEL_WIDTH = '950px'; // Standard WIDE view for complex UIs

    let fabElement, fabButton;
    let panelHostElement, panelShadowRoot, panelContainerElement, panelIframeElement,
        panelHeaderIconElement, panelCloseButtonElement, panelTitleElement, panelMinimizeButtonElement,
        panelMainMenuButtonElement;

    let currentTheme = 'light';
    let isFabDragging = false;
    let dragMoveHandler, dragEndHandler;
    let isFabExplicitlyHiddenByAction = false;
    const FAB_HIDDEN_STORAGE_KEY_PREFIX = 'fundingflockFabHiddenState_';

    const CACHED_RSRC_URLS = {
        fab_icon_neutral: null, panel_css: null,
        panel_header_icon_light: null, panel_header_icon_dark: null,
        default_favicon: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    };
    let resourceUrlsInitialized = false;

    function isContentScriptContextValid() {
        return !!(chrome.runtime && chrome.runtime.id && document.body && window && window.parent);
    }

    async function tryInitializeResourceURLsOnce() {
        if (resourceUrlsInitialized || !isContentScriptContextValid()) return resourceUrlsInitialized;
        try {
            CACHED_RSRC_URLS.fab_icon_neutral = chrome.runtime.getURL('icons/fab_logo_neutral.png');
            CACHED_RSRC_URLS.panel_css = chrome.runtime.getURL('content_scripts/panel_styles.css');
            CACHED_RSRC_URLS.panel_header_icon_light = chrome.runtime.getURL('icons/icon48.png');
            CACHED_RSRC_URLS.panel_header_icon_dark = chrome.runtime.getURL('icons/icon48.png');
            resourceUrlsInitialized = true;
        } catch (e) { resourceUrlsInitialized = false; }
        return resourceUrlsInitialized;
    }

    function applyFabThemeColors(theme) {
        if (!fabButton || !document.body.contains(fabButton)) return;
        currentTheme = theme;
        if (CACHED_RSRC_URLS.fab_icon_neutral) {
            fabButton.style.setProperty('--fab-icon-url', `url('${CACHED_RSRC_URLS.fab_icon_neutral}')`);
        }
        fabButton.style.setProperty('--fab-bg-color', theme === 'dark' ? '#3A5060' : '#F0F4F8');
        fabButton.style.setProperty('--fab-outline-color', theme === 'dark' ? '#556878' : '#2F4858');
    }

    function getFabHiddenStorageKeyForCurrentOrigin() {
        try {
            if (window.location && window.location.href && typeof window.location.href === 'string') {
                 const currentOrigin = new URL(window.location.href).origin;
                 return FAB_HIDDEN_STORAGE_KEY_PREFIX + currentOrigin;
            }
        } catch (e) {  }
        return FAB_HIDDEN_STORAGE_KEY_PREFIX + "default_origin_fallback";
    }

    function toggleFabActualVisibility(forceShow = null) {
        if (!fabElement || !document.body.contains(fabElement)) {
            if (typeof createAndSetupFAB === 'function' && fabButton === undefined) {
                createAndSetupFAB();
                if (!fabElement || !document.body.contains(fabElement)) {
                    console.error("[FabInjector] toggleFabActualVisibility: FAB still not available after attempting creation.");
                    return;
                }
            } else if (!fabElement || !document.body.contains(fabElement)){
                console.error("[FabInjector] toggleFabActualVisibility: FAB element critically missing.");
                return;
            }
        }

        let fabHiddenStorageKey = getFabHiddenStorageKeyForCurrentOrigin();

        if (forceShow !== null) {
            isFabExplicitlyHiddenByAction = !forceShow;
        } else {
            isFabExplicitlyHiddenByAction = !isFabExplicitlyHiddenByAction;
        }

        fabElement.style.display = isFabExplicitlyHiddenByAction ? 'none' : 'flex';

        if (chrome.storage && chrome.storage.local) {
            let stateToSave = {};
            stateToSave[fabHiddenStorageKey] = isFabExplicitlyHiddenByAction;
            chrome.storage.local.set(stateToSave, () => {
                if (chrome.runtime.lastError && isContentScriptContextValid()) {  }
            });
        }

        if (isFabExplicitlyHiddenByAction && panelContainerElement && panelContainerElement.classList.contains('panel-visible')) {
            // This is effectively a minimize request because the FAB action toggle hides the FAB,
            // and if the panel is open, we want it to close (preserve state).
            handlePanelMinimizeRequest();
        }
    }

    async function applyPersistedFabVisibility() {
        if (!fabElement || !document.body.contains(fabElement)) { return; }
        if (chrome.storage && chrome.storage.local) {
            let fabHiddenStorageKey = getFabHiddenStorageKeyForCurrentOrigin();
            chrome.storage.local.get([fabHiddenStorageKey], (result) => {
                 if (!isContentScriptContextValid()) return;
                if (chrome.runtime.lastError) { return; }
                const storedHiddenState = result[fabHiddenStorageKey];
                isFabExplicitlyHiddenByAction = storedHiddenState === true;

                if (fabElement && document.body.contains(fabElement)) {
                    fabElement.style.display = isFabExplicitlyHiddenByAction ? 'none' : 'flex';
                }
            });
        }
    }

    function createAndSetupFAB() {
        if (!document.body || !isContentScriptContextValid()) return;
        let existingFab = document.getElementById(FAB_ID);
        if (existingFab) {
             if (window[SCRIPT_SINGLETON_FLAG] !== true && !fabElement) { try { existingFab.remove(); } catch (e) { /* */ } }
             else if (fabElement && document.body.contains(fabElement)) { return; }
        }

        fabElement = document.createElement('div'); fabElement.id = FAB_ID; fabElement.style.display = 'flex';
        fabButton = document.createElement('div'); fabButton.classList.add('fundingflock-fab');
        fabElement.appendChild(fabButton);
        try { document.body.appendChild(fabElement); }
        catch (e) { console.error("FundingFlock FAB: Failed to append FAB.", e); fabElement = null; fabButton = null; return; }

        let initialMouseY_drag, initialFabTop_drag, startY_clickDetect_drag;
        const handleFabMouseDown = (e) => {
            if (!isContentScriptContextValid() || e.button !== 0 || !fabElement || !document.body.contains(fabElement)) return;
            if (fabElement.style.display === 'none') return;
            if (e.cancelable) e.preventDefault();
            isFabDragging = true; fabElement.classList.add('dragging');
            initialMouseY_drag = e.clientY; initialFabTop_drag = fabElement.getBoundingClientRect().top;
            startY_clickDetect_drag = e.clientY;
            document.addEventListener('mousemove', dragMoveHandler, { passive: false });
            document.addEventListener('mouseup', dragEndHandler, { once: true });
        };
        dragMoveHandler = (e) => {
            if (!isFabDragging || !isContentScriptContextValid() || !fabElement || !document.body.contains(fabElement)) {
                if(isFabDragging){isFabDragging=false; document.removeEventListener('mousemove', dragMoveHandler); if(fabElement)fabElement.classList.remove('dragging');} return;
            }
            if (e.cancelable) e.preventDefault();
            let newY = initialFabTop_drag + (e.clientY - initialMouseY_drag);
            newY = Math.max(0, Math.min(newY, window.innerHeight - fabElement.offsetHeight));
            fabElement.style.top = `${newY}px`;
        };
        dragEndHandler = (e) => {
            document.removeEventListener('mousemove', dragMoveHandler);
            if (!isFabDragging || !fabElement || !document.body.contains(fabElement)) { if (isFabDragging && fabElement) { fabElement.classList.remove('dragging');} isFabDragging = false; return; }
            isFabDragging = false;
            fabElement.classList.remove('dragging');
            if (Math.abs(e.clientY - startY_clickDetect_drag) > 5) {
                saveFabPositionToStorage();
            } else {
                handleFabClickRequest();
            }
        };

        fabElement.removeEventListener('mousedown', handleFabMouseDown);
        fabElement.addEventListener('mousedown', handleFabMouseDown);
        loadFabPositionFromStorage();
        applyPersistedFabVisibility();
        if (typeof loadActiveThemeFromStorageAndApplyToUI === 'function') { loadActiveThemeFromStorageAndApplyToUI(); }
    }

    function handleFabClickRequest() {
    if (!isContentScriptContextValid()) return;

    chrome.storage.local.get([AUTOFILL_TUTORIAL_FLAG_KEY], (result) => {
        if (!isContentScriptContextValid()) return;

        if (result[AUTOFILL_TUTORIAL_FLAG_KEY] === true) {
            // Normal FAB logic
            try {
                chrome.runtime.sendMessage({ type: "FUNDINGFLOCK_FAB_CLICKED_PANEL_TOGGLE_REQUEST" });
            } catch (err) { /* handle error */ }
        } else {
            // First run: Open the tutorial page in a new tab
            try {
                chrome.runtime.sendMessage({ type: "OPEN_AUTOFILL_TUTORIAL" });
            } catch (err) {
                console.error("FundingFlock FAB: Error sending OPEN_AUTOFILL_TUTORIAL message.", err);
            }
        }
    });
}

    // Handles Minimize ("—") button click in panel header

    function handlePanelMinimizeRequest() {
        if (!isContentScriptContextValid()) return;

        const isTailoringView = panelIframeElement && panelIframeElement.src && panelIframeElement.src.includes('tailoring/tailor_proposal.html');

        const proceedWithMinimize = () => {
            try {
                chrome.runtime.sendMessage({ type: "REQUEST_PANEL_MINIMIZE" }, (response) => {
                    // This callback is just to handle potential errors from the send itself.
                    if (chrome.runtime.lastError) {
                        console.warn("Minimize request failed to send:", chrome.runtime.lastError.message);
                    }
                });
            } catch (e) {
                console.warn("FundingFlock Panel: Exception sending REQUEST_PANEL_MINIMIZE.", e);
            }
        };

        if (isTailoringView && panelIframeElement.contentWindow) {
            const onMinimizeReady = (event) => {
            if (event.source === panelIframeElement.contentWindow && event.data.type === 'FUNDINGFLOCK_IFRAME_MINIMIZE_PREPARED') {
                    // *** THIS IS THE BUG FIX ***
                    // Remove the listener as soon as its job is done to prevent a memory leak.
                    window.removeEventListener('message', onMinimizeReady);
                    proceedWithMinimize();
                }
            };

            window.addEventListener('message', onMinimizeReady);

            try {
            panelIframeElement.contentWindow.postMessage({ type: 'FUNDINGFLOCK_PANEL_PREPARE_MINIMIZE' }, '*');
            } catch (e) {
                console.error("[FabInjector] Error posting PREPARE_MINIMIZE message. Minimizing immediately.", e);
                // *** THIS IS THE BUG FIX ***
                // Also remove the listener on failure to prevent it from being orphaned.
                window.removeEventListener('message', onMinimizeReady);
                proceedWithMinimize();
            }
        } else {
            // If not a tailoring view, or content window isn't accessible, proceed immediately.
            proceedWithMinimize();
        }
    }

    // Handles Close ("X") button click in panel header
    function handlePanelHardCloseAndResetRequest() {
        if (!isContentScriptContextValid()) return;

        // Check if the user is in a potentially stateful view
        const isStatefulView = panelIframeElement && panelIframeElement.src && panelIframeElement.src.includes('tailoring/tailor_proposal.html');
        const confirmationMessage = isStatefulView
            ? "Are you sure you want to close the panel?\n\nThis will end the current tailoring session and discard any unsaved changes."
            : "Are you sure you want to close the panel?";

        if (window.confirm(confirmationMessage)) {
            try {
                chrome.runtime.sendMessage({ type: "FUNDINGFLOCK_PANEL_HARD_CLOSE_AND_FULL_RESET" });
            } catch (e) {
                console.warn("FundingFlock Panel: Exception sending hard close/reset request.", e);
            }
        } else {
        }
    }

    function saveFabPositionToStorage() {
        if (!isContentScriptContextValid() || !fabElement || !document.body.contains(fabElement)) {
            return;
        }
        // Get the current position of the FAB from its inline style.
        const currentPosition = { top: fabElement.style.top };

        // Use the same storage key as the loading function.
        try {
            chrome.storage.local.set({ [FAB_STORAGE_KEY_VERTICAL_POSITION]: currentPosition }, () => {
                if (chrome.runtime.lastError) {
                } else {
                }
            });
        } catch (e) {
        }
    }

    function loadFabPositionFromStorage() {
        if (!isContentScriptContextValid() || !fabElement) return;
        try {
            chrome.storage.local.get([FAB_STORAGE_KEY_VERTICAL_POSITION], (result) => {
                if (!isContentScriptContextValid() || !fabElement || !document.body.contains(fabElement)) {
                    if(fabElement) fabElement.style.top = '20px'; return;
                }
                if (chrome.runtime.lastError) { if(fabElement) fabElement.style.top = '20px'; return; }
                if(fabElement) fabElement.style.top = (result[FAB_STORAGE_KEY_VERTICAL_POSITION]?.top) || '20px';
            });
        } catch (e) { if (fabElement) fabElement.style.top = '20px'; }
    }

    function ensurePanelShellExistsAndIsStyled() {
        if (!document.body || !isContentScriptContextValid()) return false;
        if (panelHostElement && panelShadowRoot && document.body.contains(panelHostElement)) {
            if (!panelShadowRoot.querySelector(`.${PANEL_CONTAINER_CLASS}`)) panelShadowRoot.innerHTML = '';
            else return true;
        } else if (panelHostElement && !document.body.contains(panelHostElement)) {
            panelHostElement = panelShadowRoot = null;
        }
        if (!panelHostElement) {
            panelHostElement = document.createElement('div'); panelHostElement.id = PANEL_HOST_ID;
            try { document.body.appendChild(panelHostElement); panelShadowRoot = panelHostElement.attachShadow({ mode: 'open' });}
            catch(e) { console.error("CS Panel: Failed to create host/shadow.", e); panelHostElement = panelShadowRoot = null; return false;}
        }
        if (!panelShadowRoot.querySelector(`.${PANEL_CONTAINER_CLASS}`)) {
            panelShadowRoot.innerHTML = `
                <div class="${PANEL_CONTAINER_CLASS}">
                    <div class="panel-header">
                        <div id="${PANEL_HEADER_ICON_ID}" class="panel-header-icon"></div>
                        <h2 id="${PANEL_TITLE_ID}" class="panel-title">FundingFlock Panel</h2>
                        <button id="${PANEL_MAIN_MENU_BUTTON_ID}" class="panel-main-menu-button panel-header-action-button" title="Main Menu">⌂</button>
                        <button id="${PANEL_MINIMIZE_BUTTON_ID}" class="panel-minimize-button panel-header-action-button" title="Minimize Panel">-</button>
                        <button id="${PANEL_CLOSE_BUTTON_ID}" class="panel-close-button panel-header-action-button" title="Close Panel">×</button>
                    </div>
                    <div class="panel-content">
                        <iframe id="${PANEL_IFRAME_ID}" title="FundingFlock Panel" name="fundingflockPanelIframe"></iframe>
                    </div>
                </div>`;
        }
        if (CACHED_RSRC_URLS.panel_css && !panelShadowRoot.querySelector(`link[href="${CACHED_RSRC_URLS.panel_css}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.type = 'text/css';
            link.href = CACHED_RSRC_URLS.panel_css;
            panelShadowRoot.prepend(link);
        } else if (!CACHED_RSRC_URLS.panel_css && !panelShadowRoot.querySelector('style#fundingflockPanelFallbackStyles')) {
            const style = document.createElement('style'); style.id = 'fundingflockPanelFallbackStyles';
            style.textContent = `
                .${PANEL_CONTAINER_CLASS} { position:fixed; top:0; right:0; width:var(--panel-width, ${DEFAULT_PANEL_WIDTH}); max-height:98vh; min-height:250px; background-color:var(--panel-bg-color, #f0f4f8); border-left:1px solid var(--panel-border-color, #c0c8d0); transform:translateX(105%); transition:transform .3s ease-in-out, width .3s ease-in-out, height .2s ease-out; z-index:2147483641; display:flex; flex-direction:column; overflow:hidden; box-shadow: -3px 0 15px rgba(0,0,0,0.12); font-family: system-ui, sans-serif;}
                .${PANEL_CONTAINER_CLASS}.panel-visible { transform:translateX(0); }
                .panel-header { padding:8px 12px; border-bottom:1px solid var(--panel-border-color, #c0c8d0); background-color:var(--panel-header-bg-color, #e9eef2); display:flex; align-items:center; flex-shrink:0; height:40px; box-sizing:border-box;}
                .panel-header-icon { width:20px; height:20px; margin-right:8px; background-size:contain; background-repeat:no-repeat; background-position:center; flex-shrink:0;}
                .panel-title { font-size:1em; font-weight:600; color:var(--panel-header-text-color, #33658A); margin:0; flex-grow:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.2;}
                .panel-header-action-button { background:transparent; border:none; padding:0; margin:0; margin-left:5px; cursor:pointer; color:var(--panel-text-muted-color, #6c757d); transition:color 0.15s ease-in-out, background-color 0.15s ease-in-out; border-radius:4px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; box-sizing:border-box;}
                .panel-header-action-button:hover { color:var(--panel-header-text-color, #33658A); background-color:rgba(0,0,0,0.07); }
                /* Updated styles for panel buttons matching provided CSS */
                .panel-header .panel-minimize-button { font-family:Arial,sans-serif; font-size:16px; font-weight:bold; line-height:0.5; }
                .panel-header .panel-close-button { font-family:'Times New Roman',Times,serif; font-size:20px; font-weight:normal; line-height:0.8;}

                .panel-content { flex-grow:1; display:flex; overflow:hidden; background-color:var(--panel-bg-color, #ffffff); }
                .panel-content iframe { width:100%; height:100%; border:none; display:block; }
            `; panelShadowRoot.prepend(style);
        }
        panelContainerElement = panelShadowRoot.querySelector(`.${PANEL_CONTAINER_CLASS}`);
        panelIframeElement = panelShadowRoot.getElementById(PANEL_IFRAME_ID);
        panelHeaderIconElement = panelShadowRoot.getElementById(PANEL_HEADER_ICON_ID);
        panelCloseButtonElement = panelShadowRoot.getElementById(PANEL_CLOSE_BUTTON_ID);
        panelTitleElement = panelShadowRoot.getElementById(PANEL_TITLE_ID);
        panelMainMenuButtonElement = panelShadowRoot.getElementById(PANEL_MAIN_MENU_BUTTON_ID);
        panelMinimizeButtonElement = panelShadowRoot.getElementById(PANEL_MINIMIZE_BUTTON_ID);

        if(!panelContainerElement || !panelIframeElement || !panelCloseButtonElement || !panelHeaderIconElement || !panelTitleElement || !panelMinimizeButtonElement) {
            console.error("CS Panel: Failed to acquire critical panel shell elements post-build."); return false;
        }

        if(panelMinimizeButtonElement && !panelMinimizeButtonElement.dataset.minimizeListenerAttached){
            panelMinimizeButtonElement.addEventListener('click', (event) => {
                event.currentTarget.blur(); // <-- FIX: Remove focus first
                handlePanelMinimizeRequest(); // Then call the handler
            });
            panelMinimizeButtonElement.dataset.minimizeListenerAttached = 'true';
        }
        if(panelCloseButtonElement && !panelCloseButtonElement.dataset.closeListenerAttached){
            panelCloseButtonElement.addEventListener('click', (event) => {
                event.currentTarget.blur(); // <-- FIX: Remove focus first
                handlePanelHardCloseAndResetRequest(); // Then call the handler
            });
            panelCloseButtonElement.dataset.closeListenerAttached = 'true';
        }
        if(panelMainMenuButtonElement && !panelMainMenuButtonElement.dataset.menuListenerAttached){
            panelMainMenuButtonElement.addEventListener('click', (event) => {
                event.currentTarget.blur();
                // Send a message to the background script to navigate to the main popup view
                try {
                    chrome.runtime.sendMessage({ type: "NAVIGATE_PANEL_VIEW", targetView: "popup/popup.html" });
                } catch (e) {
                    console.warn("FundingFlock Panel: Exception sending NAVIGATE_PANEL_VIEW message.", e);
                }
            });
            panelMainMenuButtonElement.dataset.menuListenerAttached = 'true';
        }
        return true;
    }

    function applyPanelShellTheme(theme, currentPanelWidth) {
        if (!panelHostElement || !panelHeaderIconElement || !isContentScriptContextValid()) return;
        const iconUrl = theme === 'dark' ? CACHED_RSRC_URLS.panel_header_icon_dark : CACHED_RSRC_URLS.panel_header_icon_light;
        if(iconUrl) panelHeaderIconElement.style.backgroundImage = `url('${iconUrl}')`;
        else if (CACHED_RSRC_URLS.default_favicon) panelHeaderIconElement.style.backgroundImage = `url('${CACHED_RSRC_URLS.default_favicon}')`;

        const pfx = '--panel-';
        const commonStyles = { fontFamily:'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', width: currentPanelWidth || DEFAULT_PANEL_WIDTH };
        const lightTheme = { ...commonStyles, bgColor:'#f0f4f8', textColor:'#2F4858', borderColor:'#dde4e9', headerBgColor:'#e9eef2', headerTextColor:'#33658A', textMutedColor:'#6c757d' };
        const darkTheme =  { ...commonStyles, bgColor:'#2F4858', textColor:'#E0E5EA', borderColor:'#4a6070', headerBgColor:'#3a5060', headerTextColor:'#86BBD8', textMutedColor:'#a0a8b0' };
        const chosenTheme = theme === 'dark' ? darkTheme : lightTheme;
        for(const key in chosenTheme) {
             if (panelHostElement) panelHostElement.style.setProperty(pfx + key.replace(/([A-Z])/g, "-$1").toLowerCase(), chosenTheme[key]);
        }
    }

    async function setPanelVisibilityStateAndContent(isVisible, iframeSrc) { // <-- Make async
        // --- THIS IS THE DEFINITIVE FIX ---
        await tryInitializeResourceURLsOnce(); // <-- Ensure resources are ready
        // --- END OF FIX ---

        if (!ensurePanelShellExistsAndIsStyled() || !panelContainerElement || !panelIframeElement) {
            return;
        }

        let targetPanelWidth = DEFAULT_PANEL_WIDTH; // Default NARROW view (420px)
        if (iframeSrc && typeof iframeSrc === 'string') {
            if (iframeSrc.includes('tailoring/tailor_proposal.html') || iframeSrc.includes('organization_profile/organization_profile.html')) {
                targetPanelWidth = TAILOR_RESUME_PANEL_WIDTH; // WIDE view (950px)
            } else if (iframeSrc.includes('options/options.html')) {
                targetPanelWidth = '600px'; // MEDIUM view (600px)
            }
        }
        applyPanelShellTheme(currentTheme, targetPanelWidth);

        if (panelMainMenuButtonElement) {
            // This is the core visibility rule: hide the button if the current view is the popup or the tailoring page.
            const shouldHideMenuButton = iframeSrc && (
                iframeSrc.includes('popup/popup.html') ||
                iframeSrc.includes('tailoring/tailor_proposal.html')
            );

            panelMainMenuButtonElement.style.display = shouldHideMenuButton ? 'none' : 'inline-flex';
        }

        if (isVisible) {
            if (isFabExplicitlyHiddenByAction && fabElement) {
                toggleFabActualVisibility(true); // Force show FAB if panel is opening and FAB was action-hidden
            }
            if (panelIframeElement) { // Check if panelIframeElement exists
                if (iframeSrc && panelIframeElement.src !== iframeSrc) {
                    try {
                        panelIframeElement.src = iframeSrc;
// START SNIPPET: Add this block in fab_injector.js after panelIframeElement.src is set
// --- THE FIX: Proactively request height after the iframe finishes loading ---
panelIframeElement.onload = () => {
    // This event fires when the new page (like organization_profile.html)
    // has fully loaded in the iframe.
    setTimeout(() => {
        if (panelIframeElement && panelIframeElement.contentWindow) {
            try {
                // We proactively ask the newly loaded page for its height.
                panelIframeElement.contentWindow.postMessage({
                    type: 'REQUEST_HEIGHT_UPDATE'
                }, '*');
            } catch (e) {
                // This might fail due to cross-origin policies on some sites, but is safe to ignore.
            }
        }
    }, 200); // A small delay to ensure scripts inside the iframe have run.
};
// END SNIPPET
                    }
                    catch(e) {
                        console.error("[fab_injector.js setPanelVisibility] CS Panel: Error setting iframe src.", e);
                        panelIframeElement.src = 'about:blank';
                    }
                } else if (!iframeSrc && panelIframeElement.src !== 'about:blank') {
                    panelIframeElement.src = 'about:blank';
                }
            } else {
                console.error('[fab_injector.js setPanelVisibility] panelIframeElement not found when trying to set src!');
            }
            panelContainerElement.classList.add('panel-visible');
            if (fabElement) fabElement.classList.add('fab-panel-active');
        } else {
            // This block runs when the panel is being hidden
            panelContainerElement.classList.remove('panel-visible');
            if (fabElement) fabElement.classList.remove('fab-panel-active');

            // --- THIS IS THE FIX ---
            if (panelIframeElement) panelIframeElement.blur(); // Remove focus from the iframe
            // --- END OF FIX ---

            if (panelHostElement && panelHostElement.style.getPropertyValue('--panel-width') !== DEFAULT_PANEL_WIDTH) {
                applyPanelShellTheme(currentTheme, DEFAULT_PANEL_WIDTH);
            }
            setTimeout(() => {
                if (panelIframeElement && panelContainerElement && !panelContainerElement.classList.contains('panel-visible')) {
                    try{panelIframeElement.src = 'about:blank';}catch(e){/* ignore */}
                }
            }, 350);
        }
    }

    function loadActiveThemeFromStorageAndApplyToUI() {
        let themeToApply = 'light';
        if (!isContentScriptContextValid()) { return; }
        try {
            chrome.storage.sync.get(['selectedTheme'], (result) => {
                if (!isContentScriptContextValid()) return;
                if (chrome.runtime.lastError) { themeToApply = 'light'; }
                else {
                    const preferredTheme = result.selectedTheme || 'system';
                    themeToApply = (preferredTheme === 'system') ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : (preferredTheme === 'dark' ? 'dark' : 'light');
                }
                currentTheme = themeToApply;
                if (fabButton && document.body.contains(fabButton)) applyFabThemeColors(currentTheme);
                if (panelHostElement && document.body.contains(panelHostElement) && panelContainerElement?.classList.contains('panel-visible')) {
                    const currentAppliedWidth = panelHostElement.style.getPropertyValue('--panel-width') || (panelIframeElement?.src?.includes('tailoring/tailor_proposal.html') ? WIDE_PANEL_WIDTH : DEFAULT_PANEL_WIDTH);
                    applyPanelShellTheme(currentTheme, currentAppliedWidth);
                }
            });
        } catch (e) { /* fallback and apply */ }
    }

    async function initializeSystem() {
        if (!document.body || document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeSystem, { once: true });
            return;
        }
        if (window[SCRIPT_SINGLETON_FLAG] !== true) return;

        await tryInitializeResourceURLsOnce();
        createAndSetupFAB();

        if (isContentScriptContextValid()) {
            document.addEventListener('visibilitychange', () => { if(isContentScriptContextValid() && document.visibilityState==='visible') loadActiveThemeFromStorageAndApplyToUI(); });
            window.addEventListener('focus', () => { if(isContentScriptContextValid()) loadActiveThemeFromStorageAndApplyToUI(); });
            if (window.matchMedia) {
                const mql = window.matchMedia('(prefers-color-scheme: dark)');
                const listener = () => { if(isContentScriptContextValid()) loadActiveThemeFromStorageAndApplyToUI(); };
                if(mql.addEventListener) mql.addEventListener('change', listener);
                else if(mql.addListener) mql.addListener(listener);
            }

            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (!isContentScriptContextValid() || window[SCRIPT_SINGLETON_FLAG] !== true) {
                    // If context is invalid, and we're not handling the message,
                    // it's good practice to return false or undefined.
                    return false;
                }

                switch (message.type) {
                    case 'FUNDINGFLOCK_THEME_UPDATED_FOR_CONTENT':
                        if (message.theme && currentTheme !== message.theme) {
                            currentTheme = message.theme;
                            applyFabThemeColors(currentTheme);
                            if (panelHostElement && panelContainerElement?.classList.contains('panel-visible')) {
                                const currentAppliedWidth = panelHostElement.style.getPropertyValue('--panel-width') || (panelIframeElement?.src?.includes('tailoring/tailor_proposal.html') ? WIDE_PANEL_WIDTH : DEFAULT_PANEL_WIDTH);
                                applyPanelShellTheme(currentTheme, currentAppliedWidth);
                            }
                        }
                        // This case does not send a response, so it can implicitly return undefined or we can add 'break;'
                        break;
                    case 'UPDATE_PANEL_SHELL_STATE':
                        setPanelVisibilityStateAndContent(message.isVisible, message.iframeSrc);
                        sendResponse({
                            status: "UPDATE_PANEL_SHELL_STATE processed by fab_injector",
                            newSrcSet: message.iframeSrc,
                            panelIframeCurrentSrc: panelIframeElement ? panelIframeElement.src : 'panelIframeElement not found at time of response'
                        });
                        return true; // Explicitly return true as sendResponse is called.
                    case 'TOGGLE_FAB_VISIBILITY':
                       toggleFabActualVisibility();
                       try {
                           sendResponse({ fabCurrentlyHidden: isFabExplicitlyHiddenByAction });
                       } catch (e) {
                           console.warn("[FabInjector] Error sending response for TOGGLE_FAB_VISIBILITY:", e);
                       }
                       return true; // Explicitly return true as sendResponse is called.
                    default:
                        // For any unhandled message types, it's good practice to return false or nothing.
                        // This indicates the message was not handled by this listener.
                        return false;
                }
                // Note: If a case doesn't explicitly return true/false, and doesn't break,
                // the function would implicitly return undefined.
                // For clarity, it's often better to have explicit returns or breaks in each case.
                // The 'wantsAsyncResponse' variable is removed as each case handles its return.
            });

            window.addEventListener('message', (event) => {
                if (!isContentScriptContextValid() || window[SCRIPT_SINGLETON_FLAG] !== true || !panelIframeElement || event.source !== panelIframeElement.contentWindow) return;
                const iframeMessage = event.data;
                if (iframeMessage && iframeMessage.type === 'FUNDINGFLOCK_IFRAME_CONTENT_HEIGHT' && typeof iframeMessage.height === 'number') {
                    if (panelContainerElement) {
                        const desiredContentHeight = iframeMessage.height;
                        const panelHeader = panelContainerElement.querySelector('.panel-header');
                        const headerHeight = panelHeader ? panelHeader.offsetHeight : 40;
                        const totalDesiredPanelHeight = desiredContentHeight + headerHeight;
                        const maxPossiblePanelHeight = window.innerHeight * 0.98;
                        const panelComputedStyle = getComputedStyle(panelContainerElement);
                        const minPanelHeight = parseFloat(panelComputedStyle.minHeight) || 250;
                        let newCalculatedPanelHeight = Math.max(minPanelHeight, Math.min(totalDesiredPanelHeight, maxPossiblePanelHeight));
                        const currentPanelHeight = panelContainerElement.offsetHeight;
                        if (Math.abs(currentPanelHeight - newCalculatedPanelHeight) > 5) {
                            panelContainerElement.style.height = `${newCalculatedPanelHeight}px`;
                        }
                    }
                }
            });
        }
        loadActiveThemeFromStorageAndApplyToUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSystem, { once: true });
    } else {
        initializeSystem();
    }

})();
