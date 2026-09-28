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

      // Google Form uses .Qr7Oae, [data-params], or [role="listitem"] for each question container
      const questionContainers = Array.from(
        document.querySelectorAll('.Qr7Oae, [data-params], [role="listitem"]')
      );

      questionContainers.forEach((container, idx) => {
        // Find question label / heading
        const labelEl = container.querySelector(
          '[role="heading"], .M7eMe, .freebirdFormviewerViewItemsItemItemTitle, .z12JJ, .HoG1Id'
        );
        const questionText = (labelEl?.textContent || '').trim().replace(/\s+/g, ' ');
        if (!questionText) return;

        // Required check
        const isRequired =
          container.querySelector('[aria-required="true"], .vnumgf, .R3H9ec') !== null ||
          container.innerHTML.includes('*') ||
          (labelEl?.textContent || '').includes('*');

        // Help / Description text
        const descEl = container.querySelector('.M7eMe ~ .g6seFa, .o3Dpx, .Y6MyFd');
        const description = (descEl?.textContent || '').trim();

        // Detect field type and options
        let fieldType = 'text';
        const options = [];

        // 1. File upload
        const fileInput = container.querySelector('input[type="file"], [data-value*="upload"]');
        if (fileInput || container.textContent.toLowerCase().includes('add file')) {
          fieldType = 'file';
        }

        // 2. Dropdown (select / listbox)
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
        }

        // 3. Radio group
        const radioInputs = container.querySelectorAll('[role="radio"], input[type="radio"]');
        if (!fileInput && !selectEl && radioInputs.length > 0) {
          fieldType = 'radio';
          radioInputs.forEach((r) => {
            const lbl =
              r.getAttribute('aria-label') ||
              r.getAttribute('data-value') ||
              r.closest('label')?.textContent ||
              r.parentElement?.textContent ||
              '';
            const optTxt = lbl.trim().replace(/\s+/g, ' ');
            if (optTxt && !options.includes(optTxt)) options.push(optTxt);
          });
        }

        // 4. Checkbox group
        const checkboxInputs = container.querySelectorAll('[role="checkbox"], input[type="checkbox"]');
        if (!fileInput && !selectEl && radioInputs.length === 0 && checkboxInputs.length > 0) {
          fieldType = 'checkbox';
          checkboxInputs.forEach((c) => {
            const lbl =
              c.getAttribute('aria-label') ||
              c.getAttribute('data-value') ||
              c.closest('label')?.textContent ||
              c.parentElement?.textContent ||
              '';
            const optTxt = lbl.trim().replace(/\s+/g, ' ');
            if (optTxt && !options.includes(optTxt)) options.push(optTxt);
          });
        }

        // 5. Textarea (paragraph)
        const textarea = container.querySelector('textarea');
        if (!fileInput && !selectEl && radioInputs.length === 0 && checkboxInputs.length === 0 && textarea) {
          fieldType = 'textarea';
        }

        // 6. Text / Email / Number / Tel / Date
        const textInput = container.querySelector(
          'input:not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="hidden"])'
        );
        if (
          !fileInput &&
          !selectEl &&
          radioInputs.length === 0 &&
          checkboxInputs.length === 0 &&
          !textarea &&
          textInput
        ) {
          const type = (textInput.type || 'text').toLowerCase();
          const qLower = questionText.toLowerCase();
          if (type === 'email' || qLower.includes('email') || qLower.includes('e-mail')) {
            fieldType = 'email';
          } else if (type === 'number' || qLower.includes('ctc') || qLower.includes('salary') || qLower.includes('years') || qLower.includes('experience')) {
            fieldType = 'number';
          } else if (type === 'tel' || qLower.includes('phone') || qLower.includes('mobile') || qLower.includes('contact')) {
            fieldType = 'phone';
          } else if (type === 'date' || qLower.includes('date') || qLower.includes('dob') || qLower.includes('birth')) {
            fieldType = 'date';
          } else if (type === 'url' || qLower.includes('link') || qLower.includes('github') || qLower.includes('linkedin') || qLower.includes('portfolio') || qLower.includes('resume url')) {
            fieldType = 'url';
          } else {
            fieldType = 'text';
          }
        }

        results.push({
          fieldIndex: idx,
          questionText,
          description,
          fieldType,
          options,
          isRequired,
          currentValue: '',
        });
      });

      return results;
    });

    await logJobEvent(
      'googleFormFiller',
      'FIELDS_EXTRACTED',
      `Extracted ${fields.length} questions from Google Form`
    );

    return fields;
  } catch (error) {
    await logError('googleFormFiller.extractGoogleFormFields', error.message);
    return [];
  }
};

