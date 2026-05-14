declare module '*.html' {
    const content: string;
    export default content;
}

declare module 'yaml' {
    export function parse(str: string): any;
    export function stringify(obj: any): string;
}

// SillyTavern context type definitions
declare const SillyTavern: {
    getContext: () => {
        saveSettingsDebounced: () => void;
        event_types: Record<string, string>;
        eventSource: {
            on: (event: string, handler: (data: any) => void) => void;
            off: (event: string, handler: (data: any) => void) => void;
            emit: (event: string, data: any) => void;
        };
        chatCompletionSettings: {
            preset_settings_openai?: string;
            chat_completion_source?: string;
        };
        Popup: {
            show: {
                input: (title: string, message: string, defaultValue?: string) => Promise<string>;
                confirm: (title: string, message: string) => Promise<boolean>;
            };
        };
        extensionSettings: Record<string, any>;
        mainApi?: string;
    };
};

declare const toastr: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
};

declare const $: any;
