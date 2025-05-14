// 1. CONFIGURATION
// -----------------------------------------------------------------------------
const DIVIDER_PREFIX_REGEX = /^=+ /; // Regex to identify dividers like "=== Section Name" or "== Section"
                                     // The space after =+ is to avoid matching things like "var === val" if they appeared.
                                     // Adjust if your dividers are strictly "===" without a space.

// SELECTORS - VERY LIKELY CANDIDATES BASED ON THE AI'S JQUERY EXAMPLE.
// VERIFY THESE WITH YOUR BROWSER'S INSPECT ELEMENT TOOL IF ISSUES ARISE.
const PROMPTS_CONTAINER_SELECTOR = '#presets_preset_group'; // Parent container for all preset rows
const PROMPT_ITEM_ROW_SELECTOR = '.presets_preset_entry_row'; // Selector for each individual preset row
const PROMPT_NAME_SELECTOR_IN_ITEM = '.presets_preset_entry_name'; // Element within a row containing the name


// 2. HELPER FUNCTIONS
// -----------------------------------------------------------------------------

// Function to get the name of a prompt element and check if it's a divider
function getDividerInfo(promptElement) {
    const promptNameElement = promptElement.querySelector(PROMPT_NAME_SELECTOR_IN_ITEM);
    if (promptNameElement) {
        const promptName = promptNameElement.textContent.trim();
        if (DIVIDER_PREFIX_REGEX.test(promptName)) {
            // Extract clean name, removing the "===" prefix
            const cleanName = promptName.replace(DIVIDER_PREFIX_REGEX, '').replace(/\s*=+$/, '').trim();
            return { isDivider: true, name: cleanName, originalText: promptName };
        }
    }
    return { isDivider: false };
}

// Function to process and group prompts
function organizePrompts() {
    console.log("NemoEngine UI Enhancer: Attempting to organize prompts...");

    const promptsContainer = document.querySelector(PROMPTS_CONTAINER_SELECTOR);
    if (!promptsContainer) {
        console.warn(`NemoEngine UI Enhancer: Prompts container ("${PROMPTS_CONTAINER_SELECTOR}") not found.`);
        return;
    }

    // Check if already organized to prevent re-processing
    if (promptsContainer.dataset.nemoOrganized === 'true' || promptsContainer.querySelector('details.nemo-engine-section')) {
        console.log("NemoEngine UI Enhancer: Prompts appear to be already organized or flag is set. Skipping.");
        return;
    }

    // Get all direct children that are prompt rows.
    // The AI example used $container.children('.presets_preset_entry_row'),
    // so we'll assume prompt rows are direct children.
    const promptItems = Array.from(promptsContainer.querySelectorAll(`:scope > ${PROMPT_ITEM_ROW_SELECTOR}`));

    if (promptItems.length === 0) {
        console.log("NemoEngine UI Enhancer: No prompt items found to organize.");
        return;
    }

    let currentSection = null;
    let sectionContentWrapper = null;

    promptItems.forEach(item => {
        const dividerInfo = getDividerInfo(item);

        if (dividerInfo.isDivider) {
            console.log("NemoEngine UI Enhancer: Found divider:", dividerInfo.originalText);

            currentSection = document.createElement('details');
            currentSection.classList.add('nemo-engine-section');
            // currentSection.open = true; // Uncomment to make sections open by default

            const summary = document.createElement('summary');
            // IMPORTANT: We move the *original divider item* into the summary.
            // This preserves its entire structure, including icons and existing ST styling.
            // The CSS for 'summary' should be minimal so it doesn't clash.
            summary.appendChild(item.cloneNode(true)); // Clone to avoid issues if item has complex listeners
                                                      // If ST styling or events are attached directly to `item`,
                                                      // simple cloning might miss them. Test thoroughly.
                                                      // A direct appendChild(item) might be better if cloning causes issues.
                                                      // For now, cloning the visual part is safer if 'item' is complex.

            currentSection.appendChild(summary);

            sectionContentWrapper = document.createElement('div');
            sectionContentWrapper.classList.add('nemo-section-content');
            currentSection.appendChild(sectionContentWrapper);

            // Replace the original 'item' (which was the divider row) with the new 'currentSection'
            promptsContainer.insertBefore(currentSection, item);
            item.remove(); // Remove the original item from its old position

        } else if (currentSection && sectionContentWrapper) {
            // This is a regular prompt item, add it to the current section's content
            sectionContentWrapper.appendChild(item); // Moves the item
        }
        // If item is not a divider and no section is active, it remains as is
        // (e.g., prompts before the first divider, or if something went wrong)
    });

    promptsContainer.dataset.nemoOrganized = 'true'; // Mark as organized
    console.log("NemoEngine UI Enhancer: Prompt organization complete.");
}


// 3. EXECUTION LOGIC
// -----------------------------------------------------------------------------
const targetNode = document.body; // Observe the whole body for flexibility
const observerConfig = { childList: true, subtree: true };

let organizeTimeout = null;

const observerCallback = function(mutationsList, observer) {
    // Debounce the organizePrompts call to avoid running it too frequently during rapid DOM changes
    clearTimeout(organizeTimeout);
    organizeTimeout = setTimeout(() => {
        const presetEditorContainer = document.querySelector(PROMPTS_CONTAINER_SELECTOR);

        if (presetEditorContainer) {
            // Check if it has prompt items AND is not yet marked as organized
            // Also, ensure it has children that match the item selector to avoid running on an empty container.
            const hasUnorganizedItems = presetEditorContainer.querySelector(`${PROMPT_ITEM_ROW_SELECTOR}:not(details.nemo-engine-section ${PROMPT_ITEM_ROW_SELECTOR})`);

            if (hasUnorganizedItems && presetEditorContainer.dataset.nemoOrganized !== 'true') {
                 console.log("NemoEngine UI Enhancer: Detected prompt container with unorganized items. Running organization.");
                organizePrompts();
            }
        } else {
            // If the main container disappears, we might need to reset flags if we were tracking them globally
            // For now, if a new container appears, it won't have the 'data-nemo-organized' flag and will be processed.
        }
    }, 250); // Adjust debounce delay as needed (e.g., 100-500ms)
};

const observer = new MutationObserver(observerCallback);

function initializeScript() {
    // Attempt to run once immediately in case content is already there
    const presetEditorContainer = document.querySelector(PROMPTS_CONTAINER_SELECTOR);
    if (presetEditorContainer && presetEditorContainer.querySelector(PROMPT_ITEM_ROW_SELECTOR) && presetEditorContainer.dataset.nemoOrganized !== 'true') {
        console.log("NemoEngine UI Enhancer: Prompt container found on initial load. Running organization.");
        organizePrompts();
    }
    // Start observing for future changes
    observer.observe(targetNode, observerConfig);
    console.log("NemoEngine UI Enhancer: Observer started.");
}

// Wait for the document to be fully loaded before starting the observer
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeScript);
} else {
    initializeScript(); // Already loaded
}

console.log("NemoEngine UI Enhancer content script loaded and awaiting UI.");
