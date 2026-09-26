import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Executes navigation and interaction on the employer careers portal based on the AI LLM analysis
 * or a specific role selected by the candidate.
 * Handles accordions, opening cards, inner "Apply Now" buttons, and popups.
 *
 * @param {import('playwright').Page} page
 * @param {object} analysis - The structured analysis output from classifyPageWithLlm
 * @param {object} [context] - Browser context to handle any new tabs opened
 * @param {object} [specificRoleOverride] - Optional specific role selected by user ({ title, referenceId, targetButtonText })
 * @returns {Promise<{ success: boolean, newPage?: import('playwright').Page, navigated: boolean, message: string }>}
 */
export const navigatePortalWithAiDecision = async (page, analysis, context = null, specificRoleOverride = null) => {
  try {
    if (!page || page.isClosed()) {
      return { success: false, navigated: false, message: 'Page is closed or not available' };
    }

    const effectiveRole = specificRoleOverride || analysis?.matchedRole || {};
    const nextRecommendedAction = specificRoleOverride ? 'click_opening_apply' : (analysis?.nextRecommendedAction || 'click_opening_apply');
    const pageType = analysis?.pageType || 'job_listings_accordion';

    await logJobEvent(
      'pageNavigator',
      'NAVIGATE_START',
      `Executing action: "${nextRecommendedAction}" for role: "${effectiveRole.title || 'Unknown'}" (Ref ID: ${effectiveRole.referenceId || 'N/A'})`
    );

    // 1. Action: Click Opening Accordion / Role Card and then click its inner "Apply Now"
    if (nextRecommendedAction === 'click_opening_apply' || pageType === 'job_listings_accordion') {
      const roleTitle = effectiveRole.title || '';
      let targetElement = null;

      // Step A: Locate the matching role element / accordion header
      if (roleTitle) {
        const titleLocators = [
          page.locator(`text="${roleTitle}"`).first(),
          page.locator(`:has-text("${roleTitle}")`).first(),
          page.locator(`h1, h2, h3, h4, h5, button, a, div[class*="title" i], div[class*="header" i]`).filter({ hasText: roleTitle }).first(),
        ];

        for (const loc of titleLocators) {
          const visible = await loc.isVisible().catch(() => false);
          if (visible) {
            targetElement = loc;
            break;
          }
        }
      }

      // If matched role element found, click it to expand if accordion
      if (targetElement) {
        await logJobEvent('pageNavigator', 'CLICK_ROLE', `Expanding role card: "${roleTitle}"`);
        await targetElement.click().catch(() => {});
        await page.waitForTimeout(1200);
      }

      // Step B: Locate the inner "Apply Now" or "Apply" button
      const buttonText = effectiveRole.targetButtonText || 'Apply Now';
      const applyBtnLocators = [
        // Inside parent container of matched role
        targetElement
          ? targetElement
              .locator('..')
              .locator('..')
              .locator(`button:has-text("${buttonText}"), a:has-text("${buttonText}"), [role="button"]:has-text("${buttonText}")`)
              .first()
          : null,
        targetElement
          ? targetElement
              .locator('..')
              .locator(`button:has-text("${buttonText}"), a:has-text("${buttonText}"), [role="button"]:has-text("${buttonText}")`)
              .first()
          : null,
        page.locator(`button:has-text("${buttonText}")`).first(),
        page.locator(`a:has-text("${buttonText}")`).first(),
        page.locator(`[role="button"]:has-text("${buttonText}")`).first(),
        page.locator(`text="${buttonText}"`).first(),
        page.locator(`button:has-text("Apply")`).first(),
        page.locator(`a:has-text("Apply")`).first(),
      ].filter(Boolean);

      let clicked = false;
      let activePage = page;

      for (const btnLoc of applyBtnLocators) {
        const visible = await btnLoc.isVisible().catch(() => false);
        if (visible) {
          await logJobEvent('pageNavigator', 'CLICK_APPLY', `Clicking inner button: "${buttonText}" for ${roleTitle}`);

          // Prepare to capture any new page / popup if company site uses target="_blank"
          let newPagePromise = null;
          if (context) {
            newPagePromise = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
          }

          await btnLoc.click().catch(() => {});
          clicked = true;

          if (newPagePromise) {
            const popupPage = await newPagePromise;
            if (popupPage) {
              await popupPage.waitForLoadState('domcontentloaded').catch(() => {});
              activePage = popupPage;
              await logJobEvent('pageNavigator', 'POPUP_OPENED', `New portal tab opened: ${popupPage.url()}`);
            }
          }

          await activePage.waitForTimeout(2500);
          break;
        }
      }

      if (clicked) {
        return {
          success: true,
          newPage: activePage,
          navigated: true,
          message: `Successfully clicked "${buttonText}" for ${roleTitle}`,
        };
      }

      return {
        success: false,
        navigated: false,
        message: `Expanded "${roleTitle}", but could not locate inner "${buttonText}" button.`,
      };
    }

    // 2. Action: Click single Job Description Apply button
    if (nextRecommendedAction === 'click_description_apply' || pageType === 'job_description_page') {
      const applyBtn = page
        .locator('button:has-text("Apply"), a:has-text("Apply"), [role="button"]:has-text("Apply")')
        .first();

      const visible = await applyBtn.isVisible().catch(() => false);
      if (visible) {
        await logJobEvent('pageNavigator', 'CLICK_JD_APPLY', 'Clicking JD Apply button');
        await applyBtn.click().catch(() => {});
        await page.waitForTimeout(2500);
        return { success: true, navigated: true, message: 'Clicked Apply on Job Description page.' };
      }
    }

    return {
      success: true,
      navigated: false,
      message: `No immediate navigation needed for action: ${nextRecommendedAction}`,
    };
  } catch (error) {
    await logError('pageNavigator.navigatePortalWithAiDecision', error.message);
    return {
      success: false,
      navigated: false,
      message: `Error during navigation: ${error.message}`,
    };
  }
};
