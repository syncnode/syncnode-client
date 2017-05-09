export class SyncNodeUtils {
    static equals(obj1: any, obj2: any) {
        // use === to differentiate between undefined and null
        if (obj1 === null && obj2 === null) {
            return true;
        } else if ((obj1 != null && obj2 == null) || (obj1 == null && obj2 != null)) {
            return false;
        } else if (obj1 && obj2 && obj1.version && obj2.version) {
            return obj1.version === obj2.version;
        } else if (typeof obj1 !== 'object' && typeof obj2 !== 'object') {
            return obj1 === obj2;
        }

        return false;
    }
    static getHelper(obj: any, split: string[]): any {
        let isObject = SyncNodeUtils.isObject(obj);
        if (split.length === 1) {
            return isObject ? obj[split[0]] : null;
        }
        if (!isObject) return null;
        return SyncNodeUtils.getHelper(obj[split[0]], split.slice(1, split.length));
    }
    static isObject(val: any) {
        return typeof val === 'object' && val != null;
    }
    static isSyncNode(val: any) {
        if (!SyncNodeUtils.isObject(val)) return false;
        var className = val.constructor.toString().match(/\w+/g)[1];
        return className === 'SyncNode';
    }
    static addNE(obj: any, propName: string, value: any) {
        Object.defineProperty(obj, propName, {
            enumerable: false,
            configurable: true,
            writable: true,
            value: value
        });
    };

    static s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    static guidShort() {
        // Often used as an Object key, so prepend with letter to ensure parsed as a string and preserve 
        // insertion order when calling Object.keys -JDK 12/1/2016
        // http://stackoverflow.com/questions/5525795/does-javascript-guarantee-object-property-order
        return 'a' + SyncNodeUtils.s4() + SyncNodeUtils.s4();
    }
}

export class SyncNodeEventEmitter {
    __eventHandlers: any;
    __anyEventHandlers: any;
    constructor() {
        SyncNodeUtils.addNE(this, '__eventHandlers', {});
        SyncNodeUtils.addNE(this, '__anyEventHandlers', {});
    }
    on(eventName: string, handler: (...args: any[]) => void) {
        var id = SyncNodeUtils.guidShort();
        if (!this.__eventHandlers[eventName]) this.__eventHandlers[eventName] = {};
        this.__eventHandlers[eventName][id] = handler;
        return id;
    }
    onAny(handler: (...args: any[]) => void) {
        var id = SyncNodeUtils.guidShort();
        // Add the eventName to args before invoking anyEventHandlers
        this.__anyEventHandlers[id] = handler;
        return id;
    }
    removeListener(eventName: string, id: string) {
        if (!this.__eventHandlers[eventName]) return;
        delete this.__eventHandlers[eventName][id];
    }
    clearListeners() {
        this.__eventHandlers = {};
    }
    emit(eventName: string, ...restOfArgs: any[]) {
        var handlers = this.__eventHandlers[eventName] || {};
        var args = new Array(arguments.length - 1);
        for (var i = 1; i < arguments.length; ++i) {
            args[i - 1] = arguments[i];
        }
        Object.keys(handlers).forEach((key) => { handlers[key].apply(null, args); });
        // Add the eventName to args before invoking anyEventHandlers
        args.unshift(eventName);
        Object.keys(this.__anyEventHandlers).forEach((key) => {
            this.__anyEventHandlers[key].apply(null, args);
        });
    }
}

export class SyncNode extends SyncNodeEventEmitter {
    __isUpdatesDisabled: boolean = false;
    key: string;
    version: string;
    parent: SyncNode;

