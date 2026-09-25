/**
 * Naukri Job Application Selectors Specification
 */
export const naukriApplicationSelectors = Object.freeze({
  applyButton: 'button.apply-button, #apply-button, .apply-button-container button, button:has-text("Apply")',
  alreadyAppliedBadge: '.already-applied, span:has-text("Already Applied"), .applied-msg, button:disabled:has-text("Applied")',
  
  applyModal: {
    container: '.apply-message-container, .apply-dialog, #applyModal, .chatbot-apply-container',
    submitButton: 'button[type="submit"]:has-text("Submit"), button:has-text("Save & Apply"), button:has-text("Apply")',
    resumeUploadInput: 'input[type="file"][accept*="pdf"], #resumeUpload',
    successToast: '.apply-success-msg, .toast-success, text="Applied successfully", .styles_apply-success__...',
    externalLinkMsg: 'text="Apply on company site", a:has-text("Apply on Company Site")',
  },
});

export default naukriApplicationSelectors;
