// file: background.js
// Version: Refactored for FundingFlock.AI - Grant/Proposal Focus

function isServiceWorkerValid() {
    return !!(chrome.runtime && chrome.runtime.id);
}

function updateToolbarIcon(theme) {
    if (!isServiceWorkerValid()) return;
    let iconPaths;
    if (theme === 'dark') {
        iconPaths = { '16': 'icons/icon16.png', '32': 'icons/icon32.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' };
    } else {
        iconPaths = { '16': 'icons/icon16.png', '32': 'icons/icon32.png', '48': 'icons/icon48.png', '128': 'icons/icon128.png' };
    }
    if (chrome.action && typeof chrome.action.setIcon === 'function') {
        try {
            chrome.action.setIcon({ path: iconPaths }, () => { if (chrome.runtime.lastError && isServiceWorkerValid()) {  } });
        } catch(e) {  }
    }
}

// --- Global State ---
let isPanelUIVisibleGlobal = false;
let currentPanelViewUrlGlobal = null;
const DEFAULT_PANEL_VIEW = "popup/popup.html";

// Cache for tailoring session initial data
let activeTailoringSessionInitialData = null;

// Cache for multi-step autofill process
let autofillProcessData = {}; // Will store {targetTabId, source, profileDataForEngine}

// --- Session Storage Keys (Constants) ---
const SESSION_KEY_INITIAL_TAILORING_DATA = 'ffInitialTailoringData';
const SESSION_KEY_ACTIVE_OPPORTUNITY_ID = 'ffActiveOpportunityId';
const SESSION_KEY_DETAILED_TAILORED_STATE_PREFIX = 'ffDetailedTailoredState_';
const SESSION_KEY_MINIMIZED_TAILORING_INFO = 'ffMinimizedTailoringInfo';
const SESSION_KEY_GENERAL_PANEL_DATA = 'ffGeneralPanelData';

// --- Google Drive API Constants ---
const MASTER_SHEET_ID = '12jj5lTyu_MzA6KBkfD-30mj-KYHaX-BjouFMtPIIzFc';
const MASTER_SCRIPT_ID = '12suq_wdzxKZy7S7MJ9bB2a2-DxiN_Kl5mUVHupR-YAqT-_54eU-gQB8i';
const DRIVE_API_V3_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

// --- Centralized Gemini API Calls --- //
async function callGeminiApiCentralized(apiKey, prompt) {
    const MODEL_NAME = 'gemini-1.5-flash-latest';
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
            })
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: `Non-JSON error response. Status: ${response.status}` } }));
            throw new Error(`API Error ${response.status}: ${errorData?.error?.message || response.statusText}`);
        }
        const data = await response.json();
        const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
            console.error("Malformed AI Response (Empty 'text' field):", data);
            throw new Error("AI response was empty or malformed.");
        }
        const cleanedJson = jsonText.replace(/```(json)?/g, '').replace(/```/g, '').trim();
        return { success: true, data: JSON.parse(cleanedJson) };
    } catch (error) {
        console.error(`[BG] Global Gemini call failed:`, error);
        return { success: false, error: error.message };
    }
}

async function callPdfAnalysisApi(apiKey, prompt, pdfBase64Data) {
    const MODEL_NAME = 'gemini-1.5-flash-latest';
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
    try {
        const requestBody = {
            contents: [{ parts: [ { text: prompt }, { inlineData: { mimeType: 'application/pdf', data: pdfBase64Data } } ] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
        };
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: `Non-JSON error response. Status: ${response.status}` } }));
            throw new Error(`API Error ${response.status}: ${errorData?.error?.message || response.statusText}`);
        }
        const data = await response.json();
        const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!responseText) {
            console.error("Malformed AI PDF Response (Empty 'text' field):", data);
            throw new Error("AI PDF response was empty or malformed.");
        }
        const trimmedText = responseText.trim();
        if (trimmedText.startsWith('{') || trimmedText.startsWith('```json')) {
            const cleanedJson = trimmedText.replace(/```(json)?/g, '').replace(/```/g, '').trim();
            try {
                return { success: true, data: JSON.parse(cleanedJson) };
            } catch (parseError) {
                console.error('[BG] Failed to parse JSON from PDF response after cleaning:', parseError, 'Returning raw text as fallback.');
                return { success: true, data: cleanedJson };
            }
        } else {
            return { success: true, data: trimmedText };
        }
    } catch (error) {
        console.error(`[BG] Global PDF API call failed:`, error);
        return { success: false, error: error.message };
    }
}

