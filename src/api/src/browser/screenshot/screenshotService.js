/**
 * Browser Screenshot Service.
 * Provides visual bounding box highlights and captures viewport base64 strings
 * for multimodal vision inspection (browser-use architecture).
 */

/**
 * Capture viewport screenshot, highlighting interactive elements with labeled bounding boxes.
 * @param {import('playwright').Page} page
 * @param {object} [options]
 * @param {boolean} [options.highlight=true] - Draw monotonic boxes over elements
 * @returns {Promise<string>} Base64 encoded PNG screenshot
 */
export const takeScreenshot = async (page, options = {}) => {
  const highlight = options.highlight !== false;

  try {
    if (highlight && page && !page.isClosed()) {
      await page.evaluate(() => {
        // Remove existing overlays just in case
        const existing = document.getElementById('__aijScreenshotOverlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = '__aijScreenshotOverlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = '2147483647'; // Front-most layer
        document.body.appendChild(overlay);

        const elementsToHighlight = [];
        if (window.__aijRegistry && window.__aijRegistry.idToRef && window.__aijRegistry.idToRef.size > 0) {
          for (const [id, ref] of window.__aijRegistry.idToRef.entries()) {
            const el = ref.deref();
            if (el) elementsToHighlight.push({ id, el });
          }
        } else {
          // Dynamic discovery of interactive elements if registry not yet populated
          const interactives = document.querySelectorAll(
            'button, input:not([type="hidden"]), select, textarea, a[href], [role="button"], [role="checkbox"], [role="radio"], [role="combobox"], [role="tab"], [onclick], [tabindex]:not([tabindex="-1"])'
          );
          interactives.forEach((el, idx) => {
            elementsToHighlight.push({ id: idx + 1, el });
          });
        }

        // Render highlights only for viewport-visible items
        elementsToHighlight.forEach(({ id, el }) => {
          try {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);

            if (
              rect.width > 0 && rect.height > 0 &&
              rect.top < window.innerHeight && rect.bottom > 0 &&
              rect.left < window.innerWidth && rect.right > 0 &&
              style.display !== 'none' && style.visibility !== 'hidden' &&
              parseFloat(style.opacity || '1') > 0
            ) {
              const box = document.createElement('div');
              box.style.position = 'absolute';
              box.style.top = `${Math.max(0, rect.top)}px`;
              box.style.left = `${Math.max(0, rect.left)}px`;
              box.style.width = `${rect.width}px`;
              box.style.height = `${rect.height}px`;
              box.style.border = '2px solid #FF3366';
              box.style.boxSizing = 'border-box';
              box.style.pointerEvents = 'none';

              const label = document.createElement('div');
              label.style.position = 'absolute';
              label.style.top = '-16px';
              label.style.left = '0';
              label.style.backgroundColor = '#FF3366';
              label.style.color = '#FFFFFF';
              label.style.fontSize = '10px';
              label.style.fontWeight = 'bold';
              label.style.fontFamily = 'monospace';
              label.style.padding = '0 4px';
              label.style.borderRadius = '2px';
              label.style.whiteSpace = 'nowrap';
              label.style.zIndex = '2147483647';
              label.innerText = String(id);

              box.appendChild(label);
              overlay.appendChild(box);
            }
          } catch {
            // Ignore detached or cross-origin elements
          }
        });
      }).catch(() => {});
    }

    const buffer = await page.screenshot({ type: 'png' });
    return buffer.toString('base64');
  } finally {
    if (highlight && page && !page.isClosed()) {
      await page.evaluate(() => {
        const overlay = document.getElementById('__aijScreenshotOverlay');
        if (overlay) overlay.remove();
      }).catch(() => {});
    }
  }
};

export default {
  takeScreenshot
};
