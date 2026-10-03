/**
 * Generic Job Site Adapter for use-browser-js
 */

import { PageAnalyzer } from '../pageAnalyzer.js';
import { FormAnalyzer } from '../formAnalyzer.js';

export class GenericJobSiteAdapter {
  static async extractAndAnalyze(page) {
    const html = await page.content();
    const url = page.url();
    const analysis = PageAnalyzer.analyze(html, url);
    const formFields = FormAnalyzer.analyzeFields(html);

    return {
      title: await page.title(),
      url,
      analysis,
      formFields,
      source: 'Generic Website',
    };
  }
}

export default GenericJobSiteAdapter;
