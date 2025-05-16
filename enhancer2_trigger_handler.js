// Enhancer2/enhancer2_trigger_handler.js

(function () {
    let dependencies = null; // { extension_settings, getContext, saveSettingsDebounced, eventSource, event_types, LOG_PREFIX_BASE, UIOrganizer, TriggerEngine, utils, baseScriptPath }
    let LOG_PREFIX_MODULE = "[Enhancer2-TrigHand]"; // Default, will be updated

    // --- MODULE-SPECIFIC CONSTANTS ---
    const PROMPT_EDITOR_POPUP_SELECTOR = '#completion_prompt_manager_popup_edit';
    const PROMPT_EDITOR_FORM_SELECTOR = '.completion_prompt_manager_popup_entry_form';
    const PROMPT_EDITOR_SAVE_BUTTON_SELECTOR = '#completion_prompt_manager_popup_entry_form_save';
    const PROMPT_EDITOR_PROMPT_TEXTAREA_SELECTOR = '#completion_prompt_manager_popup_entry_form_prompt';
    const ST_TOGGLE_ENABLED_CLASS = 'fa-toggle-on'; // Class indicating the toggle is ON

    const MASTER_PROMPT_CONTENT_IDENTIFIER = "%%% NEMO_MASTER_TRIGGER_DEFINITIONS_V1 %%%"; // Must match definition in this module

    // --- MODULE-SCOPED STATE ---
    let promptEditorObserver = null;
    let currentEditingPromptIdForRegular = null; // Used by regular prompt editor UI
    let temporarilyEnabledPromptIdsInCurrentGeneration = [];

    // --- HELPER: Update generated comment display (for regular prompts) ---
    function updateGeneratedCommentDisplayForHandler() {
        const triggerInput = document.getElementById('enhancer2PromptTriggerInput'); // Specific ID for trigger handler's UI
        const commentArea = document.getElementById('enhancer2GeneratedCommentArea');
        const commentTextOutput = document.getElementById('enhancer2GeneratedCommentText');

        if (!triggerInput || !commentArea || !commentTextOutput) return;

        const triggerString = triggerInput.value.trim();
        if (triggerString) {
            commentTextOutput.value = `<!-- enhancer2_triggers: ${triggerString} -->`; // Use new comment key
            commentArea.style.display = 'block';
        } else {
            commentTextOutput.value = '';
            commentArea.style.display = 'none';
        }
    }
    
    // --- PROMPT EDITOR UI INJECTION LOGIC ---

    function handleMasterTriggerPromptEditor(editorPopupNode, masterPromptId, masterPromptContent) {
        console.log(`${LOG_PREFIX_MODULE} Master Trigger Prompt editor opened (ID: ${masterPromptId}). Processing...`);
        const form = editorPopupNode.querySelector(PROMPT_EDITOR_FORM_SELECTOR);
        const promptTextarea = editorPopupNode.querySelector(PROMPT_EDITOR_PROMPT_TEXTAREA_SELECTOR);

        const existingNemoConfigDiv = form.querySelector('#enhancer2PromptTriggerConfigRegular'); // ID for regular prompt UI
        if (existingNemoConfigDiv) existingNemoConfigDiv.style.display = 'none';

        let processingResultsDiv = form.querySelector('#enhancer2MasterProcessingResults');
        if (!processingResultsDiv) {
            processingResultsDiv = document.createElement('div');
            processingResultsDiv.id = 'enhancer2MasterProcessingResults';
            processingResultsDiv.className = 'completion_prompt_manager_popup_entry_form_control';
            processingResultsDiv.innerHTML = `<h4>Enhancer2 Trigger Definitions Processor</h4><div class="text_muted">Reading trigger definitions from this prompt's content...</div><ul id="enhancer2MasterResultsList" style="max-height: 150px; overflow-y: auto; background: #222; padding: 5px; border-radius: 3px;"></ul>`;
            
            const mainPromptControlBlock = promptTextarea.closest('.completion_prompt_manager_popup_entry_form_control');
            if (mainPromptControlBlock) {
                form.insertBefore(processingResultsDiv, mainPromptControlBlock.nextSibling);
            } else {
                form.appendChild(processingResultsDiv);
            }
        }
        
        const resultsList = processingResultsDiv.querySelector('#enhancer2MasterResultsList');
        resultsList.innerHTML = '';

        if (masterPromptContent) {
            const lines = masterPromptContent.substring(masterPromptContent.indexOf('\n') + 1).split('\n');
            let processedCount = 0;
            let errorCount = 0;

            lines.forEach(line => {
                line = line.trim();
                if (line.startsWith('#') || line === '') return;

                const parts = line.split('::');
                if (parts.length === 2) {
                    const targetPromptId = parts[0].trim().replace(/^\[|\]$/g, '');
                    const triggerString = parts[1].trim();

                    if (targetPromptId && triggerString) {
                        if (dependencies.TriggerEngine && typeof dependencies.TriggerEngine.savePromptTriggers === 'function') {
                            dependencies.TriggerEngine.savePromptTriggers(targetPromptId, triggerString);
                            const Rli = document.createElement('li');
                            Rli.textContent = `OK: Loaded triggers for prompt ID ${targetPromptId}.`;
                            Rli.style.color = 'lightgreen'; resultsList.appendChild(Rli);
                            processedCount++;
                        }
                    } else {
                        const Rli = document.createElement('li');
                        Rli.textContent = `WARN: Invalid line (ID or trigger string missing): "${line.substring(0, 50)}..."`;
                        Rli.style.color = 'orange'; resultsList.appendChild(Rli); errorCount++;
                    }
                } else if (line) {
                     const Rli = document.createElement('li');
                     Rli.textContent = `WARN: Invalid line (no '::' separator): "${line.substring(0,50)}..."`;
                     Rli.style.color = 'orange'; resultsList.appendChild(Rli); errorCount++;
                }
            });

            if (typeof dependencies.saveSettingsDebounced === 'function' && processedCount > 0) {
                dependencies.saveSettingsDebounced();
            }
            
            const summary = document.createElement('p');
            summary.innerHTML = `<strong>Processing Complete.</strong> Loaded: ${processedCount} definitions. Warnings: ${errorCount}.<br>You can now close this editor. These triggers are active in your browser settings.`;
            resultsList.appendChild(summary);
            console.log(`${LOG_PREFIX_MODULE} Master Trigger Prompt processing. Loaded: ${processedCount}, Warnings: ${errorCount}`);
        } else {
            resultsList.innerHTML = '<li>No content found in master prompt to process.</li>';
        }
    }

    function handleRegularPromptEditor(editorPopupNode, currentPromptId, promptContentString) {
        const form = editorPopupNode.querySelector(PROMPT_EDITOR_FORM_SELECTOR);
        const promptTextarea = editorPopupNode.querySelector(PROMPT_EDITOR_PROMPT_TEXTAREA_SELECTOR);
        if (!form || !promptTextarea) return;

        const masterResultsDiv = form.querySelector('#enhancer2MasterProcessingResults');
        if (masterResultsDiv) masterResultsDiv.style.display = 'none';

        let triggerDiv = form.querySelector('#enhancer2PromptTriggerConfigRegular'); // Use a distinct ID
        if (!triggerDiv) {
            triggerDiv = document.createElement('div');
            triggerDiv.id = 'enhancer2PromptTriggerConfigRegular';
            triggerDiv.className = 'completion_prompt_manager_popup_entry_form_control';
            triggerDiv.innerHTML = `
                <label for="enhancer2PromptTriggerInput">Contextual Triggers (Keywords/Regex, comma-separated)</label>
                <input type="text" id="enhancer2PromptTriggerInput" class="text_pole" placeholder="e.g., help, /order \\d+/">
                <div id="enhancer2GeneratedCommentArea" style="margin-top: 8px; display: none;">
                    <label for="enhancer2GeneratedCommentText" style="font-size:0.9em;">To embed these as defaults in your preset's prompt content:</label>
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <input type="text" id="enhancer2GeneratedCommentText" class="text_pole" readonly style="flex-grow: 1; background-color: #2b2b2b; cursor: text; font-size:0.9em;">
                        <button id="enhancer2CopyCommentButton" class="menu_button fa-solid fa-copy" title="Copy to clipboard" style="min-width: auto; padding: 5px 8px;"></button>
                    </div>
                </div>
                <div class="text_muted" style="font-size:0.9em; margin-top:5px;">
                    Active triggers are saved to your browser. Use the comment embedding for sharable defaults.
                </div>`;
            const mainPromptControlBlock = promptTextarea.closest('.completion_prompt_manager_popup_entry_form_control');
            if (mainPromptControlBlock) {
                form.insertBefore(triggerDiv, mainPromptControlBlock);
            } else {
                form.appendChild(triggerDiv);
            }
        }
        triggerDiv.style.display = 'block';
        
        currentEditingPromptIdForRegular = currentPromptId; // Store for save function
        const triggerInput = document.getElementById('enhancer2PromptTriggerInput');
        if (triggerInput) {
            let triggersToLoad = "";
            if (currentPromptId && dependencies.TriggerEngine && typeof dependencies.TriggerEngine.loadPromptTriggers === 'function') {
                triggersToLoad = dependencies.TriggerEngine.loadPromptTriggers(currentPromptId);
            }
            if (!triggersToLoad && currentPromptId && promptContentString) {
                const match = promptContentString.match(/<!--\s*enhancer2_triggers:\s*(.*?)\s*-->/i); // Use new comment key
                if (match && match[1]) {
                    triggersToLoad = match[1].trim();
                }
            }
            triggerInput.value = triggersToLoad;
            
            updateGeneratedCommentDisplayForHandler();

            triggerInput.removeEventListener('input', updateGeneratedCommentDisplayForHandler);
            triggerInput.removeEventListener('blur', updateGeneratedCommentDisplayForHandler);
            triggerInput.addEventListener('input', updateGeneratedCommentDisplayForHandler);
            triggerInput.addEventListener('blur', updateGeneratedCommentDisplayForHandler);

            const copyButton = document.getElementById('enhancer2CopyCommentButton');
            const commentTextOutput = document.getElementById('enhancer2GeneratedCommentText');
            if (copyButton && commentTextOutput && !copyButton.enhancer2ListenerAttached) {
                copyButton.addEventListener('click', () => {
                    if (commentTextOutput.value) {
                        navigator.clipboard.writeText(commentTextOutput.value).then(() => {
                            const originalTitle = copyButton.title; copyButton.title = 'Copied!'; copyButton.classList.add('success_button');
                            setTimeout(() => { copyButton.title = originalTitle; copyButton.classList.remove('success_button'); }, 1500);
                        }).catch(err => { console.error(`${LOG_PREFIX_MODULE} Failed to copy comment: `, err); });
                    }
                });
                copyButton.enhancer2ListenerAttached = true;
            }
        }
    }

    function injectTriggerUIIntoEditor(editorPopupNode) {
        const saveButton = editorPopupNode.querySelector(PROMPT_EDITOR_SAVE_BUTTON_SELECTOR);
        const currentPromptId = saveButton ? saveButton.dataset.pmPrompt : null;
        const promptTextarea = editorPopupNode.querySelector(PROMPT_EDITOR_PROMPT_TEXTAREA_SELECTOR);
        const promptContent = promptTextarea ? promptTextarea.value : "";

        let isMaster = false;
        if (promptContent.trim().startsWith(MASTER_PROMPT_CONTENT_IDENTIFIER)) {
            isMaster = true;
        }

        if (isMaster) {
            handleMasterTriggerPromptEditor(editorPopupNode, currentPromptId, promptContent);
        } else {
            handleRegularPromptEditor(editorPopupNode, currentPromptId, promptContent);
        }
    }

    function saveTriggerDataFromEditor(event) { // Called on ST Save button click
        let promptIdToSaveFor = null;
        let saveButtonElement = null;

        if (event && event.target && event.target.closest(PROMPT_EDITOR_SAVE_BUTTON_SELECTOR)) {
            saveButtonElement = event.target.closest(PROMPT_EDITOR_SAVE_BUTTON_SELECTOR);
            promptIdToSaveFor = saveButtonElement.dataset.pmPrompt;
        }
        // Fallback if event target isn't helpful or if currentEditingPromptIdForRegular is more reliable here
        if (!promptIdToSaveFor) {
            promptIdToSaveFor = currentEditingPromptIdForRegular;
        }
        
        // Do not save if it's the master prompt being "saved" via this flow
        const promptTextarea = document.querySelector(`${PROMPT_EDITOR_POPUP_SELECTOR}[style*="display: flex"] ${PROMPT_EDITOR_PROMPT_TEXTAREA_SELECTOR}`);
        if (promptTextarea && promptTextarea.value && promptTextarea.value.trim().startsWith(MASTER_PROMPT_CONTENT_IDENTIFIER)) {
            // console.log(`${LOG_PREFIX_MODULE} Master prompt detected during save, skipping regular trigger save.`);
            return; 
        }


        if (!promptIdToSaveFor) {
            console.warn(`${LOG_PREFIX_MODULE} Cannot save trigger data: No prompt ID for regular prompt.`);
            return;
        }

        if (!dependencies.TriggerEngine || typeof dependencies.TriggerEngine.savePromptTriggers !== 'function') {
            console.warn(`${LOG_PREFIX_MODULE} TriggerEngine not available for saving.`);
            return;
        }
        const triggerInput = document.getElementById('enhancer2PromptTriggerInput'); // ID for regular prompt UI
        if (triggerInput) {
            dependencies.TriggerEngine.savePromptTriggers(promptIdToSaveFor, triggerInput.value);
            if (typeof dependencies.saveSettingsDebounced === 'function') {
                dependencies.saveSettingsDebounced();
            }
            // console.log(`${LOG_PREFIX_MODULE} Trigger data for prompt '${promptIdToSaveFor}' saved to settings.`);
        }
    }

    function initializePromptEditorObserver() {
        if (promptEditorObserver) return;
        const targetNodeObs = document.body;

        const callbackObs = function (mutationsList, observer) {
            for (const mutation of mutationsList) {
                const processNode = (node) => {
                    if (node.nodeType === 1 && node.matches && node.matches(PROMPT_EDITOR_POPUP_SELECTOR) && node.style.display !== 'none') {
                        injectTriggerUIIntoEditor(node);
                        const saveButton = node.querySelector(PROMPT_EDITOR_SAVE_BUTTON_SELECTOR);
                        if (saveButton && !saveButton.dataset.enhancer2SaveListener) {
                            saveButton.addEventListener('click', saveTriggerDataFromEditor);
                            saveButton.dataset.enhancer2SaveListener = 'true';
                        }
                    }
                };
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(processNode);
                    // Handle removed nodes if necessary (e.g. cleanup currentEditingPromptIdForRegular)
                     mutation.removedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.matches && node.matches(PROMPT_EDITOR_POPUP_SELECTOR)) {
                            currentEditingPromptIdForRegular = null; 
                            const saveButton = node.querySelector(PROMPT_EDITOR_SAVE_BUTTON_SELECTOR);
                            if (saveButton) delete saveButton.dataset.enhancer2SaveListener;
                        }
                    });
                }
                if (mutation.type === 'attributes' && mutation.attributeName === 'style' && mutation.target.matches(PROMPT_EDITOR_POPUP_SELECTOR)) {
                    processNode(mutation.target);
                     if (mutation.target.style.display === 'none') {
                        currentEditingPromptIdForRegular = null;
                        const saveButton = mutation.target.querySelector(PROMPT_EDITOR_SAVE_BUTTON_SELECTOR);
                        if (saveButton) delete saveButton.dataset.enhancer2SaveListener;
                    }
                }
            }
        };
        promptEditorObserver = new MutationObserver(callbackObs);
        promptEditorObserver.observe(targetNodeObs, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        console.log(`${LOG_PREFIX_MODULE} Prompt Editor observer initialized.`);
    }

    // --- GENERATION EVENT HANDLING ---
    async function enhancer2HandleBeforeGeneration() {
        const ENHANCER2_EXTENSION_NAME = dependencies.extension_settings.Enhancer2 ? "Enhancer2" : Object.keys(dependencies.extension_settings)[0] || "Enhancer2";
        if (!dependencies.extension_settings[ENHANCER2_EXTENSION_NAME]?.isPromptTriggerSystemEnabled) return;
        if (!dependencies.TriggerEngine || !dependencies.UIOrganizer) {
            console.warn(`${LOG_PREFIX_MODULE} TriggerEngine or UIOrganizer not available for pre-generation.`);
            return;
        }

        let latestUserMessage = "";
        if (dependencies.getContext && typeof dependencies.getContext === 'function') {
            try {
                const context = dependencies.getContext();
                latestUserMessage = context?.chat?.slice().reverse().find(m => m.is_user === true)?.mes || "";
            } catch (err) { console.error(`${LOG_PREFIX_MODULE} Error getting user message:`, err); return; }
        }
        if (!latestUserMessage) return;

        const promptMap = dependencies.UIOrganizer.getPromptMap ? dependencies.UIOrganizer.getPromptMap() : {};
        const promptIdsToActivate = dependencies.TriggerEngine.getMatchingTriggerPromptIds(latestUserMessage);
        
        temporarilyEnabledPromptIdsInCurrentGeneration = []; // Reset for this turn

        for (const promptId of promptIdsToActivate) {
            const promptMapEntry = promptMap[promptId];
            if (promptMapEntry && promptMapEntry.toggleButton) {
                const isCurrentlyEnabled = promptMapEntry.toggleButton.classList.contains(ST_TOGGLE_ENABLED_CLASS);
                if (!isCurrentlyEnabled) {
                    // console.log(`${LOG_PREFIX_MODULE} Trigger for '${promptMapEntry.name}' (ID: ${promptId}). Clicking ON.`);
                    promptMapEntry.toggleButton.click();
                    temporarilyEnabledPromptIdsInCurrentGeneration.push(promptId);
                    await new Promise(resolve => setTimeout(resolve, 50)); // UI update delay
                }
            }
        }
        // if (temporarilyEnabledPromptIdsInCurrentGeneration.length > 0) {
        //     console.log(`${LOG_PREFIX_MODULE} Prompts toggled ON: ${temporarilyEnabledPromptIdsInCurrentGeneration.join(', ')}`);
        // }
    }

    async function enhancer2HandleAfterGenerationCleanup() {
        if (temporarilyEnabledPromptIdsInCurrentGeneration.length === 0) return;
        if (!dependencies.UIOrganizer) return;

        // console.log(`${LOG_PREFIX_MODULE} Cleaning up prompts: ${temporarilyEnabledPromptIdsInCurrentGeneration.join(', ')}`);
        const promptMap = dependencies.UIOrganizer.getPromptMap ? dependencies.UIOrganizer.getPromptMap() : {};

        for (const promptIdToReset of temporarilyEnabledPromptIdsInCurrentGeneration) {
            const promptMapEntry = promptMap[promptIdToReset];
            if (promptMapEntry && promptMapEntry.toggleButton) {
                const isCurrentlyEnabled = promptMapEntry.toggleButton.classList.contains(ST_TOGGLE_ENABLED_CLASS);
                if (isCurrentlyEnabled) { // Should be, as we turned it on
                    // console.log(`${LOG_PREFIX_MODULE} Resetting '${promptMapEntry.name}' (ID: ${promptIdToReset}). Clicking OFF.`);
                    promptMapEntry.toggleButton.click();
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
        }
        temporarilyEnabledPromptIdsInCurrentGeneration = [];
    }


    // --- INITIALIZATION AND PUBLIC API ---
    window.Enhancer2TriggerHandler = {
        initialize: function (deps) {
            dependencies = deps;
            LOG_PREFIX_MODULE = `${dependencies.LOG_PREFIX_BASE}-TrigHand`;
            console.log(`${LOG_PREFIX_MODULE} Initializing...`);

            if (!dependencies.TriggerEngine) console.error(`${LOG_PREFIX_MODULE} TriggerEngine dependency missing!`);
            if (!dependencies.UIOrganizer) console.error(`${LOG_PREFIX_MODULE} UIOrganizer dependency missing!`);
            if (!dependencies.eventSource || !dependencies.event_types) {
                 console.error(`${LOG_PREFIX_MODULE} EventSource/EventTypes missing!`);
            } else {
                const genAfterCommandsEvent = dependencies.event_types.GENERATION_AFTER_COMMANDS || 'GENERATION_AFTER_COMMANDS_fallback';
                dependencies.eventSource.on(genAfterCommandsEvent, enhancer2HandleBeforeGeneration);
                
                const genEndedEvent = dependencies.event_types.GENERATION_ENDED || 'GENERATION_ENDED_fallback';
                dependencies.eventSource.on(genEndedEvent, enhancer2HandleAfterGenerationCleanup);
                console.log(`${LOG_PREFIX_MODULE} Generation event listeners registered.`);
            }
            
            initializePromptEditorObserver();
            console.log(`${LOG_PREFIX_MODULE} Initialized.`);
        },

        initializeSettingsUI: function(deps) {
            dependencies = dependencies || deps;
            LOG_PREFIX_MODULE = LOG_PREFIX_MODULE || `${dependencies.LOG_PREFIX_BASE}-TrigHand`;
            const ENHANCER2_EXTENSION_NAME = dependencies.extension_settings.Enhancer2 ? "Enhancer2" : Object.keys(dependencies.extension_settings)[0] || "Enhancer2";


            const enableTriggersCheckbox = document.getElementById('enhancer2EnablePromptTriggers'); // Assuming ID in settings.html
            const saveTriggersButton = document.getElementById('enhancer2SaveTriggerSystemSettings'); // This might be just a global save now
            const triggerSystemStatusDiv = document.getElementById('enhancer2TriggerSystemStatus');

            if (!enableTriggersCheckbox || !triggerSystemStatusDiv ) { // saveTriggersButton might be removed if it's just a global enable
                // console.warn(`${LOG_PREFIX_MODULE} Trigger System Settings UI elements not found.`);
                return;
            }
            
            enableTriggersCheckbox.checked = dependencies.extension_settings[ENHANCER2_EXTENSION_NAME]?.isPromptTriggerSystemEnabled || false;
            
            const updateTriggerSetting = () => {
                 if (!dependencies.saveSettingsDebounced) {
                    triggerSystemStatusDiv.textContent = 'Error: Save function missing.'; triggerSystemStatusDiv.style.color = 'red'; return;
                }
                dependencies.extension_settings[ENHANCER2_EXTENSION_NAME].isPromptTriggerSystemEnabled = enableTriggersCheckbox.checked;
                dependencies.saveSettingsDebounced();
                triggerSystemStatusDiv.textContent = 'Trigger system setting saved!'; triggerSystemStatusDiv.style.color = 'lightgreen';
                // console.log(`${LOG_PREFIX_MODULE} Prompt trigger system enabled state saved: ${enableTriggersCheckbox.checked}`);
                setTimeout(() => { if(triggerSystemStatusDiv) triggerSystemStatusDiv.textContent = ''; }, 3000);
            };

            enableTriggersCheckbox.removeEventListener('change', updateTriggerSetting); // Prevent duplicates
            enableTriggersCheckbox.addEventListener('change', updateTriggerSetting);

            // If you still have a dedicated save button for this section:
            if (saveTriggersButton) {
                saveTriggersButton.removeEventListener('click', updateTriggerSetting);
                saveTriggersButton.addEventListener('click', updateTriggerSetting);
            }
            console.log(`${LOG_PREFIX_MODULE} Trigger System settings UI initialized.`);
        }
    };
    console.log(`${LOG_PREFIX_MODULE} Script loaded. Waiting for initialize().`);
})();
