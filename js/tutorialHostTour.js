// START SNIPPET: Replace entire content of tutorialHostTour.js
document.addEventListener('DOMContentLoaded', async () => {
    const iframe = document.getElementById('setupIframe');
    const iframeContainer = document.getElementById('setup-iframe-container');
    const pageContainer = document.querySelector('.page-container.tutorial-container');
    const skipButton = document.getElementById('skipTutorialButton');
    const TUTORIAL_COMPLETED_KEY = 'hasCompletedFirstRunTutorialV2';
    let currentStepKey = 'start';

    const tourSteps = {
        'start': { view: 'popup/popup.html', message: "Welcome to FundingFlock.AI! 👋 This guided setup will help you connect your accounts and learn the core features for grant applications.", ctaButtonText: "Let's Begin!", onCta: () => navigateToStep('navigateToSettings') },
        'navigateToSettings': { view: 'popup/popup.html', message: "First, click 'Settings' to open the options page where you'll add your AI API key.", iframeTargetSelector: '#openOptionsPageLink', position: 'left_top_of_target' },
        'apiKeyInstructions': { view: 'options/options.html', message: "Paste your Google Gemini API Key into the input field and click 'Save API Key'. You can get a key from Google AI Studio.", iframeTargetSelector: '.api-key-section', position: 'left' },
        'returnToPopup': { view: 'options/options.html', message: "API Key Saved! ✅ Return to the main panel to set up your Grant Tracker sheet.", ctaButtonText: "Okay, I'll go back", onCta: () => navigateToStep('createSheet') },
        'createSheet': { view: 'popup/popup.html', message: "Great! Now, click 'Create Your Grant Tracker Sheet' to set up your Google Sheet for tracking opportunities.", iframeTargetSelector: '#openTrackerSheetButton', position: 'left_top_of_target' },
        'navigateToProfile': { view: 'popup/popup.html', message: "Sheet Setup Complete! ✅ Next, click 'My Organization Profile' to build your master profile.", iframeTargetSelector: '#openOrgProfileButton', position: 'left_top_of_target' },
        'waitForProfileSave': { view: 'organization_profile/organization_profile.html', message: "This is your Master Organization Profile. Fill it out with your non-profit's information. <strong>Click 'Save Full Organization Profile' at the bottom when you're done.</strong> The tour will continue automatically.", ctaButtonText: null },
        'profileSaved': { view: 'popup/popup.html', message: "Profile Saved! ✅ Now, let's use it. Click 'Autofill from Org. Profile' to automatically fill the sample grant application on the left.", iframeTargetSelector: '#masterAutofillButton', position: 'left_top_of_target' },
        'autofillComplete': { view: 'popup/popup.html', message: "Autofill successful! Notice how your profile data filled the form. Next, click 'Analyze Funding Opportunity' to see how the AI analyzes the sample RFP.", iframeTargetSelector: '#analyzeButton', position: 'left_top_of_target' },
        'analysisComplete': { view: 'popup/popup.html', message: "Analysis complete! The AI has extracted the funder's priorities and requirements. This data is now ready for tailoring your proposal.", ctaButtonText: "Next", onCta: () => navigateToStep('promptToTailor') },
        'promptToTailor': { view: 'popup/popup.html', message: "Now, click 'Tailor Proposal' to generate AI-powered narrative suggestions based on the RFP analysis and your profile.", iframeTargetSelector: '#tailorProposalButton', position: 'left_top_of_target' }
    };

    let responseListeners = new Map();

    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'TUTORIAL_NAVIGATE_TO_OPTIONS') navigateToStep('apiKeyInstructions');
        else if (message.type === 'TUTORIAL_API_KEY_SAVED') navigateToStep('returnToPopup');
        else if (message.type === 'TUTORIAL_SHEET_CREATED') navigateToStep('navigateToProfile');
        else if (message.type === 'TUTORIAL_NAVIGATE_TO_PROFILE') navigateToStep('waitForProfileSave');
        else if (message.type === 'TUTORIAL_PROFILE_SAVED') navigateToStep('profileSaved');
        else if (message.type === 'TUTORIAL_NAVIGATE_IFRAME') iframe.src = chrome.runtime.getURL(message.newSrc + '?context=tutorial');
        else if (message.type === 'TUTORIAL_MASTER_AUTOFILL_COMPLETE') navigateToStep('autofillComplete');
        else if (message.type === 'TUTORIAL_ANALYSIS_COMPLETE') navigateToStep('analysisComplete');
        else if (message.type === 'TUTORIAL_TAILORING_STARTED') {
            Promise.all([
                chrome.storage.session.get('rfpAnalysisData'),
                chrome.storage.local.get('parsedOrgProfileData')
            ]).then(([sessionData, localData]) => {
                const initialData = {
                    rfpForTailoring: sessionData.rfpAnalysisData,
                    orgProfileForTailoring: localData.parsedOrgProfileData,
                    opportunityId: sessionData.rfpAnalysisData?.opportunityId || `tutorial_opp_${Date.now()}`
                };
                chrome.storage.session.set({ 'ffInitialTailoringData': initialData }, () => {
                    window.location.href = 'advanced_tailoring_tutorial.html';
                });
            });
        }
    });

    window.addEventListener('message', async (event) => {
        if (event.source !== iframe.contentWindow) return;
        const message = event.data;
        if (message.type === 'IFRAME_READY') displayPromptForStep(currentStepKey);
        else if (message.type === 'ELEMENT_RECT_RESPONSE') {
            const resolver = responseListeners.get(message.stepName);
            if (resolver) resolver(message.rect);
        }
    });

    function getRectFromIframe(selector, stepName) {
        return new Promise(resolve => {
            responseListeners.set(stepName, resolve);
            iframe.contentWindow.postMessage({ type: 'REQUEST_ELEMENT_RECT', selector, stepName }, '*');
        });
    }

    async function displayPromptForStep(stepKey) {
        document.querySelectorAll('.guided-tour-chat-box').forEach(el => el.remove());
        const step = tourSteps[stepKey];
        if (!step) return;
        let targetRect = step.iframeTargetSelector ? await getRectFromIframe(step.iframeTargetSelector, stepKey) : null;
        const iframeRect = iframeContainer.getBoundingClientRect();
        let absolutePos = targetRect ? { top: iframeRect.top + targetRect.top, left: iframeRect.left + targetRect.left, width: targetRect.width, height: targetRect.height } : null;
        window.createChatBoxDirectly(step.message, { position: step.position || 'left', ctaButtonText: step.ctaButtonText, absolutePos, onCta: step.onCta });
    }

    function navigateToStep(stepKey) {
        currentStepKey = stepKey;
        const step = tourSteps[stepKey];
        if (!step) return;
        const targetViewUrl = chrome.runtime.getURL(step.view + '?context=tutorial');
        let newWidth = step.view.includes('organization_profile') ? '950px' : '420px';
        iframeContainer.style.width = newWidth;
        pageContainer.style.paddingRight = `calc(${newWidth} + 20px)`;
        if (iframe.src !== targetViewUrl) iframe.src = targetViewUrl;
        else displayPromptForStep(stepKey);
    }

    skipButton.addEventListener('click', async () => {
        await chrome.storage.local.set({ [TUTORIAL_COMPLETED_KEY]: true });
        document.body.innerHTML = '<h1>Setup Skipped</h1><p>You can close this tab.</p>';
    });

    const isCompleted = (await chrome.storage.local.get(TUTORIAL_COMPLETED_KEY))[TUTORIAL_COMPLETED_KEY];
    if (isCompleted) document.body.innerHTML = '<h1>Tutorial Complete!</h1><p>You can close this tab.</p>';
    else navigateToStep('start');
});
// END SNIPPET