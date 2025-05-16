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
    // Fallback to window.utils if direct import fails
    if (window.utils) {
        escapeRegex = window.utils.escapeRegex;
        regexFromString = window.utils.regexFromString;
        if (typeof escapeRegex === 'function' && typeof regexFromString === 'function') {
            console.log(`[Enhancer2-Loader] Using utils from window.utils as fallback.`);
        } else {
            escapeRegex = null; regexFromString = null; // Ensure they are null if window.utils is incomplete
        }
    }
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
        const scriptUrl = `${BASE_SCRIPT_PATH}${scriptName}?v=${Date.now()}`; // Cache busting
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

// --- SETTINGS NAMESPACE & UI ---
// This object will hold shared dependencies for all modules
let sharedDependenciesForModules = {};

function ensureEnhancer2SettingsNamespace() {
    if (!extension_settings) {
        console.error(`${LOG_PREFIX_LOADER} extension_settings not available for namespace check.`);
        return false;
    }
    extension_settings[ENHANCER2_EXTENSION_NAME] = extension_settings[ENHANCER2_EXTENSION_NAME] || {};
    // Example: Top-level default setting for the whole Enhancer2 suite
    // if (extension_settings[ENHANCER2_EXTENSION_NAME].globalEnable === undefined) {
    //     extension_settings[ENHANCER2_EXTENSION_NAME].globalEnable = true;
    // }
    // Individual modules will handle their own specific sub-settings namespaces via the shared extension_settings object.
    return true;
}

async function initializeEnhancer2SettingsPanel() {
    if (!ensureEnhancer2SettingsNamespace()) {
        console.error(`${LOG_PREFIX_LOADER} Cannot init settings panel, namespace error.`);
        return;
    }
    try {
        const extensionsSettingsContainer = document.getElementById('extensions_settings');
        if (!extensionsSettingsContainer) {
            console.warn(`${LOG_PREFIX_LOADER} extensions_settings container not found. Retrying settings panel init.`);
            setTimeout(initializeEnhancer2SettingsPanel, 1500); return;
        }

        if (!document.querySelector(`.${ENHANCER2_EXTENSION_NAME}-settings-container`)) {
            const settingsHtmlPath = `${BASE_SCRIPT_PATH}settings.html`;
            const response = await fetch(settingsHtmlPath);
            if (!response.ok) throw new Error(`Failed to fetch settings.html: ${response.statusText}`);
            extensionsSettingsContainer.insertAdjacentHTML('beforeend', await response.text());
            console.log(`${LOG_PREFIX_LOADER} Settings HTML injected.`);
        } else {
            // console.log(`${LOG_PREFIX_LOADER} Settings HTML already present.`);
        }
        // Call initializeSettingsUI for each module that has one
        if (window.Enhancer2UIOrganizer && typeof window.Enhancer2UIOrganizer.initializeSettingsUI === 'function') {
            window.Enhancer2UIOrganizer.initializeSettingsUI(sharedDependenciesForModules);
        }
        if (window.Enhancer2TriggerHandler && typeof window.Enhancer2TriggerHandler.initializeSettingsUI === 'function') {
            window.Enhancer2TriggerHandler.initializeSettingsUI(sharedDependenciesForModules);
        }

    } catch (error) {
        console.error(`${LOG_PREFIX_LOADER} Critical error initializing Enhancer2 settings panel:`, error);
        const esc = document.getElementById('extensions_settings');
        if (esc && !document.querySelector(`.${ENHANCER2_EXTENSION_NAME}-settings-error`)) {
            esc.insertAdjacentHTML('beforeend', `<div class="${ENHANCER2_EXTENSION_NAME}-settings-error" style="color:red; padding:10px;"><b>${ENHANCER2_EXTENSION_NAME} Settings Error:</b> Failed to load UI. Check console. Details: ${error.message}</div>`);
        }
    }
}


