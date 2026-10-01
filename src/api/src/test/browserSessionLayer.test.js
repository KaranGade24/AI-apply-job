import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';

process.env.NODE_ENV = 'test';

import { BrowserManager } from '../agent/browser/session/browserManager.js';
import { SessionRegistry } from '../agent/browser/session/sessionRegistry.js';
import { attachDialogHandler } from '../agent/browser/session/dialogHandler.js';

describe('Phase 3 Browser Session Layer Test Suite', () => {
  const testAppId = 'test-app-session-123';
  const testUserId = 'test-user-456';

  // Test 1: Dialog Handler Behavior
  describe('1. Dialog Handler Safety & Logging', () => {
    it('accepts alert dialogs and dismisses confirm/prompt dialogs', async () => {
      let alertAccepted = false;
      let confirmDismissed = false;

      const mockPage = new EventEmitter();
      attachDialogHandler(mockPage, testAppId);

      // Emit mock alert
      const mockAlert = {
        type: () => 'alert',
        message: () => 'Notification: Application step saved',
        accept: async () => {
          alertAccepted = true;
        },
        dismiss: async () => {},
      };

      mockPage.emit('dialog', mockAlert);
      // Give async microtask queue time to run
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(alertAccepted, true, 'Alert dialog should be accepted');

      // Emit mock confirm (must NOT be auto-accepted for safety)
      const mockConfirm = {
        type: () => 'confirm',
        message: () => 'Submit application now?',
        accept: async () => {},
        dismiss: async () => {
          confirmDismissed = true;
        },
      };

      mockPage.emit('dialog', mockConfirm);
      await new Promise((resolve) => setTimeout(resolve, 50));
      assert.strictEqual(confirmDismissed, true, 'Confirm dialog must be dismissed by default');
    });
  });

  // Test 2: Multi-Tab Handling & Session Registry
  describe('2. Multi-Tab Tracking & getActivePage()', () => {
    it('tracks new tabs/popups and getActivePage() follows them', async () => {
      // Create mock Playwright Context and Page
      const mockContext = new EventEmitter();
      mockContext.storageState = async () => ({ cookies: [], origins: [] });
      mockContext.close = async () => {};

      class MockPage extends EventEmitter {
        constructor(url) {
          super();
          this._url = url;
          this._closed = false;
        }
        url() {
          return this._url;
        }
        mainFrame() {
          return this;
        }
        isClosed() {
          return this._closed;
        }
        async close() {
          this._closed = true;
          this.emit('close');
        }
        async bringToFront() {}
      }

      const initialPage = new MockPage('https://example.com/apply/step1');
      mockContext.newPage = async () => initialPage;

      // Mock BrowserManager.createApplicationContext for the unit test
      const originalCreateContext = BrowserManager.createApplicationContext;
      BrowserManager.createApplicationContext = async () => mockContext;

      try {
        // 1. Initialize session
        const session = await SessionRegistry.createOrGetSession(testAppId, testUserId);
        assert.ok(session, 'Session must be created');
        assert.strictEqual(SessionRegistry.getActivePage(testAppId), initialPage);
        assert.strictEqual(session.pages.length, 1);

        // 2. Open popup / new tab
        const popupPage = new MockPage('https://auth.company.com/oauth/popup');
        mockContext.emit('page', popupPage);

        // 3. Confirm getActivePage() followed the new tab/popup
        const activePageAfterPopup = SessionRegistry.getActivePage(testAppId);
        assert.strictEqual(activePageAfterPopup, popupPage, 'getActivePage() should follow the newly opened popup tab');
        assert.strictEqual(session.pages.length, 2, 'Session should now track 2 pages');

        // 4. Test switchToPage() back to the original tab
        const switchedBack = await SessionRegistry.switchToPage(testAppId, 0);
        assert.strictEqual(switchedBack, initialPage);
        assert.strictEqual(SessionRegistry.getActivePage(testAppId), initialPage, 'Active page should now be the initial page');

        // 5. Test tab closing
        await popupPage.close();
        assert.strictEqual(session.pages.length, 1, 'Closed tab should be removed from session.pages');
        assert.strictEqual(SessionRegistry.getActivePage(testAppId), initialPage, 'Active page should fall back to open tab');
      } finally {
        BrowserManager.createApplicationContext = originalCreateContext;
        await SessionRegistry.closeSession(testAppId);
      }
    });
  });

  // Test 3: Session Recovery
  describe('3. Session Recovery Post-Restart', () => {
    it('recreates session from target URL when not present in memory', async () => {
      let navigatedUrl = null;

      const mockContext = new EventEmitter();
      mockContext.storageState = async () => ({ cookies: [], origins: [] });
      mockContext.close = async () => {};

      class MockPage extends EventEmitter {
        constructor() {
          super();
          this._url = 'about:blank';
        }
        url() {
          return this._url;
        }
        mainFrame() {
          return this;
        }
        isClosed() {
          return false;
        }
        async goto(url) {
          this._url = url;
          navigatedUrl = url;
        }
        async close() {}
      }

      const mockPage = new MockPage();
      mockContext.newPage = async () => mockPage;

      const originalCreateContext = BrowserManager.createApplicationContext;
      BrowserManager.createApplicationContext = async () => mockContext;

      try {
        const recoveredSession = await SessionRegistry.recreateSession(
          'recovered-app-999',
          testUserId,
          'https://company.com/jobs/apply/step-3'
        );

        assert.ok(recoveredSession, 'Session should be recreated');
        assert.strictEqual(navigatedUrl, 'https://company.com/jobs/apply/step-3', 'Should navigate to last known URL');
      } finally {
        BrowserManager.createApplicationContext = originalCreateContext;
        await SessionRegistry.closeSession('recovered-app-999');
      }
    });
  });

  // Test 4: TTL and Eviction
  describe('4. Session Cleanup', () => {
    it('cleans up session when closeSession() is called', async () => {
      const mockContext = new EventEmitter();
      let closedContext = false;
      mockContext.storageState = async () => ({ cookies: [], origins: [] });
      mockContext.close = async () => {
        closedContext = true;
      };

      class MockPage extends EventEmitter {
        url() {
          return 'https://example.com';
        }
        mainFrame() {
          return this;
        }
        isClosed() {
          return false;
        }
        async close() {}
      }

      mockContext.newPage = async () => new MockPage();

      const originalCreateContext = BrowserManager.createApplicationContext;
      BrowserManager.createApplicationContext = async () => mockContext;

      try {
        await SessionRegistry.createOrGetSession('cleanup-app-1', testUserId);
        assert.ok(SessionRegistry.getSession('cleanup-app-1'));

        await SessionRegistry.closeSession('cleanup-app-1');
        assert.strictEqual(SessionRegistry.getSession('cleanup-app-1'), null);
        assert.strictEqual(closedContext, true);
      } finally {
        BrowserManager.createApplicationContext = originalCreateContext;
      }
    });
  });
});