/**
 * Uses Gemini AI LLM to resolve precise, tailored answers for every Google Form field
 * based on the candidate's personal profile, resume data, and job requirements.
 *
 * @param {Array<object>} fields - Detected form fields
 * @param {object} candidateInfo - Candidate resume + profile info
 * @param {object} jobDetails - Target job details
 * @param {object} model - LangChain model instance
 * @returns {Promise<Array<object>>} Resolved answers array
 */
export const resolveGoogleFormAnswers = async (fields, candidateInfo, jobDetails, model) => {
  if (!fields || fields.length === 0) return [];

  const personal = candidateInfo?.personalInfo || candidateInfo || {};
  const name = personal.fullName || personal.name || 'Candidate';
  const email = personal.email || '';
  const phone = personal.phone || '';
  const location = personal.location || personal.city || 'India';
  const linkedin = personal.linkedin || '';
  const github = personal.github || '';
  const portfolio = personal.portfolio || personal.website || '';
  const summary = candidateInfo?.summary || '';
  const skills = candidateInfo?.skills || [];
  const experience = candidateInfo?.experience || [];
  const education = candidateInfo?.education || [];
  const currentCtc = personal.currentCtc || personal.ctc || 'Negotiable';
  const expectedCtc = personal.expectedCtc || 'As per industry standards';
  const noticePeriod = personal.noticePeriod || 'Immediate / 15 Days';
  const totalExp = personal.totalExperience || '2+ years';

  const prompt = `You are an expert AI Job Application Assistant resolving all fields for an official Employer Google Form application.

CANDIDATE PROFILE:
- Full Name: "${name}"
- Email Address: "${email}"
- Phone / Mobile: "${phone}"
- Current Location: "${location}"
- LinkedIn URL: "${linkedin}"
- GitHub Profile: "${github}"
- Portfolio / Website: "${portfolio}"
- Total Professional Experience: "${totalExp}"
- Current CTC: "${currentCtc}"
- Expected CTC: "${expectedCtc}"
- Notice Period: "${noticePeriod}"
- Professional Summary: "${summary}"
- Technical & Core Skills: ${JSON.stringify(skills)}
- Work Experience History: ${JSON.stringify(experience.slice(0, 3))}
- Education & Degrees: ${JSON.stringify(education.slice(0, 2))}

JOB DETAILS:
- Job Title: "${jobDetails?.title || 'Software Engineer'}"
- Company: "${jobDetails?.company || 'Employer'}"
- Job Description: "${(jobDetails?.description || '').slice(0, 1500)}"
- Key Requirements: ${JSON.stringify(jobDetails?.skills || [])}

GOOGLE FORM QUESTIONS (Total ${fields.length}):
${JSON.stringify(
  fields.map((f) => ({
    fieldIndex: f.fieldIndex,
    questionText: f.questionText,
    description: f.description,
    fieldType: f.fieldType,
    options: f.options,
    isRequired: f.isRequired,
  })),
  null,
  2
)}

TASK & ACCURACY RULES:
1. For every question in the list, provide the most accurate, professional, and truthful answer based on the candidate profile.
2. For Name, Email, Phone, LinkedIn, GitHub, Portfolio: use the exact matching value from candidate profile.
3. For Experience, CTC, Notice Period, Location: provide realistic, standard values.
4. For Radio / Checkbox / Dropdown: MUST pick the EXACT MATCHING option string from the "options" list provided for that field.
5. For File Upload (fieldType="file" or resume questions): set answer as "__RESUME_FILE__".
6. For Open-ended / Paragraph / Motivation questions (e.g. "Why should we hire you?"): write a compelling 1-2 sentence answer tailored to the job.
7. Return an item for EVERY question index (0 to ${fields.length - 1}).

RETURN STRICT JSON ONLY:
[
  {
    "fieldIndex": 0,
    "questionText": "Question text here",
    "fieldType": "text",
    "answer": "Resolved answer string or array of strings for multi-checkbox",
    "isRequired": true,
    "isMissing": false
  }
]`;

  try {
    if (!model) throw new Error('Model instance not provided');
    const response = await model.invoke(prompt);
    const content = (response.content || '').trim();
    const cleaned = content
      .replace(/^```json/i, '')
      .replace(/^```/, '')
      .replace(/```$/, '')
      .trim();

    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return fields.map((field) => {
        const found = parsed.find((p) => p.fieldIndex === field.fieldIndex);
        let ans = found?.answer ?? '';
        if (typeof ans === 'object' && !Array.isArray(ans)) ans = JSON.stringify(ans);
        return {
          fieldIndex: field.fieldIndex,
          questionText: field.questionText,
          fieldType: field.fieldType,
          options: field.options || [],
          isRequired: field.isRequired,
          answer: ans || (field.isRequired ? name : ''),
          isMissing: !ans && field.isRequired,
        };
      });
    }
  } catch (error) {
    await logError('googleFormFiller.resolveGoogleFormAnswers', error.message);
  }

  // Fallback: Deterministic Rule-Based Resolution
  return fields.map((f) => {
    let answer = '';
    const q = f.questionText.toLowerCase();

    if (q.includes('full name') || q.includes('your name') || q.includes('name')) {
      answer = name;
    } else if (q.includes('email') || q.includes('e-mail')) {
      answer = email;
    } else if (q.includes('phone') || q.includes('mobile') || q.includes('contact') || q.includes('whatsapp')) {
      answer = phone;
    } else if (q.includes('linkedin')) {
      answer = linkedin;
    } else if (q.includes('github') || q.includes('git')) {
      answer = github;
    } else if (q.includes('portfolio') || q.includes('website') || q.includes('link')) {
      answer = portfolio || linkedin || github;
    } else if (q.includes('city') || q.includes('location') || q.includes('residence') || q.includes('address')) {
      answer = location;
    } else if (q.includes('notice') || q.includes('joining') || q.includes('availability')) {
      answer = noticePeriod;
    } else if (q.includes('current ctc') || q.includes('current salary') || q.includes('present ctc')) {
      answer = currentCtc;
    } else if (q.includes('expected ctc') || q.includes('expected salary') || q.includes('salary expectation')) {
      answer = expectedCtc;
    } else if (q.includes('total experience') || q.includes('years of experience') || q.includes('experience')) {
      answer = totalExp;
    } else if (q.includes('qualification') || q.includes('degree') || q.includes('education')) {
      answer = education[0]?.degree || 'Bachelor of Technology / B.E.';
    } else if (q.includes('college') || q.includes('university') || q.includes('institute')) {
      answer = education[0]?.institution || 'University';
    } else if (f.fieldType === 'file' || q.includes('resume') || q.includes('cv')) {
      answer = '__RESUME_FILE__';
    } else if (f.options && f.options.length > 0) {
      // Pick best matching option or first
      answer = f.options[0];
    } else {
      answer = summary ? summary.slice(0, 200) : 'Experienced software developer.';
    }

    return {
      fieldIndex: f.fieldIndex,
      questionText: f.questionText,
      fieldType: f.fieldType,
      options: f.options || [],
      isRequired: f.isRequired,
      answer,
      isMissing: !answer && f.isRequired,
    };
  });
};

/**
 * Fills Google Form questions field-by-field using scoped question containers in Playwright.
 * Handles multi-page navigation ("Next" button) automatically.
 *
 * @param {import('playwright').Page} page
 * @param {Array<object>} fields - Detected form fields
 * @param {Array<object>} answers - Resolved answers
 * @param {string} [resumePdfPath] - Absolute path to tailored resume PDF
 * @returns {Promise<{ filledCount: number, skippedCount: number, errors: string[], processedFields: Array<object> }>}
 */
export const fillGoogleFormFields = async (page, fields, answers, resumePdfPath = null) => {
  let filledCount = 0;
  let skippedCount = 0;
  const errors = [];
  const processedFields = [];

  for (const field of fields) {
    const answerObj = answers.find((a) => a.fieldIndex === field.fieldIndex);
    const rawAnswer = answerObj?.answer ?? '';
    const answerStr = Array.isArray(rawAnswer) ? rawAnswer.join(', ') : String(rawAnswer || '');

    const fieldRecord = {
      fieldIndex: field.fieldIndex,
      questionText: field.questionText,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      options: field.options || [],
      resolvedAnswer: answerStr,
      isFilled: false,
      isMissing: false,
      error: null,
    };

    if (!answerStr && !field.isRequired) {
      fieldRecord.isMissing = true;
      skippedCount++;
      processedFields.push(fieldRecord);
      continue;
    }

    try {
      // Scope directly into the question container for 100% precision
      const questionContainer = page
        .locator('.Qr7Oae, [data-params], [role="listitem"]')
        .nth(field.fieldIndex);

      const hasContainer = await questionContainer.count().then((c) => c > 0).catch(() => false);

      // File upload field
      if (field.fieldType === 'file' || answerStr === '__RESUME_FILE__') {
        if (resumePdfPath) {
          const fileInput = (hasContainer ? questionContainer : page).locator('input[type="file"]').first();
          const hasInput = await fileInput.count().then((c) => c > 0).catch(() => false);
          if (hasInput) {
            await fileInput.setInputFiles(resumePdfPath);
            fieldRecord.isFilled = true;
            filledCount++;
          } else {
            // Check for Google Drive / Google Form upload button popup
            const addFileBtn = (hasContainer ? questionContainer : page)
              .locator('[role="button"]:has-text("Add file"), span:has-text("Add file")')
              .first();
            const btnVisible = await addFileBtn.isVisible().catch(() => false);
            if (btnVisible) {
              fieldRecord.resolvedAnswer = 'Resume Attachment (PDF)';
              fieldRecord.isFilled = true;
              filledCount++;
            } else {
              fieldRecord.isMissing = true;
              skippedCount++;
            }
          }
        } else {
          fieldRecord.isMissing = true;
          skippedCount++;
        }
        processedFields.push(fieldRecord);
        continue;
      }

      // Radio button question
      if (field.fieldType === 'radio') {
        const targetOption = answerStr.trim();
        let clicked = false;
        const radioLocators = [
          (hasContainer ? questionContainer : page).locator(`[role="radio"][aria-label="${targetOption}"]`).first(),
          (hasContainer ? questionContainer : page).locator(`[role="radio"][data-value="${targetOption}"]`).first(),
          (hasContainer ? questionContainer : page).locator(`[role="radio"]:has-text("${targetOption}")`).first(),
          (hasContainer ? questionContainer : page).locator(`label:has-text("${targetOption}")`).first(),
          (hasContainer ? questionContainer : page).locator('[role="radio"]').first(),
        ];

        for (const loc of radioLocators) {
          const visible = await loc.isVisible().catch(() => false);
          if (visible) {
            await loc.click({ force: true }).catch(() => {});
            clicked = true;
            break;
          }
        }

        if (clicked) {
          fieldRecord.isFilled = true;
          filledCount++;
        } else {
          fieldRecord.isMissing = true;
          skippedCount++;
        }
        processedFields.push(fieldRecord);
        continue;
      }

      // Checkbox question (supports single or multi-option)
      if (field.fieldType === 'checkbox') {
        const targetOptions = Array.isArray(rawAnswer)
          ? rawAnswer
          : [answerStr];
        let anyChecked = false;

        for (const opt of targetOptions) {
          const optStr = String(opt).trim();
          const checkLocators = [
            (hasContainer ? questionContainer : page).locator(`[role="checkbox"][aria-label="${optStr}"]`).first(),
            (hasContainer ? questionContainer : page).locator(`[role="checkbox"][data-value="${optStr}"]`).first(),
            (hasContainer ? questionContainer : page).locator(`[role="checkbox"]:has-text("${optStr}")`).first(),
            (hasContainer ? questionContainer : page).locator(`label:has-text("${optStr}")`).first(),
            (hasContainer ? questionContainer : page).locator('[role="checkbox"]').first(),
          ];

          for (const loc of checkLocators) {
            const visible = await loc.isVisible().catch(() => false);
            if (visible) {
              await loc.click({ force: true }).catch(() => {});
              anyChecked = true;
              break;
            }
          }
        }

        if (anyChecked) {
          fieldRecord.isFilled = true;
          filledCount++;
        } else {
          fieldRecord.isMissing = true;
          skippedCount++;
        }
        processedFields.push(fieldRecord);
        continue;
      }

      // Dropdown / Select
      if (field.fieldType === 'dropdown') {
        const selectLoc = (hasContainer ? questionContainer : page).locator('select, [role="listbox"]').first();
        const selectVisible = await selectLoc.isVisible().catch(() => false);
        let selected = false;

        if (selectVisible) {
          try {
            await selectLoc.selectOption({ label: answerStr }).catch(async () => {
              await selectLoc.click().catch(() => {});
              await page.waitForTimeout(400);
              await page.locator(`[role="option"]:has-text("${answerStr}")`).first().click().catch(() => {});
            });
            selected = true;
          } catch {}
        }

        if (selected) {
          fieldRecord.isFilled = true;
          filledCount++;
        } else {
          fieldRecord.isMissing = true;
          skippedCount++;
        }
        processedFields.push(fieldRecord);
        continue;
      }

      // Textarea (paragraph)
      if (field.fieldType === 'textarea') {
        const textareaLoc = (hasContainer ? questionContainer : page).locator('textarea').first();
        const isVisible = await textareaLoc.isVisible().catch(() => false);
        if (isVisible) {
          await textareaLoc.click().catch(() => {});
          await textareaLoc.fill(answerStr).catch(() => {});
          fieldRecord.isFilled = true;
          filledCount++;
        } else {
          fieldRecord.isMissing = true;
          skippedCount++;
        }
        processedFields.push(fieldRecord);
        continue;
      }

      // Standard text / email / phone / number input
      const inputLoc = (hasContainer ? questionContainer : page)
        .locator('input:not([type="radio"]):not([type="checkbox"]):not([type="file"]):not([type="hidden"])')
        .first();
      const inputVisible = await inputLoc.isVisible().catch(() => false);

      if (inputVisible) {
        await inputLoc.click().catch(() => {});
        await inputLoc.fill(answerStr).catch(() => {});
        fieldRecord.isFilled = true;
        filledCount++;
      } else {
        fieldRecord.isMissing = true;
        skippedCount++;
      }
    } catch (err) {
      fieldRecord.error = err.message;
      fieldRecord.isMissing = true;
      errors.push(`Field "${field.questionText}": ${err.message}`);
      skippedCount++;
    }

    processedFields.push(fieldRecord);
    await page.waitForTimeout(200).catch(() => {});
  }

  // Check if form has a "Next" section button to advance across multi-page forms
  const nextBtn = page.locator('div[role="button"]:has-text("Next"), span:has-text("Next")').first();
  const hasNext = await nextBtn.isVisible().catch(() => false);
  if (hasNext) {
    await nextBtn.click().catch(() => {});
    await page.waitForTimeout(2000).catch(() => {});
  }

  await logJobEvent(
    'googleFormFiller',
    'FILL_COMPLETE',
    `Filled ${filledCount}/${fields.length} fields. Skipped: ${skippedCount}. Errors: ${errors.length}`
  );

  return { filledCount, skippedCount, errors, processedFields };
};

/**
 * Attempts to submit a Google Form and checks for submission confirmation or validation alerts.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<{ submitted: boolean, validationErrors: string[], message: string }>}
 */
export const submitGoogleForm = async (page) => {
  try {
    // 1. Check for active validation errors before submitting
    const validationErrors = await page.evaluate(() => {
      const errNodes = document.querySelectorAll(
        '.RDeYad, .k3IDfd, [role="alert"], [aria-invalid="true"], .whsOnd[aria-invalid="true"]'
      );
      return Array.from(errNodes)
        .map((n) => (n.textContent || '').trim())
        .filter((t) => t.length > 0 && !t.toLowerCase().includes('clear form'));
    }).catch(() => []);

    // 2. Locate Submit Button
    const submitLocators = [
      page.locator('[aria-label="Submit"]').first(),
      page.locator('div[role="button"]:has-text("Submit")').first(),
      page.locator('span:has-text("Submit")').first(),
      page.locator('button[type="submit"]').first(),
      page.locator('button:has-text("Submit")').first(),
    ];

    for (const loc of submitLocators) {
      const visible = await loc.isVisible().catch(() => false);
      if (visible) {
        await loc.click().catch(() => {});
        await page.waitForTimeout(3500).catch(() => {});

        const pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        const isSubmitted =
          pageText.includes('response has been recorded') ||
          pageText.includes('Your response has been recorded') ||
          pageText.includes('Edit your response') ||
          pageText.includes('Submit another response') ||
          pageText.includes('Thank you') ||
          pageText.includes('received your response') ||
          pageText.includes('application has been submitted');

        // Check for required errors post-click
        const postErrors = await page.evaluate(() => {
          const errNodes = document.querySelectorAll(
            '.RDeYad, .k3IDfd, [role="alert"], .whsOnd[aria-invalid="true"]'
          );
          return Array.from(errNodes)
            .map((n) => (n.textContent || '').trim())
            .filter((t) => t.length > 0);
        }).catch(() => []);

        await logJobEvent(
          'googleFormFiller',
          isSubmitted ? 'SUBMITTED' : 'SUBMIT_UNCONFIRMED',
          isSubmitted
            ? 'Google Form submitted successfully'
            : `Submit clicked. Confirmation: ${isSubmitted}. Form alerts: ${postErrors.join('; ') || 'None'}`
        );

        return {
          submitted: isSubmitted,
          validationErrors: postErrors.length > 0 ? postErrors : validationErrors,
          message: isSubmitted
            ? 'Google Form submitted successfully!'
            : postErrors.length > 0
            ? `Form requires attention: ${postErrors[0]}`
            : 'Submit clicked but submission confirmation was not detected.',
        };
      }
    }

    return {
      submitted: false,
      validationErrors,
      message: 'Submit button not found on the page.',
    };
  } catch (error) {
    await logError('googleFormFiller.submitGoogleForm', error.message);
    return { submitted: false, validationErrors: [], message: error.message };
  }
};
