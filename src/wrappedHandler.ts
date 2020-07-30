import { isUndefined, unwrap, isFunction } from "./shared";
import { wrapMethod } from "./method";

const {
    construct,
    apply,
    deleteProperty,
    has,
    set,
    get,
    ownKeys,
    defineProperty,
    setPrototypeOf,
    getPrototypeOf,
    isExtensible,
    preventExtensions,
    getOwnPropertyDescriptor,
} = Reflect;

const { freeze, create } = Object;

function getWrappedDescriptor(desc: PropertyDescriptor): PropertyDescriptor {
    const wrappedDesc = create(desc);
    const { value, get, set } = desc;
    if (isFunction(value)) {
        wrappedDesc.value = wrapMethod(value);
    }
    if (isFunction(set)) {
        wrappedDesc.set = wrapMethod(set);
    }
    if (isFunction(get)) {
        wrappedDesc.get = wrapMethod(get);
    }
    return wrappedDesc;
}

class SmartProxyHandler<ProxyTarget extends Object> implements ProxyHandler<ProxyTarget> {
    // original target for the proxy
    private readonly target: ProxyTarget;
    private readonly handler: ProxyHandler<ProxyTarget>;
    private readonly deletePropertyTrap: (target: ProxyTarget, p: PropertyKey) => boolean;
    private readonly applyTrap: (target: ProxyTarget, thisArg: any, argArray?: any) => any;
    private readonly constructTrap: (target: ProxyTarget, argArray: any, newTarget?: any) => object;
    private readonly getTrap: (target: ProxyTarget, p: PropertyKey, receiver: any) => any;
    private readonly setTrap: (target: ProxyTarget, p: PropertyKey, value: any, receiver: any) => boolean;
    private readonly hasTrap: (target: ProxyTarget, p: PropertyKey) => boolean;
    private readonly ownKeysTrap: (target: ProxyTarget) => PropertyKey[];
    private readonly isExtensibleTrap: (target: ProxyTarget) => boolean;
    private readonly getOwnPropertyDescriptorTrap: (target: ProxyTarget, p: PropertyKey) => PropertyDescriptor | undefined;
    private readonly getPrototypeOfTrap: (target: ProxyTarget) => object | null;
    private readonly setPrototypeOfTrap: (target: ProxyTarget, v: any) => boolean;
    private readonly preventExtensionsTrap: (target: ProxyTarget) => boolean;
    private readonly definePropertyTrap: (target: ProxyTarget, p: PropertyKey, attributes: PropertyDescriptor) => boolean;

    constructor(target: ProxyTarget, handler: ProxyHandler<ProxyTarget>) {
        this.target = target;
        this.handler = handler;
        const {
            deleteProperty: deletePropertyTrap = deleteProperty,
            apply: applyTrap = apply,
            construct: constructTrap = construct,
            get: getTrap = get,
            set: setTrap = set,
            has: hasTrap = has,
            ownKeys: ownKeysTrap = ownKeys,
            isExtensible: isExtensibleTrap = isExtensible,
            getOwnPropertyDescriptor: getOwnPropertyDescriptorTrap = getOwnPropertyDescriptor,
            getPrototypeOf: getPrototypeOfTrap = getPrototypeOf,
            setPrototypeOf: setPrototypeOfTrap = setPrototypeOf,
            preventExtensions: preventExtensionsTrap = preventExtensions,
            defineProperty: definePropertyTrap = defineProperty,
        } = handler;
        this.deletePropertyTrap = deletePropertyTrap;
        this.applyTrap = applyTrap;
        this.constructTrap = constructTrap;
        this.getTrap = getTrap;
        this.setTrap = setTrap;
        this.hasTrap = hasTrap;
        this.ownKeysTrap = ownKeysTrap;
        this.isExtensibleTrap = isExtensibleTrap;
        this.getOwnPropertyDescriptorTrap = getOwnPropertyDescriptorTrap;
        this.getPrototypeOfTrap = getPrototypeOfTrap;
        this.setPrototypeOfTrap = setPrototypeOfTrap;
        this.preventExtensionsTrap = preventExtensionsTrap;
        this.definePropertyTrap = definePropertyTrap;

        // future optimization in browsers
        freeze(this);
    }

    copyDescriptorIntoShadowTarget(shadowTarget: ProxyTarget, key: PropertyKey) {
        // Note: a property might get defined multiple times in the shadowTarget
        //       but it will always be compatible with the previous descriptor
        //       to preserve the object invariants, which makes these lines safe.
        const normalizedRedDescriptor = apply(this.getOwnPropertyDescriptorTrap, this.handler, [this.target, key]);
        if (!isUndefined(normalizedRedDescriptor)) {
            const blueDesc = getWrappedDescriptor(normalizedRedDescriptor);
            defineProperty(shadowTarget, key, blueDesc);
        }
    }

