import { logError } from "../../utils/logger.js";

/**
 * Traverses Playwright's Accessibility tree snapshot to extract semantic roles and accessible names
 * @param {import('playwright').Page} page
 * @returns {Promise<Array>} Flattened list of interactive accessibility nodes
 */
export const extractAccessibilitySnapshot = async (page) => {
  try {
    const rawSnapshot = await page.accessibility.snapshot({ interestingOnly: true });
    if (!rawSnapshot) return [];

    const flatNodes = [];

    const traverse = (node, depth = 0) => {
      if (!node) return;

      const interactiveRoles = [
        "button",
        "link",
        "textbox",
        "checkbox",
        "radio",
        "combobox",
        "listbox",
        "menuitem",
        "tab",
        "dialog",
        "alert",
      ];

      if (interactiveRoles.includes(node.role)) {
        flatNodes.push({
          role: node.role,
          name: node.name || null,
          value: node.value !== undefined ? String(node.value) : null,
          description: node.description || null,
          checked: node.checked ?? null,
          pressed: node.pressed ?? null,
          disabled: node.disabled || false,
          focused: node.focused || false,
          depth,
        });
      }

      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child, depth + 1);
        }
      }
    };

    traverse(rawSnapshot);
    return flatNodes;
  } catch (error) {
    await logError("accessibilityObserver.extractAccessibilitySnapshot", error.message);
    return [];
  }
};
