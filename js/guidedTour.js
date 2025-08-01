// In js/guidedTour.js

// This listener allows the host page (tutorialHostTour.js) to ask for an element's position.
(function initializeIframeCommunication() {
    if (window.parent === window) return; // Exit if not in an iframe

    // Announce readiness to the host
    window.parent.postMessage({ type: 'IFRAME_READY' }, '*');

    // Listen for requests from the host
    window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;

        const data = event.data;
        if (!data || !data.type) return;

        const element = data.selector ? document.querySelector(data.selector) : null;

        // This function sends the response back to the host.
        const sendResponse = (rect) => {
            window.parent.postMessage({
                type: 'ELEMENT_RECT_RESPONSE',
                stepName: data.stepName,
                rect: rect
            }, '*');
        };

        switch (data.type) {
            case 'REQUEST_ELEMENT_RECT':
                // Handles the simple case where we just need the coordinates.
                sendResponse(element ? JSON.parse(JSON.stringify(element.getBoundingClientRect())) : null);
                break;

            case 'REQUEST_ELEMENT_SCROLL_AND_RECT':
                // Handles the new, smarter case for potentially off-screen elements.
                if (element) {
                    // 1. Scroll the element into the middle of the view.
                    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

                    // 2. Wait a brief moment for the smooth scroll to finish.
                    setTimeout(() => {
                        // 3. Now get the coordinates of the visible element and send them back.
                        sendResponse(JSON.parse(JSON.stringify(element.getBoundingClientRect())));
                    }, 400); // 400ms is a good delay for most smooth scrolls.
                } else {
                    sendResponse(null); // Element not found.
                }
                break;
        }
    });
})();

window.createChatBoxDirectly = function(message, { targetSelector, position = 'bottom', arrowDirection, ctaButtonText = "Got it!", onCta, stepName, absolutePos } = {}) {
    document.querySelectorAll('.guided-tour-chat-box').forEach(box => box.remove());
    const chatBox = document.createElement('div');
    chatBox.id = `guidedTourChatBox-${stepName || 'direct'}`;
    chatBox.className = 'guided-tour-chat-box';
    chatBox.innerHTML = `<p>${message}</p>`;

    if (ctaButtonText) {
        const ctaButton = document.createElement('button');
        ctaButton.textContent = ctaButtonText;
        ctaButton.onclick = (e) => {
            e.stopPropagation();
            chatBox.remove();
            if (onCta) onCta();
        };
        chatBox.appendChild(ctaButton);
    }

    document.body.appendChild(chatBox);
    const chatBoxRect = chatBox.getBoundingClientRect();

    if (absolutePos) {
        let top = absolutePos.top;
        let left = absolutePos.left;

        if (position.startsWith('top')) {
            top -= (chatBoxRect.height + 15);
            left += (absolutePos.width / 2) - (chatBoxRect.width / 2);
            arrowDirection = 'arrow-down';
        } else if (position.startsWith('left')) {
            left -= (chatBoxRect.width + 15);
            top += (absolutePos.height / 2) - (chatBoxRect.height / 2);
            arrowDirection = 'arrow-right';
        } else if (position === 'right') {
            left += (absolutePos.width + 15);
            top += (absolutePos.height / 2) - (chatBoxRect.height / 2);
            arrowDirection = 'arrow-left';
        } else { // Default to bottom
            top += (absolutePos.height + 15);
            left += (absolutePos.width / 2) - (chatBoxRect.width / 2);
            arrowDirection = 'arrow-up';
        }

        if (position.includes('_left_of_target')) {
             left = absolutePos.left - chatBoxRect.width - 15;
        } else if (position.includes('_right_of_target')) {
             left = absolutePos.left + absolutePos.width + 15;
        }

        chatBox.style.top = `${top}px`;
        chatBox.style.left = `${left}px`;
        if (arrowDirection) chatBox.classList.add(arrowDirection);

    } else if (targetSelector) {
        const target = document.querySelector(targetSelector);
        if (target) {
            const targetRect = target.getBoundingClientRect();
            let top = targetRect.bottom + 10;
            let left = targetRect.left + (targetRect.width / 2) - (chatBoxRect.width / 2);
            chatBox.style.top = `${top}px`;
            chatBox.style.left = `${left}px`;
            chatBox.classList.add('arrow-up');
        } else {
            chatBox.classList.add('position-center');
        }
    } else {
        chatBox.classList.add('position-center');
    }

    // Return the newly created element so the host script can use it.
    return chatBox;
};

