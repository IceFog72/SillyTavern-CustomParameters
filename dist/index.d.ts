import './style.css';
type ParameterType = 'slider' | 'text' | 'number' | 'checkbox' | 'select' | 'array' | 'object' | 'textarea' | 'multiselect';
interface ParameterModel {
    id: string;
    name: string;
    property: string;
    type: ParameterType;
    enabled: boolean;
    description?: string;
    min?: string;
    max?: string;
    step?: string;
    value?: number;
    textValue?: string;
    boolValue?: boolean;
    options?: string[];
    selectValue?: string | string[];
    arrayValue?: (string | number | boolean)[];
    arrayDelimiter?: string;
    arrayAsString?: boolean;
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
export declare function getSettings(): ExtensionSettings;
export declare function addSettingsControls(settings: ExtensionSettings): void;
export {};