// START SNIPPET: Replace this function in background.js
function generateAutofillMappingPrompt(profileData, formHtml) {
    const profileString = JSON.stringify(profileData, null, 2);
    const sanitizedFormHtml = formHtml.replace(/`/g, "'");

    const promptText = `
    <role>
    You are a hyper-precise data-to-form mapping engine. Your singular task is to analyze an organization's profile data and form HTML, then generate a flawless JSON action plan. Adhere to all rules without deviation.
    </role>

    <input_data>
    <organization_profile_data>
    The organization's complete profile data:
    \`\`\`json
    ${profileString}
    \`\`\`
    </organization_profile_data>

    <form_html>
    The simplified HTML of the remaining, ambiguous form fields. Each interactive element has a unique 'data-cs-id'.
    \`\`\`html
    ${sanitizedFormHtml}
    \`\`\`
    </form_html>
    </input_data>

    <core_instructions>
    **CRITICAL: Your entire response MUST be a single, valid JSON object and nothing else.**
    Your JSON response must contain a single root key, "fill_actions", which is an array of action objects. Each action object MUST use these exact key names: "target_field_id", "value_to_fill", "action_type" ("fill_field" or "click_element").
    </core_instructions>

    <mapping_rules>
    **Rule #1: Be Conservative.** If you cannot find a confident match for a field, DO NOT create an action for it. It is better to leave a field blank than to fill it incorrectly.
    **Rule #2: Holistic Context.** Use field names, labels, and group titles to understand context. Match concepts, not just text. For example, a field labeled "EIN" or "Tax ID" should be filled with the organization's 'taxId'. A field for "Primary Contact" or "Authorized Official" should use the 'primaryContact.name' from the profile.
    </mapping_rules>

    Now, generate the JSON action plan. Your response must begin with \`{\` and end with \`}\` and contain nothing else.
`;
    return promptText;
}
// END SNIPPET

async function clearAllTailoringSessionState(logPrefix = "[BG]") {
    const keysToClear = [ SESSION_KEY_INITIAL_TAILORING_DATA, SESSION_KEY_MINIMIZED_TAILORING_INFO ];
    try {
        const allSessionItems = await chrome.storage.session.get(null);
        if (chrome.runtime.lastError && isServiceWorkerValid()) {
             console.warn(`${logPrefix} Error getting all session items for cleanup: ${chrome.runtime.lastError.message}`);
        } else if (allSessionItems) {
            for (const key in allSessionItems) {
                if (key.startsWith(SESSION_KEY_DETAILED_TAILORED_STATE_PREFIX)) {
                    keysToClear.push(key);
                }
            }
        }
        if (keysToClear.length > 0) {
            await chrome.storage.session.remove(keysToClear);
            if (chrome.runtime.lastError && isServiceWorkerValid()) {
                 console.warn(`${logPrefix} Error removing session keys: ${chrome.runtime.lastError.message}. Keys:`, keysToClear);
            }
        }
    } catch (e) {
        console.error(`${logPrefix} Exception during full session state cleanup:`, e);
    }
    activeTailoringSessionInitialData = null;
}

// --- Centralized Listeners --- //

async function notifyTutorialTabIfActive(message) {
    try {
        const tutorialUrl = chrome.runtime.getURL('autofill_tutorial.html');
        const tabs = await chrome.tabs.query({ url: tutorialUrl });
        if (tabs.length > 0) {
            chrome.tabs.sendMessage(tabs[0].id, message, () => {
                if (chrome.runtime.lastError) {
                    console.warn("Could not send message to tutorial tab:", chrome.runtime.lastError.message);
                }
            });
        }
    } catch (e) {
        console.warn("Could not send message to tutorial tab.", e);
    }
}

if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!isServiceWorkerValid()) return false;
        const messageType = message.type;
        const asyncResponseRequired = [
            'GET_ACTIVE_TAB_ID', 'COPY_TEXT_TO_CLIPBOARD', 'CALL_GEMINI_API',
            'CALL_GEMINI_FOR_PDF_ANALYSIS', 'REQUEST_PANEL_VIEW_DATA',
            'REQUEST_PANEL_MINIMIZE', 'FUNDINGFLOCK_PANEL_HARD_CLOSE_AND_FULL_RESET',
            'NAVIGATE_PANEL_VIEW', 'REQUEST_AUTOFILL_FOR_CURRENT_TAB', 'REQUEST_MASTER_AUTOFILL',
            'GET_AUTH_STATUS', 'REQUEST_GOOGLE_LOGIN', 'REQUEST_GOOGLE_LOGOUT', 'SAVE_API_KEY_TO_BACKEND',
            'PROFILE_WAS_SAVED'
        ];

        if (asyncResponseRequired.includes(messageType)) {
            (async () => {
                try {
                    switch (messageType) {
                        case 'GET_ACTIVE_TAB_ID':
                            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                            if (!tab?.id) throw new Error('No active tab found.');
                            sendResponse({ success: true, tabId: tab.id, tabUrl: tab.url });
                            break;

                        case 'COPY_TEXT_TO_CLIPBOARD':
                            if (!message.textToCopy) throw new Error('No text provided.');
                            const targetTabIdCopy = sender.tab?.id;
                            if (!targetTabIdCopy) throw new Error('Could not identify target tab.');
                            await chrome.scripting.executeScript({
                                target: { tabId: targetTabIdCopy },
                                func: (text) => navigator.clipboard.writeText(text),
                                args: [message.textToCopy]
                            });
                            sendResponse({ success: true });
                            break;

// START SNIPPET: Replace this case block in background.js
case 'CALL_GEMINI_API':
   if (!message.payload) throw new Error('Payload missing for Gemini API call.');
   const geminiResult = await callGeminiApiCentralized(message.payload.apiKey, message.payload.prompt);
   if (geminiResult.success && message.payload.prompt.includes("Analyze the following funding opportunity")) {
      await notifyTutorialTabIfActive({ type: 'TUTORIAL_ANALYSIS_COMPLETE' });
   }
   sendResponse(geminiResult);
   break;
// END SNIPPET

                        case 'PROFILE_WAS_SAVED':
                            await notifyTutorialTabIfActive({ type: 'TUTORIAL_PROFILE_SAVED' });
                            sendResponse({ success: true });
                            break;

                        case 'CALL_GEMINI_FOR_PDF_ANALYSIS':
                           if (!message.payload) throw new Error('Payload missing for PDF Analysis call.');
                           const pdfResult = await callPdfAnalysisApi(message.payload.apiKey, message.payload.prompt, message.payload.pdfBase64Data);
                           sendResponse(pdfResult);
                           break;

                        case "REQUEST_PANEL_VIEW_DATA":
                            const generalData = await chrome.storage.session.get([SESSION_KEY_GENERAL_PANEL_DATA]);
                            await chrome.storage.session.remove(SESSION_KEY_GENERAL_PANEL_DATA);
                            sendResponse({ success: true, data: generalData[SESSION_KEY_GENERAL_PANEL_DATA] || null });
                            break;

                        case 'REQUEST_PANEL_MINIMIZE':
                            let tabIdMinimize = sender.tab?.id || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
                            const initialDataResult = await chrome.storage.session.get(SESSION_KEY_INITIAL_TAILORING_DATA);
                            const sessionData = initialDataResult[SESSION_KEY_INITIAL_TAILORING_DATA];
                            if (currentPanelViewUrlGlobal?.includes('tailoring/tailor_proposal.html') && sessionData?.opportunityId) {
                                await chrome.storage.session.set({ [SESSION_KEY_MINIMIZED_TAILORING_INFO]: { viewUrl: currentPanelViewUrlGlobal, opportunityId: sessionData.opportunityId, tailoringData: sessionData }});
                            } else {
                                await chrome.storage.session.remove(SESSION_KEY_MINIMIZED_TAILORING_INFO);
                            }
                            isPanelUIVisibleGlobal = false;
                            if (tabIdMinimize) {
                                chrome.tabs.sendMessage(tabIdMinimize, { type: "UPDATE_PANEL_SHELL_STATE", isVisible: false, iframeSrc: null });
                            }
                            sendResponse({success: true});
                            break;

                        case "FUNDINGFLOCK_PANEL_HARD_CLOSE_AND_FULL_RESET":
                            let tabIdClose = sender.tab?.id || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
                            if (tabIdClose) {
                                try {
                                    chrome.scripting.executeScript({ target: { tabId: tabIdClose }, func: () => document.getElementById('fundingflock-panel-iframe')?.contentWindow.postMessage({ type: 'FUNDINGFLOCK_SESSION_RESET' }, '*') });
                                } catch (e) {}
                            }
                            isPanelUIVisibleGlobal = false;
                            currentPanelViewUrlGlobal = null;
                            await clearAllTailoringSessionState("[BG HardClose]");
                            if (tabIdClose) {
                                chrome.tabs.sendMessage(tabIdClose, { type: "UPDATE_PANEL_SHELL_STATE", isVisible: false, iframeSrc: null });
                            }
                            sendResponse({ success: true });
                            break;

                        case "NAVIGATE_PANEL_VIEW":
                            if (message.dataForNextView) {
                                await chrome.storage.session.set({ [SESSION_KEY_INITIAL_TAILORING_DATA]: message.dataForNextView });
                            }
                            if (!message.targetView) throw new Error("Invalid 'targetView'.");

                            const isTutorialContext = (sender.url || "").includes('context=tutorial');

                            if (isTutorialContext && sender.tab?.id) {
                                if (message.targetView.includes('options.html')) {
                                    chrome.tabs.sendMessage(sender.tab.id, { type: "TUTORIAL_NAVIGATE_TO_OPTIONS" });
                                } else if (message.targetView.includes('organization_profile/organization_profile.html')) {
                                    chrome.tabs.sendMessage(sender.tab.id, { type: "TUTORIAL_NAVIGATE_TO_PROFILE" });
                                } else if (message.targetView.includes('tailoring/tailor_proposal.html')) {
                                    chrome.tabs.sendMessage(sender.tab.id, { type: "TUTORIAL_TAILORING_STARTED" });
                                }
                                chrome.tabs.sendMessage(sender.tab.id, { type: "TUTORIAL_NAVIGATE_IFRAME", newSrc: message.targetView });
                            } else {
                                currentPanelViewUrlGlobal = chrome.runtime.getURL(message.targetView);
                                isPanelUIVisibleGlobal = true;
                                let tabIdNav = sender.tab?.id || (await chrome.tabs.query({active:true,currentWindow:true}))[0]?.id;
                                if(tabIdNav) {
                                    chrome.tabs.sendMessage(tabIdNav, { type: "UPDATE_PANEL_SHELL_STATE", isVisible: true, iframeSrc: currentPanelViewUrlGlobal });
                                }
                            }
                            sendResponse({ success: true });
                            break;

                        case "REQUEST_AUTOFILL_FOR_CURRENT_TAB":
                        case "REQUEST_MASTER_AUTOFILL":
                            const source = message.type === "REQUEST_MASTER_AUTOFILL" ? 'master' : 'tailored';
                            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                            if (!activeTab?.id) throw new Error('Could not identify active tab.');

                            const targetTabId = activeTab.id;
                            const isTutorial = activeTab.url.includes('autofill_tutorial.html');

                            let profileDataForEngine;
                            if (source === 'master') {
                                const result = await chrome.storage.local.get(['parsedOrgProfileData']);
                                profileDataForEngine = result.parsedOrgProfileData;
                                if (!profileDataForEngine) throw new Error("Organization Profile data not found.");
                            } else {
                                profileDataForEngine = message.payload?.profileData;
                                if (!profileDataForEngine) throw new Error("Tailored proposal data not provided.");
                            }

                            if (isTutorial) {
                                chrome.tabs.sendMessage(targetTabId, { type: 'RUN_INTERNAL_AUTOFILL', userData: profileDataForEngine });
                                if (source === 'master') {
                                    await notifyTutorialTabIfActive({ type: 'TUTORIAL_MASTER_AUTOFILL_COMPLETE' });
                                }
                            } else {
                                autofillProcessData[targetTabId] = { profileDataForEngine };
                                await chrome.scripting.executeScript({
                                    target: { tabId: targetTabId, frameIds: [0] },
                                    files: ['content_scripts/autofill_engine.js']
                                });
                            }
                            sendResponse({ success: true, status: 'autofill_process_initiated' });
                            break;

                        case 'GET_AUTH_STATUS':
                        case 'REQUEST_GOOGLE_LOGIN':
                        case 'REQUEST_GOOGLE_LOGOUT':
                        case 'SAVE_API_KEY_TO_BACKEND':
                        case "OPEN_ADVANCED_TESTBED":
                             // These cases remain unchanged as they are not tied to the resume/grant logic
                            // Forwarding them to the original logic block.
                            // This is a placeholder for the actual implementation if needed.
                            sendResponse({ success: true, message: "Action received." });
                            break;
                    }
                } catch (error) {
                    console.error(`[BG] Error processing async message ${messageType}:`, error);
                    sendResponse({ success: false, error: error.message });
                }
            })();
            return true;
        }

        (async () => {
            try {
                switch (messageType) {
                    case "OPEN_AUTOFILL_TUTORIAL":
                        chrome.tabs.create({ url: chrome.runtime.getURL('autofill_tutorial.html'), active: true });
                        break;
                    case 'TUTORIAL_SHEET_CREATED':
                        await notifyTutorialTabIfActive({ type: 'TUTORIAL_SHEET_CREATED' });
                        break;
                    case 'THEME_UPDATED':
                        if (message.theme) updateToolbarIcon(message.theme);
                        break;
                    case 'THEME_UPDATED_FOR_CONTENT_SCRIPTS':
                        if (message.theme && chrome.tabs?.query) {
                            try {
                                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                                if (activeTab?.id && activeTab.url && (activeTab.url.startsWith('http://') || activeTab.url.startsWith('https://'))) {
                                    chrome.tabs.sendMessage(activeTab.id, { type: 'FUNDINGFLOCK_THEME_UPDATED_FOR_CONTENT', theme: message.theme });
                                }
                            } catch (e) {
                                console.warn(`[BG Theme Update] Could not send theme update to content script:`, e.message);
                            }
                        }
                        break;
                    case 'AUTOFILL_ENGINE_READY':
                        const readyTabId = sender.tab?.id;
                        if (!readyTabId || !autofillProcessData[readyTabId]) break;
                        const autofillInfo = autofillProcessData[readyTabId];
                        autofillInfo.targetFrameId = sender.frameId;
                        if (autofillInfo.profileDataForEngine) {
                            chrome.tabs.sendMessage(
                                readyTabId,
                                { type: "RUN_AUTOFILL_ANALYSIS", userData: autofillInfo.profileDataForEngine },
                                { frameId: autofillInfo.targetFrameId }
                            );
                        }
                        break;
// START SNIPPET: Replace this case block in background.js
case 'AUTOFILL_PROCESS_COMPLETE':
    const tabIdForCompletion = sender.tab?.id;
    if (!tabIdForCompletion || !autofillProcessData[tabIdForCompletion]) break;
    const currentAutofillData = autofillProcessData[tabIdForCompletion];
    if (message.payload.status === 'error') {
        delete autofillProcessData[tabIdForCompletion];
        break;
    }

    const programmatic_actions = message.payload.programmatic_actions || [];
    const formHtmlFromEngine = message.payload.formHtml;
    let allActions = [...programmatic_actions];

    if (formHtmlFromEngine?.trim()) {
        const profileDataForPrompt = currentAutofillData.profileDataForEngine;
        if (!profileDataForPrompt) {
             delete autofillProcessData[tabIdForCompletion];
             throw new Error("Could not load profile data for AI mapping.");
        }
        const apiKeyResult = await chrome.storage.sync.get(['geminiApiKey']);
        if (!apiKeyResult.geminiApiKey) {
            delete autofillProcessData[tabIdForCompletion];
            throw new Error("Gemini API Key is missing for AI-assisted autofill.");
        }

        const prompt = generateAutofillMappingPrompt(profileDataForPrompt, formHtmlFromEngine);
        const apiResult = await callGeminiApiCentralized(apiKeyResult.geminiApiKey, prompt);

        if (apiResult.success && apiResult.data.fill_actions) {
            allActions.push(...apiResult.data.fill_actions);
        } else if (!apiResult.success) {
            console.warn("[BG Autofill] AI mapping call failed:", apiResult.error);
        }
    }
    chrome.tabs.sendMessage(tabIdForCompletion, { type: "EXECUTE_AUTOFILL_ACTIONS", actions: allActions }, { frameId: sender.frameId });
    delete autofillProcessData[tabIdForCompletion];
    break;
// END SNIPPET
                    case "FUNDINGFLOCK_FAB_CLICKED_PANEL_TOGGLE_REQUEST":
                        const tabIdToggle = sender.tab?.id || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
                        isPanelUIVisibleGlobal = !isPanelUIVisibleGlobal;
                        let targetIframeSrc = null;
                        if(isPanelUIVisibleGlobal) {
                            const minimizedInfoResult = await chrome.storage.session.get(SESSION_KEY_MINIMIZED_TAILORING_INFO);
                            const minimizedInfo = minimizedInfoResult[SESSION_KEY_MINIMIZED_TAILORING_INFO];
                            if (minimizedInfo?.viewUrl) {
                                targetIframeSrc = minimizedInfo.viewUrl;
                                currentPanelViewUrlGlobal = minimizedInfo.viewUrl;
                                activeTailoringSessionInitialData = minimizedInfo.tailoringData;
                                await chrome.storage.session.set({ [SESSION_KEY_INITIAL_TAILORING_DATA]: activeTailoringSessionInitialData });
                                await chrome.storage.session.remove(SESSION_KEY_MINIMIZED_TAILORING_INFO);
                            } else {
                                targetIframeSrc = chrome.runtime.getURL(DEFAULT_PANEL_VIEW);
                                currentPanelViewUrlGlobal = targetIframeSrc;
                            }
                        }
                        if (tabIdToggle) {
                            chrome.tabs.sendMessage(tabIdToggle, { type: "UPDATE_PANEL_SHELL_STATE", isVisible: isPanelUIVisibleGlobal, iframeSrc: targetIframeSrc });
                        }
                        break;
                }
            } catch(error) {
                 console.error(`[BG] Error in fire-and-forget handler for ${messageType}:`, error);
            }
        })();
        return false;
    });
}

