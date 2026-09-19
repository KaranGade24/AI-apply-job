/**
 * DOM Selectors for JobViaReferral Website
 * Isolates all CSS and Playwright selectors used for navigation and extraction.
 */

export const JOB_VIA_REFERRAL_SELECTORS = Object.freeze({
  // Listing / Category Page Selectors
  jobCards: 'article.post, article.type-post, article, div.post, .entry',
  jobCardTitleLink: 'h2.entry-title a, header.entry-header h2 a, .entry-title a, h2 a',
  jobCardExcerpt: '.entry-summary, .entry-content p, .post-excerpt',
  jobCardDate: 'time.entry-date, .posted-on, .entry-meta time',
  nextPageLink: 'a.next, .nav-previous a, .pagination a.next, a.next-page',

  // Job Detail Page Selectors
  detailTitle: 'h1.entry-title, header.entry-header h1, .entry-title, h1',
  detailContent: '.entry-content, main#main article, .post-content',
  detailMeta: '.entry-meta, .posted-on, time.entry-date',

  // Application Link & Contact Selectors inside Detail Page Content
  applicationLinks: [
    '.entry-content a[href*="forms"]',
    '.entry-content a[href*="docs.google.com"]',
    '.entry-content a[href*="linkedin.com"]',
    '.entry-content a[href*="myworkdayjobs.com"]',
    '.entry-content a[href*="greenhouse.io"]',
    '.entry-content a[href*="lever.co"]',
    '.entry-content a.wp-block-button__link',
    '.entry-content a.btn',
    '.entry-content p a[target="_blank"]',
    '.entry-content a[target="_blank"]'
  ].join(', '),

  mailtoLinks: '.entry-content a[href^="mailto:"]',
  phoneLinks: '.entry-content a[href^="tel:"], .entry-content a[href*="wa.me"], .entry-content a[href*="api.whatsapp.com"]',

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
