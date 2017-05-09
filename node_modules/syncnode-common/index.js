var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var SyncNodeUtils = (function () {
        function SyncNodeUtils() {
        }
        SyncNodeUtils.equals = function (obj1, obj2) {
            // use === to differentiate between undefined and null
            if (obj1 === null && obj2 === null) {
                return true;
            }
            else if ((obj1 != null && obj2 == null) || (obj1 == null && obj2 != null)) {
                return false;
            }
            else if (obj1 && obj2 && obj1.version && obj2.version) {
                return obj1.version === obj2.version;
            }
            else if (typeof obj1 !== 'object' && typeof obj2 !== 'object') {
                return obj1 === obj2;
            }
            return false;
        };
        SyncNodeUtils.getHelper = function (obj, split) {
            var isObject = SyncNodeUtils.isObject(obj);
            if (split.length === 1) {
                return isObject ? obj[split[0]] : null;
            }
            if (!isObject)
                return null;
            return SyncNodeUtils.getHelper(obj[split[0]], split.slice(1, split.length));
        };
        SyncNodeUtils.isObject = function (val) {
            return typeof val === 'object' && val != null;
        };
        SyncNodeUtils.isSyncNode = function (val) {
            if (!SyncNodeUtils.isObject(val))
                return false;
            var className = val.constructor.toString().match(/\w+/g)[1];
            return className === 'SyncNode';
        };
        SyncNodeUtils.addNE = function (obj, propName, value) {
            Object.defineProperty(obj, propName, {
                enumerable: false,
                configurable: true,
                writable: true,
                value: value
            });
        };
        ;
        SyncNodeUtils.s4 = function () {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        };
        SyncNodeUtils.guidShort = function () {
            // Often used as an Object key, so prepend with letter to ensure parsed as a string and preserve 
            // insertion order when calling Object.keys -JDK 12/1/2016
            // http://stackoverflow.com/questions/5525795/does-javascript-guarantee-object-property-order
            return 'a' + SyncNodeUtils.s4() + SyncNodeUtils.s4();
        };
        return SyncNodeUtils;
    }());
    exports.SyncNodeUtils = SyncNodeUtils;
    var SyncNodeEventEmitter = (function () {
        function SyncNodeEventEmitter() {
            SyncNodeUtils.addNE(this, '__eventHandlers', {});
            SyncNodeUtils.addNE(this, '__anyEventHandlers', {});
        }
        SyncNodeEventEmitter.prototype.on = function (eventName, handler) {
            var id = SyncNodeUtils.guidShort();
            if (!this.__eventHandlers[eventName])
                this.__eventHandlers[eventName] = {};
            this.__eventHandlers[eventName][id] = handler;
            return id;
        };
        SyncNodeEventEmitter.prototype.onAny = function (handler) {
            var id = SyncNodeUtils.guidShort();
            // Add the eventName to args before invoking anyEventHandlers
            this.__anyEventHandlers[id] = handler;
            return id;
        };
        SyncNodeEventEmitter.prototype.removeListener = function (eventName, id) {
            if (!this.__eventHandlers[eventName])
                return;
            delete this.__eventHandlers[eventName][id];
        };
        SyncNodeEventEmitter.prototype.clearListeners = function () {
            this.__eventHandlers = {};
        };
        SyncNodeEventEmitter.prototype.emit = function (eventName) {
            var _this = this;
            var restOfArgs = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                restOfArgs[_i - 1] = arguments[_i];
            }
            var handlers = this.__eventHandlers[eventName] || {};
            var args = new Array(arguments.length - 1);
            for (var i = 1; i < arguments.length; ++i) {
                args[i - 1] = arguments[i];
            }
            Object.keys(handlers).forEach(function (key) { handlers[key].apply(null, args); });
            // Add the eventName to args before invoking anyEventHandlers
            args.unshift(eventName);
            Object.keys(this.__anyEventHandlers).forEach(function (key) {
                _this.__anyEventHandlers[key].apply(null, args);
            });
        };
        return SyncNodeEventEmitter;
    }());
    exports.SyncNodeEventEmitter = SyncNodeEventEmitter;
    var SyncNode = (function (_super) {
        __extends(SyncNode, _super);
        function SyncNode(obj, parent) {
            var _this = _super.call(this) || this;
            _this.__isUpdatesDisabled = false;
            obj = obj || {};
            SyncNodeUtils.addNE(_this, '__isUpdatesDisabled', false);
            SyncNodeUtils.addNE(_this, 'parent', parent);
            Object.keys(obj).forEach(function (propName) {
                var propValue = obj[propName];
                if (SyncNodeUtils.isObject(propValue)) {
                    if (!SyncNodeUtils.isSyncNode(propValue)) {
                        propValue = new SyncNode(propValue);
                    }
                    SyncNodeUtils.addNE(propValue, 'parent', _this);
                    propValue.on('updated', _this.createOnUpdated(propName));
                }
                _this[propName] = propValue;
            });
            return _this;
        }
        SyncNode.prototype.createOnUpdated = function (propName) {
            var _this = this;
            return function (updated, merge) {
                if (!_this.__isUpdatesDisabled) {
                    var newUpdated = _this;
                    var newMerge = {};
                    newMerge[propName] = merge;
                    if (updated.version) {
                        _this.version = updated.version;
                    }
                    else {
                        _this.version = SyncNodeUtils.guidShort();
                    }
                    newMerge.version = _this.version;
                    _this.emit('updated', newUpdated, newMerge);
                }
            };
        };
        SyncNode.prototype.set = function (key, val) {
            var merge = {};
            var split = key.split('.');
            var curr = merge;
            for (var i = 0; i < split.length - 1; i++) {
                curr[split[i]] = {};
                curr = curr[split[i]];
            }
            curr[split[split.length - 1]] = val;
            var result = this.merge(merge);
            return this;
        };
        SyncNode.prototype.get = function (path) {
            if (!path)
                return this;
            return SyncNodeUtils.getHelper(this, path.split('.'));
        };
        SyncNode.prototype.remove = function (key) {
            if (this.hasOwnProperty(key)) {
                this.merge({ '__remove': key });
            }
            return this;
        };
        SyncNode.prototype.merge = function (merge) {
            var result = this.doMerge(merge);
            if (result.hasChanges) {
                this.emit('updated', this, result.merge);
            }
            return this;
        };
        SyncNode.prototype.doMerge = function (merge, disableUpdates) {
            var _this = this;
            if (disableUpdates === void 0) { disableUpdates = false; }
            var hasChanges = false;
            var isEmpty = false;
            var newMerge = {};
            if (!merge) {
                console.error('Cannot merge: merge is not defined');
                return { hasChanges: false, merge: {} };
            }
            Object.keys(merge).forEach(function (key) {
                if (key === '__remove') {
                    var propsToRemove = merge[key];
                    if (!Array.isArray(propsToRemove) && typeof propsToRemove === 'string') {
                        var arr = [];
                        arr.push(propsToRemove);
                        propsToRemove = arr;
                    }
                    propsToRemove.forEach(function (prop) {
                        delete _this[prop];
                    });
                    if (!disableUpdates) {
                        _this.version = SyncNodeUtils.guidShort();
                        newMerge['__remove'] = propsToRemove;
                        hasChanges = true;
                    }
                }
                else {
                    var currVal = _this[key];
                    var newVal = merge[key];
                    if (!SyncNodeUtils.equals(currVal, newVal)) {
                        if (!SyncNodeUtils.isObject(newVal)) {
                            // at a leaf node of the merge
                            // we already know they aren't equal, simply set the value
                            _this[key] = newVal;
                            if (!disableUpdates) {
                                _this.version = SyncNodeUtils.guidShort();
                                newMerge[key] = newVal;
                                hasChanges = true;
                            }
                        }
                        else {
                            // about to merge an object, make sure currVal is a SyncNode	
                            if (!SyncNodeUtils.isSyncNode(currVal)) {
                                currVal = new SyncNode({}, _this);
                            }
                            currVal.clearListeners();
                            currVal.on('updated', _this.createOnUpdated(key));
                            var result = currVal.doMerge(newVal, disableUpdates);
                            if (typeof _this[key] === 'undefined') {
                                result.hasChanges = true;
                            }
                            _this[key] = currVal;
                            if (!disableUpdates && result.hasChanges) {
                                if (typeof currVal.version === 'undefined') {
                                    currVal.version = SyncNodeUtils.guidShort();
                                }
                                _this.version = currVal.version;
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
            }
            else {
                return { hasChanges: false, merge: newMerge };
            }
        };
        // Like set(), but assumes or adds a key property 
        SyncNode.prototype.setItem = function (item) {
            if (!SyncNodeUtils.isObject(item)) {
                console.error('SyncNode: item must be an object');
                return;
            }
            else {
                if (!('key' in item))
                    item.key = SyncNodeUtils.guidShort();
                this.set(item.key, item);
                return this[item.key];
            }
        };
        return SyncNode;
    }(SyncNodeEventEmitter));
    exports.SyncNode = SyncNode;
    var SyncNodeLocal = (function (_super) {
        __extends(SyncNodeLocal, _super);
        function SyncNodeLocal(id) {
            var _this = this;
            var data = JSON.parse(localStorage.getItem(id));
            _this = _super.call(this, data) || this;
            _this.on('updated', function () {
                localStorage.setItem(id, JSON.stringify(_this));
            });
            return _this;
        }
        return SyncNodeLocal;
    }(SyncNode));
    exports.SyncNodeLocal = SyncNodeLocal;
    var SyncNodeClient = (function (_super) {
        __extends(SyncNodeClient, _super);
        function SyncNodeClient() {
            var _this = _super.call(this) || this;
            if (!('WebSocket' in window)) {
                throw new Error('SyncNode only works with browsers that support WebSockets');
            }
            _this.socketUrl = window.location.origin.replace(/^http(s?):\/\//, 'ws$1://');
            _this.channels = {};
            //window.addEventListener('load', () => {
            _this.tryConnect();
            return _this;
            //});
        }
        SyncNodeClient.prototype.socketOnOpen = function (msg) {
            console.log('connected!');
            this.emit('open');
        };
        SyncNodeClient.prototype.socketOnClosed = function (msg) {
            var _this = this;
            console.log('Socket connection closed: ', msg);
            this.emit('closed');
            setTimeout(function () {
                console.log('Retrying socket connection...');
                _this.tryConnect();
            }, 2000);
        };
        SyncNodeClient.prototype.socketOnMessage = function (msg) {
            var deserialized = JSON.parse(msg.data);
            if (!deserialized.channel) {
                console.error('Error: msg is missing channel.', deserialized);
            }
            else {
                var channel = this.channels[deserialized.channel];
                if (channel) {
                    channel.handleMessage(deserialized);
                }
            }
        };
        SyncNodeClient.prototype.socketOnError = function (msg) {
            console.error(msg);
            this.emit('error', msg);
        };
        SyncNodeClient.prototype.send = function (msg) {
            this.socket.send(msg);
        };
        SyncNodeClient.prototype.tryConnect = function () {
            console.log('connecting...');
            var socket = new WebSocket(this.socketUrl);
            socket.onopen = this.socketOnOpen.bind(this);
            socket.onclose = this.socketOnClosed.bind(this);
            socket.onmessage = this.socketOnMessage.bind(this);
            socket.onerror = this.socketOnError.bind(this);
            this.socket = socket;
        };
        SyncNodeClient.prototype.subscribe = function (channelName) {
            if (!this.channels[channelName]) {
                this.channels[channelName] = new SyncNodeChannel(this, channelName);
            }
            return this.channels[channelName];
        };
        return SyncNodeClient;
    }(SyncNodeEventEmitter));
    exports.SyncNodeClient = SyncNodeClient;
    var SyncNodeChannel = (function (_super) {
        __extends(SyncNodeChannel, _super);
        function SyncNodeChannel(client, channelName) {
            var _this = _super.call(this) || this;
            _this.client = client;
            _this.channelName = channelName;
            client.on('open', function () { return _this.send('subscribe'); });
            return _this;
        }
        SyncNodeChannel.prototype.send = function (type, data) {
            var msg = {
                channel: this.channelName,
                type: type,
                data: data
            };
            var serialized = JSON.stringify(msg);
            this.client.send(serialized);
        };
        SyncNodeChannel.prototype.handleMessage = function (msg) {
            var _this = this;
            switch (msg.type) {
                case 'subscribed':
                    if (this.data) {
                        this.data.clearListeners();
                    }
                    this.data = new SyncNode(msg.data);
                    this.data.on('updated', function (data, merge) {
                        _this.send('updated', merge);
                    });
                    this.emit('updated');
                    break;
                case 'updated':
                    if (!this.data) {
                        console.log('Error: update before subscribed result.');
                    }
                    else {
                        this.data.doMerge(msg.data, true);
                        this.emit('updated');
                    }
                    break;
                default:
                    this.emit(msg.type, msg.data);
                    break;
            }
        };
        return SyncNodeChannel;
    }(SyncNodeEventEmitter));
    exports.SyncNodeChannel = SyncNodeChannel;
});
//# sourceMappingURL=index.js.map