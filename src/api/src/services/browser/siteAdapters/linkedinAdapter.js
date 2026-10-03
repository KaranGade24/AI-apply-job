/**
 * LinkedIn Site Adapter for use-browser-js
 */

export class LinkedinAdapter {
  static async extractJobDetails(page) {
    const title = await page.title();
    return {
      title,
      source: 'LinkedIn',
      sourceUrl: page.url(),
      hasEasyApply: true,
    };
  }
}

export default LinkedinAdapter;
