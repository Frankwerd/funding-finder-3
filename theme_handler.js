// theme_handler.js (Fresh Start)

function isExtensionPageContextValid() {
    return !!(chrome.runtime && chrome.runtime.id && document.body && window);
}

function notifyBackgroundOfThemeChange(actualResolvedTheme) { // 'light' or 'dark'
    if (!isExtensionPageContextValid()) return;
    try {
        if (chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ type: 'THEME_UPDATED', theme: actualResolvedTheme }); // For toolbar icon
            chrome.runtime.sendMessage({ type: 'THEME_UPDATED_FOR_CONTENT_SCRIPTS', theme: actualResolvedTheme }); // For FAB etc.
        }
    } catch (e) { /* console.warn("ThemeHandler: sendMessage failed", e.message); */ }
}

function applyThemeToCurrentPage(themePreference) { // 'system', 'light', or 'dark'
    if (!document.body) return;

    document.body.classList.remove('theme-light', 'theme-dark', 'theme-system-actual-dark', 'theme-system-actual-light');
    let actualResolvedTheme = 'light';

    if (themePreference === 'system') {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.body.classList.add('theme-system-actual-dark'); actualResolvedTheme = 'dark';
        } else {
            document.body.classList.add('theme-system-actual-light'); actualResolvedTheme = 'light';
        }
    } else if (themePreference === 'dark') {
        document.body.classList.add('theme-dark'); actualResolvedTheme = 'dark';
    } else {
        document.body.classList.add('theme-light'); actualResolvedTheme = 'light';
    }

    // Update images on this extension page
    if (isExtensionPageContextValid()) { // Guard getURL calls
        document.querySelectorAll('.theme-aware-img').forEach(imgElement => {
            const lightSrcPath = imgElement.dataset.lightSrc;
            const darkSrcPath = imgElement.dataset.darkSrc;
            let targetSrcPath = (actualResolvedTheme === 'dark' && darkSrcPath) ? darkSrcPath : lightSrcPath;
            if (targetSrcPath) {
                try {
                    const newFullSrc = chrome.runtime.getURL(targetSrcPath);
                    if (imgElement.src !== newFullSrc) imgElement.src = newFullSrc;
                } catch (e) { /* console.warn("ThemeHandler: Img src update failed for", targetSrcPath, e.message); */}
            }
        });
    }
    notifyBackgroundOfThemeChange(actualResolvedTheme);
}

// Initial theme load for the extension page
(function loadInitialPageTheme() {
    if (chrome.storage && chrome.storage.sync) {
        try {
            chrome.storage.sync.get(['selectedTheme'], function(result) {
                if (!isExtensionPageContextValid()) { applyThemeToCurrentPage('system'); return; } // Check context in callback
                if (chrome.runtime.lastError) { applyThemeToCurrentPage('system'); return; }
                applyThemeToCurrentPage(result.selectedTheme || 'system');
            });
        } catch (e) { applyThemeToCurrentPage('system'); }
    } else { applyThemeToCurrentPage('system'); }
})();

// Listener for storage changes
if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(function(changes, namespace) {
        if (!isExtensionPageContextValid()) return; // Check context
        if (namespace === 'sync' && changes.selectedTheme) {
            applyThemeToCurrentPage(changes.selectedTheme.newValue);
        }
    });
}

// Listener for OS theme changes
if (window.matchMedia) {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const osThemeChangeListener = (event) => {
        if (!isExtensionPageContextValid()) return; // Check context
        if (chrome.storage && chrome.storage.sync) {
            try {
                chrome.storage.sync.get(['selectedTheme'], function(result) {
                    if (!isExtensionPageContextValid() || chrome.runtime.lastError) return;
                    if ((result.selectedTheme || 'system') === 'system') {
                        applyThemeToCurrentPage('system');
                    }
                });
            } catch (e) {}
        } else { /* Fallback for no storage, less relevant here */ }
    };
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', osThemeChangeListener);
    else if (typeof mql.addListener === 'function') mql.addListener(osThemeChangeListener); // Deprecated
}