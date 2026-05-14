import { parse, stringify } from 'yaml';
import './style.css';
import settingsTemplate from './settings.html';
import configTemplate from './config.html';
import parameterTemplate from './parameter.html';

const { saveSettingsDebounced, event_types, eventSource, chatCompletionSettings, Popup } = SillyTavern.getContext();

const MODULE_NAME = 'advancedParameters';

type ParameterType = 'slider' | 'text' | 'number' | 'checkbox' | 'select' | 'array' | 'object' | 'textarea' | 'multiselect';

interface ParameterModel {
    id: string;
    name: string;
    property: string;
    type: ParameterType;
    enabled: boolean;
    description?: string;
    
    // For sliders and numbers
    min?: string;
    max?: string;
    step?: string;
    value?: number;
    
    // For text, textarea
    textValue?: string;
    
    // For checkboxes
    boolValue?: boolean;
    
    // For select and multiselect
    options?: string[];
    selectValue?: string | string[];
    
    // For arrays
    arrayValue?: (string | number | boolean)[];
    arrayDelimiter?: string;
    arrayAsString?: boolean;  // If true, return as delimited string instead of array
    
    // For objects (JSON)
    objectValue?: Record<string, unknown> | unknown[];
    objectRaw?: string;
}

interface ParameterCollection {
    active: boolean;
    name: string;
    parameters: ParameterModel[];
    presets: string[];
}

interface ExtensionSettings {
    enabled: boolean;
    collections: ParameterCollection[];
    [key: string]: unknown;
}

interface GlobalSettings {
    [MODULE_NAME]: ExtensionSettings;
}

interface ChatCompletionRequestData {
    chat_completion_source: string;
    custom_include_body: string;
}

/**
 * Convert Python-style JSON to valid JSON
 * Handles: False -> false, True -> true, None -> null
 * Works with objects, arrays, and nested structures
 */
function convertPythonToJSON(input: string): string {
    // Extract strings to avoid replacing inside quoted values
    const strings: string[] = [];
    let processed = input.replace(/"([^"\\]|\\.)*"/g, (match) => {
        strings.push(match);
        return `__STRING_${strings.length - 1}__`;
    });

    // Replace Python keywords with JSON equivalents
    processed = processed
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bNone\b/g, 'null');

    // Restore strings
    processed = processed.replace(/__STRING_(\d+)__/g, (match, index) => {
        return strings[parseInt(index)];
    });

    return processed;
}

const defaultSettings: Readonly<ExtensionSettings> = Object.freeze({
    enabled: true,
    collections: [{
        active: true,
        name: 'Default',
        parameters: [],
        presets: [],
    }],
});

export function getSettings(): ExtensionSettings {
    const context = SillyTavern.getContext();
    const globalSettings = context.extensionSettings as object as GlobalSettings;

    if (!globalSettings[MODULE_NAME]) {
        globalSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }

    for (const key in defaultSettings) {
        if (globalSettings[MODULE_NAME][key] === undefined) {
            globalSettings[MODULE_NAME][key] = defaultSettings[key];
        }
    }

    const settings = globalSettings[MODULE_NAME];

    if (settings.collections.length === 0) {
        settings.collections.push(defaultSettings.collections[0]);
    }

    if (!settings.collections.some(c => c.active)) {
        settings.collections[0].active = true;
    }

    return settings;
}

function getUIElements() {
    return {
        create: document.getElementById('advanced_params_create') as HTMLInputElement,
        list: document.getElementById('advanced_params_list') as HTMLDivElement,
        rangeBlock: document.getElementById('range_block_openai') as HTMLDivElement,
        collections: document.getElementById('advanced_params_collections') as HTMLSelectElement,
        createCollection: document.getElementById('advanced_params_create_collection') as HTMLDivElement,
        deleteCollection: document.getElementById('advanced_params_delete_collection') as HTMLDivElement,
        bindToPreset: document.getElementById('advanced_params_bind_to_preset') as HTMLDivElement,
        hint: document.getElementById('advanced_params_hint') as HTMLDivElement,
        importFile: document.getElementById('advanced_params_import_file') as HTMLInputElement,
        importCollection: document.getElementById('advanced_params_import_collection') as HTMLDivElement,
        exportCollection: document.getElementById('advanced_params_export_collection') as HTMLDivElement,
        container: document.getElementById('advanced_params_container') as HTMLDivElement,
        preview: document.getElementById('advanced_params_preview') as HTMLTextAreaElement,
    };
}

function generateParameterId(): string {
    return 'param_' + Math.random().toString(36).substr(2, 9);
}

