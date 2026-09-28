import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Detects if a URL is a Google Form link (direct or shortened).
 *
 * Supports:
 *   - https://forms.gle/...
 *   - https://docs.google.com/forms/...
 *   - https://forms.google.com/...
 *
 * @param {string} url
 * @returns {boolean}
 */
export const isGoogleFormUrl = (url = '') => {
  if (!url) return false;
  return (
    /forms\.gle\//i.test(url) ||
    /docs\.google\.com\/forms/i.test(url) ||
    /forms\.google\.com/i.test(url)
  );
};

/**
 * Extracts all form fields from an active Google Form page.
 * Handles standard text, email, paragraph, radio, checkbox, dropdown, file upload, and linear scale.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<Array<object>>} Array of detected field objects
 */
export const extractGoogleFormFields = async (page) => {
  try {
    if (!page || page.isClosed()) return [];

    const fields = await page.evaluate(() => {
      const results = [];

      // Google Form uses [data-params] on each question container
      const questionContainers = document.querySelectorAll(
        '[data-params], .freebirdFormviewerViewItemsItemItem, .Qr7Oae'
      );

      questionContainers.forEach((container, idx) => {
        const labelEl = container.querySelector(
          '[role="heading"], .M7eMe, .freebirdFormviewerViewItemsItemItemTitle, .z12JJ'
        );
        const questionText = (labelEl?.textContent || '').trim().replace(/\s+/g, ' ');
        if (!questionText) return;

        const isRequired = container.querySelector('[aria-required="true"], .vnumgf') !== null
          || (container.textContent || '').includes('*');

        // Detect field type
        let fieldType = 'text';
        let options = [];
        let fieldSelector = '';

        // File upload
        const fileInput = container.querySelector('input[type="file"]');
        if (fileInput) {
          fieldType = 'file';
          fieldSelector = fileInput.id ? `#${fileInput.id}` : 'input[type="file"]';
        }

        // Dropdown (select)
        const selectEl = container.querySelector('select, [role="listbox"]');
        if (!fileInput && selectEl) {
          fieldType = 'dropdown';
          const optionEls = container.querySelectorAll('option, [role="option"]');
          optionEls.forEach((o) => {
            const txt = (o.textContent || o.value || '').trim();
            if (txt && !txt.toLowerCase().includes('choose') && !txt.toLowerCase().includes('select')) {
              options.push(txt);
            }
          });
          fieldSelector = selectEl.id ? `#${selectEl.id}` : '[role="listbox"]';
        }

        // Radio group
        const radioInputs = container.querySelectorAll('[role="radio"], input[type="radio"]');
        if (!fileInput && !selectEl && radioInputs.length > 0) {
          fieldType = 'radio';
          radioInputs.forEach((r) => {
            const lbl = r.getAttribute('aria-label') || r.closest('label')?.textContent || r.value || '';
            const optTxt = lbl.trim();
            if (optTxt && !options.includes(optTxt)) options.push(optTxt);
          });
          fieldSelector = '[role="radio"]';
        }

        // Checkbox group
        const checkboxInputs = container.querySelectorAll('[role="checkbox"], input[type="checkbox"]');
        if (!fileInput && !selectEl && radioInputs.length === 0 && checkboxInputs.length > 0) {
          fieldType = 'checkbox';
          checkboxInputs.forEach((c) => {
            const lbl = c.getAttribute('aria-label') || c.closest('label')?.textContent || c.value || '';
            const optTxt = lbl.trim();
            if (optTxt && !options.includes(optTxt)) options.push(optTxt);
          });
          fieldSelector = '[role="checkbox"]';
        }

        // Textarea (paragraph)
        const textarea = container.querySelector('textarea');
        if (!fileInput && !selectEl && radioInputs.length === 0 && checkboxInputs.length === 0 && textarea) {
          fieldType = 'textarea';
          fieldSelector = textarea.id ? `#${textarea.id}` : 'textarea';
        }

        // Standard text/email/number input
        const textInput = container.querySelector('input:not([type="radio"]):not([type="checkbox"]):not([type="file"])');
        if (!fileInput && !selectEl && radioInputs.length === 0 && checkboxInputs.length === 0 && !textarea && textInput) {
          const inputType = textInput.type || 'text';
          fieldType = inputType === 'email' ? 'email' : inputType === 'number' ? 'number' : 'text';
          fieldSelector = textInput.id ? `#${textInput.id}` : `input[type="${inputType}"]`;
        }

        results.push({
          fieldIndex: idx,
          questionText,
          fieldType,
          options,
          fieldSelector: fieldSelector || `div:nth-child(${idx + 1})`,
          isRequired,
          currentValue: '',
        });
      });

      return results;
    });

    await logJobEvent(
      'googleFormFiller',
      'FIELDS_EXTRACTED',
      `Extracted ${fields.length} fields from Google Form`
    );

    return fields;
  } catch (error) {
    await logError('googleFormFiller.extractGoogleFormFields', error.message);
    return [];
  }
};

