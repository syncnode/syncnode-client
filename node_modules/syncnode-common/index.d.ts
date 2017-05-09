export declare class SyncNodeUtils {
    static equals(obj1: any, obj2: any): boolean;
    static getHelper(obj: any, split: string[]): any;
    static isObject(val: any): boolean;
    static isSyncNode(val: any): boolean;
    static addNE(obj: any, propName: string, value: any): void;
    static s4(): string;
    static guidShort(): string;
}
export declare class SyncNodeEventEmitter {
    __eventHandlers: any;
    __anyEventHandlers: any;
    constructor();
    on(eventName: string, handler: (...args: any[]) => void): string;
    onAny(handler: (...args: any[]) => void): string;
    removeListener(eventName: string, id: string): void;
    clearListeners(): void;
    emit(eventName: string, ...restOfArgs: any[]): void;
}
export declare class SyncNode extends SyncNodeEventEmitter {
    __isUpdatesDisabled: boolean;
    key: string;
    version: string;
    parent: SyncNode;
    constructor(obj?: any, parent?: SyncNode);
    createOnUpdated(propName: string): (updated: SyncNode, merge: any) => void;
    set(key: string, val: any): this;
    get(path: string): any;
    remove(key: string): this;
    merge(merge: any): this;
    doMerge(merge: any, disableUpdates?: boolean): {
        hasChanges: boolean;
        merge: any;
    };
    setItem(item: any): any;
}
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
    constructor();
    socketOnOpen(msg: any): void;
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