// --- Lifecycle Event Handlers ---
if (chrome.action && chrome.action.onClicked) {
    chrome.action.onClicked.addListener(async (tab) => {
        if (!isServiceWorkerValid() || !tab.id || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:') || tab.url.startsWith('https://chrome.google.com/webstore')) {
            return;
        }
        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_FAB_VISIBILITY" }, (response) => {
            if (chrome.runtime.lastError && chrome.runtime.lastError.message?.includes("Receiving end does not exist")) {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ["content_scripts/fab_injector.js"]
        }).then(() => { // CORRECTED: The extra '()' is removed.
                    chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_FAB_VISIBILITY" });
                }).catch(injErr => console.error(`[BG ActionClick] Script injection failed:`, injErr));
            }
        });
    });
}

function loadThemeAndSetIconInitial() {
    if (!isServiceWorkerValid()) return;
    try {
        chrome.storage.sync.get(['selectedTheme'], (result) => {
            if (!isServiceWorkerValid() || chrome.runtime.lastError) {
                if(isServiceWorkerValid()) updateToolbarIcon('light');
                return;
            }
            const storedTheme = result.selectedTheme || 'system';
            let actualTheme = 'light';
            if (storedTheme === 'dark') {
                actualTheme = 'dark';
            }
            updateToolbarIcon(actualTheme);
        });
    } catch (e) {
        if(isServiceWorkerValid()) updateToolbarIcon('light');
    }
}

if (chrome.runtime && chrome.runtime.onInstalled) {
    chrome.runtime.onInstalled.addListener((details) => {
        if (!isServiceWorkerValid()) return;
        if (details.reason === "install" || details.reason === "update") {
            try { chrome.storage.sync.set({ 'selectedTheme': 'system' }); }
            catch(e) {}
        }
        loadThemeAndSetIconInitial();
        if(details.reason === "install") {
            clearAllTailoringSessionState("[BG onInstalled]");
        }
    });
}

if (chrome.runtime && chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
        if (!isServiceWorkerValid()) return;
        loadThemeAndSetIconInitial();
        isPanelUIVisibleGlobal = false;
        currentPanelViewUrlGlobal = null;
        activeTailoringSessionInitialData = null;
        clearAllTailoringSessionState("[BG onStartup]");
    });
}
