// START SNIPPET: Replace the entire content of organization_profile.js with this
// File: organization_profile/organization_profile.js
// Version: Hybrid for FundingFlock.AI

document.addEventListener('DOMContentLoaded', function() {
    if (window.parent !== window) {
        document.body.classList.add('in-iframe-panel');
    }

    if (window.parent !== window && (new URLSearchParams(window.location.search)).get('context') === 'tutorial') {
        window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
        window.addEventListener('message', (event) => {
            if (event.source !== window.parent || !event.data.type) return;
            if (event.data.type === 'REQUEST_ELEMENT_RECT') {
                let element = event.data.selector ? document.querySelector(event.data.selector) : null;
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => {
                        window.parent.postMessage({
                            type: 'ELEMENT_RECT_RESPONSE',
                            stepName: event.data.stepName,
                            rect: JSON.parse(JSON.stringify(element.getBoundingClientRect()))
                        }, '*');
                    }, 400);
                } else {
                    window.parent.postMessage({ type: 'ELEMENT_RECT_RESPONSE', stepName: event.data.stepName, rect: null }, '*');
                }
            }
        });
        if (window.startOrgProfileTour) {
            window.startOrgProfileTour();
        }
    }

    const isTutorialContext = (new URLSearchParams(window.location.search)).get('context') === 'tutorial';

    // --- Element References ---
    const processDocButton = document.getElementById('processDocButton');
    const pdfProcessLoader = document.getElementById('pdfProcessLoader');
    const pdfProcessStatus = document.getElementById('pdfProcessStatus');
    const orgProfileForm = document.getElementById('orgProfileForm');
    const orgNameInput = document.getElementById('orgName');
    const orgTaxIdInput = document.getElementById('orgTaxId');
    const orgWebsiteInput = document.getElementById('orgWebsite');
    const orgMissionStatementTextarea = document.getElementById('orgMissionStatement');
    const primaryContactNameInput = document.getElementById('primaryContactName');
    const primaryContactTitleInput = document.getElementById('primaryContactTitle');
    const primaryContactEmailInput = document.getElementById('primaryContactEmail');
    const primaryContactPhoneInput = document.getElementById('primaryContactPhone');
    const orgHistoryTextarea = document.getElementById('orgHistory');
    const orgCapabilitiesTextarea = document.getElementById('orgCapabilities');
    const newProjectTitleInput = document.getElementById('newProjectTitle');
    const newProjectFunderInput = document.getElementById('newProjectFunder');
    const newProjectDatesInput = document.getElementById('newProjectDates');
    const newProjectOutcomesTextarea = document.getElementById('newProjectOutcomes');
    const commitAddProjectButton = document.getElementById('commitAddProjectButton');
    const cancelEditProjectButton = document.getElementById('cancelEditProjectButton');
    const editingProjectIndexInput = document.getElementById('editingProjectIndex');
    const projectEntriesDisplayContainer = document.getElementById('projectEntriesDisplayContainer');
    const saveProfileButton = document.getElementById('saveProfileButton');
    const profileSaveStatus = document.getElementById('profileSaveStatus');

    // --- Global State ---
    let geminiApiKey = null;
    let masterProfileData = {};
    let isDirty = false;

