import { SyncNode, SyncNodeEventEmitter } from 'syncnode-common';

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


export type Partial<T> = {
    [P in keyof T]?: T[P];
}
export type CSSStyleDeclarationPartial = Partial<CSSStyleDeclaration>; // To get code completion for style definitions below, make partial to specify only a subset

export interface ElementSpec {
	tag?: string;
	innerHTML?: string;
	className?: string;
	style?: CSSStyleDeclarationPartial;
	events?: { [key: string]: (...args: any[]) => void }
}

export class SyncView<T extends SyncNode> extends SyncNodeEventEmitter {
	options: any;
	el: HTMLElement;
	data: T;
	bindings: any;
	__currentDataVersion: string | undefined;

	constructor(options: any = {}) {
		super();
		this.options = options;
		this.bindings = {};
		this.el = document.createElement(this.options.tag || 'div');
		this.el.className = options.className || '';
		this.style(this.options.style || {});
	}
	hasDataChanged(newData: T): boolean {
		if (!newData) return true;
		if (this.__currentDataVersion && newData.version) {
			return this.__currentDataVersion !== newData.version;
		}
		return true;
	}
	add<K extends keyof HTMLElementTagNameMap>(tag: K, spec: ElementSpec = {}): HTMLElementTagNameMap[K] {
		let el = document.createElement(tag || 'div');
		(el as any).innerHTML = spec.innerHTML || '';
		(el as any).className = spec.className || '';
		if (spec.style) {
			Object.keys(spec.style).forEach((key: string) => { (el as any).style[key] = (spec.style as any)[key]; });
		}
		if (spec.events) {
			Object.keys(spec.events).forEach((key: string) => {
				(el as any).addEventListener(key, (spec.events as any)[key]);
			});
		}
		this.el.appendChild(el as any);
		return el;
	}
	addView<R extends SyncView<SyncNode>>(view: R, className?: string, tag?: string): R {
		view.init();
		if(className) view.el.className += ' ' + className;
		this.el.appendChild(view.el);
		return view;
	}
	addBinding(memberName: string, prop: string, value: string) {
		var existing = this.bindings[memberName] || {};
		existing[prop] = value;
		this.bindings[memberName] = existing;
	}
	style(s: CSSStyleDeclarationPartial): void {
		SyncUtils.applyStyle(this.el, s);
	}
	init() {
	}
	update(data: T, force?: boolean) {
		if (force || this.hasDataChanged(data)) {
			this.__currentDataVersion = data ? data.version : undefined;
			this.data = data;
			this.bind();
			this.render();
		}
	}
	bind() {
		function traverse(curr: any, pathArr: string[]): any {
			if (pathArr.length === 0) return curr;
			else {
				var next = pathArr.shift() as string;
				if (curr == null || !curr.hasOwnProperty(next)) return undefined;
				return traverse(curr[next], pathArr);
			}
		}

		Object.keys(this.bindings).forEach((id) => {
			var props = this.bindings[id];
			Object.keys(props).forEach((prop) => {
				var valuePath = props[prop];
				var value = traverse(this, valuePath.split('.'));
				if (prop === 'update') {
					(this as any)[id].update(value);
				} else {
					(this as any)[id][prop] = value;
				}
			});
		});
	}
	show() { 
		this.el.style.display = (this.el.style as any).display_old || 'block'; 
	}
	hide() { 
		if(this.el.style.display !== 'none') {
			(this.el.style as any).display_old = this.el.style.display;
			this.el.style.display = 'none'; 
		}
	}
	render() {
	}



	static createStyleElement(): HTMLStyleElement {
		var style = document.createElement('style');
		// WebKit hack :(
		style.appendChild(document.createTextNode(""));
		document.head.appendChild(style);
		return style as HTMLStyleElement;
	}
	static globalStyles = SyncView.createStyleElement();
	static addGlobalStyle(selector: string, style: string) {
		(SyncView.globalStyles.sheet as any).addRule(selector, style);
	}
	static appendGlobalStyles() {
	}
}



