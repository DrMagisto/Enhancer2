// Enhancer2/enhancer2_trigger_engine.js

(function () {
    let dependencies = null; // To store passed-in dependencies { extension_settings, utils, LOG_PREFIX_MODULE }
    let LOG_PREFIX_MODULE = "[Enhancer2-TrigEng]"; // Default, will be updated

    // --- MODULE-SCOPED STATE ---
    let isEngineCoreInitialized = false;
    // No more polling logic here, assume dependencies are passed correctly by the loader.

    // --- HELPER FUNCTIONS ---

    function ensureTriggerSettingsNamespaceInEngine() {
        if (!isEngineCoreInitialized || !dependencies || !dependencies.extension_settings) {
            console.warn(`${LOG_PREFIX_MODULE} Cannot ensure settings namespace: core not init or deps missing.`);
            return false;
        }
        // Assuming ENHANCER2_EXTENSION_NAME is the key used in extension_settings by the loader
        const ENHANCER2_EXTENSION_NAME = dependencies.extension_settings.Enhancer2 ? "Enhancer2" : Object.keys(dependencies.extension_settings)[0] || "Enhancer2";

        dependencies.extension_settings[ENHANCER2_EXTENSION_NAME] = dependencies.extension_settings[ENHANCER2_EXTENSION_NAME] || {};
        const enhancerSettings = dependencies.extension_settings[ENHANCER2_EXTENSION_NAME];

        if (enhancerSettings.isPromptTriggerSystemEnabled === undefined) {
            enhancerSettings.isPromptTriggerSystemEnabled = false; // Default
        }
        if (typeof enhancerSettings.prompt_triggers !== 'object' || enhancerSettings.prompt_triggers === null) {
            enhancerSettings.prompt_triggers = {};
        }
        return true;
    }

    function parseTriggerStringToRegexes(triggerString) {
        if (!isEngineCoreInitialized || !dependencies || !dependencies.utils ||
            typeof dependencies.utils.regexFromString !== 'function' ||
            typeof dependencies.utils.escapeRegex !== 'function') {
            console.warn(`${LOG_PREFIX_MODULE} ParseTriggers: Utils not available or invalid.`);
            return [];
        }
        if (typeof triggerString !== 'string' || !triggerString.trim()) {
            return [];
        }

        const triggers = triggerString.split(',').map(t => t.trim()).filter(t => t.length > 0);
        return triggers.map(trigger => {
            try {
                if (trigger.startsWith('/') && trigger.lastIndexOf('/') > 0) {
                    const parsedRegex = dependencies.utils.regexFromString(trigger);
                    if (!parsedRegex) throw new Error(`regexFromString returned null for: ${trigger}`);
                    return parsedRegex;
                } else {
                    return new RegExp(dependencies.utils.escapeRegex(trigger), 'i');
                }
            } catch (e) {
                console.warn(`${LOG_PREFIX_MODULE} Invalid regex or keyword: "${trigger}". Error:`, e.message);
                return null;
            }
        }).filter(Boolean); // Remove nulls from failed parsing
    }

    function checkTriggersAgainstMessage(message, regexTriggers) {
        if (!message || regexTriggers.length === 0) {
            return false;
        }
        for (const regex of regexTriggers) {
            if (regex.test(message)) {
                return true;
            }
        }
        return false;
    }

    // --- PUBLIC API METHODS ---

    function getMatchingTriggerPromptIds(latestUserMessage) {
        const matchingPromptIds = [];
        if (!isEngineCoreInitialized || !ensureTriggerSettingsNamespaceInEngine()) {
            // console.warn(`${LOG_PREFIX_MODULE} GetMatching: Engine not ready or settings namespace error.`);
            return matchingPromptIds;
        }

        const ENHANCER2_EXTENSION_NAME = dependencies.extension_settings.Enhancer2 ? "Enhancer2" : Object.keys(dependencies.extension_settings)[0] || "Enhancer2";
        const enhancerSettings = dependencies.extension_settings[ENHANCER2_EXTENSION_NAME];

        if (!enhancerSettings.isPromptTriggerSystemEnabled) {
            return matchingPromptIds;
        }
        if (!latestUserMessage) {
            return matchingPromptIds;
        }

        const promptTriggersConfig = enhancerSettings.prompt_triggers || {};
        for (const promptId in promptTriggersConfig) {
            if (Object.hasOwnProperty.call(promptTriggersConfig, promptId)) {
                const triggerConfigString = promptTriggersConfig[promptId];
                if (triggerConfigString) {
                    const regexTriggers = parseTriggerStringToRegexes(triggerConfigString);
                    if (checkTriggersAgainstMessage(latestUserMessage, regexTriggers)) {
                        matchingPromptIds.push(promptId);
                    }
                }
            }
        }
        return matchingPromptIds;
    }

    function savePromptTriggersToSettings(promptId, triggerConfigString) {
        if (!isEngineCoreInitialized || !ensureTriggerSettingsNamespaceInEngine()) {
            console.warn(`${LOG_PREFIX_MODULE} SaveTriggers: Engine not ready or settings namespace error.`);
            return;
        }
        if (promptId) {
            const ENHANCER2_EXTENSION_NAME = dependencies.extension_settings.Enhancer2 ? "Enhancer2" : Object.keys(dependencies.extension_settings)[0] || "Enhancer2";
            dependencies.extension_settings[ENHANCER2_EXTENSION_NAME].prompt_triggers[promptId] = triggerConfigString || "";
            // Actual saving to localStorage is handled by saveSettingsDebounced called by the handler module
        } else {
            console.warn(`${LOG_PREFIX_MODULE} SaveTriggers: promptId is missing.`);
        }
    }

    function loadPromptTriggersFromSettings(promptId) {
        if (!isEngineCoreInitialized || !ensureTriggerSettingsNamespaceInEngine()) {
            // console.warn(`${LOG_PREFIX_MODULE} LoadTriggers: Engine not ready or settings namespace error.`);
            return "";
        }
        if (promptId) {
            const ENHANCER2_EXTENSION_NAME = dependencies.extension_settings.Enhancer2 ? "Enhancer2" : Object.keys(dependencies.extension_settings)[0] || "Enhancer2";
            return dependencies.extension_settings[ENHANCER2_EXTENSION_NAME].prompt_triggers[promptId] || "";
        }
        return "";
    }


    // --- INITIALIZATION ---
    window.Enhancer2TriggerEngine = {
        initialize: function (deps) {
            if (isEngineCoreInitialized) {
                // console.warn(`${LOG_PREFIX_MODULE} Already initialized.`);
                return;
            }
            dependencies = deps;
            LOG_PREFIX_MODULE = dependencies.LOG_PREFIX_MODULE || LOG_PREFIX_MODULE;

            if (!dependencies || !dependencies.extension_settings || !dependencies.utils) {
                console.error(`${LOG_PREFIX_MODULE} CRITICAL: Missing core dependencies (extension_settings, utils). Engine may not function.`);
                isEngineCoreInitialized = false;
                return;
            }
            if (typeof dependencies.utils.escapeRegex !== 'function' || typeof dependencies.utils.regexFromString !== 'function') {
                console.error(`${LOG_PREFIX_MODULE} CRITICAL: Utils methods (escapeRegex, regexFromString) missing or invalid. Trigger parsing will fail.`);
                isEngineCoreInitialized = false;
                return;
            }
            
            isEngineCoreInitialized = true;
            ensureTriggerSettingsNamespaceInEngine(); // Initialize settings structure
            console.log(`${LOG_PREFIX_MODULE} Initialized.`);
        },

        isInitialized: function() {
            return isEngineCoreInitialized;
        },

        // Exposed methods
        getMatchingTriggerPromptIds: getMatchingTriggerPromptIds,
        savePromptTriggers: savePromptTriggersToSettings, // Renamed for clarity
        loadPromptTriggers: loadPromptTriggersFromSettings  // Renamed for clarity
    };

    console.log(`${LOG_PREFIX_MODULE} Script loaded. Waiting for initialize().`);
})();
