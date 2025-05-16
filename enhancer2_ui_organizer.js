// Enhancer2/enhancer2_ui_organizer.js

(function () {
    let dependencies = null; // To store passed-in dependencies
    let LOG_PREFIX_MODULE = "[Enhancer2-UIOrg]"; // Default, will be updated

    // --- MODULE-SPECIFIC CONSTANTS ---
    const NEMO_DEFAULT_REGEX_PATTERN = '=+'; // Keep your original default
    let DIVIDER_PREFIX_REGEX = new RegExp(`^(${NEMO_DEFAULT_REGEX_PATTERN})`);

    const PROMPTS_CONTAINER_SELECTOR = '#completion_prompt_manager_list';
    const PROMPT_ITEM_ROW_SELECTOR = 'li.completion_prompt_manager_prompt';
    const PROMPT_NAME_SELECTOR_IN_ITEM = 'span.completion_prompt_manager_prompt_name a.prompt-manager-inspect-action';
    const INTERACTIVE_ELEMENTS_INSIDE_ROW = [ // For section summary click prevention
        'a.prompt-manager-inspect-action',
        '.prompt-manager-detach-action',
        '.prompt-manager-edit-action',
        '.prompt-manager-toggle-action',
    ].join(', ');
    const ST_TOGGLE_ENABLED_CLASS = 'fa-toggle-on';
    const ST_TOGGLE_ICON_SELECTOR = '.prompt-manager-toggle-action';
    const MIN_OVERLAY_DISPLAY_TIME_MS = 400;


    // --- MODULE-SCOPED STATE ---
    let openSectionStates = {}; // Stores open/closed state of sections
    let enhancer2PromptMap = {}; // Maps promptId to { name, fullName, domElement, toggleButton }
    let overlayElement = null;
    let searchUiInitialized = false;
    let mainObserver = null; // This module's observer for the prompt list
    let organizeTimeout = null;

    // --- HELPER FUNCTIONS (Many moved from old content.js) ---

    async function loadAndSetDividerRegex() {
        if (!dependencies || !dependencies.extension_settings) {
            console.warn(`${LOG_PREFIX_MODULE} extension_settings not available for divider regex.`);
            DIVIDER_PREFIX_REGEX = new RegExp(`^(${NEMO_DEFAULT_REGEX_PATTERN})`);
            return;
        }
        const ENHANCER2_EXTENSION_NAME = dependencies.extension_settings.Enhancer2 ? "Enhancer2" : Object.keys(dependencies.extension_settings)[0] || "Enhancer2"; // Be robust

        let patternString = NEMO_DEFAULT_REGEX_PATTERN;
        const currentSettings = dependencies.extension_settings[ENHANCER2_EXTENSION_NAME] || {};
        const savedPattern = currentSettings.dividerRegexPattern;

        if (savedPattern !== undefined && savedPattern !== null && String(savedPattern).trim() !== '') {
            patternString = String(savedPattern).trim();
        } else {
            patternString = currentSettings.dividerRegexPattern || NEMO_DEFAULT_REGEX_PATTERN;
        }
        try {
            DIVIDER_PREFIX_REGEX = new RegExp(`^(${patternString})`);
        } catch (e) {
            console.error(`${LOG_PREFIX_MODULE} Invalid regex pattern "${patternString}". Falling back. Error: ${e.message}`);
            DIVIDER_PREFIX_REGEX = new RegExp(`^(${NEMO_DEFAULT_REGEX_PATTERN})`);
            if (dependencies.extension_settings[ENHANCER2_EXTENSION_NAME]) {
                dependencies.extension_settings[ENHANCER2_EXTENSION_NAME].dividerRegexPattern = NEMO_DEFAULT_REGEX_PATTERN;
            }
        }
    }

    function getDividerInfo(promptElement) {
        const promptNameElement = promptElement.querySelector(PROMPT_NAME_SELECTOR_IN_ITEM);
        if (promptNameElement) {
            // Use dataset.enhancer2FullName if available (set by organizePrompts), otherwise use textContent
            const promptName = promptElement.dataset.enhancer2FullName || promptNameElement.textContent.trim();
            
            if (DIVIDER_PREFIX_REGEX && DIVIDER_PREFIX_REGEX.test(promptName)) {
                const match = promptName.match(DIVIDER_PREFIX_REGEX);
                let cleanName = promptName.substring(match[0].length).trim();
                const matchedDividerItself = match[1];
                const escapedMatchedDivider = matchedDividerItself.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const suffixRegex = new RegExp(`\\s*(${escapedMatchedDivider}|={2,})\\s*$`);
                cleanName = cleanName.replace(suffixRegex, '').trim();
                return { isDivider: true, name: cleanName || "Section", originalText: promptName, identifier: promptName };
            }
        }
        return { isDivider: false };
    }

    function getOrCreateLoadingOverlay(container) {
        if (!overlayElement) {
            overlayElement = document.createElement('div');
            overlayElement.className = 'enhancer2-loading-overlay'; // Use new class name
            const spinner = document.createElement('div');
            spinner.className = 'enhancer2-spinner';
            overlayElement.appendChild(spinner);
            if (container && getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
            if (container) container.appendChild(overlayElement);
        }
        return overlayElement;
    }
    function showLoadingOverlay(container) {
        if (!container) return;
        const overlay = getOrCreateLoadingOverlay(container);
        requestAnimationFrame(() => overlay.classList.add('enhancer2-visible'));
    }
    function hideLoadingOverlay() {
        if (overlayElement) overlayElement.classList.remove('enhancer2-visible');
    }

    function ensureRightControlsStructure(liElement) {
        if (!liElement || !liElement.matches(PROMPT_ITEM_ROW_SELECTOR)) { return null; }
        let rightSideWrapper = liElement.querySelector(':scope > .enhancer2-right-controls-wrapper');
        if (!rightSideWrapper) {
            rightSideWrapper = document.createElement('span');
            rightSideWrapper.classList.add('enhancer2-right-controls-wrapper');
            liElement.appendChild(rightSideWrapper);
            const nameSpan = liElement.querySelector(':scope > span.completion_prompt_manager_prompt_name');
            let stControlsOuterOriginalSpan = null;
            let stTokensSpan = null;
            Array.from(liElement.children).forEach(child => {
                if (child === nameSpan || child.classList.contains('drag-handle') || child === rightSideWrapper) return;
                const actualControls = child.classList.contains('prompt_manager_prompt_controls') ? child : child.querySelector('.prompt_manager_prompt_controls');
                if (actualControls && (!actualControls.closest('.enhancer2-right-controls-wrapper') || actualControls.closest('.enhancer2-right-controls-wrapper') === rightSideWrapper)) {
                    if (child.parentElement === liElement) stControlsOuterOriginalSpan = child;
                }
                if (child.classList.contains('prompt_manager_prompt_tokens') && child.parentElement === liElement) {
                    if (!child.closest('.enhancer2-right-controls-wrapper') || child.closest('.enhancer2-right-controls-wrapper') === rightSideWrapper) {
                        stTokensSpan = child;
                    }
                }
            });
            if (stControlsOuterOriginalSpan) rightSideWrapper.appendChild(stControlsOuterOriginalSpan);
            if (stTokensSpan) rightSideWrapper.appendChild(stTokensSpan);
        }
        const promptControlsElem = rightSideWrapper.querySelector('.prompt_manager_prompt_controls');
        if (promptControlsElem && promptControlsElem.parentElement !== rightSideWrapper) {
            rightSideWrapper.insertBefore(promptControlsElem, rightSideWrapper.querySelector('.prompt_manager_prompt_tokens'));
        }
        return rightSideWrapper;
    }

    function updateSummaryWithCounts(summaryElement, enabledCount) {
        if (!summaryElement || !summaryElement.firstChild || summaryElement.firstChild.tagName !== 'LI') return;
        const liElementInSummary = summaryElement.firstChild;
        if (!liElementInSummary.matches(PROMPT_ITEM_ROW_SELECTOR)) return;
        const rightSideWrapper = ensureRightControlsStructure(liElementInSummary);
        if (rightSideWrapper) {
            let countSpan = rightSideWrapper.querySelector('.enhancer2-enabled-count');
            if (!countSpan) {
                countSpan = document.createElement('span');
                countSpan.classList.add('enhancer2-enabled-count');
                const firstSTControlOrToken = rightSideWrapper.querySelector('.prompt_manager_prompt_controls, .prompt_manager_prompt_tokens');
                if (firstSTControlOrToken) {
                    rightSideWrapper.insertBefore(countSpan, firstSTControlOrToken);
                } else {
                    rightSideWrapper.appendChild(countSpan);
                }
            }
            countSpan.textContent = ` (${enabledCount})`;
        }
    }

    // --- MAIN UI ORGANIZATION LOGIC ---
    async function organizePrompts() {
        if (!DIVIDER_PREFIX_REGEX || !(DIVIDER_PREFIX_REGEX instanceof RegExp)) await loadAndSetDividerRegex();
        const organizeStartTime = performance.now();
        const promptsContainer = document.querySelector(PROMPTS_CONTAINER_SELECTOR);
        if (!promptsContainer) { hideLoadingOverlay(); return; }
        showLoadingOverlay(promptsContainer);

        const newPromptMap = {}; // Local map for this run, will update global enhancer2PromptMap
        promptsContainer.querySelectorAll(PROMPT_ITEM_ROW_SELECTOR).forEach(liElement => {
            const promptId = liElement.dataset.pmIdentifier;
            const toggleButton = liElement.querySelector(ST_TOGGLE_ICON_SELECTOR);
            const nameAnchor = liElement.querySelector(PROMPT_NAME_SELECTOR_IN_ITEM);
            
            if (nameAnchor && promptId) {
                const fullName = nameAnchor.textContent.trim(); // This is the full name from ST
                const displayName = fullName; // For now, display name is full name. Trigger module might refine.
                                          // If name embedding for triggers is done, this part needs coordination.
                                          // For now, assume UI organizer doesn't parse triggers from name.

                liElement.dataset.enhancer2FullName = fullName; // Store it
                // nameAnchor.textContent = displayName; // Only change if displayName differs from fullName

                if (toggleButton) {
                    newPromptMap[promptId] = { 
                        name: displayName, 
                        fullName: fullName, 
                        domElement: liElement, 
                        toggleButton: toggleButton 
                    };
                }
            }
        });
        enhancer2PromptMap = newPromptMap; // Update the module's global map
        // console.log(`${LOG_PREFIX_MODULE} enhancer2PromptMap updated:`, Object.keys(enhancer2PromptMap).length, "entries");

        // ... (rest of the sectioning logic from your old organizePrompts)
        // Make sure to use 'enhancer2-engine-section', 'enhancer2-section-content' etc. for class names
        // to avoid conflicts if the old extension is somehow also active.

        const currentOnPageSections = promptsContainer.querySelectorAll('details.enhancer2-engine-section');
        const newOpenStatesSnapshot = {};
        currentOnPageSections.forEach(section => {
            const summary = section.querySelector('summary');
            const liInSummary = summary ? summary.querySelector(PROMPT_ITEM_ROW_SELECTOR) : null;
            if (liInSummary) {
                const dividerInfo = getDividerInfo(liInSummary);
                if (dividerInfo.isDivider) newOpenStatesSnapshot[dividerInfo.originalText] = section.open;
            }
        });
        openSectionStates = { ...openSectionStates, ...newOpenStatesSnapshot };

        const fragment = document.createDocumentFragment();
        const newSectionsMap = new Map();
        const topLevelNonDividerItems = [];
        let currentSectionContext = null;

        Array.from(promptsContainer.children).forEach(childEl => {
            // Handle existing sections if any (e.g. if organizePrompts is called multiple times)
            if (childEl.matches('details.enhancer2-engine-section')) {
                // If we are completely rebuilding, we might not want to clone old sections directly
                // but rather re-process their original li items.
                // For now, let's assume we are processing raw <li> items.
                // This part might need adjustment based on how often organizePrompts runs and on what input.
                // The safest is to always work from a flat list of <li> elements from ST.
            }

            if (!childEl.matches(PROMPT_ITEM_ROW_SELECTOR)) {
                // If it's an already processed section by this module, keep it (or its state)
                if (childEl.matches('details.enhancer2-engine-section')) {
                     const existingSummaryLi = childEl.querySelector(':scope > summary > li.completion_prompt_manager_prompt');
                     if (existingSummaryLi) {
                        const dividerInfo = getDividerInfo(existingSummaryLi);
                        if (dividerInfo.isDivider && openSectionStates.hasOwnProperty(dividerInfo.originalText)) {
                            childEl.open = openSectionStates[dividerInfo.originalText];
                        }
                     }
                     fragment.appendChild(childEl.cloneNode(true)); // Clone existing sections
                }
                return; // Skip non-prompt items unless they are our sections
            }
            
            // childEl is an <li> element
            const dividerInfo = getDividerInfo(childEl);
            if (dividerInfo.isDivider) {
                const newDetailsSection = document.createElement('details');
                newDetailsSection.classList.add('enhancer2-engine-section');
                newDetailsSection.open = openSectionStates[dividerInfo.originalText] || false;
                const summary = document.createElement('summary');
                summary.appendChild(childEl); // childEl is the <li> for the divider
                summary.addEventListener('click', function (event) {
                    if (event.target.closest(INTERACTIVE_ELEMENTS_INSIDE_ROW)) return;
                    const detailsElement = this.parentElement;
                    setTimeout(() => {
                        const liInSum = this.querySelector(PROMPT_ITEM_ROW_SELECTOR);
                        if (liInSum) {
                            const currentDivInfo = getDividerInfo(liInSum);
                            if (currentDivInfo.isDivider) openSectionStates[currentDivInfo.originalText] = detailsElement.open;
                        }
                    }, 0);
                });
                newDetailsSection.appendChild(summary);
                const newSectionContentDiv = document.createElement('div');
                newSectionContentDiv.classList.add('enhancer2-section-content');
                newDetailsSection.appendChild(newSectionContentDiv);
                fragment.appendChild(newDetailsSection);
                newSectionsMap.set(newDetailsSection, { summaryEl: summary, contentEl: newSectionContentDiv, items: [], originalDividerText: dividerInfo.originalText });
                currentSectionContext = newDetailsSection;
            } else {
                if (currentSectionContext && newSectionsMap.has(currentSectionContext)) {
                    newSectionsMap.get(currentSectionContext).items.push(childEl);
                } else {
                    topLevelNonDividerItems.push(childEl);
                }
            }
        });

        promptsContainer.innerHTML = ''; // Clear existing content
        promptsContainer.appendChild(fragment); // Add newly structured content or cloned old sections

        newSectionsMap.forEach((sectionData, sectionElement) => {
            // This part assumes sectionElement was newly created and added to fragment.
            // If we are preserving old sections, this logic needs to find them in promptsContainer.
            if (sectionElement.parentElement === promptsContainer) { 
                let enabledCountInSection = 0;
                sectionData.items.forEach(itemLi => {
                    sectionData.contentEl.appendChild(itemLi);
                    ensureRightControlsStructure(itemLi);
                    if (itemLi.querySelector(`${ST_TOGGLE_ICON_SELECTOR}.${ST_TOGGLE_ENABLED_CLASS}`)) {
                        enabledCountInSection++;
                    }
                });
                updateSummaryWithCounts(sectionData.summaryEl, enabledCountInSection);
                if (sectionData.originalDividerText && openSectionStates.hasOwnProperty(sectionData.originalDividerText)) {
                    sectionElement.open = openSectionStates[sectionData.originalDividerText];
                }
            }
        });

        topLevelNonDividerItems.forEach(itemLi => {
            promptsContainer.appendChild(itemLi);
            ensureRightControlsStructure(itemLi);
        });

        // Final pass to ensure all structure and counts are correct, especially if mixing new/old
        promptsContainer.querySelectorAll('details.enhancer2-engine-section').forEach(section => {
            section.querySelectorAll(':scope > .enhancer2-section-content > li.completion_prompt_manager_prompt').forEach(li => {
                ensureRightControlsStructure(li);
            });
            const summaryLi = section.querySelector(':scope > summary > li.completion_prompt_manager_prompt');
            if (summaryLi) {
                ensureRightControlsStructure(summaryLi);
                let enabledCount = 0;
                section.querySelectorAll(':scope > .enhancer2-section-content > li.completion_prompt_manager_prompt').forEach(itemLi => {
                    if (itemLi.querySelector(`${ST_TOGGLE_ICON_SELECTOR}.${ST_TOGGLE_ENABLED_CLASS}`)) {
                        enabledCount++;
                    }
                });
                updateSummaryWithCounts(section.querySelector('summary'), enabledCount);
            }
        });


        promptsContainer.dataset.enhancer2Organized = 'true';
        const organizeEndTime = performance.now();
        const durationMs = organizeEndTime - organizeStartTime;
        const remainingTimeMs = MIN_OVERLAY_DISPLAY_TIME_MS - durationMs;
        setTimeout(() => requestAnimationFrame(hideLoadingOverlay), Math.max(0, remainingTimeMs));
    }


    // --- SEARCH UI ---
    function showAllPromptsAndSections() {
        const promptsContainer = document.querySelector(PROMPTS_CONTAINER_SELECTOR);
        if (!promptsContainer) return;
        promptsContainer.querySelectorAll(':scope > details.enhancer2-engine-section, :scope > li.completion_prompt_manager_prompt').forEach(el => {
            el.style.removeProperty('display');
            if (el.tagName === 'DETAILS') {
                el.querySelectorAll(':scope > .enhancer2-section-content > li.completion_prompt_manager_prompt').forEach(liEl => {
                    liEl.style.removeProperty('display');
                });
            }
        });
    }

    function handlePresetSearch() {
        const searchInput = document.getElementById('enhancer2PresetSearchInput');
        if (!searchInput) return;
        const searchTerm = searchInput.value.trim().toLowerCase();
        const promptsContainer = document.querySelector(PROMPTS_CONTAINER_SELECTOR);
        if (!promptsContainer) return;

        if (searchTerm === '') {
            showAllPromptsAndSections();
            promptsContainer.querySelectorAll(':scope > details.enhancer2-engine-section').forEach(sectionEl => {
                const summaryLi = sectionEl.querySelector(':scope > summary > li.completion_prompt_manager_prompt');
                if (summaryLi) {
                    const dividerInfo = getDividerInfo(summaryLi);
                    if (dividerInfo.isDivider) {
                        sectionEl.open = openSectionStates[div