// START SNIPPET: Add this function to organization_profile.js
function smartPrefixUrl(url) {
    if (!url || typeof url !== 'string' || url.trim() === '') return '';
    const trimmedUrl = url.trim();
    if (!/^(https?:\/\/)/i.test(trimmedUrl)) return `https://${trimmedUrl}`;
    return trimmedUrl;
}
// END SNIPPET
    // --- Helper Functions (showStatus, escapeHtml, etc.) ---
    function setDirty(state = true) {
        if (state === isDirty) return;
        isDirty = state;
        if (saveProfileButton) {
            if (isDirty) {
                saveProfileButton.textContent = 'Save Full Organization Profile';
                saveProfileButton.disabled = false;
                saveProfileButton.classList.remove('saved-successfully');
            } else {
                saveProfileButton.textContent = 'Saved ✔';
                saveProfileButton.disabled = true;
                saveProfileButton.classList.add('saved-successfully');
            }
        }
    }

    function showStatus(element, message, type, duration = 4000) {
        if (!element) return;
        element.textContent = message;
        element.className = 'status-message-global';
        if (type) element.classList.add(`status-${type}`);
        if (duration > 0) {
            setTimeout(() => {
                if (element && element.textContent === message) {
                    element.textContent = '';
                    element.className = 'status-message-global';
                }
            }, duration);
        }
    }

    function escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') return (unsafe === null || unsafe === undefined) ? '' : String(unsafe);
        return unsafe.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, """).replace(/'/g, "'");
    }

    function callBackgroundForPdfAnalysis(apiKey, prompt, pdfBase64Data) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'CALL_GEMINI_FOR_PDF_ANALYSIS',
                payload: { apiKey, prompt, pdfBase64Data }
            }, (response) => {
                if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
                if (response?.success) resolve(response.data);
                else reject(new Error(response?.error || "Unknown background script error."));
            });
        });
    }

    function populateProfileForm(data) {
        const defaultStructure = {
            organizationInfo: {}, primaryContact: {}, projectHistory: [], coreCapabilities: [], organizationHistory: ''
        };
        masterProfileData = { ...defaultStructure, ...data };

        const orgInfo = masterProfileData.organizationInfo || {};
        const contact = masterProfileData.primaryContact || {};

        orgNameInput.value = orgInfo.name || '';
        orgTaxIdInput.value = orgInfo.taxId || '';
        orgWebsiteInput.value = orgInfo.website || '';
        orgMissionStatementTextarea.value = orgInfo.missionStatement || '';
        primaryContactNameInput.value = contact.name || '';
        primaryContactTitleInput.value = contact.title || '';
        primaryContactEmailInput.value = contact.email || '';
        primaryContactPhoneInput.value = contact.phone || '';
        orgHistoryTextarea.value = masterProfileData.organizationHistory || '';
        orgCapabilitiesTextarea.value = (masterProfileData.coreCapabilities || []).join('\n');

        renderProjectEntries();
        setDirty(false);
    }

    // --- Dynamic Entry Logic for Projects ---
    function renderProjectEntries() {
        const container = projectEntriesDisplayContainer;
        container.innerHTML = '';
        if (!masterProfileData.projectHistory || masterProfileData.projectHistory.length === 0) {
            container.innerHTML = `<p class="no-entries-message">No project entries have been added.</p>`;
            return;
        }
        masterProfileData.projectHistory.forEach((proj, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.className = `project-item entry-item`;
            itemDiv.setAttribute('data-index', index);
            const funderHtml = proj.fundingSource ? `<div class="funder-info"><strong>Funder:</strong> ${escapeHtml(proj.fundingSource)}</div>` : '';
            const datesHtml = proj.dates ? `<div class="project-dates"><strong>Dates:</strong> ${escapeHtml(proj.dates)}</div>` : '';
            const outcomesHtml = (proj.outcomes && proj.outcomes.length > 0) ? `<h6>Key Outcomes/Activities:</h6><ul>${(proj.outcomes).map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul>` : '';
            itemDiv.innerHTML = `<div class="entry-actions"><button type="button" class="edit-entry-btn" title="Edit">✏️</button><button type="button" class="delete-entry-btn" title="Delete">🗑️</button></div><h5>${escapeHtml(proj.title || 'Project Title')}</h5>${funderHtml}${datesHtml}${outcomesHtml}`;
            container.appendChild(itemDiv);
        });
    }

    function resetProjectForm() {
        newProjectTitleInput.value = '';
        newProjectFunderInput.value = '';
        newProjectDatesInput.value = '';
        newProjectOutcomesTextarea.value = '';
        editingProjectIndexInput.value = '-1';
        commitAddProjectButton.textContent = '+ Add Project';
        cancelEditProjectButton.style.display = 'none';
    }

    commitAddProjectButton.addEventListener('click', () => {
        const newEntry = {
            title: newProjectTitleInput.value.trim(),
            fundingSource: newProjectFunderInput.value.trim(),
            dates: newProjectDatesInput.value.trim(),
            outcomes: newProjectOutcomesTextarea.value.split('\n').map(s => s.trim()).filter(Boolean)
        };
        if (!newEntry.title) {
            showStatus(profileSaveStatus, 'Project Title is required.', 'warning');
            return;
        }
        const editingIndex = parseInt(editingProjectIndexInput.value, 10);
        if (editingIndex > -1) {
            masterProfileData.projectHistory[editingIndex] = newEntry;
        } else {
            masterProfileData.projectHistory.push(newEntry);
        }
        renderProjectEntries();
        resetProjectForm();
        setDirty(true);
    });

    cancelEditProjectButton.addEventListener('click', resetProjectForm);

    projectEntriesDisplayContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const itemDiv = btn.closest('.entry-item');
        const index = parseInt(itemDiv.dataset.index, 10);
        if (btn.matches('.delete-entry-btn')) {
            if (confirm('Are you sure you want to delete this project entry?')) {
                masterProfileData.projectHistory.splice(index, 1);
                renderProjectEntries();
                setDirty(true);
            }
        } else if (btn.matches('.edit-entry-btn')) {
            const entry = masterProfileData.projectHistory[index];
            newProjectTitleInput.value = entry.title || '';
            newProjectFunderInput.value = entry.fundingSource || '';
            newProjectDatesInput.value = entry.dates || '';
            newProjectOutcomesTextarea.value = (entry.outcomes || []).join('\n');
            editingProjectIndexInput.value = index;
            commitAddProjectButton.textContent = 'Update Project';
            cancelEditProjectButton.style.display = 'inline-block';
            newProjectTitleInput.focus();
        }
    });

    // --- PDF Processing Logic ---
    processDocButton.addEventListener('click', async () => {
        const file = document.getElementById('profileDocUploadInput').files[0];
        if (!file) return showStatus(pdfProcessStatus, "Please select a PDF file.", "warning");
        if (!geminiApiKey) return showStatus(pdfProcessStatus, "API Key is missing.", "error");

        pdfProcessLoader.style.display = 'block';
        processDocButton.disabled = true;
        showStatus(pdfProcessStatus, "Analyzing document with AI...", "info", 0);

        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const pdfBase64 = reader.result.split(',')[1];
                const prompt = `
                    You are a high-precision data extraction engine for grant-seeking organizations. Analyze the provided document and extract its content into a structured JSON object.
                    CRITICAL INSTRUCTIONS:
                    1. Extract text verbatim. Do NOT summarize or invent information.
                    2. If a section or field is not present, use an empty string "" for fields or an empty array [] for lists.
                    JSON SCHEMA: Adhere strictly to this schema. Your entire response MUST be a single, valid JSON object.
                    {
                      "organizationInfo": { "name": "string", "taxId": "string", "website": "string", "missionStatement": "string" },
                      "primaryContact": { "name": "string", "title": "string", "email": "string", "phone": "string" },
                      "organizationHistory": "string",
                      "coreCapabilities": ["string"],
                      "projectHistory": [{ "title": "string", "fundingSource": "string", "dates": "string", "outcomes": ["string"] }]
                    }
                `;
                const finalParsedData = await callBackgroundForPdfAnalysis(geminiApiKey, prompt, pdfBase64);
                populateProfileForm(finalParsedData);
                setDirty(true);
                showStatus(pdfProcessStatus, "Document processed successfully! Please review and save.", "success");
            };
        } catch (error) {
            showStatus(pdfProcessStatus, `Error: ${error.message}`, "error");
        } finally {
            pdfProcessLoader.style.display = 'none';
            processDocButton.disabled = false;
        }
    });

    // --- Form Saving Logic ---
    orgProfileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        masterProfileData.organizationInfo = {
            name: orgNameInput.value.trim(),
            taxId: orgTaxIdInput.value.trim(),
            website: smartPrefixUrl(orgWebsiteInput.value),
            missionStatement: orgMissionStatementTextarea.value.trim(),
        };
        masterProfileData.primaryContact = {
            name: primaryContactNameInput.value.trim(),
            title: primaryContactTitleInput.value.trim(),
            email: primaryContactEmailInput.value.trim(),
            phone: primaryContactPhoneInput.value.trim(),
        };
        masterProfileData.organizationHistory = orgHistoryTextarea.value.trim();
        masterProfileData.coreCapabilities = orgCapabilitiesTextarea.value.split('\n').map(s => s.trim()).filter(Boolean);

        chrome.storage.local.set({ 'parsedOrgProfileData': masterProfileData }, () => {
            if (chrome.runtime.lastError) {
                showStatus(profileSaveStatus, `Error: ${chrome.runtime.lastError.message}`, "error");
            } else {
                showStatus(profileSaveStatus, "Profile saved successfully!", "success");
                setDirty(false);
                if (isTutorialContext) {
                    chrome.runtime.sendMessage({ type: 'PROFILE_WAS_SAVED' });
                }
            }
        });
    });

    // --- Page Initialization ---
    async function initializePage() {
        const keyResult = await chrome.storage.sync.get('geminiApiKey');
        geminiApiKey = keyResult.geminiApiKey;
        processDocButton.disabled = !geminiApiKey;

        const profileResult = await chrome.storage.local.get('parsedOrgProfileData');
        populateProfileForm(profileResult.parsedOrgProfileData || {});

        orgProfileForm.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', () => setDirty(true));
        });

        orgProfileForm.addEventListener('click', (event) => {
            const header = event.target.closest('.section-header');
            if (header) {
                const section = header.closest('.section-collapsible');
                const btn = header.querySelector('.section-toggle-button');
                if (section && btn) {
                    const isExpanded = section.classList.toggle('is-expanded');
                    btn.setAttribute('aria-expanded', isExpanded);
                }
            }
        });
// START SNIPPET: Add this inside the initializePage function in organization_profile.js
if (orgWebsiteInput) {
    orgWebsiteInput.addEventListener('blur', function() {
        this.value = smartPrefixUrl(this.value);
    });
}
// END SNIPPET
    }

    initializePage();
// START SNIPPET: Add to organization_profile.js
// --- DYNAMIC HEIGHT MESSAGING TO PARENT PANEL ---
let heightSendTimeout = null;
function sendHeightToParentDebounced() {
    clearTimeout(heightSendTimeout);
    heightSendTimeout = setTimeout(() => {
        if (window.parent !== window) {
            const pageContainer = document.querySelector('.page-container.profile-page');
            const calculatedContentHeight = pageContainer ? pageContainer.scrollHeight : document.body.scrollHeight;
            window.parent.postMessage({
                type: 'FUNDINGFLOCK_IFRAME_CONTENT_HEIGHT',
                height: calculatedContentHeight + 20 // Add buffer
            }, '*');
        }
    }, 150);
}
if (typeof ResizeObserver !== "undefined") {
    const pageContainerForObserver = document.querySelector('.page-container.profile-page');
    if (pageContainerForObserver) {
        const resizeObserver = new ResizeObserver(sendHeightToParentDebounced);
        resizeObserver.observe(pageContainerForObserver);
    }
}
setTimeout(sendHeightToParentDebounced, 300);
// END SNIPPET
});
// END SNIPPET
