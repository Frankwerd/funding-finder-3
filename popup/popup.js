// File: popup/popup.js
// GrantSuite.AI Final Version

document.addEventListener('DOMContentLoaded', function() {
    if (window.parent !== window && (new URLSearchParams(window.location.search)).get('context') === 'tutorial') {
        window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
    }

    // --- DOM ELEMENT REFERENCES ---
    const analyzeButton = document.getElementById('analyzeButton');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorMessageDiv = document.getElementById('errorMessage');
    const resultsArea = document.getElementById('resultsArea');
    const openOptionsLink = document.getElementById('openOptionsPageLink');
    const openOrgProfileButton = document.getElementById('openOrgProfileButton');
    const openTrackerSheetButton = document.getElementById('openTrackerSheetButton');
    const trackerStatusMessage = document.getElementById('trackerStatusMessage');
    const weeklyStatsSectionDiv = document.getElementById('weeklyStatsSection');
    const weeklyStatsLoadingMessageDiv = document.getElementById('weeklyStatsLoadingMessage');
    const weeklyStatsErrorMessageDiv = document.getElementById('weeklyStatsErrorMessage');
    const weeklyAppsChartCanvas = document.getElementById('weeklyAppsChartCanvas');
    const tailorProposalButton = document.getElementById('tailorProposalButton');
    const proposalTailoringTriggerSectionDiv = document.getElementById('proposalTailoringSection');
    const proposalTailoringSessionButton = document.getElementById('proposalTailoringSessionButton');
    const masterAutofillButton = document.getElementById('masterAutofillButton');
    const logoutButton = document.getElementById('logoutButton');

    // --- GLOBAL STATE ---
    let geminiApiKey = null;
    let userTrackerSheetId = null;
    let weeklyChartInstance = null;
    let currentRfpAnalysisData = null;

    const WEB_APP_BASE_URL = "https://script.google.com/macros/s/AKfycbyYR4sMfRplUw92UC1MiYad9V_0o3jL0j73Om3JJCrxBTIFxpUvEClMUdEVjkKzdDRK/exec";

    // --- HELPER FUNCTIONS ---

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            return (unsafe === null || unsafe === undefined) ? '' : String(unsafe);
        }
        return unsafe
            .replace(/&/g, "&")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "'");
    }
    
    function setLoadingState(isLoading) {
        if (loadingIndicator) loadingIndicator.style.display = isLoading ? 'block' : 'none';
        if (resultsArea) resultsArea.style.display = isLoading ? 'none' : 'block';
        if (analyzeButton) analyzeButton.disabled = isLoading || !geminiApiKey;
    }

    async function getApiKeyFromStorage() {
        try {
            const result = await chrome.storage.sync.get('geminiApiKey');
            return result.geminiApiKey;
        } catch (e) {
            console.error("Error getting API key:", e);
            return null;
        }
    }
    
    function callBackgroundGemini(apiKey, prompt) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'CALL_GEMINI_API', payload: { apiKey, prompt } }, (response) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (response?.success) resolve(response.data);
                else reject(new Error(response?.error || "Unknown Gemini API error."));
            });
        });
    }

    function generateRfpAnalysisPrompt(textSegment) {
        return `Analyze the following funding opportunity description (RFP). Extract key information into a single, valid JSON object. The JSON object MUST strictly adhere to this structure: { "funderName": "string_or_null", "opportunityTitle": "string_or_null", "fundingPriorities": ["string", "..."], "eligibilityRequirements": ["string", "..."], "awardRange": "string_or_null", "deadline": "string_or_null", "keyKeywords": ["string", "..."], "reportingRequirements": ["string", "..."] }. Return ONLY the raw JSON object. Do NOT include any explanatory text or markdown. RFP Text:\n---\n${textSegment}\n---`;
    }

    function displayGeminiResults(analysis) {
        currentRfpAnalysisData = analysis;
        let htmlContent = '';
        if (analysis?.opportunityTitle) {
            htmlContent = `<h3>AI Opportunity Analysis:</h3>
                           <p><strong>Title:</strong> ${escapeHtml(analysis.opportunityTitle)}</p>
                           <p><strong>Funder:</strong> ${escapeHtml(analysis.funderName)}</p>`;
            if (analysis.keyKeywords?.length) {
                htmlContent += `<h4>Top Keywords:</h4><ul>${analysis.keyKeywords.slice(0, 5).map(k => `<li>${escapeHtml(k)}</li>`).join('')}</ul>`;
            }
            if (proposalTailoringTriggerSectionDiv) proposalTailoringTriggerSectionDiv.style.display = 'block';
        } else {
            htmlContent = "<p>AI analysis could not extract key details. Please try another opportunity.</p>";
            if (proposalTailoringTriggerSectionDiv) proposalTailoringTriggerSectionDiv.style.display = 'none';
        }
        resultsArea.innerHTML = htmlContent;
    }
    
    async function initializePopup() {
        geminiApiKey = await getApiKeyFromStorage();
        
        const uiElements = [analyzeButton, openTrackerSheetButton, openOrgProfileButton, masterAutofillButton];
        uiElements.forEach(el => { if(el) el.style.display = 'block'; });

        if(proposalTailoringTriggerSectionDiv) proposalTailoringTriggerSectionDiv.style.display = 'none';
        if(resultsArea && !currentRfpAnalysisData) resultsArea.innerHTML = '<p class="placeholder-text">Click "Analyze" to see AI insights for this opportunity.</p>';

        if (analyzeButton) analyzeButton.disabled = !geminiApiKey;

        const profileResult = await chrome.storage.local.get(['parsedOrgProfileData']);
        if (masterAutofillButton) {
            masterAutofillButton.style.display = profileResult.parsedOrgProfileData ? 'block' : 'none';
        }
    }

    // --- EVENT LISTENERS ---
    
    if (analyzeButton) {
        analyzeButton.addEventListener('click', async function() {
            if (errorMessageDiv) errorMessageDiv.style.display = 'none';
            setLoadingState(true);
            
            try {
                const currentApiKey = await getApiKeyFromStorage();
                if (!currentApiKey) throw new Error("API Key not set. Please go to Settings.");

                const { tabId } = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_ID' });
                const injectionResults = await chrome.scripting.executeScript({
                    target: { tabId },
                    function: () => document.body.innerText
                });
                const pageText = injectionResults?.[0]?.result;

                if (pageText && pageText.trim()) {
                    const prompt = generateRfpAnalysisPrompt(pageText.substring(0, 180000));
                    const analysisResult = await callBackgroundGemini(currentApiKey, prompt);
                    analysisResult.opportunityId = `opp_${Date.now()}`;
                    await chrome.storage.session.set({ 'rfpAnalysisData': analysisResult });
                    displayGeminiResults(analysisResult);
                } else {
                    throw new Error("Could not extract text from the page.");
                }
            } catch (error) {
                if (errorMessageDiv) {
                    errorMessageDiv.textContent = `Analysis Error: ${error.message}`;
                    errorMessageDiv.style.display = 'block';
                }
            } finally {
                setLoadingState(false);
            }
        });
    }

    if (tailorProposalButton) {
        tailorProposalButton.addEventListener('click', async () => {
            const [profileResult, sessionResult] = await Promise.all([
                chrome.storage.local.get('parsedOrgProfileData'),
                chrome.storage.session.get('rfpAnalysisData')
            ]);
            
            const orgProfile = profileResult.parsedOrgProfileData;
            const rfpAnalysis = sessionResult.rfpAnalysisData;

            if (!rfpAnalysis || !orgProfile) {
                errorMessageDiv.textContent = "Please analyze an opportunity and save an Organization Profile first.";
                errorMessageDiv.style.display = 'block';
                return;
            }

            chrome.runtime.sendMessage({
                type: "NAVIGATE_PANEL_VIEW",
                targetView: "tailoring/tailor_proposal.html",
                dataForNextView: {
                    rfpForTailoring: rfpAnalysis,
                    orgProfileForTailoring: orgProfile,
                    opportunityId: rfpAnalysis.opportunityId
                }
            });
        });
    }

    if (openOrgProfileButton) {
        openOrgProfileButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({
                type: "NAVIGATE_PANEL_VIEW",
                targetView: "organization_profile/organization_profile.html"
            });
        });
    }

    if (openOptionsLink) {
        openOptionsLink.addEventListener('click', (e) => {
            e.preventDefault();
            chrome.runtime.sendMessage({ type: "NAVIGATE_PANEL_VIEW", targetView: "options/options.html" });
        });
    }
    
    if (masterAutofillButton) {
        masterAutofillButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: "REQUEST_MASTER_AUTOFILL" });
        });
    }

    initializePopup();
// START SNIPPET: Add to popup.js
// --- DYNAMIC HEIGHT MESSAGING TO PARENT PANEL ---
let heightSendTimeout = null;
function sendHeightToParentDebounced() {
    clearTimeout(heightSendTimeout);
    heightSendTimeout = setTimeout(() => {
        if (window.parent !== window) {
            const calculatedContentHeight = document.body.scrollHeight;
            window.parent.postMessage({
                type: 'FUNDINGFLOCK_IFRAME_CONTENT_HEIGHT',
                height: calculatedContentHeight + 20 // Add buffer
            }, '*');
        }
    }, 150);
}
if (typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(sendHeightToParentDebounced);
    resizeObserver.observe(document.body);
}
setTimeout(sendHeightToParentDebounced, 250);
// END SNIPPET
});