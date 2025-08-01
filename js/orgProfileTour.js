// In: js/orgProfileTour.js (REPLACE ENTIRE FILE)

function startOrgProfileTour() {
    const tourSteps = [
        { message: "Welcome to your Organization Profile! This is where you'll store all the information our AI needs to help you tailor grant proposals.", buttonText: "Next", target: '.page-title-header' },
        { message: "You can kickstart your profile by uploading a document (PDF), like a past proposal or annual report. Our AI will try to extract information to fill in the fields below.", buttonText: "Next", target: '.pdf-upload-section' },
        { message: "Alternatively, or after processing, you can manually fill or edit all sections of your profile here. This is your master data source.", buttonText: "Next", target: '#orgProfileForm' },
        { message: "Your organization's core details and primary contact information are crucial for applications.", buttonText: "Next", target: () => document.querySelector('.profile-section .section-header h3') },
        { message: "Add your past programs or projects here. The more detailed your outcomes, the better the AI can tailor them for new proposals.", buttonText: "Next", target: '#newProjectEntryForm' },
        { message: "Your organization's history and core capabilities are key selling points. Fill them out here.", buttonText: "Next", target: '#orgHistory' },
        { message: "Once you've entered all your information, click here to save everything. Your Master Organization Profile will then be ready for tailoring and autofill!", buttonText: "Finish Tour", target: '#saveProfileButton' }
    ];

    let currentStepIndex = -1;

    function advanceTour() {
        currentStepIndex++;
        if (currentStepIndex < tourSteps.length) {
            const step = tourSteps[currentStepIndex];
            const onCtaAction = step.isFinalStep ? 'COMPLETE_ORG_PROFILE_TOUR' : 'ADVANCE_ORG_PROFILE_TOUR';

            window.parent.postMessage({
                type: 'TUTORIAL_SHOW_STEP',
                step: {
                    message: step.message,
                    ctaButtonText: step.buttonText,
                    iframeTargetSelector: typeof step.target === 'function' ? null : step.target,
                    targetFnString: typeof step.target === 'function' ? step.target.toString() : null,
                    onCtaAction: onCtaAction
                }
            }, '*');
        }
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        if (event.data.type === 'ADVANCE_ORG_PROFILE_TOUR') {
            advanceTour();
        }
    });

    advanceTour();
}
