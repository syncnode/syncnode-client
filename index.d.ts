import { SyncNode, SyncNodeEventEmitter } from 'syncnode-common';
export declare class SyncNodeLocal extends SyncNode {
    constructor(id: string);
}
export interface SyncNodeChannelMessage {
    channel: string;
    type: string;
    data: any;
}
export declare class SyncNodeClient extends SyncNodeEventEmitter {
    socketUrl: string;
    socket: WebSocket;
    channels: {
        [key: string]: SyncNodeChannel<SyncNode>;
    };
    isSocketOpen: boolean;
    queuedMessages: string[];
    constructor();
    socketOnOpen(msg: any): void;
    sendQueuedMessages(): void;
    socketOnClosed(msg: any): void;
    socketOnMessage(msg: MessageEvent): void;
    socketOnError(msg: any): void;
    send(msg: string): void;
    tryConnect(): void;
    subscribe<T extends SyncNode>(channelName: string): SyncNodeChannel<T>;
}
export declare class SyncNodeChannel<T extends SyncNode> extends SyncNodeEventEmitter {
    client: SyncNodeClient;
    channelName: string;
    data: T;
    constructor(client: SyncNodeClient, channelName: string);
    send(type: string, data?: any): void;
    handleMessage(msg: SyncNodeChannelMessage): void;
}
export declare type Partial<T> = {
    [P in keyof T]?: T[P];
};
export declare type CSSStyleDeclarationPartial = Partial<CSSStyleDeclaration>;
export interface ElementSpec {
    parent?: string;
    tag?: string;
    innerHTML?: string;
    className?: string;
    style?: CSSStyleDeclarationPartial;
    events?: {
        [key: string]: (...args: any[]) => void;
    };
}
export declare class SyncView<T extends SyncNode> extends SyncNodeEventEmitter {
    options: any;
    el: HTMLElement;
    data: T;
    bindings: any;
    __currentDataVersion: string | undefined;
    constructor(options?: any);
    hasDataChanged(newData: T): boolean;
    add<K extends keyof HTMLElementTagNameMap>(tag: K, spec?: ElementSpec): HTMLElementTagNameMap[K];
    addView<R extends SyncView<SyncNode>>(view: R, className?: string, parent?: HTMLElement | SyncView<SyncNode>): R;
    addBinding(memberName: string, prop: string, value: string): void;
    style(s: CSSStyleDeclarationPartial): void;
    init(): void;
    update(data: T, force?: boolean): void;
    bind(): void;
    show(): void;
    hide(): void;
    render(): void;
    static createStyleElement(): HTMLStyleElement;
    static globalStyles: HTMLStyleElement;
    static addGlobalStyle(selector: string, style: string): void;
    static appendGlobalStyles(): void;
}
export declare class SyncUtils {
    static getProperty(obj: any, path: string): any;
    static getPropertyHelper(obj: any, split: any[]): any;
    static mergeMap(destination: any, source: any): any;
    static applyStyle(el: HTMLElement, s: CSSStyleDeclarationPartial): void;
    static normalize(str: string): string;
    static toMap(arr: any[], keyValFunc?: (obj: any) => string): {};
    static sortMap(obj: any, sortField: string, reverse?: boolean, keyValFunc?: (obj: any) => string): {};
    static toArray(obj: any, sortField?: string, reverse?: boolean): any[];
    static forEach(obj: any, func: (val: any) => any): void;
    static getByKey(obj: any, key: string): any;
    static param(variable: string): string | false;
    static getHash(): string;
    static group(arr: any[], prop: string, groupVals: any[]): any;
    static filterMap(map: any, filterFn: (val: any) => boolean): any;
    static isEmptyObject(obj: any): boolean;
    static formatCurrency(value: string, precision: number, emptyString?: string): string;
    static toNumberOrZero(value: string): number;
}
export interface SyncListOptions {
    sortField?: string;
    sortReversed?: boolean;
    item: typeof SyncView;
    tag?: string;
}
export declare class SyncList extends SyncView<SyncNode> {
    views: {
        [key: string]: SyncView<SyncNode>;
    };
    item: typeof SyncView;
    options: SyncListOptions;
    constructor(options: SyncListOptions);
    render(): void;
}
export interface SyncAppOptions {
    channel: string;
    mainView: SyncView<SyncNode>;
    host?: string;
    parent?: HTMLElement;
}
export declare class SyncAppSimple<D extends SyncNode> {
    options: SyncAppOptions;
    client: SyncNodeClient;
    reload: SyncNodeChannel<SyncNode>;
    channel: SyncNodeChannel<SyncNode>;
    constructor(options: SyncAppOptions);
}
