/**
 * Compact Tree Serializer in the style of Browser Use.
 * Transforms DOM snapshots into clean, token-efficient text trees.
 */
export const CHARACTER_BUDGET = 15000;

/**
 * Encodes an individual element with clean attributes and decorators.
 */
export const serializeElement = (el, indent = '') => {
  let prefix = '';
  if (el.isNew) prefix += '*';

  let decorators = '';
  if (el.frameId && el.frameId !== 'main') {
    decorators += `|FRAME:${el.frameId}| `;
  }
  if (el.inShadow) {
    decorators += `|SHADOW| `;
  }
  if (el.scrollable) {
    decorators += `|SCROLL| `;
  }

  const attrs = [];
  if (el.type) attrs.push(`type="${el.type}"`);
  if (el.role) attrs.push(`role="${el.role}"`);

  // Include validation attributes
  const consts = el.constraints || {};
  if (consts.pattern) attrs.push(`pattern="${consts.pattern}"`);
  if (consts.maxlength) attrs.push(`maxlength="${consts.maxlength}"`);
  if (consts.accept) attrs.push(`accept="${consts.accept}"`);
  if (consts.inputmode) attrs.push(`inputmode="${consts.inputmode}"`);
  if (consts.autocomplete) attrs.push(`autocomplete="${consts.autocomplete}"`);

  if (el.required) attrs.push('required');
  if (el.disabled) attrs.push('disabled');
  if (el.readonly) attrs.push('readonly');
  if (el.checked) attrs.push('checked');
  if (el.selected) attrs.push('selected');

  if (el.accessibleName) {
    // Truncate long accessible names to save tokens
    const cleanName = el.accessibleName.replace(/\s+/g, ' ').trim();
    attrs.push(`aria-label="${cleanName.substring(0, 100)}"`);
  }

  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';

  // Keeps Select option tags inside select parent scope
  if (el.tag === 'select' && el.options) {
    const optsStr = el.options
      .slice(0, 5)
      .map(opt => `${indent}  <option value="${opt.value}"${opt.selected ? ' selected' : ''}>${opt.label.substring(0, 40)}</option>`)
      .join('\n');
    const truncatedNotice = el.options.length > 5 ? `\n${indent}  <!-- ... ${el.options.length - 5} more options omitted -->` : '';
    return `${prefix}[${el.id}]${decorators}<select${attrStr}>\n${optsStr}${truncatedNotice}\n${indent}</select>`;
  }

  return `${prefix}[${el.id}]${decorators}<${el.tag}${attrStr} />`;
};

/**
 * Converts a full BrowserState object into compact serial tree text.
 * @param {object} state - BrowserState object
 * @returns {string} Fully formatted hierarchical serialization string
 */
export const serializeState = (state) => {
  const allElements = state.elements || [];

  // Filter elements to viewport-only by default
  const viewportElements = allElements.filter(el => el.inViewport);

  // Count non-viewport elements above & below
  const elementsAbove = allElements.filter(el => !el.inViewport && el.boundingBox.bottom < 0).length;
  const elementsBelow = allElements.filter(el => !el.inViewport && el.boundingBox.top >= 800).length;

  let serializedText = '';
  
  if (elementsAbove > 0) {
    serializedText += `[${elementsAbove} more elements above viewport]\n`;
  }

  // Build tree structure
  const elementMap = new Map(viewportElements.map(el => [el.id, el]));
  const roots = [];
  const childrenMap = new Map();

  for (const el of viewportElements) {
    const pId = el.parentId;
    if (pId && elementMap.has(pId)) {
      if (!childrenMap.has(pId)) childrenMap.set(pId, []);
      childrenMap.get(pId).push(el);
    } else {
      roots.push(el);
    }
  }

  let budgetExceeded = false;
  let omittedCount = 0;

  const renderTree = (el, depth = 0) => {
    if (serializedText.length >= CHARACTER_BUDGET) {
      budgetExceeded = true;
      omittedCount++;
      return;
    }

    const indent = '  '.repeat(depth);
    serializedText += `${indent}${serializeElement(el, indent)}\n`;

    const children = childrenMap.get(el.id) || [];
    for (const child of children) {
      renderTree(child, depth + 1);
    }
  };

  for (const root of roots) {
    renderTree(root, 0);
  }

  if (elementsBelow > 0) {
    serializedText += `[${elementsBelow} more elements below viewport]\n`;
  }

  if (budgetExceeded) {
    serializedText += `\n[WARNING: Character budget exceeded. ${omittedCount} interactive items omitted from view.]\n`;
  }

  return serializedText;
};

export default {
  serializeState,
  serializeElement,
  CHARACTER_BUDGET
};
