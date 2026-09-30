import { logError } from '../../utils/logger.js';

/**
 * Traverses Playwright accessibility tree to find a node matching specific element characteristics.
 */
function findAccessibilityNode(axNode, tagName, id, text, level = 0) {
  if (!axNode) return null;

  // Simple heuristic checks for match
  const nameMatch = axNode.name && text && text.toLowerCase().includes(axNode.name.toLowerCase());
  const roleMatch = axNode.role && tagName && (
    (axNode.role === 'button' && tagName === 'button') ||
    (axNode.role === 'link' && tagName === 'a') ||
    (axNode.role === 'textbox' && (tagName === 'input' || tagName === 'textarea'))
  );

  if (nameMatch || roleMatch) {
    return axNode;
  }

  if (axNode.children) {
    for (const child of axNode.children) {
      const match = findAccessibilityNode(child, tagName, id, text, level + 1);
      if (match) return match;
    }
  }

  return null;
}

/**
 * Snapshot and retrieve accessibility insights.
 * @param {import('playwright').Page} page
 * @param {Array<object>} observedElements
 * @returns {Promise<Array<object>>}
 */
export async function observeAccessibility(page, observedElements = []) {
  try {
    const axSnapshot = await page.accessibility.snapshot();
    if (!axSnapshot) return observedElements;

    return observedElements.map((el) => {
      // Find matching accessibility attributes
      const axNode = findAccessibilityNode(axSnapshot, el.tagName, el.id, el.labelText || el.normalizedText);

      return {
        ...el,
        accessibleRole: axNode?.role || el.role || el.tagName,
        accessibleName: axNode?.name || el.ariaLabel || el.labelText || el.normalizedText || '',
        axValue: axNode?.value || '',
        axChecked: axNode?.checked || null,
        axPressed: axNode?.pressed || null
      };
    });
  } catch (error) {
    await logError('accessibilityObserver.observeAccessibility', error.message);
    return observedElements;
  }
}