    constructor(obj?: any, parent?: SyncNode) {
        super();

        obj = obj || {};
        SyncNodeUtils.addNE(this, '__isUpdatesDisabled', false);
        SyncNodeUtils.addNE(this, 'parent', parent);

        Object.keys(obj).forEach((propName) => {
            var propValue = obj[propName];
            if (SyncNodeUtils.isObject(propValue)) {
                if (!SyncNodeUtils.isSyncNode(propValue)) {
                    propValue = new SyncNode(propValue);
                }

                SyncNodeUtils.addNE(propValue, 'parent', this);
                propValue.on('updated', this.createOnUpdated(propName));
            }
            (this as any)[propName] = propValue;
        });
    }
    createOnUpdated(propName: string) {
        return (updated: SyncNode, merge: any) => {
            if (!this.__isUpdatesDisabled) {
                var newUpdated = this;
                var newMerge = {} as any;
                newMerge[propName] = merge;
                if (updated.version) {
                    this.version = updated.version;
                } else {
                    this.version = SyncNodeUtils.guidShort();
                }
                newMerge.version = this.version;
                this.emit('updated', newUpdated, newMerge);
            }
        }
    }
    set(key: string, val: any) {
        let merge: any = {};
        let split: string[] = key.split('.');
        let curr: any = merge;
        for (var i = 0; i < split.length - 1; i++) {
            curr[split[i]] = {};
            curr = curr[split[i]];
        }
        curr[split[split.length - 1]] = val;
        var result = this.merge(merge);
        return this;
    }
    get(path: string) {
        if (!path) return this;
        return SyncNodeUtils.getHelper(this, path.split('.'));
    }
    remove(key: string) {
        if (this.hasOwnProperty(key)) {
            this.merge({ '__remove': key });
        }
        return this;
    }
    merge(merge: any) {
        var result = this.doMerge(merge);
        if (result.hasChanges) {
            this.emit('updated', this, result.merge);
        }
        return this;
    }
    doMerge(merge: any, disableUpdates: boolean = false) {
        var hasChanges = false;
        var isEmpty = false;
        var newMerge = {} as any;
        if(!merge) {
            console.error('Cannot merge: merge is not defined');
            return { hasChanges: false, merge: {} };
        }
        Object.keys(merge).forEach((key) => {
            if (key === '__remove') {
                var propsToRemove = merge[key];
                if (!Array.isArray(propsToRemove) && typeof propsToRemove === 'string') {
                    var arr = [];
                    arr.push(propsToRemove);
                    propsToRemove = arr;
                }
                propsToRemove.forEach((prop: string) => {
                    delete (this as any)[prop];
                });
                if (!disableUpdates) {
                    this.version = SyncNodeUtils.guidShort();
                    newMerge['__remove'] = propsToRemove;
                    hasChanges = true;
                }
            } else {
                var currVal = (this as any)[key];
                var newVal = merge[key];
                if (!SyncNodeUtils.equals(currVal, newVal)) {
                    if (!SyncNodeUtils.isObject(newVal)) {
                        // at a leaf node of the merge
                        // we already know they aren't equal, simply set the value
                        (this as any)[key] = newVal;
                        if (!disableUpdates) {
                            this.version = SyncNodeUtils.guidShort();
                            newMerge[key] = newVal;
                            hasChanges = true;
                        }
                    } else {
                        // about to merge an object, make sure currVal is a SyncNode	
                        if (!SyncNodeUtils.isSyncNode(currVal)) {
                            currVal = new SyncNode({}, this);
                        }
                        currVal.clearListeners();
                        currVal.on('updated', this.createOnUpdated(key));

                        var result = currVal.doMerge(newVal, disableUpdates);
                        if (typeof (this as any)[key] === 'undefined') {
                            result.hasChanges = true;
                        }
                        (this as any)[key] = currVal;
                        if (!disableUpdates && result.hasChanges) {
                            if (typeof currVal.version === 'undefined') {
                                currVal.version = SyncNodeUtils.guidShort();
                            }
                            this.version = currVal.version;
                            newMerge[key] = result.merge;
                            hasChanges = true;
                        }
                    }
                }
            }
        });
        if (!disableUpdates && hasChanges) {
            newMerge.version = this.version;
            return { hasChanges: true, merge: newMerge };
        } else {
            return { hasChanges: false, merge: newMerge };
        }
    }
    // Like set(), but assumes or adds a key property 
    setItem(item: any) {
        if (!SyncNodeUtils.isObject(item)) {
            console.error('SyncNode: item must be an object');
            return;
        } else {
            if (!('key' in item)) item.key = SyncNodeUtils.guidShort();
            this.set(item.key, item);
            return (this as any)[item.key];
        }
    }
}


