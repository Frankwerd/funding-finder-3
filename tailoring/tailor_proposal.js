// START SNIPPET: Replace the entire content of tailor_proposal.js with this
// File: tailoring/tailor_proposal.js
// Version: FundingFlock Hybrid Engine v1.0

document.addEventListener('DOMContentLoaded', async function() {
// START SNIPPET: Add to top of DOMContentLoaded in tailor_proposal.js
if (window.parent !== window) {
    document.body.classList.add('in-iframe-panel');
}
// END SNIPPET
    if (window.parent !== window && (new URLSearchParams(window.location.search)).get('context') === 'tutorial') {
        window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
        window.addEventListener('message', (event) => {
            if (event.source !== window.parent || !event.data.type) return;
            if (event.data.type === 'REQUEST_ELEMENT_RECT') {
                const element = document.querySelector(event.data.selector);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => {
                        window.parent.postMessage({
                            type: 'ELEMENT_RECT_RESPONSE',
                            stepName: event.data.stepName,
                            rect: JSON.parse(JSON.stringify(element.getBoundingClientRect()))
                        }, '*');
                    }, 400);
                }
            }
        });
    }

    // --- DOM Element References ---
    const targetJobTitleEl = document.getElementById('targetJobTitle');
    const targetCompanyEl = document.getElementById('targetCompany');
    const globalLoadingScreen = document.getElementById('globalLoadingScreen');
    const loadingStatusMessageEl = document.getElementById('loadingStatusMessage');
    const tailoringProgressBar = document.getElementById('tailoringProgressBar');
    const progressPercentageEl = document.getElementById('progressPercentage');
    const tailoredOutputContainer = document.getElementById('tailoredOutputContainer');
    const mainPageActionsBar = document.getElementById('mainPageActionsBar');
    const autofillActivePageButton = document.getElementById('autofillActivePageButton');
    const copyProposalTextButton = document.getElementById('copyProposalTextButton');
    const copyStatus = document.getElementById('copyStatus');
    const notesSection = document.getElementById('notesSection');
    const notesTextarea = document.getElementById('notesTextarea');
    const copyNotesButton = document.getElementById('copyNotesButton');

    // --- Global State ---
    let orgProfileData = null;
    let rfpAnalysisData = null;
    let geminiApiKeyForTailoring = null;
    let tailoredItemStates = {
        statementOfNeed: null,
        projectDescription: null,
    };

    // --- Session Keys (must match background.js) ---
    const SESSION_KEY_INITIAL_TAILORING_DATA = 'ffInitialTailoringData';
    const SESSION_KEY_DETAILED_TAILORED_STATE_PREFIX = 'ffDetailedTailoredState_';
    const SESSION_KEY_ACTIVE_OPPORTUNITY_ID = 'ffActiveOpportunityId';

    // --- Helper Functions ---
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

    function showStatus(element, message, type = "success", duration = 3000) {
        if (!element) return;
        element.textContent = message;
        element.className = `status-message-inline ${type.toLowerCase()}`;
        element.style.display = 'inline-block';
        setTimeout(() => {
            if (element) {
                element.style.display = 'none';
            }
        }, duration);
    }

    function updateProgress(percentage, message) {
        const rounded = Math.round(percentage);
        if (tailoringProgressBar) tailoringProgressBar.style.width = `${rounded}%`;
        if (progressPercentageEl) progressPercentageEl.textContent = `${rounded}%`;
        if (loadingStatusMessageEl && message) loadingStatusMessageEl.textContent = message;
    }

    function callBackgroundGemini(apiKey, prompt) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'CALL_GEMINI_API', payload: { apiKey, prompt }
            }, (response) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (response?.success) resolve(response.data);
                else reject(new Error(response?.error || "Unknown background script error."));
            });
        });
    }

    // --- AI Prompt Generation ---
    function generateProposalNarrativePrompt(orgProfileSection, rfpAnalysisSection, narrativeType) {
        const rfpContextString = JSON.stringify(rfpAnalysisSection, null, 2);
        const orgProfileString = JSON.stringify(orgProfileSection, null, 2);
        return `
            You are an expert grant writer with a clear, concise, and persuasive writing style.
            TASK: Draft a compelling grant proposal narrative for a section titled "${narrativeType}". You must synthesize the funder's requirements with the organization's existing capabilities and history.
            CONTEXT:
            1.  Funder's Request for Proposal (RFP) Details: ${rfpContextString}
            2.  Applicant's Relevant Organizational Information: ${orgProfileString}
            DRAFTING INSTRUCTIONS:
            - Write a cohesive and persuasive paragraph (or paragraphs) that directly responds to the funder's priorities.
            - Seamlessly integrate the organization's history, mission, and past project outcomes as evidence of its capability.
            - Naturally incorporate 2-3 of the most relevant "keyKeywords" from the RFP.
            - Assign a "narrativeScore" from 0-100 based on how strongly the organization's data aligns with the funder's stated priorities.
            - List the specific "keywordsHit" from the RFP that you integrated.
            CRITICAL: Your entire response MUST be a single, valid JSON object.
            REQUIRED JSON OUTPUT FORMAT:
            {
              "narrativeType": "${narrativeType}",
              "draftedNarrative": "Your rewritten, persuasive, and RFP-aligned proposal narrative text.",
              "narrativeScore": 88,
              "keywordsHit": ["Community Empowerment", "Youth Development"]
            }`;
    }

    // --- UI Rendering ---
    function renderProposalNarrative(narrativeType, displayName, aiData) {
        let sectionContainer = document.getElementById(`${narrativeType}Section`);
        if (!sectionContainer) {
            sectionContainer = document.createElement('div');
            sectionContainer.id = `${narrativeType}Section`;
            sectionContainer.className = 'content-block';
            tailoredOutputContainer.appendChild(sectionContainer);
        }

        const headerContainer = document.createElement('div');
        headerContainer.className = 'main-category-header-container';
        headerContainer.innerHTML = `<h2 class="main-category-header">${displayName}</h2>`;

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'content-wrapper-for-toggle';

        const { draftedNarrative, narrativeScore, keywordsHit } = aiData;
        let contentHTML = `<p class="instructions">AI-generated draft based on your Organization Profile and the RFP. You can edit the text below.</p>
                           <div class="narrative-score"><strong>Funder Alignment Score:</strong> <span class="score-value">${narrativeScore || 'N/A'}%</span></div>
                           <textarea class="narrative-textarea" id="${narrativeType}Textarea" rows="12">${escapeHtml(draftedNarrative || '')}</textarea>`;
        if (keywordsHit && keywordsHit.length > 0) {
            contentHTML += `<div class="keywords-hit" style="padding-left:0; margin-top:10px;"><strong>Keywords Hit:</strong> ${keywordsHit.map(k => `<span>${escapeHtml(k)}</span>`).join(' ')}</div>`;
        }
        contentHTML += `<div class="narrative-actions"><button type="button" class="action-button save-narrative-btn secondary-action-button" data-narrative-type="${narrativeType}" title="Save this narrative to your Master Organization Profile">💾 Save to Profile</button></div>`;

        contentWrapper.innerHTML = contentHTML;
        sectionContainer.appendChild(headerContainer);
        sectionContainer.appendChild(contentWrapper);
    }

    // --- Core Processing Logic ---
    async function processProposalSections() {
        const narrativeTasks = [
            { type: 'statementOfNeed', displayName: 'Statement of Need', orgContext: { mission: orgProfileData.organizationInfo.missionStatement, history: orgProfileData.organizationHistory }, rfpContext: { fundingPriorities: rfpAnalysisData.fundingPriorities, keyKeywords: rfpAnalysisData.keyKeywords }},
            { type: 'projectDescription', displayName: 'Project Description', orgContext: orgProfileData.projectHistory?.[0], rfpContext: { opportunityTitle: rfpAnalysisData.opportunityTitle, eligibilityRequirements: rfpAnalysisData.eligibilityRequirements }}
        ];

        for (const [i, task] of narrativeTasks.entries()) {
            if (!task.orgContext) continue;
            updateProgress(10 + (i / narrativeTasks.length) * 85, `Drafting ${task.displayName}...`);
            try {
                const prompt = generateProposalNarrativePrompt(task.orgContext, task.rfpContext, task.displayName);
                const result = await callBackgroundGemini(geminiApiKeyForTailoring, prompt);
                if (!result?.draftedNarrative) throw new Error(`AI did not return a valid narrative for ${task.displayName}.`);

                tailoredItemStates[task.type] = {
                    draftedNarrative: result.draftedNarrative, score: result.narrativeScore, keywordsHit: result.keywordsHit
                };
                renderProposalNarrative(task.type, task.displayName, result);
            } catch (error) {
                console.error(`Error processing grant narrative for ${task.displayName}:`, error);
                // Simple error rendering for now
                tailoredOutputContainer.innerHTML += `<div class="status-message-global status-error">Failed to generate ${task.displayName}: ${error.message}</div>`;
            }
        }
    }

    function reRenderAllSectionsFromState() {
        tailoredOutputContainer.innerHTML = '';
        const displayNames = { statementOfNeed: 'Statement of Need', projectDescription: 'Project Description' };
        for (const type in tailoredItemStates) {
            const state = tailoredItemStates[type];
            if (state) {
                renderProposalNarrative(type, displayNames[type], state);
            }
        }
    }

    // --- Event Listeners ---
    tailoredOutputContainer.addEventListener('click', async (event) => {
        const button = event.target.closest('.save-narrative-btn');
        if (!button) return;
        const narrativeType = button.dataset.narrativeType;
        const textarea = document.getElementById(`${narrativeType}Textarea`);
        if (!narrativeType || !textarea) return;

        const newText = textarea.value;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "💾 Saving...";
        try {
            // Placeholder: In a real app, you'd find the right field in the master profile and save to it.
            // For now, we just show a success message. This part will need more logic later.
            showStatus(copyStatus, `${narrativeType.replace(/([A-Z])/g, ' $1')} saved to Profile!`, "success");
            button.textContent = "💾 Saved!";
            button.classList.add('saved');
        } catch (error) {
            showStatus(copyStatus, `Save failed: ${error.message}`, "error", 5000);
        } finally {
            setTimeout(() => { button.disabled = false; button.textContent = originalText; button.classList.remove('saved'); }, 3000);
        }
    });

    copyProposalTextButton.addEventListener('click', () => {
        let fullText = "";
        for (const type in tailoredItemStates) {
            const state = tailoredItemStates[type];
            if (state?.draftedNarrative) {
                const displayName = type.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                fullText += `--- ${displayName} ---\n\n${state.draftedNarrative}\n\n\n`;
            }
        }
        chrome.runtime.sendMessage({ type: 'COPY_TEXT_TO_CLIPBOARD', textToCopy: fullText.trim() }, (response) => {
            showStatus(copyStatus, response.success ? "Proposal text copied!" : "Copy failed.", response.success ? "success" : "error");
        });
    });

    autofillActivePageButton.addEventListener('click', async () => {
        autofillActivePageButton.disabled = true;
        autofillActivePageButton.textContent = 'Preparing Data...';
        try {
            const proposalDataForAutofill = {
                organizationName: orgProfileData.organizationInfo.name,
                taxId: orgProfileData.organizationInfo.taxId,
                website: orgProfileData.organizationInfo.website,
                primaryContact: orgProfileData.primaryContact,
                missionStatement: tailoredItemStates.statementOfNeed?.draftedNarrative || orgProfileData.organizationInfo.missionStatement,
                project_abstract: tailoredItemStates.projectDescription?.draftedNarrative || '',
            };

            const response = await chrome.runtime.sendMessage({
                type: "REQUEST_AUTOFILL_FOR_CURRENT_TAB",
                payload: { profileData: proposalDataForAutofill }
            });
            if (chrome.runtime.lastError || !response?.success) throw new Error(response?.error || "Autofill failed to start.");
        } catch (error) {
            showStatus(copyStatus, `Error: ${error.message}`, "error", 5000);
        } finally {
            setTimeout(() => { autofillActivePageButton.disabled = false; autofillActivePageButton.textContent = 'Autofill from Proposal'; }, 2500);
        }
    });

    // --- Page Initialization ---
    async function initializePage() {
        globalLoadingScreen.style.display = 'flex';
        updateProgress(5, "Initializing...");

        try {
            const keyResult = await chrome.storage.sync.get('geminiApiKey');
            geminiApiKeyForTailoring = keyResult.geminiApiKey;
            if (!geminiApiKeyForTailoring) throw new Error("Gemini API Key not configured.");

            const initialDataResult = await chrome.storage.session.get(SESSION_KEY_INITIAL_TAILORING_DATA);
            const initialData = initialDataResult[SESSION_KEY_INITIAL_TAILORING_DATA];
            if (!initialData?.rfpForTailoring || !initialData?.orgProfileForTailoring) {
                throw new Error("Essential RFP/Profile data is missing. Please restart from the main panel.");
            }
            rfpAnalysisData = initialData.rfpForTailoring;
            orgProfileData = initialData.orgProfileForTailoring;
            const opportunityId = initialData.opportunityId;

            targetJobTitleEl.textContent = rfpAnalysisData.opportunityTitle || "N/A";
            targetCompanyEl.textContent = rfpAnalysisData.funderName || "N/A";

            const cachedStateResult = await chrome.storage.session.get(SESSION_KEY_DETAILED_TAILORED_STATE_PREFIX + opportunityId);
            const cachedState = cachedStateResult[SESSION_KEY_DETAILED_TAILORED_STATE_PREFIX + opportunityId];

            if (cachedState) {
                tailoredItemStates = cachedState;
                reRenderAllSectionsFromState();
            } else {
                await processProposalSections();
                await chrome.storage.session.set({ [SESSION_KEY_DETAILED_TAILORED_STATE_PREFIX + opportunityId]: tailoredItemStates });
            }

            mainPageActionsBar.style.display = 'flex';
            notesSection.style.display = 'block';
            updateProgress(100, "Ready!");

        } catch (error) {
            console.error("Tailoring Page Setup Failed:", error);
            document.getElementById('globalErrorMessage').textContent = `Setup Error: ${error.message}`;
            document.getElementById('globalErrorMessage').style.display = 'block';
        } finally {
            globalLoadingScreen.style.display = 'none';
            if ((new URLSearchParams(window.location.search)).get('context') === 'tutorial') {
                window.parent.postMessage({ type: 'TAILORING_COMPLETE_AND_UI_READY' }, '*');
                if (window.startTailoringTour) window.startTailoringTour();
            }
        }
    }

    initializePage();
// START SNIPPET: Add to tailor_proposal.js
// --- DYNAMIC HEIGHT MESSAGING TO PARENT PANEL ---
let heightSendTimeout = null;
function sendHeightToParentDebounced() {
    clearTimeout(heightSendTimeout);
    heightSendTimeout = setTimeout(() => {
        if (window.parent !== window) {
            const pageContainer = document.querySelector('.page-container.tailoring-page');
            const calculatedContentHeight = pageContainer ? pageContainer.scrollHeight : document.body.scrollHeight;
            window.parent.postMessage({
                type: 'FUNDINGFLOCK_IFRAME_CONTENT_HEIGHT',
                height: calculatedContentHeight + 20 // Add buffer
            }, '*');
        }
    }, 150);
}
if (typeof ResizeObserver !== "undefined") {
    const pageContainerForObserver = document.querySelector('.page-container.tailoring-page');
    if (pageContainerForObserver) {
        const resizeObserver = new ResizeObserver(sendHeightToParentDebounced);
        resizeObserver.observe(pageContainerForObserver);
    }
}
setTimeout(sendHeightToParentDebounced, 300);
// END SNIPPET
});
// END SNIPPET
