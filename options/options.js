// options/options.js
document.addEventListener('DOMContentLoaded', function() {
// START SNIPPET: Add to top of DOMContentLoaded in options.js
if (window.parent !== window) {
    document.body.classList.add('in-iframe-panel');
}
// END SNIPPET
// --- TUTORIAL COMMUNICATION ---
// Announce that this iframe view is loaded and ready.
if (window.parent !== window && (new URLSearchParams(window.location.search)).get('context') === 'tutorial') {
    window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
}
// --- END TUTORIAL COMMUNICATION ---
    // --- THEME SELECTOR ---
    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) {
        chrome.storage.sync.get(['selectedTheme'], function(result) {
            if(chrome.runtime.lastError) {}
            else if (result.selectedTheme) themeSelector.value = result.selectedTheme;
            else themeSelector.value = 'system';
        });
        themeSelector.addEventListener('change', function() {
            const selected = themeSelector.value;
            chrome.storage.sync.set({ 'selectedTheme': selected }, function() {
                if (chrome.runtime.lastError) {}
            });
        });
    }

    // --- Tracker Sheet ID Elements ---
    const trackerSheetIdInput = document.getElementById('trackerSheetIdInput');
    const saveTrackerSheetIdButton = document.getElementById('saveTrackerSheetIdButton');
    const trackerSheetIdStatus = document.getElementById('trackerSheetIdStatus');
    const statusMessageDiv = document.getElementById('statusMessage'); // For API Key status

    // Generic status function for both sections
    function showStatus(element, message, type) {
        if (!element) return;
        element.textContent = message;
        element.className = 'status-message-global'; // Reset
        if (type) element.classList.add(`status-${type}`);

        // Auto-clear for non-error messages
        if (type !== 'error') {
             setTimeout(() => {
                if (element.textContent === message) { // Avoid clearing a subsequent message
                    element.textContent = '';
                    element.className = 'status-message-global';
                }
            }, 4000);
        }
    }

    // --- Load saved Tracker Sheet ID ---
    if (trackerSheetIdInput) {
        chrome.storage.sync.get(['userTrackerSheetId'], function(result) {
            if (chrome.runtime.lastError) {
                showStatus(trackerSheetIdStatus, "Error loading Sheet ID.", "error");
            } else if (result.userTrackerSheetId) {
                trackerSheetIdInput.value = result.userTrackerSheetId;
            }
        });
    }

    // --- Save Tracker Sheet ID ---
    if (saveTrackerSheetIdButton && trackerSheetIdInput) {
        saveTrackerSheetIdButton.addEventListener('click', function() {
            const sheetId = trackerSheetIdInput.value.trim();
            if (sheetId) {
                if (sheetId.length < 30 || sheetId.includes(" ") || sheetId.includes("/")) {
                    showStatus(trackerSheetIdStatus, "Invalid Sheet ID format.", "warning");
                    return;
                }
                chrome.storage.sync.set({ 'userTrackerSheetId': sheetId }, function() {
                    if (chrome.runtime.lastError) {
                        showStatus(trackerSheetIdStatus, `Error saving Sheet ID: ${chrome.runtime.lastError.message}`, 'error');
                    } else {
                        showStatus(trackerSheetIdStatus, 'Tracker Sheet ID saved!', 'success');
                    }
                });
            } else {
                chrome.storage.sync.remove('userTrackerSheetId', function() {
                     if (chrome.runtime.lastError) {
                        showStatus(trackerSheetIdStatus, `Error clearing Sheet ID: ${chrome.runtime.lastError.message}`, 'error');
                    } else {
                        showStatus(trackerSheetIdStatus, 'Tracker Sheet ID cleared.', 'info');
                    }
                });
            }
        });
    }

    // --- API KEY MANAGEMENT ---
    const apiKeyInput = document.getElementById('geminiApiKeyInput');
    const saveButton = document.getElementById('saveApiKeyButton');
    const toggleVisibilityButton = document.getElementById('toggleApiKeyVisibility');

    if (apiKeyInput) {
        chrome.storage.sync.get(['geminiApiKey'], function(result) {
            if(chrome.runtime.lastError) showStatus(statusMessageDiv, "Error loading API key.", "error");
            else if (result.geminiApiKey) apiKeyInput.value = result.geminiApiKey;
        });
    } else { showStatus(statusMessageDiv, "API Key input field is missing from HTML.", "error"); }

    if (saveButton && apiKeyInput) {
        saveButton.addEventListener('click', async function() {
            saveButton.disabled = true;
            saveButton.textContent = 'Saving...';

            const apiKey = apiKeyInput.value.trim();

            if (apiKey) {
                try {
                    // Step 1: Save the key to local browser sync storage.
                    showStatus(statusMessageDiv, 'Saving key to browser...', 'info');
                    await new Promise((resolve, reject) => {
                        chrome.storage.sync.set({ 'geminiApiKey': apiKey }, () => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(`Local Save Error: ${chrome.runtime.lastError.message}`));
                            } else {
                                resolve();
                            }
                        });
                    });

                    // Step 2: Send the key to the backend for secure storage.
                    showStatus(statusMessageDiv, 'Syncing key to your secure backend...', 'info');
                    const response = await chrome.runtime.sendMessage({
                        type: 'SAVE_API_KEY_TO_BACKEND',
                        payload: { apiKey: apiKey }
                    });

                    if (response && response.success) {
                        showStatus(statusMessageDiv, 'API Key saved and synced successfully!', 'success');
                        chrome.runtime.sendMessage({ type: 'TUTORIAL_API_KEY_SAVED' });
                    } else {
                        // Throw the user-friendly error from the background script.
                        throw new Error(response?.error || 'An unknown error occurred during backend sync.');
                    }
                } catch (error) {
                    showStatus(statusMessageDiv, error.message, 'error');
                } finally {
                    saveButton.disabled = false;
                    saveButton.textContent = 'Save API Key';
                }
            } else { // Logic for clearing the key
                saveButton.textContent = 'Clearing...';
                try {
                    await new Promise((resolve, reject) => {
                        chrome.storage.sync.remove('geminiApiKey', () => {
                            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                            else resolve();
                        });
                    });
                    apiKeyInput.value = '';
                    showStatus(statusMessageDiv, 'API Key cleared from browser storage.', 'success');
                } catch (error) {
                    showStatus(statusMessageDiv, `Error clearing key: ${error.message}`, 'error');
                } finally {
                    saveButton.disabled = false;
                    saveButton.textContent = 'Save API Key';
                }
            }
        });
    }

    if (toggleVisibilityButton && apiKeyInput) {
        toggleVisibilityButton.addEventListener('click', function() {
            if (apiKeyInput.type === 'password') {
                apiKeyInput.type = 'text';
                toggleVisibilityButton.textContent = 'Hide';
            } else {
                apiKeyInput.type = 'password';
                toggleVisibilityButton.textContent = 'Show';
            }
        });
    }

    // --- VERSION DISPLAY ---
    const versionSpan = document.getElementById('extensionVersion');
    if (versionSpan) {
        try { versionSpan.textContent = chrome.runtime.getManifest().version; }
        catch (e) { console.warn("Could not set extension version display."); }
    }

