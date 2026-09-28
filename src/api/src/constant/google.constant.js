/**
 * Centralized Google Session & Google Forms Constants
 */

export const GOOGLE_AUTH_STATUS = Object.freeze({
  CONNECTED: 'connected',
  AUTHENTICATION_REQUIRED: 'authenticationRequired',
  DISCONNECTED: 'disconnected',
  EXPIRED: 'expired',
});

export const GOOGLE_URLS = Object.freeze({
  SIGNIN: 'https://accounts.google.com/signin',
  MY_ACCOUNT: 'https://myaccount.google.com',
  FORMS_BASE: 'https://docs.google.com/forms',
});

export const GOOGLE_SELECTORS = Object.freeze({
  // Indicators that page is at Google Login / Sign-in
  LOGIN_INDICATORS: [
    '#identifierId',
    'input[type="email"]',
    'input[name="identifier"]',
    'input[name="Passwd"]',
    'input[type="password"]',
    'div[data-identifier]',
    '#headingText',
  ],

  LOGIN_TEXT_PATTERNS: [
    'sign in to continue to google forms',
    'sign in with google',
    'sign in - google accounts',
    'to continue to google forms',
    'choose an account',
    'verify it\'s you',
  ],

  // Indicators that user is authenticated with Google
  LOGGED_IN_INDICATORS: [
    'a[href*="SignOutOptions"]',
    'img[alt*="Google Account"]',
    '[aria-label*="Google Account:"]',
    '[data-email]',
    'a[href*="accounts.google.com/Logout"]',
  ],
});
