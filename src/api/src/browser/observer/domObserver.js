import { logError } from '../../utils/logger.js';
import crypto from 'crypto';

/**
 * Computes a stable fingerprint hash for an element based on its stable semantic traits.
 */
export function computeElementFingerprint(traits) {
  const payload = [
    traits.tagName || '',
    traits.id || '',
    traits.name || '',
    traits.type || '',
    traits.role || '',
    traits.placeholder || '',
    traits.ariaLabel || '',
    traits.labelText || '',
    traits.normalizedText || '',
    traits.href || ''
  ].join('|');

  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Script to run inside the browser page context to extract interactive elements.
 */
const EXTRACTION_SCRIPT = () => {
  // Find associated label text for an input element
  const getLabelText = (el) => {
    // 1. By ID matching <label for="...">
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label && label.innerText) {
        return label.innerText.trim();
      }
    }
    // 2. By ancestor <label> wrapper
    let parent = el.parentElement;
    while (parent) {
      if (parent.tagName === 'LABEL') {
        return parent.innerText.trim();
      }
      parent = parent.parentElement;
    }
    // 3. Search surrounding text or placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();

    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();

    return '';
  };

  // Get semantic attributes/path context
  const getAncestryPath = (el) => {
    const parts = [];
    let curr = el;
    while (curr && curr !== document.body) {
      let segment = curr.tagName.toLowerCase();
      if (curr.id) {
        segment += `#${curr.id}`;
      } else if (curr.name) {
        segment += `[name="${curr.name}"]`;
      } else if (curr.className) {
        const firstClass = curr.className.split(/\s+/)[0];
        if (firstClass && !firstClass.includes('active') && !firstClass.includes('hover')) {
          segment += `.${firstClass}`;
        }
      }
      parts.unshift(segment);
      curr = curr.parentElement;
    }
    return parts.join(' > ');
  };

  // Query all interactive elements
  const candidates = Array.from(document.querySelectorAll(
    'input, select, textarea, button, a, [role="button"], [role="checkbox"], [role="radio"], [role="option"], [clickable="true"]'
  ));

  return candidates.map((el, index) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    const visible = rect.width > 0 && 
                    rect.height > 0 && 
                    style.visibility !== 'hidden' && 
                    style.display !== 'none' && 
                    style.opacity !== '0';

    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || '',
      name: el.getAttribute('name') || '',
      type: el.getAttribute('type') || '',
      role: el.getAttribute('role') || '',
      placeholder: el.getAttribute('placeholder') || '',
      ariaLabel: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '',
      labelText: getLabelText(el),
      normalizedText: (el.innerText || el.textContent || '').trim().substring(0, 150),
      href: el.getAttribute('href') || '',
      enabled: !el.disabled,
      visible,
      boundingBox: {
        x: Math.round(rect.left + window.scrollX),
        y: Math.round(rect.top + window.scrollY),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      ancestryPath: getAncestryPath(el),
      index
    };
  });
};

/**
 * Extracts and observes interactive DOM elements recursively from page and iframes.
 * @param {import('playwright').Page} page
 * @returns {Promise<Array<object>>}
 */
export async function observeDOM(page) {
  try {
    const elements = [];
    const frames = page.frames();

    for (const frame of frames) {
      let frameElements = [];
      try {
        // Evaluate extraction script in frame context
        frameElements = await frame.evaluate(EXTRACTION_SCRIPT);
      } catch (err) {
        // Skip cross-origin frames if evaluation fails
        continue;
      }

      const frameId = frame.name() || frame.url();
      for (const rawEl of frameElements) {
        // Compute deterministic element fingerprint
        const fingerprint = computeElementFingerprint(rawEl);

        elements.push({
          ...rawEl,
          frameId,
          frameUrl: frame.url(),
          elementFingerprint: fingerprint,
          elementId: `el_${fingerprint.substring(0, 10)}`
        });
      }
    }

    return elements;
  } catch (error) {
    await logError('domObserver.observeDOM', error.message);
    return [];
  }
}