export class SyncUtils {
	static getProperty(obj: any, path: string): any {
		if (!path) return obj;
		return SyncUtils.getPropertyHelper(obj, path.split('.'));
	}

	static getPropertyHelper(obj: any, split: any[]): any {
		if (split.length === 1) return obj[split[0]];
		if (obj == null) return null;
		return SyncUtils.getPropertyHelper(obj[split[0]], split.slice(1, split.length));
	}
	static mergeMap(destination: any, source: any) {
		destination = destination || {};
		Object.keys(source || {}).forEach((key) => {
			destination[key] = source[key];
		});
		return destination;
	}
	static applyStyle(el: HTMLElement, s: CSSStyleDeclarationPartial) {
		SyncUtils.mergeMap(el.style, s);
	}
	static normalize(str: string) {
		return (str || '').trim().toLowerCase();
	}

	static toMap(arr: any[], keyValFunc?: (obj: any) => string) {
		keyValFunc = keyValFunc || ((obj) => { return obj.key });
		if (!Array.isArray(arr)) return arr;
		let result = {};
		let curr;
		for (let i = 0; i < arr.length; i++) {
			curr = arr[i];
			(result as any)[keyValFunc(curr)] = curr;
		}
		return result;
	}

	static sortMap(obj: any, sortField: string, reverse?: boolean, keyValFunc?: (obj: any) => string) {
		return SyncUtils.toMap(SyncUtils.toArray(obj, sortField, reverse), keyValFunc);
	}

	static toArray(obj: any, sortField?: string, reverse?: boolean) {
		let result: any[];
		if (Array.isArray(obj)) {
			result = obj.slice();
		} else {
			result = [];
			if (!obj) return result;
			Object.keys(obj).forEach((key) => {
				if (key !== 'version' && key !== 'lastModified' && key !== 'key') {
					result.push(obj[key]);
				}
			});
		}

		if (sortField) {
			let getSortValue: (obj: any) => any;
			if (typeof sortField === 'function') getSortValue = sortField;
			else getSortValue = (obj: any) => { return SyncUtils.getProperty(obj, sortField); }
			result.sort(function (a, b) {
				let a1 = getSortValue(a);
				let b1 = getSortValue(b);
				if (typeof a1 === 'string') a1 = a1.toLowerCase();
				if (typeof b1 === 'string') b1 = b1.toLowerCase();
				if (a1 < b1)
					return reverse ? 1 : -1;
				if (a1 > b1)
					return reverse ? -1 : 1;
				return 0;
			});
		}
		return result;
	}

	static forEach(obj: any, func: (val: any) => any) {
		if (!Array.isArray(obj)) {
			obj = SyncUtils.toArray(obj);
		}
		obj.forEach((val: any) => func(val));
	}

	static getByKey(obj: any, key: string) {
		if (Array.isArray(obj)) {
			for (let i = 0; i < obj.length; i++) {
				if (obj[i].key === key) return obj[i];
			}
		} else {
			return obj[key];
		}
	}

	static param(variable: string) {
		let query = window.location.search.substring(1);
		let vars = query.split("&");
		for (let i = 0; i < vars.length; i++) {
			let pair = vars[i].split("=");
			if (pair[0] == variable) {
				return pair[1];
			}
		}
		return (false);
	}

	static getHash() {
		let hash = window.location.hash;
		hash = SyncUtils.normalize(hash);
		return hash.length > 0 ? hash.substr(1) : '';
	}

	static group(arr: any[], prop: string, groupVals: any[]) {
		let groups: any = {};

		if (Array.isArray(groupVals)) {
			groupVals.forEach((groupVal) => {
				groups[groupVal] = { key: groupVal };
			});
		}


		if (!Array.isArray(arr)) arr = SyncUtils.toArray(arr);

		arr.forEach(function (item) {
			let val;
			if (typeof prop === 'function') {
				val = prop(item);
			} else {
				val = item[prop];
			}

			if (!groups[val]) groups[val] = { key: val };
			groups[val][item.key] = item;
		});

		return groups;
	}