function createDefaultParameter(type: ParameterType): ParameterModel {
    const base: ParameterModel = {
        id: generateParameterId(),
        name: 'New Parameter',
        property: '',
        type,
        enabled: true,
    };

    switch (type) {
        case 'slider':
            return { ...base, min: '0', max: '1', step: '0.01', value: 0 };
        case 'number':
            return { ...base, value: 0 };
        case 'text':
            return { ...base, textValue: '' };
        case 'textarea':
            return { ...base, textValue: '' };
        case 'checkbox':
            return { ...base, boolValue: false };
        case 'select':
            return { ...base, options: ['Option 1', 'Option 2'], selectValue: 'Option 1' };
        case 'multiselect':
            return { ...base, options: ['Option 1', 'Option 2'], selectValue: [] };
        case 'array':
            return { ...base, arrayValue: [], arrayDelimiter: ',', arrayAsString: false };
        case 'object':
            return { ...base, objectValue: {}, objectRaw: '{}' };
        default:
            return base;
    }
}

export function addSettingsControls(settings: ExtensionSettings): void {
    const settingsContainer = document.getElementById('advanced_params_container') ?? document.getElementById('extensions_settings');
    if (!settingsContainer) {
        return;
    }

    const renderer = document.createElement('template');
    renderer.innerHTML = settingsTemplate;

    settingsContainer.appendChild(renderer.content);

    const elements = getUIElements();
    if (!elements.create) return;

    elements.create.addEventListener('click', () => showParameterTypeSelector(settings));
    elements.createCollection.addEventListener('click', createCollection);
    elements.deleteCollection.addEventListener('click', deleteCollection);
    elements.bindToPreset.addEventListener('click', bindToPreset);
    
    elements.collections.addEventListener('change', (e) => {
        const selectedName = elements.collections.value;
        settings.collections.forEach((collection) => {
            collection.active = collection.name === selectedName;
        });
        saveSettingsDebounced();
        renderParameterConfigs(settings);
    });
    
    elements.importCollection.addEventListener('click', async () => {
        elements.importFile.click();
    });
    
    elements.exportCollection.addEventListener('click', async () => {
        const activeCollection = settings.collections.find(c => c.active);
        if (!activeCollection) {
            return;
        }
        const fileName = activeCollection.name + '.json';
        const fileContent = JSON.stringify(activeCollection.parameters, null, 4);
        const blob = new Blob([fileContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    });
    
    elements.importFile.addEventListener('change', (e) => {
        const file = elements.importFile.files?.[0];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const fileName = file.name.split('.').shift() || 'imported';
                const fileContent = event.target?.result as string;
                const parsedParameters = JSON.parse(fileContent) as ParameterModel[];
                if (!Array.isArray(parsedParameters)) {
                    toastr.error('Invalid JSON file format.');
                    return;
                }
                processImport(fileName, parsedParameters, settings);
            } catch {
                toastr.error('Failed to parse JSON file.');
                return;
            }
        };
        reader.readAsText(file);
        elements.importFile.value = '';
    });
}

async function showParameterTypeSelector(settings: ExtensionSettings): Promise<void> {
    const types: ParameterType[] = ['slider', 'number', 'text', 'textarea', 'checkbox', 'select', 'multiselect', 'array', 'object'];
    const typeLabels: Record<ParameterType, string> = {
        'slider': 'Slider (Range)',
        'number': 'Number Input',
        'text': 'Text Input',
        'textarea': 'Text Area',
        'checkbox': 'Checkbox (Boolean)',
        'select': 'Select Dropdown',
        'multiselect': 'Multi-Select',
        'array': 'Array / List',
        'object': 'Object (JSON)',
    };

    const options = types.map(t => ({ label: typeLabels[t] }));
    
    // Simplified selection - just create a slider for now
    const activeCollection = settings.collections.find(c => c.active);
    if (!activeCollection) {
        return;
    }
    
    activeCollection.parameters.unshift(createDefaultParameter('slider'));
    renderParameterConfigs(settings);
}

async function processImport(fileName: string, parsedParameters: ParameterModel[], settings: ExtensionSettings): Promise<void> {
    const newName = await Popup.show.input('Import Collection', 'Enter the name of the new collection:', fileName);
    if (!newName) {
        return;
    }

    const existingCollection = settings.collections.find(c => c.name === newName);
    if (existingCollection) {
        toastr.warning('Collection with this name already exists.');
        return;
    }

    const newCollection: ParameterCollection = {
        active: true,
        name: newName,
        parameters: parsedParameters,
        presets: [],
    };

    settings.collections.forEach((collection) => {
        collection.active = false;
    });
    settings.collections.push(newCollection);
    saveSettingsDebounced();
    renderParameterConfigs(settings);
    toastr.success(`Imported ${parsedParameters.length} parameters into collection "${newName}".`);
}

