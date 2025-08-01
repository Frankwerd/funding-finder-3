document.addEventListener('DOMContentLoaded', async () => {
    // ... existing element references and completion check ...
    const iframe = document.getElementById('setupIframe');
    const TUTORIAL_COMPLETED_KEY = 'hasCompletedFirstRunTutorialV2';

    // Instantly check if the tour is already done.
    const isCompleted = await window.isTourCompleted(TUTORIAL_COMPLETED_KEY);
    if (isCompleted) {
        document.body.innerHTML = '<h1>Tutorial Complete!</h1><p>You have already finished the setup tutorial. You can now close this tab.</p>';
        return; // Stop further execution
    }

    const tourSteps = {
        'start': {
            view: 'tailoring/tailor_proposal.html',
            message: "Welcome to the Advanced Tailoring tutorial! Here, you can see the AI's suggestions for your proposal. Let's explore the key features.",
            position: 'left',
            ctaButtonText: "Let's Begin!",
            onCtaAction: 'advance'
        },
        'explainScores': {
            message: "This is your Funder Alignment Score. It estimates how well your tailored proposal matches the opportunity. Your goal is to get this as high as possible by accepting relevant suggestions.",
            iframeTargetSelector: '.overall-ats-score-container',
            position: 'bottom',
            onCtaAction: 'advance'
        },
        'explainAcceptReject': {
            message: "For each bullet point, the AI provides a tailored version. You can choose to 'Accept AI' or 'Use Original'. Your choices here update the score and the final proposal preview.",
            iframeTargetSelector: '.bullet-actions .accept-btn',
            position: 'right',
            onCtaAction: 'advance'
        },
        'explainOptimizer': {
            message: "After making your choices, you can use the 'Optimize & Preview 1-Page' button. The AI will try to fit your best content onto a single page, which is ideal for most applications.",
            iframeTargetSelector: '#optimizeAndPreviewButton',
            position: 'top',
            onCtaAction: 'advance'
        },
        'explainCoverLetter': {
            message: "The AI can also draft a letter of inquiry for you based on your tailored proposal and the funding opportunity. Click the 'Generate Letter' button to see it in action.",
            iframeTargetSelector: '#triggerGenerateCoverLetterButton',
            position: 'top',
            onCtaAction: 'advance'
        },
        'explainPdf': {
            message: "Finally, once you're happy, you can download it as a print-ready PDF. Remember to uncheck 'Headers and footers' in your browser's print settings for a clean look!",
            iframeTargetSelector: '#downloadPdfButton',
            position: 'top',
            onCtaAction: 'advance'
        },
        'completed': {
            message: "You've now learned the advanced features! You are ready to tailor your proposal for any funding opportunity. You can close this tutorial.",
            position: 'left',
            ctaButtonText: "Finish Tutorial",
            onCtaAction: 'finish'
        }
    };
    
    let currentStepIndex = 0;
    const stepOrder = ['start', 'explainScores', 'explainAcceptReject', 'explainOptimizer', 'explainCoverLetter', 'explainPdf', 'completed'];
    let isIframeReadyForPrompts = false;
    let tourHasStarted = false;
    let responseListeners = new Map();

    // ... existing getRectFromIframe and displayPromptForStep functions ...
    const getRectFromIframe = (selector, stepName) => {
        return new Promise(resolve => {
            responseListeners.set(stepName, resolve);
            iframe.contentWindow.postMessage({ type: 'REQUEST_ELEMENT_SCROLL_AND_RECT', selector, stepName }, '*');
        });
    };

    const displayPromptForStep = async (stepKey) => {
        document.querySelectorAll('.guided-tour-chat-box').forEach(el => el.remove());
        const step = tourSteps[stepKey];
        if (!step) return;

        let absolutePos = null;
        if (step.iframeTargetSelector) {
            const rect = await getRectFromIframe(step.iframeTargetSelector, stepKey);
            if (rect) {
                const iframeRect = iframe.getBoundingClientRect();
                absolutePos = {
                    top: iframeRect.top + rect.top,
                    left: iframeRect.left + rect.left,
                    width: rect.width,
                    height: rect.height
                };
            }
        }

        window.createChatBoxDirectly(step.message, {
            position: step.position,
            ctaButtonText: step.ctaButtonText || "Next",
            absolutePos: absolutePos,
            stepName: stepKey,
            onCta: async () => {
                if (step.onCtaAction === 'advance') {
                    navigateToStepByIndex(currentStepIndex + 1);
                } else if (step.onCtaAction === 'finish') {
                    await window.markTourAsCompleted(TUTORIAL_COMPLETED_KEY);
                    document.body.innerHTML = '<h1>Advanced Tutorial Complete!</h1><p>You can now close this tab.</p>';
                }
            }
        });
    };

    const navigateToStepByIndex = (index) => {
        if (index >= stepOrder.length) return;
        currentStepIndex = index;
        const stepKey = stepOrder[index];
        displayPromptForStep(stepKey);
    };

    // This is the new core logic. It waits for the iframe to signal readiness.
    window.addEventListener('message', (event) => {
        if (event.source !== iframe.contentWindow) return;
        const message = event.data;

        if (message.type === 'TAILORING_COMPLETE_AND_UI_READY') {
            isIframeReadyForPrompts = true;
            if (!tourHasStarted) {
                tourHasStarted = true;
                navigateToStepByIndex(0); // Start the tour now that the UI is ready
            }
        } else if (message.type === 'ELEMENT_RECT_RESPONSE') {
            // ... existing response listener logic ...
            const resolver = responseListeners.get(message.stepName);
            if (resolver) {
                resolver(message.rect);
                responseListeners.delete(message.stepName);
            }
        }
    });

    // Load the initial iframe. The tour will wait for the 'TAILORING_COMPLETE_AND_UI_READY' message.
    const initialUrl = chrome.runtime.getURL('tailoring/tailor_proposal.html?context=tutorial');
    if (iframe.src !== initialUrl) {
        iframe.src = initialUrl;
    }
});
