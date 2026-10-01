/**
 * In-page element registry script string to be injected or run.
 * Uses WeakMap and WeakRef to map elements securely and prevent memory leaks.
 */
export const REGISTRY_INIT_SCRIPT = `
  if (!window.__aijRegistry) {
    window.__aijRegistry = {
      elementToId: new WeakMap(),
      idToRef: new Map(),
      nextId: 1,
      getOrRegister(el) {
        if (this.elementToId.has(el)) {
          return { id: this.elementToId.get(el), isNew: false };
        }
        const id = this.nextId++;
        this.elementToId.set(el, id);
        this.idToRef.set(id, new WeakRef(el));
        return { id, isNew: true };
      },
      resolve(id) {
        const ref = this.idToRef.get(id);
        return ref ? ref.deref() : null;
      }
    };
  }
`;

/**
 * Resolves a monotonic ID back to a Playwright ElementHandle or JSHandle in the frame.
 * @param {import('playwright').Frame} frame
 * @param {number} id
 * @returns {Promise<import('playwright').JSHandle>}
 */
export const resolveElementHandle = async (frame, id) => {
  return await frame.evaluateHandle((numericId) => {
    return window.__aijRegistry ? window.__aijRegistry.resolve(numericId) : null;
  }, id);
};

export default {
  REGISTRY_INIT_SCRIPT,
  resolveElementHandle
};
