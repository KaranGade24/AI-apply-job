import { MAX_ELEMENTS_IN_PROMPT } from '../../../constant/agent.constant.js';

/**
 * In-browser evaluation function to discover, label, index, and stamp interactive elements.
 *
 * @param {object} params
 * @param {string} params.snapshotId
 * @param {string} params.frameUrl
 * @param {number} params.startIndex
 * @param {number} params.maxElements
 * @returns {Array<object>}
 */
export const inPageExtractElements = ({ snapshotId, frameUrl, startIndex = 0, maxElements = 60 }) => {
  const elements = [];
  let currentIndex = startIndex;

  const SENSITIVE_PATTERN = /password|passcode|secret|otp|one_?time|pin|cvv|credit_?card|security_?code/i;

  const collectNodes = (root, list = []) => {
    if (!root) return list;

    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="combobox"]',
      '[role="option"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="switch"]',
      '[contenteditable="true"]',
      '[contenteditable=""]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    try {
      const matched = Array.from(root.querySelectorAll(selector));
      list.push(...matched);
    } catch {
      // Ignore selector query errors
    }

    const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let currentNode = treeWalker.currentNode;
    while (currentNode) {
      if (currentNode.shadowRoot) {
        collectNodes(currentNode.shadowRoot, list);
      }
      currentNode = treeWalker.nextNode();
    }

    return list;
  };

  const resolveLabel = (el) => {
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    const ariaLabelledby = el.getAttribute('aria-labelledby');
    if (ariaLabelledby) {
      const labelEl = document.getElementById(ariaLabelledby);
      if (labelEl && labelEl.textContent.trim()) return labelEl.textContent.trim();
    }

    if (el.id) {
      try {
        const labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (labelFor && labelFor.textContent.trim()) return labelFor.textContent.trim();
      } catch {}
    }

    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.textContent.trim()) {
      return parentLabel.textContent.trim();
    }

    const placeholder = el.getAttribute('placeholder');
    if (placeholder && placeholder.trim()) return placeholder.trim();

    const title = el.getAttribute('title');
    if (title && title.trim()) return title.trim();

    const name = el.getAttribute('name');
    if (name && name.trim()) return name.trim();

    const prev = el.previousElementSibling;
    if (prev && ['LABEL', 'SPAN', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(prev.tagName)) {
      const text = prev.textContent.trim();
      if (text && text.length < 80) return text;
    }

    return '';
  };

  const checkVisibility = (el) => {
    if (!el || !el.getBoundingClientRect) return null;

    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      style.pointerEvents === 'none'
    ) {
      return null;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const inViewport =
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.left <= (window.innerWidth || document.documentElement.clientWidth);

    let isOccluded = false;
    if (inViewport) {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight) {
        const topEl = document.elementFromPoint(cx, cy);
        if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
          const overlayStyle = window.getComputedStyle(topEl);
          if (overlayStyle.position === 'fixed' || overlayStyle.position === 'absolute') {
            const zIndex = parseInt(overlayStyle.zIndex, 10) || 0;
            if (zIndex > 10) {
              isOccluded = true;
            }
          }
        }
      }
    }

    if (isOccluded) return null;

    return {
      inViewport,
      boundingBox: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  };

  const rawNodes = collectNodes(document.body || document.documentElement);
  const uniqueNodes = Array.from(new Set(rawNodes));

  for (const el of uniqueNodes) {
    if (elements.length >= maxElements) break;

    const vis = checkVisibility(el);
    if (!vis) continue;

    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const role = el.getAttribute('role') || '';
    const name = el.getAttribute('name') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const label = resolveLabel(el);
    const text = (el.textContent || '').trim().slice(0, 100);

    const isSensitive =
      type === 'password' ||
      SENSITIVE_PATTERN.test(name) ||
      SENSITIVE_PATTERN.test(label) ||
      SENSITIVE_PATTERN.test(el.id || '');

    let value = undefined;
    if (!isSensitive) {
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        value = el.value || '';
      }
    }

    let options = undefined;
    if (tag === 'select') {
      options = Array.from(el.options || []).map((opt) => ({
        value: opt.value,
        text: (opt.textContent || '').trim(),
        selected: opt.selected,
      }));
    }

    const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true';
    const required = el.required || el.getAttribute('aria-required') === 'true';
    const checked = el.checked || el.getAttribute('aria-checked') === 'true';
    const groupName = tag === 'input' && type === 'radio' ? name : undefined;

    // Stamp unique snapshot attribute for deterministic resolution
    const stampRef = `${snapshotId}-${currentIndex}`;
    el.setAttribute('data-aij-ref', stampRef);

    elements.push({
      index: currentIndex,
      snapshotId,
      frameUrl: frameUrl || window.location.href,
      tag,
      role: role || undefined,
      type: type || undefined,
      text: text || undefined,
      label: label || undefined,
      placeholder: placeholder || undefined,
      name: name || undefined,
      value,
      required: required || undefined,
      disabled: disabled || undefined,
      checked: (type === 'checkbox' || type === 'radio') ? Boolean(checked) : undefined,
      options,
      visible: true,
      inViewport: vis.inViewport,
      boundingBox: vis.boundingBox,
      groupName,
      isSensitive: isSensitive || undefined,
    });

    currentIndex++;
  }

  return elements;
};

/**
 * Extracts interactive elements from a single Playwright Frame or Page.
 *
 * @param {import('playwright').Frame|import('playwright').Page} target
 * @param {object} params
 * @param {string} params.snapshotId
 * @param {string} params.frameUrl
 * @param {number} [params.startIndex=0]
 * @param {number} [params.maxElements]
 * @returns {Promise<Array<object>>}
 */
export const extractElementsFromFrame = async (target, { snapshotId, frameUrl, startIndex = 0, maxElements }) => {
  const cap = maxElements || MAX_ELEMENTS_IN_PROMPT || 60;
  try {
    return await target.evaluate(inPageExtractElements, {
      snapshotId,
      frameUrl,
      startIndex,
      maxElements: cap,
    });
  } catch (error) {
    return [];
  }
};

export default extractElementsFromFrame;