async function deleteCollection(): Promise<void> {
    const settings = getSettings();
    if (settings.collections.length === 1) {
        toastr.warning('Cannot delete the last collection.');
        return;
    }
    const activeCollection = settings.collections.find(c => c.active);
    if (!activeCollection) {
        return;
    }
    const confirm = await Popup.show.confirm('Delete Collection', `Are you sure you want to delete the collection "${activeCollection.name}"?`);
    if (!confirm) {
        return;
    }
    const collectionIndex = settings.collections.indexOf(activeCollection);
    settings.collections.splice(collectionIndex, 1);
    const firstCollection = settings.collections[0];
    if (firstCollection) {
        firstCollection.active = true;
    }
    saveSettingsDebounced();
    renderParameterConfigs(settings);
}

async function createCollection(): Promise<void> {
    const settings = getSettings();
    const name = await Popup.show.input('New Collection Name', 'Enter the name of the new collection:');
    if (!name) {
        return;
    }
    const existingCollection = settings.collections.find(c => c.name === name);
    if (existingCollection) {
        toastr.warning('Collection with this name already exists.');
        return;
    }
    settings.collections.forEach((collection) => {
        collection.active = false;
    });
    settings.collections.push({
        active: true,
        name,
        parameters: [],
        presets: [],
    });
    saveSettingsDebounced();
    renderParameterConfigs(settings);
}

function bindToPreset(): void {
    const settings = getSettings();
    const presetName = chatCompletionSettings.preset_settings_openai;
    if (!presetName) {
        toastr.warning('No Chat Completion preset selected.');
        return;
    }
    const activeCollection = settings.collections.find(c => c.active);
    if (!activeCollection) {
        return;
    }
    const collectionWithPreset = settings.collections.find(c => c.presets.includes(presetName));
    if (collectionWithPreset) {
        collectionWithPreset.presets.splice(collectionWithPreset.presets.indexOf(presetName), 1);
        if (collectionWithPreset !== activeCollection) {
            toastr.warning(`The preset will be unbound from another collection "${collectionWithPreset.name}".`);
            activeCollection.presets.push(presetName);
        }
    } else {
        activeCollection.presets.push(presetName);
        toastr.info(`Selecting the preset "${presetName}" will now automatically pick the parameters collection "${activeCollection.name}".`);
    }

    saveSettingsDebounced();
    renderParameterConfigs(settings);
}

function renderHint(): void {
    const elements = getUIElements();
    const context = SillyTavern.getContext();
    const settings = getSettings();
    if (!elements.hint) return;

    if (!settings.enabled) {
        elements.hint.textContent = 'Extension is currently disabled.';
        elements.hint.style.display = '';
        return;
    }

    elements.hint.textContent = 'Note: Advanced Parameters work with "Custom" API source only.';
    const displayHint = context.mainApi !== 'openai' || chatCompletionSettings.chat_completion_source !== 'custom';
    elements.hint.style.display = displayHint ? '' : 'none';
}

