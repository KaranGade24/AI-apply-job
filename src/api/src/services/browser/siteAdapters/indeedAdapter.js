/**
 * Indeed Site Adapter for use-browser-js
 */

export class IndeedAdapter {
  static async extractJobDetails(page) {
    const title = await page.title();
    return {
      title,
      source: 'Indeed',
      sourceUrl: page.url(),
      hasDirectApply: true,
    };
  }
}

export default IndeedAdapter;
