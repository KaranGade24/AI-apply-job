/**
 * Form Parser and Modeler.
 * Groups flat DOM elements into semantic forms, sections, and multi-step representations.
 */

/**
 * Builds a structured, high-level Form Model from the elements in the DOM snapshot.
 * @param {Array<object>} elements - Snapshot elements list
 * @returns {object} Form Model containing grouped sections and step indicators
 */
export const buildFormModel = (elements = []) => {
  const forms = new Map();
  const stepIndicators = {
    currentStep: null,
    totalSteps: null,
    progressPercent: null,
    nextButtons: [],
    backButtons: []
  };

  // 1. Detect multi-step pagination indicators in text
  for (const el of elements) {
    const text = (el.accessibleName || '').toLowerCase();
    
    // Check next/back buttons
    if (el.tag === 'button' || el.tag === 'a' || el.role === 'button') {
      if (/next|continue|proceed/i.test(text)) {
        stepIndicators.nextButtons.push({ id: el.id, accessibleName: el.accessibleName });
      } else if (/back|previous|prev/i.test(text)) {
        stepIndicators.backButtons.push({ id: el.id, accessibleName: el.accessibleName });
      }
    }

    // Parse step numbers like "step 2 of 5" or "page 3/4"
    const stepMatch = text.match(/step\s*(\d+)\s*(?:of|\/)\s*(\d+)/i) || text.match(/page\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
    if (stepMatch) {
      stepIndicators.currentStep = parseInt(stepMatch[1], 10);
      stepIndicators.totalSteps = parseInt(stepMatch[2], 10);
    }
  }

  // 2. Group interactive elements by form/section hierarchy
  for (const el of elements) {
    // We only group inputs, selects, textareas, and buttons
    const tag = el.tag.toLowerCase();
    if (!['input', 'select', 'textarea', 'button'].includes(tag) && el.role !== 'button') {
      continue;
    }

    const parentId = el.parentId || 'global';
    if (!forms.has(parentId)) {
      forms.set(parentId, {
        sectionId: parentId,
        fields: [],
        buttons: []
      });
    }

    const section = forms.get(parentId);
    if (tag === 'button' || el.role === 'button') {
      section.buttons.push(el);
    } else {
      section.fields.push({
        id: el.id,
        tag: el.tag,
        type: el.type,
        accessibleName: el.accessibleName || `Field ${el.id}`,
        value: el.value || '',
        required: !!el.required,
        disabled: !!el.disabled,
        readonly: !!el.readonly,
        constraints: el.constraints || {},
        options: el.options || null
      });
    }
  }

  return {
    sections: Array.from(forms.values()),
    stepIndicators
  };
};

export default {
  buildFormModel
};
