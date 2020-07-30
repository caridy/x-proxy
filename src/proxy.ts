import { createShadowTarget } from "./shadowTarget";
import { createWrappedHandler } from "./wrappedHandler";
import { link, isTypeObject } from "./shared";

interface Revocable<T> {
    proxy: T;
    revoke: () => void;
}

// Based on 26.2.1.1 Proxy
export default class SmartProxy<T extends Object> {
    constructor(target: T, handler: ProxyHandler<T>) {
        if (!new.target) {
            // If NewTarget is undefined, throw a TypeError exception.
            throw new TypeError(`Constructor Proxy requires 'new'`);
        }
        if (!isTypeObject(target) || !isTypeObject(handler)) {
            // If Type(target) is not Object, throw a TypeError exception.
            // If Type(handler) is not Object, throw a TypeError exception.
            // * this is supposed to throw the proper error
            return new Proxy(target, handler);
        }
        const shadowTarget = createShadowTarget(target);
        const wrappedHandler = createWrappedHandler(shadowTarget, handler);
        const proxy = new Proxy(shadowTarget, wrappedHandler);
        link(target, proxy);
        return proxy;
    }
    revocable(target: T, handler: ProxyHandler<T>): Revocable<T> {
        if (!isTypeObject(target) || !isTypeObject(handler)) {
            // If Type(target) is not Object, throw a TypeError exception.
            // If Type(handler) is not Object, throw a TypeError exception.
            // * this is supposed to throw the proper error
            return Proxy.revocable(target, handler);
        }
        const shadowTarget = createShadowTarget(target);
        const wrappedHandler = createWrappedHandler(shadowTarget, handler);
        const o = Proxy.revocable(shadowTarget, wrappedHandler);
        link(target, o.proxy);
        return o;
    }
}
