// 1. CONFIGURATION
// -----------------------------------------------------------------------------
const DIVIDER_PREFIX = "==="; // How you identify your divider prompts (e.g., "=== CORE ===")
// Or a more specific emoji/text combo:
// const DIVIDER_MARKER_REGEX = /^✨📚︱DIVIDER:/; // Example for a very specific marker

// 2. HELPER FUNCTIONS
// -----------------------------------------------------------------------------

// Function to check if a prompt element is a divider
function isDivider(promptElement) {
    // This depends on how SillyTavern renders the prompt names in the UI.
    // You'll need to inspect the DOM to find the right selector.
    // Let's assume each prompt has a text element with the prompt name.
    const promptNameElement = promptElement.querySelector('.prompt-name-selector'); // EXAMPLE SELECTOR
    if (promptNameElement) {
        const promptName = promptNameElement.textContent.trim();
        return promptName.startsWith(DIVIDER_PREFIX);
        // Or: return DIVIDER_MARKER_REGEX.test(promptName);
    }
    return false;
}

// Function to process and group prompts
function organizePrompts() {
    console.log("NemoEngine UI Enhancer: Attempting to organize prompts...");

    // Find the container that holds all the prompt items in the preset editor.
    // This is CRUCIAL and requires inspecting SillyTavern's DOM.
    // Let's assume it's a div with a specific ID or class.
    const promptsContainer = document.getElementById('prompts-list-container-id'); // EXAMPLE ID
    if (!promptsContainer) {
        console.warn("NemoEngine UI Enhancer: Prompts container not found.");
        return;
    }

    const promptItems = Array.from(promptsContainer.children); // Assuming direct children are prompt items
    if (promptItems.length === 0) {
        console.log("NemoEngine UI Enhancer: No prompt items found to organize.");
        return;
    }

    let currentSection = null;
    let sectionContentWrapper = null;

    promptItems.forEach(item => {
        if (isDivider(item)) {
            // This is a divider, start a new section
            console.log("NemoEngine UI Enhancer: Found divider:", item.textContent.trim().match(/.prompt-name-selector/)?.textContent);

            // Create the <details> element for the collapsible section
            currentSection = document.createElement('details');
            currentSection.classList.add('nemo-engine-section');
            // currentSection.open = true; // Optionally make sections open by default

            // Create the <summary> element (the clickable header)
            const summary = document.createElement('summary');
            // Move the original divider item's content (or just its name) into the summary
            // This is tricky: you might want to clone the divider's name display
            // or restyle the original divider item to act as the summary.
            // For simplicity here, let's assume we move the whole 'item' which is the divider.
            // However, ST might have event listeners on 'item', so be careful.
            // A safer way is to clone the essential display part of 'item'.
            summary.appendChild(item.cloneNode(true)); // Simplistic, might need refinement
            // Or, more robustly:
            // const dividerNameClone = item.querySelector('.prompt-name-selector').cloneNode(true);
            // summary.appendChild(dividerNameClone);
            // item.style.display = 'none'; // Hide the original divider item if we cloned its content

            currentSection.appendChild(summary);

            // Create a div to hold the content of this section
            sectionContentWrapper = document.createElement('div');
            sectionContentWrapper.classList.add('nemo-section-content');
            currentSection.appendChild(sectionContentWrapper);

            // Add the new section to the main container (or replace the original divider)
            // promptsContainer.appendChild(currentSection); // Appends at the end
            promptsContainer.insertBefore(currentSection, item); // Insert before the original divider
            item.remove(); // Remove the original flat divider item

        } else if (currentSection && sectionContentWrapper) {
            // This is a regular prompt item, add it to the current section's content
            sectionContentWrapper.appendChild(item); // Moves the item
        }
        // If item is not a divider and no section is active, it remains as is (e.g., prompts before the first divider)
    });

    console.log("NemoEngine UI Enhancer: Prompt organization complete.");
}


// 3. EXECUTION LOGIC
// -----------------------------------------------------------------------------

// We need to wait for SillyTavern's UI to be ready and the prompts to be loaded.
// Using a MutationObserver is a good way to detect when the relevant parts of the DOM are available.

const targetNode = document.body; // Or a more specific parent if known
const config = { childList: true, subtree: true };

const callback = function(mutationsList, observer) {
    // Look for a specific element that indicates the preset editor is open and prompts are likely loaded
    // This is an EXAMPLE selector. You need to find a reliable one in ST.
    const presetEditorReadyIndicator = document.getElementById('prompts-list-container-id'); // Same as above

    if (presetEditorReadyIndicator && !presetEditorReadyIndicator.dataset.nemoOrganized) {
        organizePrompts();
        presetEditorReadyIndicator.dataset.nemoOrganized = 'true'; // Mark as organized to prevent re-running
        // observer.disconnect(); // Optional: disconnect if you only want to run once per page load/major update
    }
};

const observer = new MutationObserver(callback);

// Start observing only when the document is somewhat ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(targetNode, config);
    });
} else {
    observer.observe(targetNode, config);
    // Potentially run once immediately if content is already there
    if (document.getElementById('prompts-list-container-id') && !document.getElementById('prompts-list-container-id').dataset.nemoOrganized) {
        organizePrompts();
        document.getElementById('prompts-list-container-id').dataset.nemoOrganized = 'true';
    }
}

// Optional: Re-run if the user navigates within ST in a way that reloads the preset UI
// This can get complex and depends on how ST handles internal navigation (SPA behavior).
// window.addEventListener('hashchange', organizePrompts); // Example for hash-based routing
// Or listen for specific custom events ST might fire.

console.log("NemoEngine UI Enhancer content script loaded.");
