import { BrowserContextManager } from '../browser/browserContextManager.js';
import assert from 'assert';

async function runBrowserContextTests() {
  console.log('--- STARTING HIGH-RELIABILITY BROWSER CONTEXT TESTS ---');

  try {
    // 1. Stub structure tests (Since Playwright requires a running browser, we test with realistic mock patterns)
    console.log('Test 1: Mocked tab resolution validation...');
    const fakeContext = {
      pages: () => [
        { url: () => 'about:blank' },
        { url: () => 'https://careerportal.com/job/101' }
      ]
    };
    const fakeCurrentPage = fakeContext.pages()[0];
    const { activePage, tabCount } = await BrowserContextManager.resolveActiveTab(fakeContext, fakeCurrentPage);
    assert.strictEqual(tabCount, 2);
    assert.strictEqual(activePage.url(), 'https://careerportal.com/job/101');
    console.log('✅ Test 1 Passed.');

    console.log('Test 2: Modal context resolution fallback check...');
    const fakePage = {
      $: async (selector) => {
        if (selector === '[role="dialog"]') {
          return {
            isVisible: async () => true
          };
        }
        return null;
      }
    };
    const modalContext = await BrowserContextManager.resolveModalContext(fakePage);
    assert.strictEqual(modalContext.isModal, true);
    assert.ok(modalContext.root);
    console.log('✅ Test 2 Passed.');

    console.log('Test 3: Stale element re-evaluation protection...');
    let queryCount = 0;
    const fakeDynamicContext = {
      $: async (selector) => {
        queryCount++;
        return {
          evaluate: async () => false // Simulate detached stale element on first call
        };
      }
    };
    const staleCheck = await BrowserContextManager.getFreshElement('.react-button', fakeDynamicContext);
    assert.ok(staleCheck);
    assert.strictEqual(queryCount, 2); // Ensures it ran query a second time on detachment
    console.log('✅ Test 3 Passed.');

    console.log('🎉 ALL BROWSER CONTEXT TESTS PASSED SUCCESSFULLY.');
  } catch (error) {
    console.error('❌ Browser Context Tests Failed:', error);
    process.exit(1);
  }
}

runBrowserContextTests();