function renderParameterConfigs(settings: ExtensionSettings): void {
    const elements = getUIElements();
    if (!elements.list) return;

    const globalEnabledCheckbox = document.getElementById('advanced_params_enabled') as HTMLInputElement;
    if (globalEnabledCheckbox) {
        globalEnabledCheckbox.checked = settings.enabled;
        globalEnabledCheckbox.onchange = () => {
            settings.enabled = globalEnabledCheckbox.checked;
            saveSettingsDebounced();
            renderCompletionParameters(settings);
            renderHint();
        };
    }

    elements.list.innerHTML = '';
    const activeCollection = settings.collections.find(c => c.active);
    if (!activeCollection) {
        return;
    }

    elements.collections.innerHTML = '';
    settings.collections.forEach((collection) => {
        const option = document.createElement('option');
        option.value = collection.name;
        option.textContent = collection.name;
        option.selected = collection.active;
        elements.collections.appendChild(option);
    });

    const presetName = chatCompletionSettings.preset_settings_openai;
    elements.bindToPreset.classList.toggle('toggleEnabled', presetName ? activeCollection.presets.includes(presetName) : false);

    activeCollection.parameters.forEach((parameter, index) => {
        const renderer = document.createElement('template');
        renderer.innerHTML = configTemplate;

        const container = renderer.content.querySelector('.parameter-config-container') as HTMLDivElement;
        const nameInput = renderer.content.querySelector('input[name="name"]') as HTMLInputElement;
        const propertyInput = renderer.content.querySelector('input[name="property"]') as HTMLInputElement;
        const typeSelect = renderer.content.querySelector('select[name="type"]') as HTMLSelectElement;
        const descriptionInput = renderer.content.querySelector('input[name="description"]') as HTMLInputElement;
        const enableCheckbox = renderer.content.querySelector('input[name="enabled"]') as HTMLInputElement;
        const deleteButton = renderer.content.querySelector('button[name="delete"]') as HTMLButtonElement;
        const upButton = renderer.content.querySelector('button[name="up"]') as HTMLButtonElement;
        const downButton = renderer.content.querySelector('button[name="down"]') as HTMLButtonElement;
        const arrayDelimiterInput = renderer.content.querySelector('input[name="arrayDelimiter"]') as HTMLInputElement;
        const arrayAsStringCheckbox = renderer.content.querySelector('input[name="arrayAsString"]') as HTMLInputElement;
        const arrayContainers = Array.from(renderer.content.querySelectorAll('[data-type="array"]')) as HTMLDivElement[];
        const arrayDelimiterContainer = arrayContainers[0] ?? null;
        const arrayAsStringContainer = arrayContainers[1] ?? null;
        const rangeContainer = renderer.content.querySelector('[data-type="range"]') as HTMLDivElement | null;
        const minInput = renderer.content.querySelector('input[name="min"]') as HTMLInputElement;
        const maxInput = renderer.content.querySelector('input[name="max"]') as HTMLInputElement;
        const stepInput = renderer.content.querySelector('input[name="step"]') as HTMLInputElement;

        nameInput.value = parameter.name;
        propertyInput.value = parameter.property;
        typeSelect.value = parameter.type;
        descriptionInput.value = parameter.description || '';
        enableCheckbox.checked = parameter.enabled;
        if (arrayDelimiterInput) arrayDelimiterInput.value = parameter.arrayDelimiter || ',';
        if (arrayAsStringCheckbox) arrayAsStringCheckbox.checked = parameter.arrayAsString ?? false;
        if (minInput) minInput.value = parameter.min || '0';
        if (maxInput) maxInput.value = parameter.max || '2';
        if (stepInput) stepInput.value = parameter.step || '0.01';

        const showTypeSpecificFields = () => {
            const isArray = typeSelect.value === 'array';
            const isRange = typeSelect.value === 'slider' || typeSelect.value === 'number';
            if (arrayDelimiterContainer) arrayDelimiterContainer.style.display = isArray ? '' : 'none';
            if (arrayAsStringContainer) arrayAsStringContainer.style.display = isArray ? '' : 'none';
            if (rangeContainer) rangeContainer.style.display = isRange ? '' : 'none';
        };
        showTypeSpecificFields();

        const updateParameter = () => {
            renderParameterUI(settings, parameter);
            renderCompletionParameters(settings);
            saveSettingsDebounced();
        };

        nameInput.addEventListener('input', (e) => {
            parameter.name = nameInput.value;
            updateParameter();
        });

        propertyInput.addEventListener('input', (e) => {
            parameter.property = propertyInput.value;
            updateParameter();
        });

        typeSelect.addEventListener('change', (e) => {
            const oldType = parameter.type;
            const newType = typeSelect.value as ParameterType;
            showTypeSpecificFields();
            if (oldType !== newType) {
                const newParam = createDefaultParameter(newType);
                parameter.type = newType;
                parameter.value = newParam.value;
                parameter.min = newParam.min;
                parameter.max = newParam.max;
                parameter.step = newParam.step;
                parameter.textValue = newParam.textValue;
                parameter.boolValue = newParam.boolValue;
                parameter.options = newParam.options;
                parameter.selectValue = newParam.selectValue;
                parameter.arrayValue = newParam.arrayValue;
                parameter.arrayDelimiter = newParam.arrayDelimiter;
                parameter.arrayAsString = newParam.arrayAsString;
                parameter.objectValue = newParam.objectValue;
                parameter.objectRaw = newParam.objectRaw;
                if (arrayDelimiterInput) arrayDelimiterInput.value = newParam.arrayDelimiter || ',';
                if (arrayAsStringCheckbox) arrayAsStringCheckbox.checked = newParam.arrayAsString ?? false;
            }
            updateParameter();
        });

        if (arrayDelimiterInput) {
            arrayDelimiterInput.addEventListener('input', (e) => {
                parameter.arrayDelimiter = arrayDelimiterInput.value;
                updateParameter();
            });
        }

        if (arrayAsStringCheckbox) {
            arrayAsStringCheckbox.addEventListener('change', (e) => {
                parameter.arrayAsString = arrayAsStringCheckbox.checked;
                updateParameter();
            });
        }

        descriptionInput.addEventListener('input', (e) => {
            parameter.description = descriptionInput.value;
            updateParameter();
        });
        
        if (minInput) {
            minInput.addEventListener('input', (e) => {
                parameter.min = minInput.value;
                updateParameter();
            });
        }
        
        if (maxInput) {
            maxInput.addEventListener('input', (e) => {
                parameter.max = maxInput.value;
                updateParameter();
            });
        }
        
        if (stepInput) {
            stepInput.addEventListener('input', (e) => {
                parameter.step = stepInput.value;
                updateParameter();
            });
        }

        enableCheckbox.addEventListener('change', (e) => {
            parameter.enabled = enableCheckbox.checked;
            renderCompletionParameters(settings);
            saveSettingsDebounced();
        });

        deleteButton.addEventListener('click', async () => {
            const confirm = await Popup.show.confirm('Delete Parameter', `Are you sure you want to delete the parameter "${parameter.name}"?`);
            if (!confirm) {
                return;
            }
            activeCollection.parameters.splice(index, 1);
            renderParameterConfigs(settings);
            saveSettingsDebounced();
        });

        upButton.addEventListener('click', () => {
            if (index > 0) {
                const temp = activeCollection.parameters[index - 1];
                activeCollection.parameters[index - 1] = activeCollection.parameters[index];
                activeCollection.parameters[index] = temp;
                renderParameterConfigs(settings);
                saveSettingsDebounced();
            }
        });

        downButton.addEventListener('click', () => {
            if (index < activeCollection.parameters.length - 1) {
                const temp = activeCollection.parameters[index + 1];
                activeCollection.parameters[index + 1] = activeCollection.parameters[index];
                activeCollection.parameters[index] = temp;
                renderParameterConfigs(settings);
                saveSettingsDebounced();
            }
        });

        elements.list.appendChild(renderer.content);
        renderParameterUI(settings, parameter);
        elements.list.appendChild(document.createElement('hr'));
    });

    if (activeCollection.parameters.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.classList.add('empty-message');
        emptyMessage.textContent = 'No parameters configured. Click "Create" to add one.';
        elements.list.appendChild(emptyMessage);
    }

    renderCompletionParameters(settings);
    renderHint();
}