const manageOrgProfileLink = document.getElementById('manageOrgProfileLink');
if (manageOrgProfileLink) {
    const queryParams = new URLSearchParams(window.location.search);
    const isTutorialContext = queryParams.get('context') === 'tutorial';

    manageOrgProfileLink.addEventListener('click', function(e) {
        e.preventDefault(); // Always prevent the default link behavior.

        if (isTutorialContext) {
            // In tutorial, send a message to navigate the panel.
            chrome.runtime.sendMessage({
                type: "NAVIGATE_PANEL_VIEW",
                targetView: "organization_profile/organization_profile.html"
            });
        } else {
            // Outside tutorial, create a new tab for the organization profile page.
            chrome.tabs.create({ url: chrome.runtime.getURL('organization_profile/organization_profile.html') });
        }
    });
}

    // --- DYNAMIC HEIGHT MESSAGING TO PARENT PANEL ---
    let heightSendTimeout = null;
    function sendHeightToParentDebounced() {
        clearTimeout(heightSendTimeout);
        heightSendTimeout = setTimeout(() => {
            // Only send if this page is actually in an iframe
            if (window.parent !== window) {
                const pageContainer = document.querySelector('.page-container.options-page-container');
                const calculatedContentHeight = pageContainer ? pageContainer.scrollHeight : document.body.scrollHeight;

                window.parent.postMessage({
                    type: 'FUNDINGFLOCK_IFRAME_CONTENT_HEIGHT',
                    height: calculatedContentHeight + 20 // Add a 20px buffer
                }, '*');
            }
        }, 150);
    }

    // Use a ResizeObserver to automatically detect content changes
    if (typeof ResizeObserver !== "undefined") {
        const pageContainerForObserver = document.querySelector('.page-container.options-page-container');
        if (pageContainerForObserver) {
            const resizeObserver = new ResizeObserver(sendHeightToParentDebounced);
            resizeObserver.observe(pageContainerForObserver);
        }
    }

    // Send an initial height update
    setTimeout(sendHeightToParentDebounced, 300);
});