// --- MAIN STARTUP LOGIC ---
async function startExtension() {
    console.log(`${LOG_PREFIX_LOADER} ${ENHANCER2_EXTENSION_NAME} startup sequence initiated.`);
    if (!ensureEnhancer2SettingsNamespace()) {
        console.error(`${LOG_PREFIX_LOADER} Halting startup due to settings namespace error.`);
        return;
    }

    for (const scriptFile of MODULE_FILES) {
        try {
            await loadScript(scriptFile);
        } catch (error) {
            console.error(`${LOG_PREFIX_LOADER} CRITICAL: Failed to load module ${scriptFile}. Some features may be unavailable.`, error);
        }
    }

    // Prepare shared dependencies
    sharedDependenciesForModules = {
        extension_settings: extension_settings,
        getContext: getContext,
        saveSettingsDebounced: saveSettingsDebounced,
        eventSource: eventSource,
        event_types: event_types,
        LOG_PREFIX_BASE: `[${ENHANCER2_EXTENSION_NAME}]`,
        baseScriptPath: BASE_SCRIPT_PATH, // For modules to load their own assets if needed
        utils: {
            escapeRegex: typeof escapeRegex === 'function' ? escapeRegex : null,
            regexFromString: typeof regexFromString === 'function' ? regexFromString : null
        }
    };

    // Check if utils were successfully resolved (either by import or window fallback)
    if (!sharedDependenciesForModules.utils.escapeRegex || !sharedDependenciesForModules.utils.regexFromString) {
        console.warn(`${LOG_PREFIX_LOADER} Utility functions (escapeRegex, regexFromString) are not available. Trigger parsing may fail or be disabled.`);
        // Modules needing these utils should check for their existence in their init.
    }

    // Initialize modules - order can matter if there are interdependencies
    if (window.Enhancer2TriggerEngine && typeof window.Enhancer2TriggerEngine.initialize === 'function') {
        window.Enhancer2TriggerEngine.initialize({
            extension_settings: sharedDependenciesForModules.extension_settings,
            utils: sharedDependenciesForModules.utils, // Pass the resolved utils
            LOG_PREFIX_MODULE: `${sharedDependenciesForModules.LOG_PREFIX_BASE}-TrigEng`
        });
    } else {
        console.error(`${LOG_PREFIX_LOADER} Enhancer2TriggerEngine not found or not initializable.`);
    }

    let uiOrganizerInstance = null;
    if (window.Enhancer2UIOrganizer && typeof window.Enhancer2UIOrganizer.initialize === 'function') {
        // Pass a copy of shared dependencies, potentially adding module-specific ones or modifying
        const uiDeps = { ...sharedDependenciesForModules };
        uiDeps.LOG_PREFIX_MODULE = `${sharedDependenciesForModules.LOG_PREFIX_BASE}-UIOrg`;
        window.Enhancer2UIOrganizer.initialize(uiDeps);
        uiOrganizerInstance = window.Enhancer2UIOrganizer; // Store instance if needed
    } else {
        console.error(`${LOG_PREFIX_LOADER} Enhancer2UIOrganizer not found or not initializable.`);
    }

    if (window.Enhancer2TriggerHandler && typeof window.Enhancer2TriggerHandler.initialize === 'function') {
        const triggerHandlerDeps = { ...sharedDependenciesForModules };
        triggerHandlerDeps.LOG_PREFIX_MODULE = `${sharedDependenciesForModules.LOG_PREFIX_BASE}-TrigHand`;
        if (uiOrganizerInstance) {
            triggerHandlerDeps.UIOrganizer = uiOrganizerInstance; // Pass the UIOrganizer instance
        } else {
            console.warn(`${LOG_PREFIX_LOADER} UIOrganizer instance not available for TriggerHandler.`);
        }
        triggerHandlerDeps.TriggerEngine = window.Enhancer2TriggerEngine; // Pass the TriggerEngine instance

        window.Enhancer2TriggerHandler.initialize(triggerHandlerDeps);
    } else {
        console.error(`${LOG_PREFIX_LOADER} Enhancer2TriggerHandler not found or not initializable.`);
    }

    console.log(`${LOG_PREFIX_LOADER} All modules loaded and initialization sequence attempted.`);

    // Initialize settings panel UI after modules are loaded
    const initSettingsPanel = async () => {
        await initializeEnhancer2SettingsPanel();
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
       initSettingsPanel();
    } else {
        window.addEventListener('load', initSettingsPanel);
    }
}

// --- STARTUP TRIGGER ---
let stFullyLoadedForEnhancer2 = false;
function robustEnhancer2StartupTrigger() {
    if (stFullyLoadedForEnhancer2) return;

    // Basic check for ST core objects
    if (typeof getContext !== 'function' || typeof extension_settings !== 'object' || typeof saveSettingsDebounced !== 'function') {
        console.log(`${LOG_PREFIX_LOADER} Waiting for SillyTavern core objects to be available... Retrying in 500ms.`);
        setTimeout(robustEnhancer2StartupTrigger, 500);
        return;
    }
    
    stFullyLoadedForEnhancer2 = true;
    console.log(`${LOG_PREFIX_LOADER} DOM content loaded / Window loaded & ST core objects detected. Proceeding with ${ENHANCER2_EXTENSION_NAME} startup.`);
    setTimeout(startExtension, 700); // Slight delay for ST environment
}

if (document.readyState === 'complete' || document.readyState === 'interactive' || document.readyState === "loaded" ) {
    robustEnhancer2StartupTrigger();
} else {
    document.addEventListener('DOMContentLoaded', robustEnhancer2StartupTrigger);
    window.addEventListener('load', robustEnhancer2StartupTrigger);
}
