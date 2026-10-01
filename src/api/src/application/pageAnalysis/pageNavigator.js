import { logJobEvent, logError } from '../../utils/logger.js';
import { waitForSettled } from '../../browser/session/sessionRegistry.js';

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
<<<<<<< HEAD
        await activePage.waitForTimeout(2500);
=======
      }

      // If matched role element found, click it to expand if accordion
      if (targetElement) {
        await logJobEvent('pageNavigator', 'CLICK_ROLE', `Expanding role card: "${roleTitle}"`);
        await targetElement.click().catch(() => {});
        await waitForSettled(page);
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

          await waitForSettled(activePage);
          break;
        }
      }

      if (clicked) {
>>>>>>> 1d429e22336b7068910ecf5c700f23abff096a1b
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
      let activePage = page;

      await logJobEvent('pageNavigator', 'SEARCH_ROLE_CARD', `Locating & clicking opening card for: "${roleTitle}"`);

      let newPagePromise = null;
      if (context) {
        newPagePromise = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
      }

      // Execute instantaneous, deeply-scoped DOM traversal to locate the exact card container and click its Apply button
      const domResult = await page.evaluate((targetTitle) => {
        const normTarget = (targetTitle || '').toLowerCase().trim();
        const allElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, span, p, div, a, button'));
        
        // Find elements containing the target role words
        const matchingElements = allElements.filter((el) => {
          const txt = (el.textContent || '').trim().toLowerCase();
          return (
            (txt.includes(normTarget) || (normTarget.length > 8 && txt.includes(normTarget.slice(0, 10)))) &&
            txt.length < 150
          );
        });

        // Sort by shortest text length to isolate the exact title header/element
        matchingElements.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);

        for (const matchEl of matchingElements) {
          let container = matchEl;
          for (let i = 0; i < 7 && container && container !== document.body; i++) {
            const btn = Array.from(container.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]')).find((b) => {
              const text = (b.textContent || b.value || b.getAttribute('aria-label') || '').toLowerCase().trim();
              const href = (b.getAttribute('href') || '').toLowerCase();
              return text === 'apply' || text.includes('apply') || href.includes('mailto:') || href.includes('apply');
            });

            if (btn) {
              const href = btn.getAttribute('href') || '';
              const btnText = (btn.textContent || btn.value || '').trim();
              btn.scrollIntoView({ behavior: 'instant', block: 'center' });
              btn.click();
              return {
                clicked: true,
                href,
                btnText,
                isMailto: href.toLowerCase().startsWith('mailto:'),
                matchedTitle: (matchEl.textContent || '').trim(),
              };
            }
            container = container.parentElement;
          }
        }

        // Fallback: Click any visible button or link with text 'Apply'
        const allApplyButtons = Array.from(document.querySelectorAll('button, a, [role="button"]')).filter((b) => {
          const text = (b.textContent || b.value || '').toLowerCase().trim();
          const href = (b.getAttribute('href') || '').toLowerCase();
          return text === 'apply' || text.includes('apply now') || href.includes('mailto:');
        });

        if (allApplyButtons.length > 0) {
          allApplyButtons[0].scrollIntoView({ behavior: 'instant', block: 'center' });
          allApplyButtons[0].click();
          const href = allApplyButtons[0].getAttribute('href') || '';
          return {
            clicked: true,
            href,
            btnText: allApplyButtons[0].textContent.trim(),
            isMailto: href.toLowerCase().startsWith('mailto:'),
            matchedTitle: 'Generic Apply Button',
          };
        }

        return { clicked: false };
      }, roleTitle);

      if (domResult.clicked) {
        await logJobEvent(
          'pageNavigator',
          'CLICK_APPLY_SUCCESS',
          `Clicked Apply for "${roleTitle}" (Mailto: ${domResult.isMailto}, Href: ${domResult.href || 'none'})`
        );

        if (newPagePromise) {
          const popupPage = await newPagePromise;
          if (popupPage) {
            await popupPage.waitForLoadState('domcontentloaded').catch(() => {});
            activePage = popupPage;
            await logJobEvent('pageNavigator', 'POPUP_OPENED', `New portal tab opened: ${popupPage.url()}`);
          }
        }

        await activePage.waitForTimeout(1500);

        // Check if a 2-stage modal/dialog opened (Job Details Dialog containing an inner Apply button)
        const innerModalApply = await activePage.evaluate(() => {
          // Check if there are currently any visible form inputs
          const visibleInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select')).filter((el) => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
          });

          // If NO form inputs are open yet, but an inner Apply button is visible (e.g. green APPLY button in JD modal):
          if (visibleInputs.length === 0) {
            const allButtons = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"]')).filter((b) => {
              const style = window.getComputedStyle(b);
              const text = (b.textContent || b.value || '').trim();
              const isVis = style.display !== 'none' && style.visibility !== 'hidden' && b.offsetHeight > 0;
              return isVis && (/^apply$/i.test(text) || /^apply now$/i.test(text) || /^apply for this/i.test(text));
            });

            if (allButtons.length > 0) {
              const targetBtn = allButtons[allButtons.length - 1]; // Pick the topmost / inner modal button
              targetBtn.scrollIntoView({ behavior: 'instant', block: 'center' });
              targetBtn.click();
              return { clickedInner: true, btnText: targetBtn.textContent.trim() };
            }
          }
          return { clickedInner: false };
        });

        if (innerModalApply.clickedInner) {
          await logJobEvent(
            'pageNavigator',
            'CLICK_MODAL_APPLY',
            `Clicked inner modal Apply button: "${innerModalApply.btnText}" to open Application Form`
          );
          await activePage.waitForTimeout(2000);
        }

        return {
          success: true,
          newPage: activePage,
          navigated: true,
          isMailto: Boolean(domResult.isMailto),
          mailtoUrl: domResult.isMailto ? domResult.href : null,
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
        await waitForSettled(page);
        return { success: true, navigated: true, message: 'Clicked Apply on Job Description page.' };
      }
    }

    // 3. Action: Modal Dialogs (e.g. "Start Your Application", "Autofill with Resume", "Apply Manually", or JD Modal "APPLY")
    if (
      pageType === 'modal_application_form' ||
      nextRecommendedAction === 'fill_form' ||
      analysis?.modalState?.isOpen ||
      analysis?.authGateway?.hasAutofillWithResume ||
      analysis?.authGateway?.hasApplyManually
    ) {
      // Check if there is an inner Apply button visible (like the green APPLY button in JD modal)
      const clickedInner = await page.evaluate(() => {
        const visibleInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), textarea, select')).filter((el) => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetHeight > 0;
        });

        // If no inputs yet on screen, click any visible button with text APPLY
        if (visibleInputs.length === 0) {
          const allButtons = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="button"]')).filter((b) => {
            const style = window.getComputedStyle(b);
            const text = (b.textContent || b.value || '').trim();
            const isVis = style.display !== 'none' && style.visibility !== 'hidden' && b.offsetHeight > 0;
            return isVis && (/^apply$/i.test(text) || /^apply now$/i.test(text) || /^apply for this/i.test(text));
          });

          if (allButtons.length > 0) {
            const btn = allButtons[allButtons.length - 1];
            btn.scrollIntoView({ behavior: 'instant', block: 'center' });
            btn.click();
            return { clicked: true, text: btn.textContent.trim() };
          }
        }
        return { clicked: false };
      });

      if (clickedInner.clicked) {
        await logJobEvent('pageNavigator', 'CLICK_MODAL_APPLY', `Clicked inner modal Apply button: "${clickedInner.text}"`);
        await page.waitForTimeout(2500);
        return {
          success: true,
          newPage: page,
          navigated: true,
          message: `Clicked inner modal Apply button: "${clickedInner.text}"`,
        };
      }

      const modalLocators = [
        page.locator('[data-automation-id="autofill-with-resume"]').first(),
        page.locator('button:has-text("Autofill with Resume")').first(),
        page.locator('a:has-text("Autofill with Resume")').first(),
        page.locator('[data-automation-id="apply-manually"]').first(),
        page.locator('button:has-text("Apply Manually")').first(),
        page.locator('a:has-text("Apply Manually")').first(),
        page.locator('[role="dialog"] button:has-text("Apply")').first(),
        page.locator('.modal button:has-text("Apply")').first(),
        page.locator('button:has-text("APPLY")').first(),
        page.locator('button:has-text("Apply")').first(),
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