/**
 * Uses the LLM to resolve answers for each Google Form field based on candidate info and job context.
 *
 * @param {Array<object>} fields - Detected form fields
 * @param {object} candidateInfo - Candidate resume + personal info
 * @param {object} jobDetails - Job document
 * @param {object} model - LangChain model instance
 * @returns {Promise<Array<{ fieldIndex: number, questionText: string, answer: string, fieldType: string }>>}
 */
export const resolveGoogleFormAnswers = async (fields, candidateInfo, jobDetails, model) => {
  if (!fields || fields.length === 0) return [];

  const prompt = `You are an intelligent job application assistant filling out a Google Form on behalf of a candidate.

CANDIDATE INFORMATION:
- Full Name: ${candidateInfo?.personalInfo?.fullName || candidateInfo?.name || 'Candidate'}
- Email: ${candidateInfo?.personalInfo?.email || candidateInfo?.email || ''}
- Phone: ${candidateInfo?.personalInfo?.phone || candidateInfo?.phone || ''}
- Location: ${candidateInfo?.personalInfo?.location || candidateInfo?.location || ''}
- LinkedIn: ${candidateInfo?.personalInfo?.linkedin || ''}
- GitHub: ${candidateInfo?.personalInfo?.github || ''}
- Summary: ${candidateInfo?.summary || ''}
- Skills: ${JSON.stringify(candidateInfo?.skills || [])}
- Experience: ${JSON.stringify((candidateInfo?.experience || []).slice(0, 3))}
- Education: ${JSON.stringify((candidateInfo?.education || []).slice(0, 2))}

JOB DETAILS:
- Title: ${jobDetails?.title || 'Software Developer'}
- Company: ${jobDetails?.company || 'Company'}
- Description: ${(jobDetails?.description || '').slice(0, 1500)}
- Skills Required: ${JSON.stringify(jobDetails?.skills || [])}

FORM FIELDS (JSON):
${JSON.stringify(fields.map((f) => ({
  fieldIndex: f.fieldIndex,
  questionText: f.questionText,
  fieldType: f.fieldType,
  options: f.options,
  isRequired: f.isRequired,
})), null, 2)}

TASK:
For each field, provide the BEST answer. Rules:
- Use the candidate's real information where available.
- For text/textarea: write thoughtful, professional content aligned to the job.
- For radio/checkbox/dropdown: pick the MOST APPROPRIATE option from the provided options list.
- For file upload (type = "file"): return answer as "__RESUME_FILE__" to indicate resume should be uploaded.
- For questions about years of experience, salary, notice period — provide realistic answers.
- Keep answers concise and professional.

RETURN STRICT JSON ONLY (array):
[
  {
    "fieldIndex": 0,
    "questionText": "Full Name",
    "answer": "John Doe",
    "fieldType": "text"
  }
]`;

  try {
    const response = await model.invoke(prompt);
    const content = (response.content || '').trim();
    const cleaned = content
      .replace(/^```json/i, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    await logError('googleFormFiller.resolveGoogleFormAnswers', error.message);
    // Fallback: create basic answers from candidate info
    const name = candidateInfo?.personalInfo?.fullName || 'Candidate';
    const email = candidateInfo?.personalInfo?.email || '';
    const phone = candidateInfo?.personalInfo?.phone || '';

    return fields.map((f) => {
      let answer = '';
      const q = f.questionText.toLowerCase();
      if (q.includes('name') || q.includes('full name')) answer = name;
      else if (q.includes('email')) answer = email;
      else if (q.includes('phone') || q.includes('mobile') || q.includes('contact')) answer = phone;
      else if (q.includes('experience')) answer = '2+ years';
      else if (f.fieldType === 'file') answer = '__RESUME_FILE__';
      else if (f.options && f.options.length > 0) answer = f.options[0];
      return { fieldIndex: f.fieldIndex, questionText: f.questionText, answer, fieldType: f.fieldType };
    });
  }
};

/**
 * Fills a Google Form page field-by-field using Playwright.
 * Handles text, textarea, radio, checkbox, dropdown, and file upload (resume PDF).
 *
 * @param {import('playwright').Page} page
 * @param {Array<object>} fields - Detected form fields (from extractGoogleFormFields)
 * @param {Array<object>} answers - Resolved answers (from resolveGoogleFormAnswers)
 * @param {string} [resumePdfPath] - Absolute path to resume PDF (for file upload fields)
 * @returns {Promise<{ filledCount: number, skippedCount: number, errors: string[] }>}
 */
export const fillGoogleFormFields = async (page, fields, answers, resumePdfPath = null) => {
  let filledCount = 0;
  let skippedCount = 0;
  const errors = [];

  for (const field of fields) {
    const answerObj = answers.find((a) => a.fieldIndex === field.fieldIndex);
    const answer = answerObj?.answer || '';

    if (!answer && !field.isRequired) {
      skippedCount++;
      continue;
    }

    try {
      if (field.fieldType === 'file') {
        if (resumePdfPath) {
          const fileInput = page.locator('input[type="file"]').first();
          const hasFileInput = await fileInput.count().then((c) => c > 0).catch(() => false);
          if (hasFileInput) {
            await fileInput.setInputFiles(resumePdfPath).catch(async (err) => {
              errors.push(`File upload failed: ${err.message}`);
            });
            filledCount++;
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
        continue;
      }

      if (field.fieldType === 'radio') {
        const radioLocators = [
          page.locator(`[aria-label="${answer}"]`).first(),
          page.locator(`[role="radio"]:has-text("${answer}")`).first(),
          page.locator(`label:has-text("${answer}")`).first(),
        ];
        let clicked = false;
        for (const loc of radioLocators) {
          const visible = await loc.isVisible().catch(() => false);
          if (visible) {
            await loc.click().catch(() => {});
            clicked = true;
            break;
          }
        }
        if (clicked) filledCount++;
        else skippedCount++;
        continue;
      }

      if (field.fieldType === 'checkbox') {
        const checkLocators = [
          page.locator(`[aria-label="${answer}"]`).first(),
          page.locator(`[role="checkbox"]:has-text("${answer}")`).first(),
          page.locator(`label:has-text("${answer}")`).first(),
        ];
        let clicked = false;
        for (const loc of checkLocators) {
          const visible = await loc.isVisible().catch(() => false);
          if (visible) {
            await loc.click().catch(() => {});
            clicked = true;
            break;
          }
        }
        if (clicked) filledCount++;
        else skippedCount++;
        continue;
      }

      if (field.fieldType === 'dropdown') {
        const selectLocator = page.locator('select, [role="listbox"]').nth(field.fieldIndex);
        const isVisible = await selectLocator.isVisible().catch(() => false);
        if (isVisible) {
          await selectLocator.selectOption({ label: answer }).catch(async () => {
            await selectLocator.click().catch(() => {});
            await page.locator(`[role="option"]:has-text("${answer}")`).first().click().catch(() => {});
          });
          filledCount++;
        } else {
          skippedCount++;
        }
        continue;
      }

      if (field.fieldType === 'textarea') {
        const textareaCount = fields.slice(0, fields.indexOf(field) + 1).filter((f) => f.fieldType === 'textarea').length;
        const textarea = page.locator('textarea').nth(textareaCount - 1);
        const isVisible = await textarea.isVisible().catch(() => false);
        if (isVisible) {
          await textarea.click().catch(() => {});
          await textarea.fill(answer).catch(() => {});
          filledCount++;
        } else {
          skippedCount++;
        }
        continue;
      }

      // Default: text/email/number input
      const textTypes = ['text', 'email', 'number'];
      const textFieldCount = fields.slice(0, fields.indexOf(field) + 1).filter((f) => textTypes.includes(f.fieldType)).length;
      const inputType = field.fieldType === 'email' ? 'email' : field.fieldType === 'number' ? 'number' : 'text';
      const inputEl = page.locator(`input[type="${inputType}"]`).nth(textFieldCount - 1);
      const isVisible = await inputEl.isVisible().catch(() => false);
      if (isVisible) {
        await inputEl.click().catch(() => {});
        await inputEl.fill(String(answer)).catch(() => {});
        filledCount++;
      } else {
        // Broader fallback
        const altInput = page.locator('[data-params] input:not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="hidden"])').nth(field.fieldIndex);
        const altVisible = await altInput.isVisible().catch(() => false);
        if (altVisible) {
          await altInput.click().catch(() => {});
          await altInput.fill(String(answer)).catch(() => {});
          filledCount++;
        } else {
          skippedCount++;
        }
      }
    } catch (err) {
      errors.push(`Field "${field.questionText}": ${err.message}`);
      skippedCount++;
    }

    await page.waitForTimeout(300).catch(() => {});
  }

  await logJobEvent(
    'googleFormFiller',
    'FILL_COMPLETE',
    `Filled ${filledCount}/${fields.length} fields. Skipped: ${skippedCount}. Errors: ${errors.length}`
  );

  return { filledCount, skippedCount, errors };
};

/**
 * Attempts to submit a Google Form after filling all fields.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ submitted: boolean, message: string }>}
 */
export const submitGoogleForm = async (page) => {
  try {
    const submitLocators = [
      page.locator('[aria-label="Submit"]').first(),
      page.locator('div[role="button"]:has-text("Submit")').first(),
      page.locator('span:has-text("Submit")').first(),
      page.locator('button[type="submit"]').first(),
    ];

    for (const loc of submitLocators) {
      const visible = await loc.isVisible().catch(() => false);
      if (visible) {
        await loc.click().catch(() => {});
        await page.waitForTimeout(3000).catch(() => {});

        const pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        const isSubmitted =
          pageText.includes('response has been recorded') ||
          pageText.includes('submitted') ||
          pageText.includes('Thank you') ||
          pageText.includes('received your response');

        await logJobEvent(
          'googleFormFiller',
          isSubmitted ? 'SUBMITTED' : 'SUBMIT_UNCONFIRMED',
          isSubmitted
            ? 'Google Form submitted successfully'
            : 'Clicked Submit but could not confirm submission'
        );

        return {
          submitted: isSubmitted,
          message: isSubmitted
            ? 'Google Form submitted successfully'
            : 'Submit clicked but confirmation not detected',
        };
      }
    }

    return { submitted: false, message: 'Submit button not found' };
  } catch (error) {
    await logError('googleFormFiller.submitGoogleForm', error.message);
    return { submitted: false, message: error.message };
  }
};