// Global functions to be called from the host
window.isTourCompleted = function(key) {
    return new Promise(resolve => {
        chrome.storage.local.get([key], (result) => {
            resolve(result[key] || false);
        });
    });
};

window.createChatBoxInPanel = function(panelContainer, message, { targetRect, position = 'bottom', ctaButtonText = "Got it!", onCta, stepName } = {}) {
    panelContainer.querySelectorAll('.guided-tour-chat-box').forEach(box => box.remove());

    const chatBox = document.createElement('div');
    chatBox.id = `guidedTourChatBox-${stepName || 'panel'}`;
    chatBox.className = 'guided-tour-chat-box';
    chatBox.style.position = 'absolute';
    chatBox.innerHTML = `<p>${message}</p>`;

    // This part is modified to only create a button if text is provided.
    if (ctaButtonText) {
        const ctaButton = document.createElement('button');
        ctaButton.textContent = ctaButtonText;
        ctaButton.onclick = (e) => {
            e.stopPropagation();
            chatBox.remove();
            if (onCta) onCta();
        };
        chatBox.appendChild(ctaButton);
    }

    panelContainer.appendChild(chatBox);
    const chatBoxRect = chatBox.getBoundingClientRect();

    let top, left;
    let arrowClass = '';

    if (targetRect) {
        // This switch statement now includes our new, more precise positions.
        switch (position) {
            case 'left':
                top = targetRect.top + (targetRect.height / 2) - (chatBoxRect.height / 2);
                left = targetRect.left - chatBoxRect.width - 15;
                arrowClass = 'arrow-right';
                break;
            case 'right':
                top = targetRect.top + (targetRect.height / 2) - (chatBoxRect.height / 2);
                left = targetRect.right + 15;
                arrowClass = 'arrow-left';
                break;
            case 'top':
                top = targetRect.top - chatBoxRect.height - 15;
                left = targetRect.left + (targetRect.width / 2) - (chatBoxRect.width / 2);
                arrowClass = 'arrow-down';
                break;
            // --- NEW, MORE PRECISE POSITIONS ---
            case 'left_top_of_target':
                 top = targetRect.top + 5; // Align top of box with top of target
                 left = targetRect.left - chatBoxRect.width - 15;
                 arrowClass = 'arrow-right';
                 break;
            // --- END OF NEW POSITIONS ---
            default: // 'bottom'
                top = targetRect.bottom + 15;
                left = targetRect.left + (targetRect.width / 2) - (chatBoxRect.width / 2);
                arrowClass = 'arrow-up';
                break;
        }
    } else {
        top = (panelContainer.clientHeight / 2) - (chatBoxRect.height / 2);
        left = (panelContainer.clientWidth / 2) - (chatBoxRect.width / 2);
        position = 'center';
    }

    const padding = 10;
    chatBox.style.top = `${Math.max(padding, Math.min(top, panelContainer.clientHeight - chatBoxRect.height - padding))}px`;
    chatBox.style.left = `${Math.max(padding, Math.min(left, panelContainer.clientWidth - chatBoxRect.width - padding))}px`;

    chatBox.classList.add(position === 'center' ? 'position-center' : arrowClass);

    return chatBox;
};

window.markTourAsCompleted = function(key) {
    return new Promise(resolve => {
        chrome.storage.local.set({ [key]: true }, () => {
            resolve();
        });
    });
};
