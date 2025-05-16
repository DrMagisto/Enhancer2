// Enhancer2/content.js

// --- CORE ST IMPORTS ---
let extension_settings, getContext;
try {
    ({ extension_settings, getContext } = await import('../../../extensions.js'));
} catch (e) {
    console.error(`[Enhancer2-Loader] CRITICAL: Failed to import from '../../../extensions.js'`, e);
}

let saveSettingsDebounced;
try {
    ({ saveSettingsDebounced } = await import('../../../../script.js'));
} catch (e) {
    console.error(`[Enhancer2-Loader] CRITICAL: Failed to import saveSettingsDebounced from '../../../../script.js'`, e);
}

let escapeRegex, regexFromString;
const UTILS_PATH = '../../../utils.js'; // Keep for reference, pass to modules
try {
    ({ escapeRegex, regexFromString } = await import(UTILS_PATH));
    console.log(`[Enhancer2-Loader] Successfully imported utils from ${UTILS_PATH}`);
} catch (e) {
    console.error(`[Enhancer2-Loader] Failed to import utils from '${UTILS_PATH}'. Modules will rely on window.utils or passed utils. Error:`, e);
}

let eventSource, event_types;
try {
    const scriptModule = await import('../../../../script.js');
    eventSource = scriptModule.eventSource;
    event_types = scriptModule.event_types;
    if (!eventSource || !event_types) {
        eventSource = window.eventSource; event_types = window.event_types;
    }
    console.log(`[Enhancer2-Loader] eventSource/event_types resolved.`);
} catch (e) {
    console.error(`[Enhancer2-Loader] Failed to import eventSource/event_types. Error:`, e);
    eventSource = window.eventSource; event_types = window.event_types;
}

// --- CONSTANTS ---
const ENHANCER2_EXTENSION_NAME = "Enhancer2"; // Internal name
const LOG_PREFIX_LOADER = `[${ENHANCER2_EXTENSION_NAME}-Loader]`;
const BASE_SCRIPT_PATH = `scripts/extensions/third-party/${ENHANCER2_EXTENSION_NAME}/`;

const MODULE_FILES = [
    'enhancer2_ui_organizer.js',
    'enhancer2_trigger_engine.js', // Load engine before handler that might use it
    'enhancer2_trigger_handler.js'
];

// --- SCRIPT LOADING ---
function loadScript(scriptName) {
    return new Promise((resolve, reject) => {
        const scriptUrl = `${BASE_SCRIPT_PATH}${scriptName}?v=${Date.now()}`;
        const scriptElement = document.createElement('script');
        scriptElement.src = scriptUrl;
        scriptElement.type = 'text/javascript';
        scriptElement.onload = () => {
            console.log(`${LOG_PREFIX_LOADER} Successfully loaded ${scriptName}`);
            resolve();
        };
        scriptElement.onerror = (error) => {
            console.error(`${LOG_PREFIX_LOADER} Error loading script ${scriptName}:`, error);
            reject(error);
        };
        document.head.appendChild(scriptElement);
    });
}

// --- SETTINGS NAMESPACE & UI (can be further modularized if it grows) ---
function ensureEnhancer2SettingsNamespace() {
    if (!extension_settings) return false;
    extension_settings[ENHANCER2_EXTENSION_NAME] = extension_settings[ENHANCER2_EXTENSION_NAME] || {};
    // Add any top-level default settings for the whole Enhancer2 suite if needed
    // Individual modules will handle their own specific sub-settings namespaces
    return true;
}

async function initializeEnhancer2SettingsUI() {
    // This function will be responsible for loading settings.html
    // and attaching listeners for settings that might be global or don't cleanly fit
    // into one of the sub-modules, or it can call init functions on modules for their settings.
    // For now, let's keep it simple and assume modules handle their own settings UI parts
    // if they register them. This function mainly loads the HTML container.
    if (!ensureEnhancer2SettingsNamespace()) {
        console.error(`${LOG_PREFIX_LOADER} Cannot init settings UI, namespace error.`);
        return;
    }
    try {
        const extensionsSettingsContainer = document.getElementById('extensions_settings');
        if (!extensionsSettingsContainer) {
            console.warn(`${LOG_PREFIX_LOADER} extensions_settings container not found. Retrying settings UI init.`);
            setTimeout(initializeEnhancer2SettingsUI, 1500); return;
        }

        // Check if our main settings block is already there
        if (!document.querySelector(`.${ENHANCER2_EXTENSION_NAME}-settings-container`)) {
            const settingsHtmlPath = `${BASE_SCRIPT_PATH}settings.html`;
            const response = await fetch(settingsHtmlPath);
            if (!response.ok) throw new Error(`Failed to fetch settings.html: ${response.statusText}`);
            extensionsSettingsContainer.insertAdjacentHTML('beforeend', await response.text());
            console.log(`${LOG_PREFIX_LOADER} Settings HTML injected.`);
        } else {
            console.log(`${LOG_PREFIX_LOADER} Settings HTML already present.`);
        }

        // Modules can now populate their specific parts of the settings UI
        if (window.Enhancer2UIOrganizer && typeof window.Enhancer2UIOrganizer.initializeSettingsUI === 'function') {
            window.Enhancer2UIOrganizer.initializeSettingsUI(sharedDependenciesForModules);
        }
        if (window.Enhancer2TriggerHandler && typeof window.Enhancer2TriggerHandler.initializeSettingsUI === 'function') {
            window.Enhancer2TriggerHandler.initializeSettingsUI(sharedDependenciesForModules);
        }
        // ... and so on for other modules if they have settings UI

    } catch (error) {
        console.error(`${LOG_PREFIX_LOADER} Critical error initializing Enhancer2 settings UI:`, error);
    }
}

