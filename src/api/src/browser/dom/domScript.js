import { REGISTRY_INIT_SCRIPT } from './elementRegistry.js';

/**
 * Returns the fully interpolated script to gather DOM snapshot info.
 * Evaluates recursively in-page, across open shadow roots.
 */
export const getDomSnapshotScript = () => {
  return `(() => {
    // Initialize element registry
    ${REGISTRY_INIT_SCRIPT}

    const walkDOM = (root, callback) => {
      const walker = (node, inShadow = false) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          callback(node, inShadow);
          if (node.shadowRoot) {
            walker(node.shadowRoot, true);
          }
        }
        let child = node.firstChild;
        while (child) {
          walker(child, inShadow);
          child = child.nextSibling;
        }
      };
      walker(root);
    };

    const getAccessibleName = (el) => {
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();

      const ariaLabelledBy = el.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        const ids = ariaLabelledBy.split(/\\s+/);
        const parts = ids.map(id => {
          const target = document.getElementById(id);
          return target ? (target.innerText || target.textContent || '') : '';
        }).filter(Boolean);
        if (parts.length > 0) return parts.join(' ').trim();
      }

      if (el.id) {
        const label = document.querySelector(\`label[for="\${el.id}"]\`);
        if (label) return (label.innerText || label.textContent || '').trim();
      }

      const closestLabel = el.closest('label');
      if (closestLabel) {
        return (closestLabel.innerText || closestLabel.textContent || '').trim();
      }

      const title = el.getAttribute('title');
      if (title) return title.trim();

      const placeholder = el.getAttribute('placeholder');
      if (placeholder) return placeholder.trim();

      const alt = el.getAttribute('alt');
      if (alt) return alt.trim();

      // Cap text to prevent huge tokens
      const textVal = el.innerText || el.textContent || '';
      if (textVal.trim()) {
        return textVal.trim().substring(0, 200);
      }

      return '';
    };

    const isInteractive = (el, style, rect) => {
      if (el.disabled || el.hasAttribute('disabled')) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
      if (rect.width === 0 || rect.height === 0) return false;

      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || el.role || '';

      if (['a', 'button', 'input', 'select', 'textarea', 'details', 'summary', 'option'].includes(tag)) {
        return true;
      }

      const interactiveRoles = [
        'button', 'link', 'menuitem', 'option', 'radio', 'checkbox', 'tab', 
        'textbox', 'combobox', 'slider', 'spinbutton', 'searchbox', 'listbox', 'gridcell'
      ];
      if (interactiveRoles.includes(role)) {
        return true;
      }

      if (el.hasAttribute('onclick') || el.onclick || el.hasAttribute('tabindex')) {
        return true;
      }

      if (style.cursor === 'pointer') {
        return true;
      }

      if (
        rect.width >= 10 && rect.width <= 50 &&
        rect.height >= 10 && rect.height <= 50 &&
        (el.className || el.hasAttribute('aria-label') || el.hasAttribute('role'))
      ) {
        return true;
      }

      if (['label', 'span'].includes(tag)) {
        const hasFormControl = el.querySelector('input, select, textarea, button, [role="button"]');
        if (hasFormControl) return true;
      }

      if (tag === 'iframe' && rect.width >= 100 && rect.height >= 100) {
        return true;
      }

      return false;
    };

    const elementsData = [];
    walkDOM(document.body || document.documentElement, (el, inShadow) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      if (!isInteractive(el, style, rect)) {
        return;
      }

      const { id, isNew } = window.__aijRegistry.getOrRegister(el);

      let parentId = null;
      if (el.parentElement) {
        parentId = window.__aijRegistry.getOrRegister(el.parentElement).id;
      }

      const accessibleName = getAccessibleName(el);

      let options = null;
      if (el.tagName.toLowerCase() === 'select') {
        options = Array.from(el.options).map(opt => ({
          value: opt.value,
          label: opt.text,
          selected: opt.selected
        }));
      }

      const scrollable = el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth;

      const inViewport = (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );

      let occluded = false;
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      if (centerX >= 0 && centerX <= window.innerWidth && centerY >= 0 && centerY <= window.innerHeight) {
        const topEl = document.elementFromPoint(centerX, centerY);
        if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
          occluded = true;
        }
      }

      elementsData.push({
        id,
        isNew,
        parentId,
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type') || null,
        role: el.getAttribute('role') || null,
        accessibleName,
        value: el.value || null,
        checked: el.checked || null,
        selected: el.selected || null,
        expanded: el.getAttribute('aria-expanded') || null,
        required: el.required || el.hasAttribute('required') || null,
        disabled: el.disabled || el.hasAttribute('disabled') || null,
        readonly: el.readOnly || el.hasAttribute('readonly') || null,
        constraints: {
          min: el.getAttribute('min') || null,
          max: el.getAttribute('max') || null,
          pattern: el.getAttribute('pattern') || null,
          minlength: el.getAttribute('minlength') || null,
          maxlength: el.getAttribute('maxlength') || null,
          accept: el.getAttribute('accept') || null,
          multiple: el.hasAttribute('multiple') || null,
          inputmode: el.getAttribute('inputmode') || null,
          autocomplete: el.getAttribute('autocomplete') || null,
        },
        options,
        href: el.getAttribute('href') || null,
        boundingBox: {
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom
        },
        inViewport,
        visibility: {
          display: style.display,
          visibility: style.visibility,
          opacity: parseFloat(style.opacity || '1')
        },
        cursor: style.cursor,
        scrollable,
        inShadow,
        occluded
      });
    });

    const isFormControl = (item) => {
      return ['input', 'select', 'textarea', 'button'].includes(item.tag) ||
             ['button', 'textbox', 'checkbox', 'radio', 'combobox', 'listbox'].includes(item.role || '');
    };

    const filteredElements = elementsData.filter((child) => {
      if (isFormControl(child)) return true;

      const isContained = elementsData.some((parent) => {
        if (parent.id === child.id) return false;
        const cBox = child.boundingBox;
        const pBox = parent.boundingBox;

        return (
          cBox.left >= pBox.left &&
          cBox.right <= pBox.right &&
          cBox.top >= pBox.top &&
          cBox.bottom <= pBox.bottom
        );
      });

      return !isContained;
    });

    return filteredElements;
  })();`;
};

export default {
  getDomSnapshotScript
};