function renderParameterUI(settings: ExtensionSettings, parameter: ParameterModel): void {
    // This would render type-specific UI controls
    // For now, this is a placeholder that can be extended
}

function mergeYamlIntoObject(obj: object, yamlString: string) {
    if (!yamlString) {
        return obj;
    }

    try {
        const parsedObject = parse(yamlString);

        if (Array.isArray(parsedObject)) {
            for (const item of parsedObject) {
                if (typeof item === 'object' && item && !Array.isArray(item)) {
                    Object.assign(obj, item);
                }
            }
        }
        else if (parsedObject && typeof parsedObject === 'object') {
            Object.assign(obj, parsedObject);
        }
    } catch {
        // Do nothing
    }

    return obj;
}

function getParameterValue(parameter: ParameterModel): unknown {
    switch (parameter.type) {
        case 'slider':
        case 'number':
            return parameter.value ?? 0;
        case 'text':
        case 'textarea':
            return parameter.textValue ?? '';
        case 'checkbox':
            return parameter.boolValue ?? false;
        case 'select':
            return parameter.selectValue ?? '';
        case 'multiselect':
            return Array.isArray(parameter.selectValue) ? parameter.selectValue : [];
        case 'array':
            // If arrayAsString is true, return as delimited string instead of array
            if (parameter.arrayAsString) {
                const delimiter = parameter.arrayDelimiter || ',';
                return (parameter.arrayValue ?? []).join(delimiter);
            }
            return parameter.arrayValue ?? [];
        case 'object':
            return parameter.objectValue ?? {};
        default:
            return null;
    }
}

