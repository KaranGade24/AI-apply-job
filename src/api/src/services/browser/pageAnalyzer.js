/**
 * PageAnalyzer: Generic website and job listing page analyzer (DOM + Accessibility Tree + Visible Text)
 */

export class PageAnalyzer {
  static analyze(html = '', url = '') {
    const isJobListing = /job|careers|position|apply|opening/i.test(html) || /job|careers/i.test(url);
    const isApplicationForm = /<form/i.test(html) || /apply|submit/i.test(html);
    const isLogin = /login|sign in|password|auth/i.test(html);
    const isCaptcha = /captcha|recaptcha|cf-turnstile|bot detection/i.test(html);
    const isConfirmation = /thank you|application submitted|successfully applied/i.test(html);

    let pageType = 'Unknown';
    if (isCaptcha) pageType = 'CAPTCHA';
    else if (isConfirmation) pageType = 'Confirmation';
    else if (isLogin) pageType = 'Login';
    else if (isApplicationForm) pageType = 'Application form';
    else if (isJobListing) pageType = 'Job listing';

    return {
      pageType,
      url,
      hasApplyButton: /apply|easy apply|submit application/i.test(html),
      hasFileUpload: /type=["']file["']/i.test(html),
      hasLoginForm: isLogin,
      hasCaptcha: isCaptcha,
    };
  }
}

export default PageAnalyzer;
