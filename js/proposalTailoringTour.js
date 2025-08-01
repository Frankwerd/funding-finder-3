// In: js/proposalTailoringTour.js (REPLACE ENTIRE FILE)
function startTailoringTour() {
    const tourSteps = [
        {
            message: "Welcome to the Proposal Tailoring page! Here, the AI has drafted proposal sections based on your profile and the RFP.",
            buttonText: "Let's Start!",
            target: null
        },
        {
            message: "Each generated section, like this 'Statement of Need', includes a Funder Alignment Score to estimate its relevance.",
            buttonText: "Got it",
            target: '.narrative-score'
        },
        {
            message: "You can directly edit the AI-generated text in this textarea to perfect your narrative.",
            buttonText: "Okay",
            target: '.narrative-textarea'
        },
        {
            message: "When you're happy with a section, you can save the edited version back to your Master Organization Profile for future use.",
            buttonText: "Good to Know",
            target: '.save-narrative-btn'
        },
        {
            message: "Finally, use the buttons in the action bar to autofill this tailored content into a grant application form or copy all the text to your clipboard.",
            buttonText: "Understood!",
            target: '#mainPageActionsBar'
        },
        {
            message: "This concludes the tutorial. Good luck with your funding applications!",
            buttonText: "Finish",
            isFinalStep: true,
            target: null
        }
    ];

    let currentStepIndex = -1;

    function advanceTour() {
        currentStepIndex++;
        if (currentStepIndex < tourSteps.length) {
            const step = tourSteps[currentStepIndex];
            const onCtaAction = step.isFinalStep ? 'completeTutorial' : 'advanceTailoringTour';

            window.parent.postMessage({
                type: 'TUTORIAL_SHOW_STEP',
                step: {
                    message: step.message,
                    ctaButtonText: step.buttonText,
                    iframeTargetSelector: step.target,
                    onCtaAction: onCtaAction
                }
            }, '*');
        }
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        if (event.data.type === 'ADVANCE_TAILORING_TOUR') {
            advanceTour();
        }
    });

    advanceTour();
}
