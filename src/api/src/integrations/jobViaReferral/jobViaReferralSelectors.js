/**
 * DOM Selectors for JobViaReferral Website
 * Isolates all CSS and Playwright selectors used for navigation and extraction.
 */

export const JOB_VIA_REFERRAL_SELECTORS = Object.freeze({
  // Listing / Category Page Selectors
  jobCards: 'h2.gb-text, h2, article.post, article.type-post, article, div.post, .entry',
  jobCardTitleLink: 'h2.gb-text a, h2 a, h2.entry-title a, header.entry-header h2 a',
  jobCardExcerpt: '.entry-summary, .entry-content p, .post-excerpt, p.gb-text',
  jobCardDate: 'time.entry-date, .posted-on, .entry-meta time, p.gb-text',
  nextPageLink: 'a.next, .nav-previous a, .pagination a.next, a.next-page, .page-numbers.next',

  // Job Detail Page Selectors
  detailTitle: 'h1.entry-title, h1.gb-text, header.entry-header h1, .entry-title, h1',
  detailContent: 'article, main#main article, .entry-content, main#main, .post-content',
  detailMeta: '.entry-meta, .posted-on, time.entry-date, p.gb-text',

  // Application Link & Contact Selectors inside Detail Page Content
  applicationLinks: [
    'article a[href*="forms"]',
    'article a[href*="docs.google.com"]',
    'article a[href*="linkedin.com/jobs"]',
    'article a[href*="myworkdayjobs.com"]',
    'article a[href*="greenhouse.io"]',
    'article a[href*="lever.co"]',
    'article a.wp-block-button__link',
    'article a.gb-button',
    'article a.btn',
    'article p a[target="_blank"]',
    'article a[target="_blank"]',
    '.entry-content a[href*="forms"]',
    '.entry-content a[href*="docs.google.com"]',
    '.entry-content a[target="_blank"]'
  ].join(', '),

  mailtoLinks: 'article a[href^="mailto:"], .entry-content a[href^="mailto:"], a[href^="mailto:"]',
  phoneLinks: 'article a[href^="tel:"], article a[href*="wa.me"], article a[href*="api.whatsapp.com"], a[href^="tel:"]',

  // Section Headings & Meta Selectors
  authorLink: 'a[href*="/author/"]',
  postedOnDateText: 'p.gb-text:has-text("On:"), time.entry-date, .posted-on, .entry-meta',
  resumeTipsHeadings: 'h2:has-text("Resume Tips"), h3:has-text("Resume Tips"), .wp-block-heading:has-text("Resume Tips")',
  howToApplyHeadings: 'h2:has-text("How to Apply"), h3:has-text("How to Apply"), .wp-block-heading:has-text("How to Apply")',

  // Regular expression patterns for field parsing from post text
  textPatterns: Object.freeze({
    company: /(?:Company\s*Name|Company|Organization)\s*[:|-]\s*([^\n\r]+)/i,
    location: /(?:Job\s*Location|Location|City|Work\s*Location)\s*[:|-]\s*([^\n\r]+)/i,
    experience: /(?:Experience\s*Required|Experience|Eligible\s*Batch|Batch)\s*[:|-]\s*([^\n\r]+)/i,
    qualification: /(?:Qualification|Degree|Education|Eligibility)\s*[:|-]\s*([^\n\r]+)/i,
    role: /(?:Job\s*Role|Role|Position|Title)\s*[:|-]\s*([^\n\r]+)/i,
    salary: /(?:Salary|CTC|Package)\s*[:|-]\s*([^\n\r]+)/i,
    skills: /(?:Skills\s*Required|Key\s*Skills|Technical\s*Skills|Required\s*Skills|Skills)\s*[:|-]\s*([^\n\r]+)/i,
    postedBy: /By\s*:\s*([^\n\r<|]+)/i,
    postedDate: /On\s*:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/i,
    hrEmail: /(?:HR\s*Email|Email\s*ID|Send\s*(?:Your\s*)?Resume\s*To|Apply\s*(?:At|Via)\s*Email|Email)\s*[:|-]?\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    genericEmail: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi,
    contactNumber: /(?:Contact\s*(?:No|Number)|Mobile\s*(?:No|Number)|Phone\s*(?:No|Number)|WhatsApp|Call)\s*[:|-]?\s*(\+?\d{1,4}[\s-]?\d{10}|\+?\d{10,12})/i,
    genericPhone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/gi,
    emailSubject: /(?:Subject\s*Line|Subject)\s*[:|-]\s*([^\n\r]+)/i,
    resumeTipsSection: /(?:Resume\s*Tips)\s*[\n\r]+([\s\S]*?)(?=\n\s*(?:How\s*to\s*Apply|About\s*Company|Job\s*Description|$)|\n\s*<h[1-6])/i,
    howToApplySection: /(?:How\s*to\s*Apply)\s*[\n\r]+([\s\S]*?)(?=\n\s*(?:About\s*Company|Disclaimer|$)|\n\s*<h[1-6])/i
  })
});

export default JOB_VIA_REFERRAL_SELECTORS;