export class SyncNodeLocal extends SyncNode {
    constructor(id: string) {
        let data: any = JSON.parse(localStorage.getItem(id) as string);
        super(data);
        this.on('updated', () => {
            localStorage.setItem(id, JSON.stringify(this));
        });
    }
}

export interface SyncNodeChannelMessage {
    channel: string;
    type: string;
    data: any;
}

export class SyncNodeClient extends SyncNodeEventEmitter {
    socketUrl: string;
    socket: WebSocket;
    channels: { [key: string]: SyncNodeChannel<SyncNode> };

    constructor() {
        super();

        if (!('WebSocket' in window)) {
            throw new Error('SyncNode only works with browsers that support WebSockets');
        }

        this.socketUrl = window.location.origin.replace(/^http(s?):\/\//, 'ws$1://');
        this.channels = {};
        //window.addEventListener('load', () => {
            this.tryConnect();
        //});
    }

    socketOnOpen(msg: any) {
        console.log('connected!');
        this.emit('open');
    }

    socketOnClosed(msg: any) {
        console.log('Socket connection closed: ', msg);
        this.emit('closed');
        setTimeout(() => {
            console.log('Retrying socket connection...');
            this.tryConnect();
        }, 2000);
    }

    socketOnMessage(msg: MessageEvent) {
        let deserialized: SyncNodeChannelMessage = JSON.parse(msg.data);
        if (!deserialized.channel) {
            console.error('Error: msg is missing channel.', deserialized);
        } else {
            let channel = this.channels[deserialized.channel];
            if (channel) {
                channel.handleMessage(deserialized);
            }
        }
    }

    socketOnError(msg: any) {
        console.error(msg);
        this.emit('error', msg);
    }

    send(msg: string) {
        this.socket.send(msg);
    }

    tryConnect() {
        console.log('connecting...');
        let socket = new WebSocket(this.socketUrl);
        socket.onopen = this.socketOnOpen.bind(this);
        socket.onclose = this.socketOnClosed.bind(this);
        socket.onmessage = this.socketOnMessage.bind(this);
        socket.onerror = this.socketOnError.bind(this);
        this.socket = socket;
    }


    subscribe<T extends SyncNode>(channelName: string): SyncNodeChannel<T> {
        if (!this.channels[channelName]) {
            this.channels[channelName] = new SyncNodeChannel(this, channelName);
        }
        return this.channels[channelName] as SyncNodeChannel<T>;
    }
}


export class SyncNodeChannel<T extends SyncNode> extends SyncNodeEventEmitter {
    client: SyncNodeClient;
    channelName: string;
    data: T;
    constructor(client: SyncNodeClient, channelName: string) {
        super();
        this.client = client;
        this.channelName = channelName;
        client.on('open', () => this.send('subscribe'));
    }

    send(type: string, data?: any) {
        let msg = {
            channel: this.channelName,
            type: type,
            data: data
        };
        let serialized = JSON.stringify(msg);
        this.client.send(serialized);
    }

    handleMessage(msg: SyncNodeChannelMessage) {
        switch (msg.type) {
            case 'subscribed':
                if (this.data) { this.data.clearListeners(); }
                this.data = new SyncNode(msg.data) as T;
                this.data.on('updated', (data: any, merge: any) => {
                    this.send('updated', merge);
                })
                this.emit('updated');
                break;
            case 'updated':
                if (!this.data) {
                    console.log('Error: update before subscribed result.');
                } else {
                    this.data.doMerge(msg.data, true);
                    this.emit('updated');
                }
                break;
            default:
                this.emit(msg.type, msg.data);
                break;
        }
    }
}

