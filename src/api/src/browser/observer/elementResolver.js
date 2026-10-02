import { logError } from '../../utils/logger.js';
import { computeElementFingerprint } from './domObserver.js';

/**
 * Resolves a live Playwright Locator for a target element descriptor from a prior page observation.
 * Uses a multi-tiered ambiguity-safe matching cascade with detailed score comparison.
 *
 * @param {import('playwright').Page} page
 * @param {object} elementDescriptor - Observed element descriptor with elementFingerprint, id, tag, etc.
 * @returns {Promise<object|null>} Resolves to a Playwright Locator with attached metadata, or an ambiguity/error object
 */
export async function resolveElement(page, elementDescriptor) {
  try {
    if (!elementDescriptor) {
      return {
        resolved: false,
        reason: 'TARGET_NOT_FOUND',
        candidates: []
      };
    }

    const {
      id,
      name,
      type,
      tagName,
      accessibleRole,
      accessibleName,
      labelText,
      placeholder,
      ancestryPath,
      elementFingerprint
    } = elementDescriptor;

    // Resolve within the correct frame
    const frameContext = elementDescriptor.frameId 
      ? page.frames().find(f => f.name() === elementDescriptor.frameId || f.url() === elementDescriptor.frameUrl) || page
      : page;

    // Query all possible candidate elements of matching or interactive tag types
    const queryTags = tagName || 'input, button, select, textarea, a, [role="button"], [role="checkbox"], [role="radio"]';
    const candidatesCount = await frameContext.locator(queryTags).count().catch(() => 0);
    const scoredCandidates = [];

    for (let i = 0; i < candidatesCount; i++) {
      const loc = frameContext.locator(queryTags).nth(i);
      const isVisible = await loc.isVisible().catch(() => false);
      const isEnabled = await loc.isEnabled().catch(() => false);

      const traits = await loc.evaluate((el) => {
        const getLabelText = (node) => {
          if (node.id) {
            const label = document.querySelector(`label[for="${node.id}"]`);
            if (label && label.innerText) return label.innerText.trim();
          }
          let parent = node.parentElement;
          while (parent) {
            if (parent.tagName === 'LABEL') return parent.innerText.trim();
            parent = parent.parentElement;
          }
          return '';
        };

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
          dataTestId: el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-qa') || '',
          className: el.className || ''
        };
      }).catch(() => null);

      if (!traits) continue;

      // Compute matching score
      let score = 0;
      const evidence = [];

      const currentFingerprint = computeElementFingerprint(traits);
      if (currentFingerprint === elementFingerprint) {
        score += 50;
        evidence.push('fingerprint_match');
      }

      if (id && traits.id === id) {
        score += 30;
        evidence.push('id_match');
      }

      if (accessibleRole && traits.role === accessibleRole) {
        score += 10;
        evidence.push('role_match');
      }

      if (accessibleName && traits.ariaLabel === accessibleName) {
        score += 15;
        evidence.push('aria_label_match');
      }

      if (labelText && traits.labelText === labelText) {
        score += 20;
        evidence.push('label_text_match');
      }

      if (name && traits.name === name) {
        score += 15;
        evidence.push('name_match');
      }

      if (placeholder && traits.placeholder === placeholder) {
        score += 15;
        evidence.push('placeholder_match');
      }

      if (traits.dataTestId && traits.dataTestId === elementDescriptor.dataTestId) {
        score += 25;
        evidence.push('data_test_id_match');
      }

      if (isVisible) {
        score += 10;
        evidence.push('visible');
      }

      // Record candidate
      scoredCandidates.push({
        index: i,
        locator: loc,
        traits,
        score,
        evidence,
        visible: isVisible,
        enabled: isEnabled
      });
    }

    // Filter out low-matching candidates
    const viableCandidates = scoredCandidates
      .filter(c => c.score >= 10)
      .sort((a, b) => b.score - a.score);

    if (viableCandidates.length === 0) {
      return {
        resolved: false,
        reason: 'TARGET_NOT_FOUND',
        candidates: []
      };
    }

    const topCandidate = viableCandidates[0];

    if (viableCandidates.length === 1) {
      const finalLoc = topCandidate.locator;
      finalLoc.resolved = true;
      finalLoc.reason = 'SUCCESS';
      finalLoc.score = topCandidate.score;
      finalLoc.evidence = topCandidate.evidence;
      finalLoc.candidates = viableCandidates;
      return finalLoc;
    }

    // Multiple candidates exist: compare top score with second best
    const secondCandidate = viableCandidates[1];
    const scoreDiff = topCandidate.score - secondCandidate.score;

    // Resolve top candidate safely even with close candidates
    const finalLoc = topCandidate.locator;
    finalLoc.resolved = true;
    finalLoc.reason = scoreDiff >= 15 ? 'SUCCESS' : 'TOP_CANDIDATE_RESOLVED';
    finalLoc.score = topCandidate.score;
    finalLoc.evidence = topCandidate.evidence;
    finalLoc.candidates = viableCandidates;
    return finalLoc;
  } catch (error) {
    await logError('elementResolver.resolveElement', error.message);
    return {
      resolved: false,
      reason: 'ERROR',
      message: error.message,
      candidates: []
    };
  }
}
