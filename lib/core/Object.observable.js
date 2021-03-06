/* eslint-disable no-unused-vars */
import { 
  defineAddEventListener, 
  defineRemoveEventListener, 
  raiseEvent 
} from '../utils';

/**
 * @param {Object} obj Object whose value will be copied and proxied. 
 * @summary Factory for instantiating proxied, observable Objects.
 * @description Copies Object and proxifies; configures necessary traps and broadcasts events upon the access thereof.
 *   Recurses the target Object so as to enforce traps on nested props/accessors.
 * @augments Proxy
 */
function ObservableObject (obj) {
  /* Configuration Artifacts */
  const _symbols = {
    __INTERNAL__: Symbol.for('_internal'),
    __ISPROXY__: Symbol.for('_isProxy')
    },
     _handlers = {
      itemget: [],
      itemdeleted: [],
      itemset: []
    },
    // non-enumerable prop store - mitigate get|set events from being called thereon
    _internals = [
      'addEventListener',
      'removeEventListener',
      'identifier',
      'type'
    ];

  /**
   * @param {String} prop The property presently being accessed.
   * @summary Intercepts attempts to set|delete non-configurable properties.
   * @throws {Error} Raises exception if property `prop` is present in `_internals`.
   */
  const enforceConfigurableProps = (prop) => {
    if (_internals.includes(prop)) {
      throw new Error(`Error: Property '${prop}' is non-configurable.`);
    }
  };
   
  /**
   * @summary Root Proxy handler; injects event broadcasts into get|set|delete traps.
   */
  const _rootHandler = {
    get (target, prop, recv) {
      // type-check mechanism for testing
      if (prop === _symbols.__ISPROXY__) {
        return true;
      }
      // conform to `value` accessor and return raw value
      if (prop === _symbols.__INTERNAL__) {
        return target;
      }
      // we use `Reflect` here as a simple mitigative effort to avoid violating Proxy invariants, as described in the specification here: 
      // https://www.ecma-international.org/ecma-262/8.0/#sec-proxy-object-internal-methods-and-internal-slots-get-p-receiver
      const value = Reflect.get(target, prop, recv);
      
      // recurse and continue chain of Proxies for nested props to ensure traps are executed upon access thereof
      if (typeof value === 'object') {
        return new Proxy(value, _rootHandler);
      }
      // tradeoff here is `raiseEvent` won't be called for root getters; else, the cb would fire for each branch
      // TODO fix this by caching the Object with a WeakMap or something and walking the tree on ea. `get`...I think this would work
      if (value && !_internals.includes(prop)) {
        raiseEvent({
          type: 'itemget',
          prop,
          target,
          value
        }, this, _handlers);
      }
    
      return value;
    },
    set (target, prop, value, recv) {
      enforceConfigurableProps(prop);
      raiseEvent({
        type: 'itemset',
        prop,
        target,
        value
      }, this, _handlers);
      return Reflect.set(target, prop, value);
    },
    deleteProperty (target, prop) {
      enforceConfigurableProps(prop);
      // `toString` returns a default value when argument is type Object, ergo, we use `JSON.stringify` here
      // see: https://es5.github.io/#x9.8
      const ephemeralTarget = JSON.stringify(target, null, 0);
      const value = Reflect.deleteProperty(target, prop);
      raiseEvent({
        type: 'itemdeleted',
        prop,
        target: ephemeralTarget,
        value
      }, this, _handlers);
      return value;
    }
  };

  /* Root Object Conformations */
      
  // initialize root Proxy
  if (!(obj instanceof Object)) {
    return;
  }
  // make a deep clone here so as to break the chain of reference to the provided argument `obj` 
  // if we pass `obj` directly, the Proxy will modify the original target
  const _self = new Proxy(JSON.parse(JSON.stringify(obj)), _rootHandler);

  /**
   * @summary Defines accessor for core Object value, decoupled from original target ref.
   */
  Object.defineProperty(_self, 'value', {
    configurable: false,
    enumerable: false,
    get () {
      // `assign` here to decouple execution context from returned val
      // this allows users to, at any time, copy internal value without Proxy properties
      return Object.assign({},_self[_symbols.__INTERNAL__]);
    },
    set (inboundItems) {
      return;
      }
    });

  defineAddEventListener(_self, _handlers);
  defineRemoveEventListener(_self, _handlers);
  return _self;

}

export default ObservableObject;