function updateParameterPreview(settings: ExtensionSettings): void {
    const elements = getUIElements();
    // If neither settings preview nor inline preview exist, nothing to do
    const inlinePreview = elements.rangeBlock?.querySelector('#advanced_params_preview_inline') as HTMLTextAreaElement | null;
    if (!elements.preview && !inlinePreview) return;

    const activeCollection = settings.collections.find(c => c.active);
    if (!activeCollection) {
        if (elements.preview) elements.preview.value = '';
        if (inlinePreview) inlinePreview.value = '';
        return;
    }

    // Merge existing custom_include_body with extension parameters to show exact payload
    const customBody = mergeYamlIntoObject({}, (chatCompletionSettings as any).custom_include_body);
    const parameters = activeCollection.parameters.filter(p => p.enabled && p.property).reduce((acc, param) => {
        acc[param.property] = getParameterValue(param);
        return acc;
    }, {} as Record<string, unknown>);
    
    Object.assign(customBody, parameters);

    if (Object.keys(customBody).length === 0) {
        const noParamsMessage = '(No parameters to send)';
        if (elements.preview) elements.preview.value = noParamsMessage;
        if (inlinePreview) inlinePreview.value = noParamsMessage;
        return;
    }

    const previewText = (stringify as any)(customBody, { 
        indent: 2, 
        lineWidth: 0,
    }).trim();

    if (elements.preview) elements.preview.value = previewText;
    if (inlinePreview) inlinePreview.value = previewText;
}