	static filterMap(map: any, filterFn: (val: any) => boolean) {
		let result: any = {};
		map = map || {};
		Object.keys(map).forEach(key => {
			if (key !== 'version' && key !== 'key' && key !== 'lastModified' && filterFn(map[key])) {
				result[key] = map[key];
			}
		});
		return result;
	}

	static isEmptyObject(obj: any): boolean {
		return Object.keys(obj).length === 0;
	}

	static formatCurrency(value: string, precision: number, emptyString?: string): string {
		if (value === "") {
			if (emptyString) return emptyString;
			else value = "0";
		}
		precision = precision || 2;
		var number = (typeof value === "string") ? parseFloat(value) : value;
		if (typeof number !== "number") {
			return emptyString || "";
		}
		return number.toFixed(precision);
	}

	static toNumberOrZero(value: string): number {
		if (typeof value === "number") return value;
		if (typeof value === "string") {
			if (value.trim() === "") return 0;
			let number = parseFloat(value);
			if (typeof number !== "number") {
				return 0;
			}
		}
		return 0;
	}
}



export interface SyncListOptions {
	sortField?: string;
	sortReversed?: boolean;
	item: typeof SyncView;
	tag?: string;
}
export class SyncList extends SyncView<SyncNode> {
	views: { [key: string]: SyncView<SyncNode> };
	item: typeof SyncView;
	options: SyncListOptions;
	constructor(options: SyncListOptions) {
		super(options);
		this.views = {};
	}
	render() {
		var data = this.data || {};
		var itemsArr = SyncUtils.toArray(data, this.options.sortField, this.options.sortReversed);
		Object.keys(this.views).forEach((key) => {
			let view: SyncView<SyncNode> = this.views[key];
			if (!SyncUtils.getByKey(data, view.data.key)) {
				this.el.removeChild(view.el);
				delete this.views[view.data.key];
				this.emit('removedView', view);
			}
		});
		let previous: SyncView<SyncNode>;
		itemsArr.forEach((item: SyncNode) => {
			var view = this.views[item.key];
			if (!view) {
				//let toInit: SyncView.SyncNodeView<SyncNode.SyncData>[] = [];
				var options = {};
				this.emit('addingViewOptions', options);
				//view = this.svml.buildComponent(this.options.ctor || this.options.tag, options, toInit);
				view = new this.options.item(options);
				//toInit.forEach((v) => { v.init(); });
				this.views[item.key] = view;
				this.emit('viewAdded', view);
			}
			// Attempt to preserve order:
			this.el.insertBefore(view.el, previous ? previous.el.nextSibling : this.el.firstChild);
			view.onAny((eventName: string, ...args: any[]) => {
				args.unshift(view);
				args.unshift(eventName);
				this.emit.apply(this, args);
			});
			view.update(item);
			previous = view;
		});
	}
}




export interface SyncAppOptions {
	channel: string;
	mainView: SyncView<SyncNode>;
	host?: string;
    parent?: HTMLElement;
}

export class SyncAppSimple<D extends SyncNode> {
	options: SyncAppOptions;
    client: SyncNodeClient;
    reload: SyncNodeChannel<SyncNode>;
    channel: SyncNodeChannel<SyncNode>;
    constructor(options: SyncAppOptions) {
		this.options = options;
        window.addEventListener('load', () => {
            console.log('hereerre');
            (options.parent || document.body).appendChild(this.options.mainView.el);

            this.client = new SyncNodeClient();

            this.reload = this.client.subscribe('reload');
            this.reload.on('reload', () => window.location.reload());

            console.log('channel', this.options.channel);
            this.channel = this.client.subscribe(this.options.channel);
            this.channel.on('updated', () => {
                console.log('updated: ', this.channel.data);
                this.options.mainView.update(this.channel.data);
            });
        });
    }
}