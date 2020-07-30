
const ProxyMap: WeakMap<Object, Object> = new WeakMap();

export function unwrap(proxyOrAny) {
    return ProxyMap.get(proxyOrAny) || proxyOrAny;
}

export function link(target, proxy) {
    ProxyMap.set(target, proxy);
}

export function isTypeObject(o: any): boolean {
    return (typeof o === 'object' && o !== null) || typeof o === 'function';
}

export function isFunction(fn: any): fn is (...args: any[]) => any {
    return typeof fn === 'function';
}

export function isUndefined(v: any): v is undefined {
    return v === undefined;
}