    lockShadowTarget(shadowTarget: ProxyTarget) {
        const { target, handler } = this;
        // copying all own properties into the shadowTarget
        const targetKeys = apply(this.ownKeysTrap, handler, [target]);
        for (let i = 0, len = targetKeys.length; i < len; i += 1) {
            this.copyDescriptorIntoShadowTarget(shadowTarget, targetKeys[i]);
        }
        // setting up __proto__ of the shadowTarget
        setPrototypeOf(shadowTarget, apply(this.getPrototypeOfTrap, handler, [target]));
        // locking down the extensibility of shadowTarget
        preventExtensions(shadowTarget);
    }

    // traps
    deleteProperty(shadowTarget: ProxyTarget, key: PropertyKey): boolean {
        return apply(this.deletePropertyTrap, this.handler, [this.target, key]);
    }
    apply(shadowTarget: ProxyTarget, thisArg: any, argArray: any[]): any {
        return apply(this.applyTrap, this.handler, [this.target, thisArg, argArray]);
    }
    construct(shadowTarget: ProxyTarget, blueArgArray: any[], blueNewTarget: any): any {
        return apply(this.constructTrap, this.handler, [this.target, blueArgArray, blueNewTarget]);
    }
    get(shadowTarget: ProxyTarget, key: PropertyKey, receiver: any): any {
        let value = apply(this.getTrap, this.handler, [this.target, key, receiver]);
        if (!isFunction(value)) {
            return value;
        }
        return wrapMethod(value);
    }
    set(shadowTarget: ProxyTarget, key: PropertyKey, value: any, receiver: any): boolean {
        const unwrappedReceiver = unwrap(receiver);
        return apply(this.setTrap, this.handler, [this.target, key, value, unwrappedReceiver]);
    }
    has(shadowTarget: ProxyTarget, key: PropertyKey): boolean {
        return apply(this.hasTrap, this.handler, [this.target, key]);
    }
    ownKeys(shadowTarget: ProxyTarget): PropertyKey[] {
        return apply(this.ownKeysTrap, this.handler, [this.target]);
    }
    isExtensible(shadowTarget: ProxyTarget): boolean {
        // optimization to avoid attempting to lock down the shadowTarget multiple times
        if (!isExtensible(shadowTarget)) {
            return false; // was already locked down
        }
        if (!apply(this.isExtensibleTrap, this.handler, [this.target])) {
            this.lockShadowTarget(shadowTarget);
            return false;
        }
        return true;
    }
    getOwnPropertyDescriptor(shadowTarget: ProxyTarget, key: PropertyKey): PropertyDescriptor | undefined {
        const redDesc = apply(this.getOwnPropertyDescriptorTrap, this.handler, [this.target, key]);
        if (isUndefined(redDesc)) {
            return redDesc;
        }
        if (redDesc.configurable === false) {
            // updating the descriptor to non-configurable on the shadow
            this.copyDescriptorIntoShadowTarget(shadowTarget, key);
        }
        return getWrappedDescriptor(redDesc);
    }
    getPrototypeOf(shadowTarget: ProxyTarget): any {
        return apply(this.getPrototypeOfTrap, this.handler, [this.target]);
    }
    setPrototypeOf(shadowTarget: ProxyTarget, prototype: any): boolean {
        return apply(this.setPrototypeOfTrap, this.handler, [this.target, prototype]);
    }
    preventExtensions(shadowTarget: ProxyTarget): boolean {
        if (isExtensible(shadowTarget)) {
            if (apply(this.preventExtensionsTrap, this.handler, [this.target])) {
                // TODO: What if the target is a proxy manually created in the sandbox, it might reject
                // the preventExtension call, in which case we should not attempt to lock down
                // the shadow target.
                this.lockShadowTarget(shadowTarget);
            }
            this.lockShadowTarget(shadowTarget);
        }
        return true;
    }
    defineProperty(shadowTarget: ProxyTarget, key: PropertyKey, bluePartialDesc: PropertyDescriptor): boolean {
        if (apply(this.definePropertyTrap, this.handler, [this.target, key, bluePartialDesc])) {
            // intentionally testing against true since it could be undefined as well
            if (bluePartialDesc.configurable === false) {
                this.copyDescriptorIntoShadowTarget(shadowTarget, key);
            }
        }
        return true;
    }
}

// future optimization in browsers
freeze(SmartProxyHandler.prototype);

export function createWrappedHandler<T extends object>(shadowTarget: T, handler: ProxyHandler<T>): ProxyHandler<T> {
    return new SmartProxyHandler(shadowTarget, handler);
}
