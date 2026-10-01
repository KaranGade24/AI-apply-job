import { describe, it } from 'node:test';
import assert from 'node:assert';

process.env.NODE_ENV = 'test';

import { normalizeFormField, extractFormFields, detectFieldCategory } from '../agent/browser/forms/fieldModel.js';
import { mapFormAnswers } from '../agent/browser/forms/mapAnswers.js';

describe('Phase 9 Form Analysis & Answer Mapping Test Suite', () => {
  // Test Suite 1: Field Normalization & Categorization
  describe('1. Field Normalization & Stable Question IDs', () => {
    it('normalizes form inputs and generates stable questionId', () => {
      const el = {
        index: 4,
        tag: 'input',
        type: 'email',
        name: 'candidate_email',
        label: 'Email Address',
        required: true,
        value: '',
      };

      const normalized = normalizeFormField(el);
      assert.strictEqual(normalized.index, 4);
      assert.strictEqual(normalized.type, 'email');
      assert.strictEqual(normalized.stableQuestionId, 'candidate_email');
      assert.strictEqual(normalized.category, 'email');
      assert.strictEqual(normalized.required, true);
    });

    it('categorizes high-risk questions properly', () => {
      assert.strictEqual(detectFieldCategory({ label: 'Will you now or in the future require visa sponsorship?' }), 'work_authorization');
      assert.strictEqual(detectFieldCategory({ label: 'What is your desired annual salary / compensation?' }), 'salary');
      assert.strictEqual(detectFieldCategory({ label: 'What is your gender identity?' }), 'demographic');
      assert.strictEqual(detectFieldCategory({ label: 'Are you willing to relocate?' }), 'relocation');
      assert.strictEqual(detectFieldCategory({ label: 'What is your notice period?' }), 'notice_period');
      assert.strictEqual(detectFieldCategory({ label: 'Do you agree to background check?' }), 'legal');
    });

    it('filters out non-form elements and hidden inputs', () => {
      const buttonEl = { tag: 'button', text: 'Submit' };
      assert.strictEqual(normalizeFormField(buttonEl), null);

      const hiddenEl = { tag: 'input', type: 'hidden', name: 'csrf_token' };
      assert.strictEqual(normalizeFormField(hiddenEl), null);
    });
  });

  // Test Suite 2: Deterministic Profile Mapping
  describe('2. Deterministic Mapping from UserProfile and Resume', () => {
    const mockProfile = {
      name: 'Karan Gade',
      email: 'karan@example.com',
      personal: {
        firstName: 'Karan',
        lastName: 'Gade',
        phone: '+1-555-0199',
        address: 'San Francisco, CA',
      },
      skills: ['JavaScript', 'Node.js', 'React', 'Playwright', 'MongoDB'],
      links: {
        linkedin: 'https://linkedin.com/in/karangade',
        github: 'https://github.com/karangade',
        portfolio: 'https://karangade.dev',
      },
    };

    const mockResume = {
      filePath: '/uploads/resumes/karan_resume.pdf',
      parsedData: {
        skills: ['JavaScript', 'Node.js', 'React'],
      },
    };

    it('deterministically maps name, email, phone, links, skills, and resume upload', async () => {
      const observation = {
        elements: [
          { index: 0, tag: 'input', type: 'text', name: 'firstName', label: 'First Name', required: true },
          { index: 1, tag: 'input', type: 'text', name: 'lastName', label: 'Last Name', required: true },
          { index: 2, tag: 'input', type: 'email', name: 'email', label: 'Email Address', required: true },
          { index: 3, tag: 'input', type: 'tel', name: 'phone', label: 'Phone Number', required: true },
          { index: 4, tag: 'input', type: 'text', name: 'linkedin', label: 'LinkedIn Profile URL' },
          { index: 5, tag: 'input', type: 'text', name: 'github', label: 'GitHub URL' },
          { index: 6, tag: 'input', type: 'file', name: 'resume', label: 'Attach Resume' },
        ],
      };

      const fields = extractFormFields(observation);
      const result = await mapFormAnswers(fields, { profile: mockProfile, resume: mockResume });

      assert.strictEqual(result.allResolved, true);
      assert.strictEqual(result.pendingHumanQuestions.length, 0);

      const ansMap = new Map(result.answers.map((a) => [a.questionId, a]));
      assert.strictEqual(ansMap.get('firstname').value, 'Karan');
      assert.strictEqual(ansMap.get('firstname').source, 'profile');
      assert.strictEqual(ansMap.get('lastname').value, 'Gade');
      assert.strictEqual(ansMap.get('email').value, 'karan@example.com');
      assert.strictEqual(ansMap.get('phone').value, '+1-555-0199');
      assert.strictEqual(ansMap.get('linkedin').value, 'https://linkedin.com/in/karangade');
      assert.strictEqual(ansMap.get('github').value, 'https://github.com/karangade');
      assert.strictEqual(ansMap.get('resume').value, '/uploads/resumes/karan_resume.pdf');
      assert.strictEqual(ansMap.get('resume').source, 'resume');
    });
  });

  // Test Suite 3: Mandatory Human Review & High-Risk Questions
  describe('3. Mandatory Human Review for High-Risk Categories', () => {
    it('always requests human answer for work authorization, salary, demographic, and notice period', async () => {
      const observation = {
        elements: [
          { index: 0, tag: 'input', type: 'radio', name: 'visa_sponsorship', label: 'Do you require visa sponsorship?' },
          { index: 1, tag: 'input', type: 'text', name: 'expected_salary', label: 'Expected Salary (Annual USD)' },
          { index: 2, tag: 'select', name: 'gender', label: 'Gender Identity', options: [{ value: 'male', text: 'Male' }] },
          { index: 3, tag: 'input', type: 'text', name: 'notice_period', label: 'Notice Period in Days' },
        ],
      };

      const fields = extractFormFields(observation);
      const result = await mapFormAnswers(fields, { profile: {} });

      assert.strictEqual(result.allResolved, false);
      assert.strictEqual(result.pendingHumanQuestions.length, 4);

      for (const ans of result.answers) {
        assert.strictEqual(ans.source, 'human');
        assert.strictEqual(ans.askHuman, true);
        assert.strictEqual(ans.needsReview, true);
      }
    });

    it('reuses previously approved answers for high-risk questions with highest priority', async () => {
      const observation = {
        elements: [
          { index: 0, tag: 'input', type: 'radio', name: 'visa_sponsorship', label: 'Do you require visa sponsorship?' },
        ],
      };

      const previousAnswers = [
        { questionId: 'visa_sponsorship', answer: 'No' },
      ];

      const fields = extractFormFields(observation);
      const result = await mapFormAnswers(fields, { profile: {}, previousAnswers });

      assert.strictEqual(result.allResolved, true);
      assert.strictEqual(result.pendingHumanQuestions.length, 0);

      const sponsorshipAns = result.answers[0];
      assert.strictEqual(sponsorshipAns.value, 'No');
      assert.strictEqual(sponsorshipAns.source, 'approvedBefore');
      assert.strictEqual(sponsorshipAns.confidence, 1.0);
      assert.strictEqual(sponsorshipAns.needsReview, false);
    });
  });

  // Test Suite 4: Missing, Ambiguous & Free-Text Questions
  describe('4. Missing, Ambiguous & Free-Text Questions', () => {
    it('routes unmapped ambiguous questions to askHuman', async () => {
      const observation = {
        elements: [
          { index: 0, tag: 'input', type: 'text', name: 'favorite_ide', label: 'What is your favorite code editor?' },
        ],
      };

      const fields = extractFormFields(observation);
      const result = await mapFormAnswers(fields, { profile: {} });

      assert.strictEqual(result.allResolved, false);
      assert.strictEqual(result.answers[0].askHuman, true);
      assert.strictEqual(result.answers[0].source, 'human');
    });

    it('generates LLM draft for free-text questions and marks source=llm with needsReview=true', async () => {
      const mockLlmModel = {
        invoke: async () => 'I have 5 years of experience building Node.js and Playwright automation systems.',
      };

      const observation = {
        elements: [
          { index: 0, tag: 'textarea', name: 'cover_letter', label: 'Why are you interested in this role?' },
        ],
      };

      const fields = extractFormFields(observation);
      const result = await mapFormAnswers(fields, {
        profile: { skills: ['Node.js', 'Playwright'] },
        model: mockLlmModel,
      });

      assert.strictEqual(result.allResolved, true);
      const ans = result.answers[0];
      assert.strictEqual(ans.source, 'llm');
      assert.strictEqual(ans.confidence, 0.75);
      assert.strictEqual(ans.needsReview, true);
      assert.match(ans.value, /5 years of experience/);
    });
  });
});
