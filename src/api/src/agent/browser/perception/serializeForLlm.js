import { MAX_ELEMENTS_IN_PROMPT } from '../../../constant/agent.constant.js';

/**
 * Serializes a page observation into a compact, human- and LLM-readable text representation.
 * Prioritizes in-viewport and form interactive elements while enforcing character and element budgets.
 *
 * @param {object} observation
 * @param {Array<object>} observation.elements
 * @param {string} [observation.url]
 * @param {string} [observation.title]
 * @param {object} [observation.scrollInfo]
 * @param {string} [observation.visibleTextTrimmed]
 * @param {object} [options]
 * @param {number} [options.maxElements]
 * @param {number} [options.charBudget=6000]
 * @returns {string} Formatted prompt string for the LLM
 */
export const serializeForLlm = (observation, options = {}) => {
  if (!observation) return 'No page observation available.';

  const {
    elements = [],
    url = '',
    title = '',
    scrollInfo = {},
    visibleTextTrimmed = '',
  } = observation;

  const maxElements = options.maxElements || MAX_ELEMENTS_IN_PROMPT || 60;
  const charBudget = options.charBudget || 6000;

  const lines = [];

  // Header Context
  lines.push(`=== PAGE CONTEXT ===`);
  lines.push(`URL: ${url || 'Unknown'}`);
  lines.push(`Title: ${title || 'Untitled'}`);

  if (scrollInfo.scrollHeight) {
    const pct = Math.round(((scrollInfo.scrollY || 0) / (scrollInfo.scrollHeight || 1)) * 100);
    lines.push(`Scroll: ${scrollInfo.scrollY || 0}px / ${scrollInfo.scrollHeight}px (${pct}% down page)`);
  }

  if (visibleTextTrimmed) {
    // Truncate visible text summary to ~600 chars to avoid overwhelming the prompt
    const summary = visibleTextTrimmed.trim().slice(0, 600).replace(/\s+/g, ' ');
    lines.push(`Main Text Snippet: ${summary}`);
  }

  lines.push('');
  lines.push(`=== INTERACTIVE ELEMENTS (Reference by [index]) ===`);

  if (!elements || elements.length === 0) {
    lines.push('No interactive elements detected on this page.');
    return lines.join('\n');
  }

  // Sort & prioritize elements:
  // 1. In-viewport elements first
  // 2. Form input controls (input, textarea, select, button) before plain links
  const prioritized = [...elements].sort((a, b) => {
    // Viewport priority
    if (a.inViewport && !b.inViewport) return -1;
    if (!a.inViewport && b.inViewport) return 1;

    // Form element priority
    const formTags = ['input', 'select', 'textarea', 'button'];
    const aIsForm = formTags.includes(a.tag);
    const bIsForm = formTags.includes(b.tag);
    if (aIsForm && !bIsForm) return -1;
    if (!aIsForm && bIsForm) return 1;

    return (a.index || 0) - (b.index || 0);
  });

  const selectedElements = prioritized.slice(0, maxElements);
  const omittedCount = elements.length - selectedElements.length;

  let currentLength = lines.join('\n').length;

  for (const el of selectedElements) {
    const parts = [];

    // Index
    parts.push(`[${el.index}]`);

    // Tag / Role
    parts.push(el.tag);

    if (el.type) {
      parts.push(`type=${el.type}`);
    }

    if (el.role && el.role !== el.tag) {
      parts.push(`role=${el.role}`);
    }

    if (el.name) {
      parts.push(`name="${el.name}"`);
    }

    if (el.groupName) {
      parts.push(`group="${el.groupName}"`);
    }

    if (el.label) {
      parts.push(`label="${el.label}"`);
    }

    if (el.placeholder && el.placeholder !== el.label) {
      parts.push(`placeholder="${el.placeholder}"`);
    }

    if (el.text && el.text !== el.label && el.text !== el.placeholder && el.text.length <= 60) {
      parts.push(`text="${el.text}"`);
    }

    // Select options serialization
    if (el.tag === 'select' && Array.isArray(el.options) && el.options.length > 0) {
      const optTexts = el.options.map((o) => o.text || o.value).filter(Boolean);
      const optSnippet = optTexts.length <= 5
        ? JSON.stringify(optTexts)
        : JSON.stringify(optTexts.slice(0, 5)) + ` (+${optTexts.length - 5} more)`;
      parts.push(`options=${optSnippet}`);
    }

    // Boolean flags
    if (el.required) parts.push('required');
    if (el.disabled) parts.push('disabled');
    if (el.checked !== undefined) parts.push(el.checked ? 'checked' : 'unchecked');

    // Values (with sensitive redaction)
    if (el.isSensitive) {
      parts.push('value=[REDACTED]');
    } else if (el.value !== undefined && el.value !== '') {
      const sanitizedVal = String(el.value).slice(0, 50);
      parts.push(`value="${sanitizedVal}"`);
    }

    // Frame identifier if not main frame
    if (el.frameUrl && !el.frameUrl.includes(url)) {
      parts.push(`(frame:${el.frameUrl.slice(0, 40)})`);
    }

    const line = parts.join(' ');

    if (currentLength + line.length + 1 > charBudget) {
      lines.push(`... remaining elements truncated due to prompt character budget.`);
      break;
    }

    lines.push(line);
    currentLength += line.length + 1;
  }

  if (omittedCount > 0) {
    lines.push(`... and ${omittedCount} other interactive elements omitted (exceeded priority limit).`);
  }

  return lines.join('\n');
};

export default serializeForLlm;
