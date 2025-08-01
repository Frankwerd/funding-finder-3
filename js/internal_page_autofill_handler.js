// START SNIPPET: Replace entire content of internal_page_autofill_handler.js
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "RUN_INTERNAL_AUTOFILL") {
        const orgData = message.userData;
        if (!orgData) return showToast("Error: Organization profile data is missing.", "error");
        
        const mappings = {
            '#orgName': orgData.organizationInfo?.name,
            '#orgEin': orgData.organizationInfo?.taxId,
            '#orgWebsite': orgData.organizationInfo?.website,
            '#contactName': orgData.primaryContact?.name,
            '#contactEmail': orgData.primaryContact?.email,
            '#projectAbstract': orgData.organizationInfo?.missionStatement,
        };

        let actionsExecuted = 0;
        for (const selector in mappings) {
            const element = document.querySelector(selector);
            const value = mappings[selector];
            if (element && value) {
                element.value = value;
                actionsExecuted++;
            }
        }
        showToast(`Autofill Complete (${actionsExecuted} fields).`);
    }
});

function showToast(message, type = 'success') {
    let toast = document.querySelector('.fundingflock-toast-notification');
    if (!toast) {
        const style = document.createElement('style');
        style.innerHTML = `.fundingflock-toast-notification { position: fixed; top: 20px; right: 20px; background-color: #28a745; color: white; padding: 15px 25px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 2147483647; font-family: sans-serif; font-size: 16px; opacity: 0; transform: translateY(-20px); transition: all 0.3s ease; } .fundingflock-toast-notification.error { background-color: #dc3545; } .fundingflock-toast-notification.visible { opacity: 1; transform: translateY(0); }`;
        document.head.appendChild(style);
        toast = document.createElement('div');
        toast.className = 'fundingflock-toast-notification';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `fundingflock-toast-notification ${type}`;
    setTimeout(() => toast.classList.add('visible'), 50);
    setTimeout(() => {
        toast.classList.remove('visible');
    }, 3000);
}
// END SNIPPET
