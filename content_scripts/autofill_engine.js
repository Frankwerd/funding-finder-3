// File: /content_scripts/autofill_engine.js
// Version: 1.4 - FundingFlock Refactor

(function() {
    console.log("FundingFlock Autofill Engine: V1.4 Initialized and awaiting commands.");

    // --- TOAST NOTIFICATION ---
    function showToast(message, type = 'success') {
        if (!document.getElementById('fundingflock-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'fundingflock-toast-styles';
            style.innerHTML = `
                .fundingflock-toast-notification {
                    position: fixed; top: 20px; right: 20px; background-color: #28a745;
                    color: white; padding: 15px 25px; border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 2147483647;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    font-size: 16px; opacity: 0; transform: translateY(-20px);
                    transition: opacity 0.3s ease, transform 0.3s ease;
                }
                .fundingflock-toast-notification.error { background-color: #dc3545; }
                .fundingflock-toast-notification.visible { opacity: 1; transform: translateY(0); }
            `;
            document.head.appendChild(style);
        }
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.className = `fundingflock-toast-notification ${type}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('visible'), 50);
        setTimeout(() => {
            toast.classList.remove('visible');
            toast.addEventListener('transitionend', () => toast.parentNode?.removeChild(toast));
        }, 3000);
    }

    // --- FORM ANALYSIS ---
    function findApplicationContainer() {
        let candidates = Array.from(document.querySelectorAll('form, div[role="main"], main, article'));
        candidates = candidates.filter(el => {
            const fieldCount = el.querySelectorAll('input, textarea, select').length;
            const rect = el.getBoundingClientRect();
            return fieldCount >= 5 && rect.height > 100 && rect.width > 200;
        });

        if (candidates.length === 0) return document.body;
        if (candidates.length === 1) return candidates[0];

        const getContainerScore = (element) => {
            let score = element.querySelectorAll('input, textarea, select').length * 2;
            const text = element.innerText.toLowerCase();
            if (text.includes('work experience') || text.includes('employment history')) score += 10;
            if (text.includes('sign in') || text.includes('login')) score -= 20;
            return score;
        };
        candidates.sort((a, b) => getContainerScore(b) - getContainerScore(a));
        return candidates[0];
    }

    function buildFormRepresentation(containerElement) {
        const elements = containerElement.querySelectorAll('input, textarea, select, h1, h2, h3, h4, legend, button, div[role="radio"], div[role="checkbox"]');
        let simplifiedHtml = '';
        let fieldIndex = 0;
        let inGroup = false;

        elements.forEach(el => {
            const tagName = el.tagName.toLowerCase();
            const role = el.getAttribute('role');

            if (tagName.startsWith('h') || tagName === 'legend') {
                const headingText = el.innerText.trim();
                if (headingText) {
                    if (inGroup) simplifiedHtml += `</field_group>\n`;
                    simplifiedHtml += `<field_group title="${headingText.replace(/"/g, "'")}">\n`;
                    inGroup = true;
                }
                return;
            }

            let labelText = '';
            if (el.id) labelText = document.querySelector(`label[for="${el.id}"]`)?.innerText.trim() || '';
            if (!labelText) labelText = el.closest('label')?.innerText.trim() || '';
            if (!labelText) labelText = el.previousElementSibling?.innerText.trim() || '';

            const tempId = `ff-field-${fieldIndex++}`;
            el.setAttribute('data-ff-id', tempId);
            const sanitize = str => (str || '').replace(/"/g, "'").trim();

            let typeAttr = el.type ? `type="${sanitize(el.type)}"` : '';
            if (role) typeAttr += ` role="${role}"`;

            let optionsHtml = '';
            if (tagName === 'select') {
                el.querySelectorAll('option').forEach(opt => optionsHtml += `<option value="${sanitize(opt.value)}">${sanitize(opt.textContent)}</option>`);
            }

            const isCustom = (role === 'radio' || role === 'checkbox') && tagName === 'div';
            const customAttr = isCustom ? 'data-custom-element="true"' : '';
            const dataValue = isCustom ? `value="${sanitize(el.dataset.value)}"` : `value="${sanitize(el.value)}"`;
            const textContent = isCustom ? `data-text-content="${sanitize(el.textContent)}"` : '';

            simplifiedHtml += `  <${tagName} data-ff-id="${tempId}" ${typeAttr} name="${sanitize(el.name)}" ${dataValue} label="${sanitize(labelText)}" placeholder="${sanitize(el.placeholder)}" ${customAttr} ${textContent}>${optionsHtml}</${tagName}>\n`;
        });
        if (inGroup) simplifiedHtml += `</field_group>\n`;
        return simplifiedHtml;
    }

    function preAnalyzeAndFillStandardFields(formHtml, userData) {
        // This function remains as a placeholder for rule-based matching.
        // For now, it passes all logic to the AI.
        return { actions: [], remainingHtml: formHtml };
    }

    function runAutofillProcess(userData) {
        console.log("Autofill Engine: Starting page analysis...");
        const appContainer = findApplicationContainer();
        const fullFormRepresentation = buildFormRepresentation(appContainer);
        const { actions: programmatic_actions, remainingHtml: formHtmlForAI } = preAnalyzeAndFillStandardFields(fullFormRepresentation, userData);

        chrome.runtime.sendMessage({
            type: "AUTOFILL_PROCESS_COMPLETE",
            payload: {
                status: "success",
                formHtml: formHtmlForAI,
                programmatic_actions: programmatic_actions
            }
        });
    }

// In autofill_engine.js, inside chrome.runtime.onMessage.addListener

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING_AUTOFILL_ENGINE') {
        console.log("Autofill Engine: Received PING, sending PONG.");
        sendResponse({ status: 'PONG' });
        return true; // Required for async sendResponse
    }

    if (message.type === 'RUN_AUTOFILL_ANALYSIS') {
        runAutofillProcess(message.userData);
    }

    if (message.type === 'EXECUTE_AUTOFILL_ACTIONS') {
            let actionsExecuted = 0;
            (message.actions || []).forEach(action => {
                const targetElement = document.querySelector(`[data-ff-id="${action.target_field_id}"]`);
                if (!targetElement) return;

                // Visual feedback
                targetElement.style.transition = 'background-color 0.5s ease, box-shadow 0.5s ease';
                targetElement.style.backgroundColor = 'rgba(200, 255, 200, 0.5)';
                targetElement.style.boxShadow = '0 0 5px 2px #4CAF50';
                setTimeout(() => {
                    targetElement.style.backgroundColor = '';
                    targetElement.style.boxShadow = '';
                }, 2500);

                if (action.action_type === "fill_field") {
                    targetElement.value = action.value_to_fill;
                    ['input', 'change', 'blur'].forEach(e => targetElement.dispatchEvent(new Event(e, { bubbles: true })));
                } else if (action.action_type === "click_element") {
                    targetElement.click();
                }
                actionsExecuted++;
            });
            showToast(actionsExecuted > 0 ? `Autofill Complete (${actionsExecuted} fields).` : 'Autofill: No actions to perform.');
        }

    return false; // For synchronous messages
});

    // --- ANNOUNCE READINESS ---
    try {
        chrome.runtime.sendMessage({ type: 'AUTOFILL_ENGINE_READY' });
    } catch (e) {
        console.error("Autofill Engine: Could not send readiness message.", e);
    }

})();
