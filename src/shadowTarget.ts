import { isFunction } from "./shared";

const { isArray: isArrayOrNotOrThrowForRevoked } = Array;

function renameFunction<T extends object>(provider: T, receiver: T) {
    try {
        // a revoked proxy will break this method when reading the function name
        const nameDescriptor = ReflectGetOwnPropertyDescriptor(provider, 'name')!;
        ReflectDefineProperty(receiver, 'name', nameDescriptor);
    } catch {
        // intentionally swallowing the error because this method is just extracting the function
        // in a way that it should always succeed except for the cases in which the provider is a proxy
        // that is either revoked or has some logic to prevent reading the name property descriptor.
    }
}

export function createShadowTarget<T extends object>(target: T): T {
    let shadowTarget;
    if (isFunction(target)) {
        // this new shadow target function is never invoked just needed to anchor the realm
        try {
            shadowTarget = 'prototype' in target ? function () {} : () => {};
        } catch {
            // target is a revoked proxy
            shadowTarget = function () {};
        }
        // This is only really needed for debugging, it helps to identify the proxy by name
        renameFunction(target as (...args: any[]) => any, shadowTarget as (...args: any[]) => any);
    } else {
        let isRedArray = false;
        try {
            // try/catch in case Array.isArray throws when target is a revoked proxy
            isRedArray = isArrayOrNotOrThrowForRevoked(target);
        } catch {
            // target is a revoked proxy, ignoring...
        }
        // target is array or object
        shadowTarget = isRedArray ? [] : {};
    }
    return shadowTarget;
}