function formatValueForPreview(value: unknown): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'string') {
        // Escape and quote strings that contain special chars
        if (value.includes('\n')) {
            // Show newlines as escaped \n inside single quotes
            return `'${value.replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;
        }
        if (value.includes(',') || value.includes('[') || value.includes('{')) {
            return `'${value.replace(/'/g, "\\'")}'`;
        }
        return value;
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    if (Array.isArray(value)) {
        // Format array compactly
        if (value.length === 0) return '[]';
        // Detect nested numeric/boolean arrays to format without spaces inside inner arrays
        const isNestedSimple = value.every(v => Array.isArray(v) && v.every(i => typeof i === 'number' || typeof i === 'boolean'));
        const isStringArray = value.every(v => typeof v === 'string');
        if (isNestedSimple) {
            const items = (value as unknown[]).map(inner => '[' + (inner as unknown[]).map(iv => (typeof iv === 'boolean') ? (iv ? 'true' : 'false') : String(iv)).join(',') + ']');
            return `[ ${items.join(', ')} ]`;
        }
        if (isStringArray) {
            const items = (value as string[]).map(v => `'${v.replace(/'/g, "\\'")}'`);
            return `[ ${items.join(', ')} ]`;
        }
        const items = value.map(v => {
            if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`;
            if (Array.isArray(v)) return JSON.stringify(v);
            if (typeof v === 'object') return JSON.stringify(v);
            return String(v);
        });
        return `[ ${items.join(', ')} ]`;
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

function renderCompletionParameters(settings: ExtensionSettings): void {
    const elements = getUIElements();
    let inlinePreview = elements.rangeBlock?.querySelector('#advanced_params_preview_inline') as HTMLTextAreaElement | null;
    const previewHeader = elements.rangeBlock?.querySelector('.advanced-params-preview-header') as HTMLDivElement | null;

    if (!settings.enabled) {
        const container = elements.rangeBlock?.querySelector('.advanced_params_container') as HTMLDivElement | null;
        if (container) container.innerHTML = '';
        if (inlinePreview) inlinePreview.style.display = 'none';
        if (previewHeader) previewHeader.style.display = 'none';
        return;
    }

    if (inlinePreview) inlinePreview.style.display = 'block';
    if (previewHeader) previewHeader.style.display = 'flex';

    let container = elements.rangeBlock?.querySelector('.advanced_params_container') as HTMLDivElement | null;

    if (!container) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('advanced-parameters-extension');

        container = document.createElement('div');
        container.classList.add('advanced_params_container');

        const referenceElement = Array.from(elements.rangeBlock?.querySelectorAll('.range-block:has(input[type="range"])') || []).pop();
        if (!referenceElement) {
            // Update preview anyway before returning
            updateParameterPreview(settings);
            return;
        }

        wrapper.appendChild(container);
        referenceElement.insertAdjacentElement('afterend', wrapper);
    }

    // Ensure an inline preview textarea exists in the range block so users
    // can see the parameter preview next to the sliders. Create it if missing.
    if (!inlinePreview) {
        try {
            const previewHeader = document.createElement('div');
            previewHeader.className = 'advanced-params-preview-header';
            
            const previewTitle = document.createElement('span');
            previewTitle.textContent = 'Payload Preview (What will be sent)';
            previewTitle.style.fontSize = '0.85em';
            previewTitle.style.fontWeight = 'bold';
            
            const copyButton = document.createElement('i');
            copyButton.className = 'fa-solid fa-copy menu_button_icon';
            copyButton.title = 'Copy to clipboard';
            copyButton.style.cursor = 'pointer';
            copyButton.style.fontSize = '0.9em';
            copyButton.addEventListener('click', () => {
                const text = inlinePreview?.value;
                if (text) {
                    navigator.clipboard.writeText(text);
                    toastr.success('Preview copied to clipboard!');
                }
            });

            previewHeader.appendChild(previewTitle);
            previewHeader.appendChild(copyButton);
            container.insertAdjacentElement('afterend', previewHeader);

            inlinePreview = document.createElement('textarea');
            inlinePreview.id = 'advanced_params_preview_inline';
            inlinePreview.className = 'textarea_compact';
            inlinePreview.rows = 6;
            inlinePreview.readOnly = true;
            inlinePreview.placeholder = 'Preview of parameters will appear here...';
            inlinePreview.style.width = '100%';
            inlinePreview.style.fontFamily = "Courier New, monospace";
            inlinePreview.style.fontSize = '0.85em';
            inlinePreview.style.marginTop = '5px';
            previewHeader.insertAdjacentElement('afterend', inlinePreview);
        } catch (e) {
            inlinePreview = null;
        }
    }

    container.innerHTML = '';
    const activeCollection = settings.collections.find(c => c.active);
    if (!activeCollection) {
        // Update preview
        updateParameterPreview(settings);
        return;
    }

    activeCollection.parameters.forEach((parameter) => {
        if (!parameter.enabled || !parameter.property || !parameter.name) {
            return;
        }

        const renderer = document.createElement('template');
        renderer.innerHTML = parameterTemplate;

        const paramId = CSS.escape('advanced_param_' + parameter.property);
        const paramBlock = renderer.content.querySelector('.parameter-block') as HTMLDivElement;
        const titleElement = renderer.content.querySelector('.parameter-block-title') as HTMLSpanElement;
        
        const existingParam = document.getElementById(paramId);
        if (existingParam) {
            toastr.warning('Duplicate parameter property name: ' + parameter.property);
            return;
        }

        titleElement.textContent = parameter.name;
        if (parameter.description) {
            const descElement = document.createElement('small');
            descElement.textContent = parameter.description;
            descElement.style.display = 'block';
            descElement.style.marginTop = '4px';
            titleElement.parentElement?.appendChild(descElement);
        }

        const inputContainer = renderer.content.querySelector('.parameter-input-container') as HTMLDivElement;
        createParameterInput(parameter, paramId, inputContainer, settings);

        paramBlock.id = paramId;
        if (chatCompletionSettings.chat_completion_source !== 'custom') {
            paramBlock.style.display = 'none';
        }

        container!.appendChild(renderer.content);
    });

    // Update preview after creating elements
    updateParameterPreview(settings);
}

function createParameterInput(parameter: ParameterModel, paramId: string, container: HTMLDivElement, settings: ExtensionSettings): void {
    container.innerHTML = '';

    switch (parameter.type) {
        case 'slider': {
            const input = document.createElement('input');
            input.type = 'range';
            input.id = paramId + '_range';
            input.min = parameter.min || '0';
            input.max = parameter.max || '1';
            input.step = parameter.step || '0.01';
            input.value = (parameter.value ?? 0).toString();

            const numberInput = document.createElement('input');
            numberInput.type = 'number';
            numberInput.id = paramId + '_number';
            numberInput.min = parameter.min || '0';
            numberInput.max = parameter.max || '1';
            numberInput.step = parameter.step || '0.01';
            numberInput.value = (parameter.value ?? 0).toString();

            const updateValue = () => {
                parameter.value = parseFloat(input.value);
                numberInput.value = input.value;
                updateParameterPreview(settings);
                saveSettingsDebounced();
            };

            input.addEventListener('input', updateValue);
            numberInput.addEventListener('input', () => {
                parameter.value = parseFloat(numberInput.value);
                input.value = numberInput.value;
                updateParameterPreview(settings);
                saveSettingsDebounced();
            });

            const wrapper = document.createElement('div');
            wrapper.className = 'parameter-slider-wrapper';
            wrapper.appendChild(input);
            wrapper.appendChild(numberInput);
            container.appendChild(wrapper);
            break;
        }

        case 'number': {
            const input = document.createElement('input');
            input.type = 'number';
            input.id = paramId;
            input.min = parameter.min || '';
            input.max = parameter.max || '';
            input.step = parameter.step || 'any';
            input.value = (parameter.value ?? 0).toString();
            input.addEventListener('input', () => {
                parameter.value = parseFloat(input.value);
                updateParameterPreview(settings);
                saveSettingsDebounced();
            });
            container.appendChild(input);
            break;
        }

        case 'text': {
            const input = document.createElement('input');
            input.type = 'text';
            input.id = paramId;
            input.value = parameter.textValue || '';
            input.className = 'text_pole';
            input.addEventListener('input', () => {
                parameter.textValue = input.value;
                updateParameterPreview(settings);
                saveSettingsDebounced();
            });
            container.appendChild(input);
            break;
        }

        case 'textarea': {
            const textarea = document.createElement('textarea');
            textarea.id = paramId;
            textarea.value = parameter.textValue || '';
            textarea.className = 'textarea_compact';
            textarea.rows = 4;
            textarea.addEventListener('input', () => {
                parameter.textValue = textarea.value;
                updateParameterPreview(settings);
                saveSettingsDebounced();
            });
            container.appendChild(textarea);
            break;
        }

        case 'checkbox': {
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.id = paramId;
            input.checked = parameter.boolValue ?? false;
            input.addEventListener('change', () => {
                parameter.boolValue = input.checked;
                updateParameterPreview(settings);
                saveSettingsDebounced();
            });
            container.appendChild(input);
            break;
        }

        case 'select': {
            const select = document.createElement('select');
            select.id = paramId;
            select.className = 'text_pole';
            (parameter.options || []).forEach((opt) => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                select.appendChild(option);
            });
            select.value = (parameter.selectValue as string) || '';
            select.addEventListener('change', () => {
                parameter.selectValue = select.value;
                updateParameterPreview(settings);
                saveSettingsDebounced();
            });
            container.appendChild(select);
            break;
        }

        case 'array': {
            const textarea = document.createElement('textarea');
            textarea.id = paramId;
            textarea.className = 'textarea_compact';
            textarea.rows = 4;
            textarea.value = (parameter.arrayValue || []).join(parameter.arrayDelimiter || ',');
            textarea.placeholder = `Enter values separated by "${parameter.arrayDelimiter || ','}". Example: value1,value2,value3`;
            textarea.addEventListener('input', () => {
                const delimiter = parameter.arrayDelimiter || ',';
                parameter.arrayValue = textarea.value
                    .split(delimiter)
                    .map(v => v.trim())
                    .filter(v => v.length > 0);
                updateParameterPreview(settings);
                saveSettingsDebounced();
            });
            container.appendChild(textarea);
            break;
        }

        case 'object': {
            const textarea = document.createElement('textarea');
            textarea.id = paramId;
            textarea.className = 'textarea_compact';
            textarea.rows = 8;
            textarea.value = parameter.objectRaw || JSON.stringify(parameter.objectValue || {}, null, 2);
            textarea.placeholder = 'Enter JSON object...';
            textarea.addEventListener('input', () => {
                try {
                    const jsonText = convertPythonToJSON(textarea.value);
                    parameter.objectValue = JSON.parse(jsonText);
                    parameter.objectRaw = textarea.value;
                    textarea.style.borderColor = '';
                    updateParameterPreview(settings);
                    saveSettingsDebounced();
                } catch {
                    textarea.style.borderColor = 'red';
                }
            });
            container.appendChild(textarea);
            break;
        }
    }
}

function setupEventHandlers(settings: ExtensionSettings): void {
    eventSource.on(event_types.CHAT_COMPLETION_SETTINGS_READY, (data: ChatCompletionRequestData) => {
        if (!settings.enabled || data.chat_completion_source !== 'custom') {
            return;
        }
        const activeCollection = settings.collections.find(c => c.active);
        if (!activeCollection) {
            return;
        }

        const customBody = mergeYamlIntoObject({}, data.custom_include_body);
        const parameters = activeCollection.parameters.filter(p => p.enabled).reduce((acc, param) => {
            if (param.property) {
                acc[param.property] = getParameterValue(param);
            }
            return acc;
        }, {} as Record<string, unknown>);
        Object.assign(customBody, parameters);
        data.custom_include_body = stringify(customBody);
    });

    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
        const presetName = chatCompletionSettings.preset_settings_openai;
        const activeCollection = settings.collections.find(c => c.active);
        if (!activeCollection || !presetName) {
            return;
        }

        const collectionWithPreset = settings.collections.find(c => c.presets.includes(presetName));
        if (collectionWithPreset && collectionWithPreset !== activeCollection) {
            collectionWithPreset.active = true;
            activeCollection.active = false;

            saveSettingsDebounced();
            renderParameterConfigs(settings);
        }
    });

    eventSource.on(event_types.SETTINGS_UPDATED, () => {
        renderHint();
    });
}

(async function init() {
    const settings = getSettings();
    addSettingsControls(settings);
    renderParameterConfigs(settings);
    setupEventHandlers(settings);
    saveSettingsDebounced();
})();
