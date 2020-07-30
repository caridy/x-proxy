import { unwrap } from "./shared";

export type Method = (...args: any[]) => any;

const MethodMap: WeakMap<Method, Method> = new WeakMap();

const methodHandler: ProxyHandler<Method> = {
    apply(target, thisArg: any, argArray: any[]): any {
        return Reflect.apply(target, unwrap(thisArg), argArray);
    }
};

export function wrapMethod(method: Method): Method {
    let proxy = MethodMap.get(method);
    if (proxy === undefined) {
        proxy = new Proxy(method, methodHandler);
        MethodMap.set(method, proxy);
    }
    return proxy;
}
