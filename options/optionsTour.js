// In options/optionsTour.js

document.addEventListener('DOMContentLoaded', () => {
    const tourSteps = {
        'awaitingApiKey': {
            message: "To get your API key:<br>1. Click the 'Google AI Studio' link above.<br>2. Create a new API key there.<br>3. Copy your new key.<br>4. Paste it into the input field below and click 'Save API Key'.",
            targetSelector: '.api-key-section',
            ctaButtonText: "Got it!",
            position: 'bottom',
        }
    };

    const urlParams = new URLSearchParams(window.location.search);
    const stepKey = urlParams.get('tutorialStep');
    const step = tourSteps[stepKey];

    if (step) {
        if (step.targetSelector) {
            const target = document.querySelector(step.targetSelector);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        setTimeout(() => {
            window.createChatBoxDirectly(step.message, {
                targetSelector: step.targetSelector,
                position: step.position || 'bottom',
                ctaButtonText: step.ctaButtonText || "Got it!",
                onCta: () => {
                    document.querySelectorAll('.guided-tour-chat-box').forEach(box => box.remove());
                }
            });
        }, 400); // Wait for scroll
    }

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.geminiApiKey) {
            const newStepKey = 'returnToMainTutorial';
            const newStep = tourSteps[newStepKey];
            if (newStep) {
                window.history.pushState({}, '', `?tutorialStep=${newStepKey}`);
                document.querySelectorAll('.guided-tour-chat-box').forEach(box => box.remove());
                window.createChatBoxDirectly(newStep.message, {
                    position: newStep.position || 'center',
                    ctaButtonText: newStep.ctaButtonText || "Got it!"
                });
            }
        }
    });
});
