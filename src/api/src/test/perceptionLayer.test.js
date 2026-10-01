import { describe, it } from 'node:test';
import assert from 'node:assert';

process.env.NODE_ENV = 'test';

import { PERCEPTION_PAGE_TYPES } from '../constant/agent.constant.js';
import { serializeForLlm } from '../agent/browser/perception/serializeForLlm.js';
import { classifyPageDeterministic, classifyPage } from '../agent/browser/perception/classifyPage.js';
import { needsVision } from '../agent/browser/perception/needsVision.js';
import { captureScreenshot } from '../agent/browser/perception/captureScreenshot.js';

describe('Phase 5 Perception Layer Test Suite', () => {
  // Test Suite 1: Page Type Fixture Classifications (13 page types)
  describe('1. Deterministic Page Classification Fixtures', () => {
    it('1. classifies CAPTCHA_OR_BLOCKED for Turnstile / Cloudflare / Bot detection', () => {
      const fixture = {
        url: 'https://apply.company.com/cdn-cgi/challenge-platform/h/b',
        title: 'Just a moment... Attention Required! | Cloudflare',
        visibleTextTrimmed: 'Please verify you are human to continue. Cloudflare Ray ID: 8492019.',
        elements: [
          { tag: 'input', type: 'checkbox', label: 'Verify you are human', inViewport: true },
        ],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.CAPTCHA_OR_BLOCKED);
      assert.ok(result.confidence >= 0.95);
    });

    it('2. classifies SUBMISSION_SUCCESS for thank you & confirmation banners', () => {
      const fixture = {
        url: 'https://careers.google.com/applications/thank-you',
        title: 'Application Submitted Successfully',
        visibleTextTrimmed: 'Thank you for applying to Senior Full Stack Engineer. We have received your application. Confirmation #APP-99812.',
        elements: [
          { tag: 'a', text: 'View other openings', inViewport: true },
        ],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.SUBMISSION_SUCCESS);
      assert.ok(result.confidence >= 0.90);
    });

    it('3. classifies ERROR for 404 / expired / closed job pages', () => {
      const fixture = {
        url: 'https://boards.greenhouse.io/techcorp/jobs/9999',
        title: 'Job Not Found - 404',
        visibleTextTrimmed: 'This job is no longer available or the position has been filled.',
        elements: [
          { tag: 'a', text: 'Back to careers', inViewport: true },
        ],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.ERROR);
      assert.ok(result.confidence >= 0.90);
    });

    it('4. classifies LOGIN when password field and login context are present', () => {
      const fixture = {
        url: 'https://jobs.lever.co/signin',
        title: 'Sign In to Your Candidate Portal',
        visibleTextTrimmed: 'Log in to track your job application status.',
        elements: [
          { tag: 'input', type: 'email', label: 'Email Address', inViewport: true },
          { tag: 'input', type: 'password', label: 'Password', inViewport: true, isSensitive: true },
          { tag: 'button', text: 'Sign In', inViewport: true },
        ],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.LOGIN);
      assert.ok(result.confidence >= 0.90);
    });

    it('5. classifies SIGNUP when registration form and create account keywords are present', () => {
      const fixture = {
        url: 'https://workday.com/company/candidate-portal/create-account',
        title: 'Create Account',
        visibleTextTrimmed: 'Create an account to submit and manage your job applications.',
        elements: [
          { tag: 'input', type: 'email', label: 'Email', inViewport: true },
          { tag: 'input', type: 'password', label: 'Create Password', inViewport: true, isSensitive: true },
          { tag: 'input', type: 'password', label: 'Confirm Password', inViewport: true, isSensitive: true },
          { tag: 'button', text: 'Create Account', inViewport: true },
        ],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.SIGNUP);
      assert.ok(result.confidence >= 0.90);
    });

    it('6. classifies REVIEW for summary screen before final submission', () => {
      const fixture = {
        url: 'https://jobs.smartrecruiters.com/apply/step-4',
        title: 'Review Your Application',
        visibleTextTrimmed: 'Please review your application summary and confirm details before submitting.',
        elements: [
          { tag: 'input', type: 'checkbox', label: 'I agree to terms & conditions', inViewport: true },
          { tag: 'button', text: 'Submit Application', inViewport: true },
        ],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.REVIEW);
      assert.ok(result.confidence >= 0.85);
    });

    it('7. classifies RESUME_UPLOAD when dedicated CV upload form is present', () => {
      const fixture = {
        url: 'https://careers.company.com/apply/upload-cv',
        title: 'Attach Your Resume',
        visibleTextTrimmed: 'Upload resume or drop your CV file here (PDF or DOCX).',
        elements: [
          { tag: 'input', type: 'file', label: 'Upload Resume', inViewport: true },
          { tag: 'button', text: 'Continue', inViewport: true },
        ],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.RESUME_UPLOAD);
      assert.ok(result.confidence >= 0.85);
    });

    it('8. classifies QUESTION_FORM when questionnaire / custom screening questions are detected', () => {
      const fixture = {
        url: 'https://jobs.lever.co/acme/apply/questions',
        title: 'Application Questionnaire',
        visibleTextTrimmed: 'Please answer these questions regarding sponsorship, authorized to work in US, and years of experience.',
        elements: [
          { tag: 'input', type: 'radio', groupName: 'sponsorship', label: 'Will you now or in the future require visa sponsorship?', inViewport: true },
          { tag: 'input', type: 'number', label: 'Years of Experience with Node.js', inViewport: true },
          { tag: 'button', text: 'Next Step', inViewport: true },
        ],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.QUESTION_FORM);
      assert.ok(result.confidence >= 0.85);
    });

    it('9. classifies APPLICATION_FORM for standard contact/profile inputs', () => {
      const fixture = {
        url: 'https://boards.greenhouse.io/stripe/jobs/12345/apply',
        title: 'Apply for Backend Engineer',
        visibleTextTrimmed: 'Submit your application. Please enter your contact information.',
        elements: [
          { tag: 'input', type: 'text', label: 'First Name', inViewport: true },
          { tag: 'input', type: 'text', label: 'Last Name', inViewport: true },
          { tag: 'input', type: 'email', label: 'Email', inViewport: true },
          { tag: 'input', type: 'tel', label: 'Phone', inViewport: true },
          { tag: 'input', type: 'text', label: 'LinkedIn Profile', inViewport: true },
          { tag: 'button', text: 'Submit', inViewport: true },
        ],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.APPLICATION_FORM);
      assert.ok(result.confidence >= 0.85);
    });

    it('10. classifies APPLICATION_START on job listing with prominent Apply button', () => {
      const fixture = {
        url: 'https://careers.netflix.com/jobs/88771',
        title: 'Senior Software Engineer - UI Systems',
        visibleTextTrimmed: 'Job Description: Responsibilities include architecting scalable frontend infrastructure. Qualifications: 5+ years experience.',
        elements: [
          { tag: 'button', text: 'Apply Now', inViewport: true },
          { tag: 'a', text: 'Share Job', inViewport: true },
        ],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.APPLICATION_START);
      assert.ok(result.confidence >= 0.85);
    });

    it('11. classifies JOB_DETAIL on job description content without direct apply button', () => {
      const fixture = {
        url: 'https://company.com/about/careers/roles/engineer',
        title: 'Engineering Role Overview',
        visibleTextTrimmed: 'Job Description: Responsibilities and requirements for our engineering teams.',
        elements: [
          { tag: 'a', text: 'Read more about our culture', inViewport: true },
        ],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.JOB_DETAIL);
      assert.ok(result.confidence >= 0.80);
    });

    it('12. classifies EXTERNAL_REDIRECT on third-party ATS domain', () => {
      const fixture = {
        url: 'https://myworkdayjobs.com/en-US/AcmeCorp/job/Software-Engineer',
        title: 'Acme Careers Portal',
        visibleTextTrimmed: 'Welcome to Acme careers.',
        elements: [],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.EXTERNAL_REDIRECT);
      assert.ok(result.confidence >= 0.80);
    });

    it('13. classifies UNKNOWN when no strong signals are present', () => {
      const fixture = {
        url: 'https://example.com/misc',
        title: 'Welcome',
        visibleTextTrimmed: 'Random landing page with no job signals.',
        elements: [],
      };

      const result = classifyPageDeterministic(fixture);
      assert.strictEqual(result.pageType, PERCEPTION_PAGE_TYPES.UNKNOWN);
      assert.ok(result.confidence < 0.80);
    });
  });

  // Test Suite 2: serializeForLlm
  describe('2. serializeForLlm Formatting & Redaction', () => {
    it('serializes interactive elements into compact formatted lines and redacts sensitive inputs', () => {
      const observation = {
        url: 'https://careers.corp.com/apply',
        title: 'Apply for Role',
        scrollInfo: { scrollY: 100, scrollHeight: 1000 },
        visibleTextTrimmed: 'Please fill out your contact details.',
        elements: [
          {
            index: 0,
            tag: 'input',
            type: 'text',
            name: 'fullName',
            label: 'Full Name',
            value: 'Karan Gade',
            required: true,
            inViewport: true,
          },
          {
            index: 1,
            tag: 'input',
            type: 'password',
            name: 'accountPassword',
            label: 'Password',
            value: 'SuperSecret123!',
            isSensitive: true,
            required: true,
            inViewport: true,
          },
          {
            index: 2,
            tag: 'select',
            name: 'gender',
            label: 'Gender',
            options: [
              { value: 'male', text: 'Male' },
              { value: 'female', text: 'Female' },
            ],
            value: 'male',
            inViewport: true,
          },
          {
            index: 3,
            tag: 'input',
            type: 'radio',
            groupName: 'authorized',
            label: 'Authorized to work in US?',
            checked: true,
            inViewport: true,
          },
        ],
      };

      const output = serializeForLlm(observation);

      // Verify line formatting
      assert.match(output, /\[0\] input type=text name="fullName" label="Full Name" required value="Karan Gade"/);
      // Verify sensitive password value is strictly REDACTED
      assert.strictEqual(output.includes('SuperSecret123!'), false, 'Plaintext password must NOT appear in LLM prompt');
      assert.match(output, /\[1\] input type=password name="accountPassword" label="Password" required value=\[REDACTED\]/);
      // Verify select options grouping
      assert.match(output, /\[2\] select name="gender" label="Gender" options=\["Male","Female"\]/);
      // Verify radio group
      assert.match(output, /\[3\] input type=radio group="authorized" label="Authorized to work in US\?" checked/);
    });

    it('enforces character budget and element limit and reports omitted elements', () => {
      const elements = [];
      for (let i = 0; i < 80; i++) {
        elements.push({
          index: i,
          tag: 'button',
          text: `Action Button ${i}`,
          inViewport: i < 30,
        });
      }

      const observation = {
        url: 'https://example.com/big-page',
        title: 'Big Page',
        elements,
      };

      const output = serializeForLlm(observation, { maxElements: 40 });
      assert.match(output, /omitted/);
      assert.strictEqual(output.includes('[79]'), false, 'Elements beyond maxElements should be omitted');
    });
  });

  // Test Suite 3: needsVision
  describe('3. needsVision Decision Logic', () => {
    it('returns true when consecutiveFailures >= 2', () => {
      const decision = needsVision({
        observation: { elements: [{ tag: 'button' }] },
        consecutiveFailures: 2,
      });
      assert.strictEqual(decision.required, true);
      assert.match(decision.reason, /repeated_action_failures/);
    });

    it('returns true when zero elements are detected on a non-empty page', () => {
      const decision = needsVision({
        observation: { elements: [], visibleTextTrimmed: 'Important complex canvas graphic with interactive points.' },
      });
      assert.strictEqual(decision.required, true);
      assert.match(decision.reason, /zero_elements/);
    });

    it('returns false for standard well-labeled form observation', () => {
      const decision = needsVision({
        observation: {
          elements: [
            { tag: 'input', label: 'Email' },
            { tag: 'button', text: 'Submit' },
          ],
          visibleTextTrimmed: 'Simple form',
        },
        consecutiveFailures: 0,
      });
      assert.strictEqual(decision.required, false);
    });
  });

  // Test Suite 4: captureScreenshot
  describe('4. captureScreenshot Helper', () => {
    it('handles null/missing page safely', async () => {
      const result = await captureScreenshot(null);
      assert.strictEqual(result, null);
    });

    it('captures in-memory base64 JPEG from Playwright page', async () => {
      const mockPage = {
        screenshot: async () => Buffer.from('fake-jpeg-image-bytes'),
      };

      const result = await captureScreenshot(mockPage);
      assert.ok(result);
      assert.strictEqual(result.mimeType, 'image/jpeg');
      assert.ok(typeof result.base64 === 'string');
    });
  });
});