let sharedDependenciesForModules = {};

// --- MAIN STARTUP LOGIC ---
async function startExtension() {
    console.log(`${LOG_PREFIX_LOADER} ${ENHANCER2_EXTENSION_NAME} startup sequence initiated.`);
    ensureEnhancer2SettingsNamespace();

    for (const scriptFile of MODULE_FILES) {
        try {
            await loadScript(scriptFile);
        } catch (error) {
            console.error(`${LOG_PREFIX_LOADER} CRITICAL: Failed to load module ${scriptFile}. Some features may be unavailable.`, error);
            // Decide if you want to halt or continue if a module fails
        }
    }

    sharedDependenciesForModules = {
        extension_settings: extension_settings,
        getContext: getContext,
        saveSettingsDebounced: saveSettingsDebounced,
        eventSource: eventSource,
        event_types: event_types,
        LOG_PREFIX_BASE: `[${ENHANCER2_EXTENSION_NAME}]`, // Base prefix for modules to extend
        baseScriptPath: BASE_SCRIPT_PATH,
        utils: { 
            escapeRegex: typeof escapeRegex === 'function' ? escapeRegex : (window.utils ? window.utils.escapeRegex : null),
            regexFromString: typeof regexFromString === 'function' ? regexFromString : (window.utils ? window.utils.regexFromString : null)
        }
    };
    if (!sharedDependenciesForModules.utils.escapeRegex || !sharedDependenciesForModules.utils.regexFromString) {
        console.warn(`${LOG_PREFIX_LOADER} Utility functions (escapeRegex, regexFromString) are not available. Trigger parsing may fail.`);
    }


    // Initialize modules in a specific order if there are dependencies
    // TriggerEngine first, as TriggerHandler depends on it.
    // UIOrganizer can be independent or provide data (like promptMap) to TriggerHandler.

    if (window.Enhancer2TriggerEngine && typeof window.Enhancer2TriggerEngine.initialize === 'function') {
        window.Enhancer2TriggerEngine.initialize({
            extension_settings: sharedDependenciesForModules.extension_settings,
            utils: sharedDependenciesForModules.utils,
            LOG_PREFIX_MODULE: `${sharedDependenciesForModules.LOG_PREFIX_BASE}-TrigEng`
        });
    } else {
        console.error(`${LOG_PREFIX_LOADER} Enhancer2TriggerEngine not found or not initializable.`);
    }

    // UIOrganizer might be needed by TriggerHandler (for promptMap)
    let uiOrganizerInitialized = false;
    if (window.Enhancer2UIOrganizer && typeof window.Enhancer2UIOrganizer.initialize === 'function') {
        window.Enhancer2UIOrganizer.initialize(sharedDependenciesForModules);
        uiOrganizerInitialized = true;
    } else {
        console.error(`${LOG_PREFIX_LOADER} Enhancer2UIOrganizer not found or not initializable.`);
    }

    if (window.Enhancer2TriggerHandler && typeof window.Enhancer2TriggerHandler.initialize === 'function') {
        // Pass the UIOrganizer instance or a way to get its data if needed
        const triggerHandlerDeps = { ...sharedDependenciesForModules };
        if (uiOrganizerInitialized && window.Enhancer2UIOrganizer) {
            triggerHandlerDeps.UIOrganizer = window.Enhancer2UIOrganizer; // For getPromptMap etc.
        }
        triggerHandlerDeps.TriggerEngine = window.Enhancer2TriggerEngine; // Pass the engine

        window.Enhancer2TriggerHandler.initialize(triggerHandlerDeps);
    } else {
        console.error(`${LOG_PREFIX_LOADER} Enhancer2TriggerHandler not found or not initializable.`);
    }

    console.log(`${LOG_PREFIX_LOADER} All modules loaded and initialization sequence attempted.`);

    // Initialize settings UI after modules are loaded, so they can populate their parts
    const initSettings = async () => {
        await initializeEnhancer2SettingsUI();
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
       initSettings();
    } else {
        window.addEventListener('load', initSettings);
    }
}

// --- STARTUP TRIGGER ---
let stFullyLoadedForEnhancer2 = false;
function robustEnhancer2StartupTrigger() {
    if (stFullyLoadedForEnhancer2) return;
    stFullyLoadedForEnhancer2 = true;
    console.log(`${LOG_PREFIX_LOADER} DOM content loaded / Window loaded. Proceeding with ${ENHANCER2_EXTENSION_NAME} startup.`);
    // Delay slightly to ensure ST environment is fully ready
    setTimeout(startExtension, 700);
}

if (document.readyState === 'complete' || document.readyState === 'interactive' || document.readyState === "loaded" ) {
    robustEnhancer2StartupTrigger();
} else {
    document.addEventListener('DOMContentLoaded', robustEnhancer2StartupTrigger);
    window.addEventListener('load', robustEnhancer2StartupTrigger);
}
