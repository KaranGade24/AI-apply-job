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

    // 0. High-Priority: Target Selector or Target Button provided directly by AI
    const customSelector = analysis?.targetSelector || effectiveRole.targetSelector;
    const customButtonText = effectiveRole.targetButtonText || analysis?.matchedRole?.targetButtonText;

    if (customSelector) {
      const customLoc = page.locator(customSelector).first();
      const isVisible = await customLoc.isVisible().catch(() => false);
      if (isVisible) {
        await logJobEvent('pageNavigator', 'CLICK_AI_TARGET', `Clicking AI identified target: ${customSelector}`);
        let newPagePromise = null;
        if (context) {
          newPagePromise = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
        }

        await customLoc.click().catch(() => {});
        let activePage = page;
        if (newPagePromise) {
          const popupPage = await newPagePromise;
          if (popupPage) {
            await popupPage.waitForLoadState('domcontentloaded').catch(() => {});
            activePage = popupPage;
          }
        }
        await activePage.waitForTimeout(2500);
        return {
          success: true,
          newPage: activePage,
          navigated: true,
          message: `Clicked AI target element: ${customSelector}`,
        };
      }
    }

    // 1. Action: Click Opening Accordion / Role Card and then click its inner "Apply" / "Autofill"
    if (nextRecommendedAction === 'click_opening_apply' || pageType === 'job_listings_accordion' || (analysis?.openingsList && analysis.openingsList.length > 0)) {
      const roleTitle = effectiveRole.title || '';
      let targetApplyBtn = null;
      let activePage = page;
      let clicked = false;

      await logJobEvent('pageNavigator', 'SEARCH_ROLE_CARD', `Searching for opening card matching: "${roleTitle}"`);

      // Strategy 1: Find container holding both the role title and an Apply button
      if (roleTitle) {
        const cardSelectors = [
          `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "${roleTitle.toLowerCase().slice(0, 15)}")]/ancestor-or-self::*[.//button[contains(., "Apply") or contains(., "apply")] or .//a[contains(., "Apply") or contains(., "apply")]][1]`,
          `div:has-text("${roleTitle}")`,
          `section:has-text("${roleTitle}")`,
          `article:has-text("${roleTitle}")`,
          `.card:has-text("${roleTitle}")`,
          `[class*="position" i]:has-text("${roleTitle}")`,
          `[class*="opening" i]:has-text("${roleTitle}")`,
          `[class*="job" i]:has-text("${roleTitle}")`,
        ];

        for (const sel of cardSelectors) {
          try {
            const loc = sel.startsWith('//') ? page.locator(`xpath=${sel}`).first() : page.locator(sel).first();
            if (await loc.isVisible().catch(() => false)) {
              // Click to expand if it's an accordion header
              await loc.click().catch(() => {});
              await page.waitForTimeout(600);

              const innerBtn = loc.locator('button:has-text("Apply"), a:has-text("Apply"), [role="button"]:has-text("Apply"), button, a.btn').first();
              if (await innerBtn.isVisible().catch(() => false)) {
                targetApplyBtn = innerBtn;
                await logJobEvent('pageNavigator', 'MATCHED_ROLE_CARD', `Located dedicated Apply button inside card for: "${roleTitle}"`);
                break;
              }
            }
          } catch {
            // continue
          }
        }
      }

      // Strategy 2: Fallback to role element or generic Apply button locators
      if (!targetApplyBtn) {
        const buttonText = customButtonText || 'Apply';
        const fallbackLocators = [
          page.locator(`[data-automation-id="apply-button"]`).first(),
          page.locator(`button:has-text("${buttonText}")`).first(),
          page.locator(`a:has-text("${buttonText}")`).first(),
          page.locator(`button:has-text("Apply")`).first(),
          page.locator(`a:has-text("Apply")`).first(),
        ];

        for (const loc of fallbackLocators) {
          if (await loc.isVisible().catch(() => false)) {
            targetApplyBtn = loc;
            break;
          }
        }
      }

      if (targetApplyBtn) {
        await logJobEvent('pageNavigator', 'CLICK_APPLY', `Clicking Apply button for ${roleTitle}`);

        let newPagePromise = null;
        if (context) {
          newPagePromise = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
        }

        await targetApplyBtn.scrollIntoViewIfNeeded().catch(() => {});
        await targetApplyBtn.click({ timeout: 5000 }).catch(async () => {
          await targetApplyBtn.click({ force: true, timeout: 3000 });
        });
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

        return {
          success: true,
          newPage: activePage,
          navigated: true,
          message: `Successfully clicked Apply for ${roleTitle}`,
        };
      }
    }

    // 2. Action: Click single Job Description Apply button
    if (nextRecommendedAction === 'click_description_apply' || pageType === 'job_description_page') {
      const applyBtn = page
        .locator('button:has-text("Apply"), a:has-text("Apply"), [role="button"]:has-text("Apply"), [data-automation-id="apply-button"]')
        .first();

      const visible = await applyBtn.isVisible().catch(() => false);
      if (visible) {
        await logJobEvent('pageNavigator', 'CLICK_JD_APPLY', 'Clicking JD Apply button');
        await applyBtn.click().catch(() => {});
        await page.waitForTimeout(2500);
        return { success: true, navigated: true, message: 'Clicked Apply on Job Description page.' };
      }
    }

    // 3. Action: Modal Dialogs (e.g. "Start Your Application", "Autofill with Resume", "Apply Manually")
    if (
      pageType === 'modal_application_form' ||
      analysis?.modalState?.isOpen ||
      analysis?.authGateway?.hasAutofillWithResume ||
      analysis?.authGateway?.hasApplyManually
    ) {
      const modalLocators = [
        page.locator('[data-automation-id="autofill-with-resume"]').first(),
        page.locator('button:has-text("Autofill with Resume")').first(),
        page.locator('a:has-text("Autofill with Resume")').first(),
        page.locator('[data-automation-id="apply-manually"]').first(),
        page.locator('button:has-text("Apply Manually")').first(),
        page.locator('a:has-text("Apply Manually")').first(),
        page.locator('[role="dialog"] button:has-text("Apply")').first(),
        page.locator('.modal button:has-text("Apply")').first(),
      ];

      for (const loc of modalLocators) {
        const visible = await loc.isVisible().catch(() => false);
        if (visible) {
          const locText = (await loc.textContent().catch(() => 'Modal Action')) || 'Modal Action';
          await logJobEvent('pageNavigator', 'CLICK_MODAL_OPTION', `Clicking modal action: "${locText.trim()}"`);
          await loc.click().catch(() => {});
          await page.waitForTimeout(3000);
          return {
            success: true,
            newPage: page,
            navigated: true,
            message: `Clicked modal option: "${locText.trim()}"`,
          };
        }
      }
    }

    // 4. Action: External ATS (Workday, Greenhouse, Lever, SmartRecruiters, Taleo, etc.)
    if (
      nextRecommendedAction === 'fill_form' ||
      nextRecommendedAction === 'click_button' ||
      nextRecommendedAction === 'click_opening_apply' ||
      pageType === 'external_ats' ||
      pageType === 'multi_step_wizard'
    ) {
      const atsApplyLocators = [
        page.locator('[data-automation-id="createAccountSubmitButton"]').first(),
        page.locator('button:has-text("Create Account")').first(),
        page.locator('a:has-text("Create Account")').first(),
        page.locator('[data-automation-id="signInSubmitButton"]').first(),
        page.locator('button:has-text("Sign In")').first(),
        page.locator('a:has-text("Sign In")').first(),
        page.locator('[data-automation-id="autofill-with-resume"]').first(),
        page.locator('button:has-text("Autofill with Resume")').first(),
        page.locator('a:has-text("Autofill with Resume")').first(),
        page.locator('[data-automation-id="apply-manually"]').first(),
        page.locator('button:has-text("Apply Manually")').first(),
        page.locator('a:has-text("Apply Manually")').first(),
        page.locator('[data-automation-id="bottom-navigation-next-button"]').first(),
        page.locator('[data-automation-id="apply-button"]').first(),
        page.locator('a[data-automation-id="apply-button"]').first(),
        page.locator('button:has-text("Apply Now")').first(),
        page.locator('a:has-text("Apply Now")').first(),
        page.locator('button:has-text("Apply")').first(),
        page.locator('a:has-text("Apply")').first(),
        page.locator('[role="button"]:has-text("Apply")').first(),
        page.locator('button:has-text("Next")').first(),
        page.locator('button:has-text("Continue")').first(),
        page.locator('button:has-text("Save & Continue")').first(),
        page.locator('a[href*="apply"]').first(),
      ];

      for (const loc of atsApplyLocators) {
        const visible = await loc.isVisible().catch(() => false);
        if (visible) {
          const btnName = (await loc.textContent().catch(() => 'ATS Action')) || 'ATS Action';
          await logJobEvent('pageNavigator', 'CLICK_ATS_APPLY', `Clicking ATS action: "${btnName.trim()}"`);

          let newPagePromise = null;
          if (context) {
            newPagePromise = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
          }

          await loc.click().catch(() => {});

          let activePage = page;
          if (newPagePromise) {
            const popupPage = await newPagePromise;
            if (popupPage) {
              await popupPage.waitForLoadState('domcontentloaded').catch(() => {});
              activePage = popupPage;
            }
          }

          await activePage.waitForTimeout(3000);
          return {
            success: true,
            newPage: activePage,
            navigated: true,
            message: `Clicked ATS button: "${btnName.trim()}"`,
          };
        }
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
