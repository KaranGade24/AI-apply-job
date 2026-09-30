import express from 'express';

const router = express.Router();

/**
 * HTML generator helper for test scenarios.
 */
const renderScenarioHtml = (title, bodyContent) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; background: #f8fafc; color: #1e293b; }
    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); margin-bottom: 1.5rem; }
    h1 { font-size: 1.5rem; margin-bottom: 1rem; color: #0f172a; }
    label { display: block; margin-top: 1rem; font-weight: 500; font-size: 0.875rem; }
    input, select, textarea { width: 100%; padding: 0.55rem; margin-top: 0.25rem; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 1rem; }
    button { background: #2563eb; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 600; margin-top: 1.5rem; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    .error { color: #dc2626; font-size: 0.875rem; margin-top: 0.25rem; }
    .modal { position: fixed; top: 20%; left: 50%; transform: translateX(-50%); background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); width: 90%; max-width: 500px; z-index: 1000; }
    .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 999; }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>
`;

// 1. Simple Job Page
router.get('/scenario-1', (req, res) => {
  res.send(renderScenarioHtml('Scenario 1: Simple Job Page', `
    <div class="card">
      <h1>Software Engineer - AI Systems</h1>
      <p>We are looking for an experienced AI engineer to build agentic workflows.</p>
      <button id="apply-btn">Apply Now</button>
    </div>
  `));
});

// 2. Apply Button
router.get('/scenario-2', (req, res) => {
  res.send(renderScenarioHtml('Scenario 2: Apply Button', `
    <div class="card">
      <h1>Product Designer</h1>
      <button data-automation-id="apply-now" class="btn">Apply for this Job</button>
    </div>
  `));
});

// 3. Modal Form
router.get('/scenario-3', (req, res) => {
  res.send(renderScenarioHtml('Scenario 3: Modal Form', `
    <div class="card">
      <h1>Senior Frontend Engineer</h1>
      <button onclick="document.getElementById('modal').style.display='block'; document.getElementById('overlay').style.display='block';">Quick Apply</button>
    </div>
    <div id="overlay" class="overlay" style="display:none;"></div>
    <div id="modal" role="dialog" class="modal" style="display:none;">
      <h2>Application Modal</h2>
      <label>Full Name <input type="text" id="name" required></label>
      <label>Email <input type="email" id="email" required></label>
      <button type="submit">Submit Application</button>
    </div>
  `));
});

// 4. Multi-Step Form
router.get('/scenario-4', (req, res) => {
  res.send(renderScenarioHtml('Scenario 4: Multi-Step Form', `
    <div class="card">
      <div class="stepper">Step 1 of 3: Personal Info</div>
      <label>First Name <input type="text" id="first_name" required></label>
      <button id="next-btn">Next Step</button>
    </div>
  `));
});

// 5. Dynamic Form
router.get('/scenario-5', (req, res) => {
  res.send(renderScenarioHtml('Scenario 5: Dynamic Form', `
    <div class="card">
      <h1>Dynamic Questionnaire</h1>
      <label>Do you have experience? 
        <select id="has_exp" onchange="if(this.value==='yes') document.getElementById('extra').style.display='block';">
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </label>
      <div id="extra" style="display:none;">
        <label>Years of Experience <input type="number" id="years"></label>
      </div>
      <button type="submit">Submit</button>
    </div>
  `));
});

// 6. Validation Errors
router.get('/scenario-6', (req, res) => {
  res.send(renderScenarioHtml('Scenario 6: Validation Errors', `
    <div class="card">
      <h1>Form with Errors</h1>
      <div role="alert" class="error">Please correct the highlighted fields below.</div>
      <label>Email <input type="email" id="email" value="invalid-email"></label>
      <div class="error">Invalid email address format.</div>
      <button type="submit">Submit</button>
    </div>
  `));
});

// 7. Duplicate Buttons
router.get('/scenario-7', (req, res) => {
  res.send(renderScenarioHtml('Scenario 7: Duplicate Buttons', `
    <div class="card">
      <h1>Duplicate Actions</h1>
      <button class="newsletter">Apply Now (Newsletter)</button>
      <button class="real-apply" data-automation-id="submit-application">Submit Application</button>
    </div>
  `));
});

// 8. Ambiguous Button Text
router.get('/scenario-8', (req, res) => {
  res.send(renderScenarioHtml('Scenario 8: Ambiguous Button Text', `
    <div class="card">
      <h1>Ambiguous Page</h1>
      <button>Continue</button>
      <button>Proceed</button>
      <button data-automation-id="actual-submit">Complete Submission</button>
    </div>
  `));
});

// 9. Iframe Form
router.get('/scenario-9', (req, res) => {
  res.send(renderScenarioHtml('Scenario 9: Iframe Form', `
    <div class="card">
      <h1>Nested Iframe Application</h1>
      <iframe srcdoc="<html><body><label>Iframe Name <input id='iframe_name'></label><button>Submit Iframe</button></body></html>" style="width:100%; height:200px; border:none;"></iframe>
    </div>
  `));
});

// 10. Autocomplete
router.get('/scenario-10', (req, res) => {
  res.send(renderScenarioHtml('Scenario 10: Autocomplete', `
    <div class="card">
      <h1>Autocomplete Combobox</h1>
      <label>Skill <input type="text" id="skill" autocomplete="off"></label>
      <div class="autocomplete-suggestion" style="background:#eee; padding:4px; margin-top:2px; cursor:pointer;">React Developer</div>
    </div>
  `));
});

// 11. Custom Dropdown
router.get('/scenario-11', (req, res) => {
  res.send(renderScenarioHtml('Scenario 11: Custom Dropdown', `
    <div class="card">
      <h1>Custom Dropdown</h1>
      <div class="dropdown-toggle" onclick="document.getElementById('menu').style.display='block';">Select Education Level</div>
      <div id="menu" class="dropdown-menu" style="display:none; border:1px solid #ccc; background:white;">
        <div class="option" style="padding:8px; cursor:pointer;">Bachelor of Science</div>
        <div class="option" style="padding:8px; cursor:pointer;">Master of Science</div>
      </div>
    </div>
  `));
});

// 12. File Upload
router.get('/scenario-12', (req, res) => {
  res.send(renderScenarioHtml('Scenario 12: File Upload', `
    <div class="card">
      <h1>Resume Upload</h1>
      <label>Upload CV <input type="file" id="resume" /></label>
      <button type="submit">Upload and Continue</button>
    </div>
  `));
});

// 13. Login Gate
router.get('/scenario-13', (req, res) => {
  res.send(renderScenarioHtml('Scenario 13: Login Gate', `
    <div class="card">
      <h1>Sign In Required</h1>
      <label>Email <input type="email" id="login_email"></label>
      <label>Password <input type="password" id="login_password"></label>
      <button>Sign In</button>
    </div>
  `));
});

// 14. OTP Gate
router.get('/scenario-14', (req, res) => {
  res.send(renderScenarioHtml('Scenario 14: OTP Gate', `
    <div class="card">
      <h1>Enter Verification Code</h1>
      <p>Please enter the 6-digit OTP sent to your phone.</p>
      <label>OTP Code <input type="text" id="otp" maxlength="6"></label>
      <button>Verify Code</button>
    </div>
  `));
});

// 15. CAPTCHA Detection
router.get('/scenario-15', (req, res) => {
  res.send(renderScenarioHtml('Scenario 15: CAPTCHA Detection', `
    <div class="card">
      <h1>Security Check</h1>
      <div class="g-recaptcha" data-sitekey="mock-key">Please verify you are a human. [CAPTCHA Challenge Box]</div>
    </div>
  `));
});

// 16. Unexpected Redirect
router.get('/scenario-16', (req, res) => {
  res.send(renderScenarioHtml('Scenario 16: Unexpected Redirect', `
    <div class="card">
      <h1>Redirecting...</h1>
      <p>You are being redirected to an external portal.</p>
      <script>setTimeout(() => { window.location.href = '/api/test-pages/scenario-1'; }, 2000);</script>
    </div>
  `));
});

// 17. Stale DOM
router.get('/scenario-17', (req, res) => {
  res.send(renderScenarioHtml('Scenario 17: Stale DOM Re-render', `
    <div class="card" id="card-container">
      <h1>Single Page App Re-render</h1>
      <button id="rerender-btn" onclick="document.getElementById('card-container').innerHTML='<h1>Re-rendered DOM</h1><button id=\'real-btn\'>New Submit</button>';">Re-render DOM</button>
    </div>
  `));
});

// 18. Slow Loading
router.get('/scenario-18', (req, res) => {
  res.send(renderScenarioHtml('Scenario 18: Slow Loading', `
    <div class="card" id="content" style="display:none;">
      <h1>Loaded After Delay</h1>
      <button>Delayed Apply</button>
    </div>
    <div id="loader" class="spinner">Loading application components...</div>
    <script>setTimeout(() => { document.getElementById('loader').style.display='none'; document.getElementById('content').style.display='block'; }, 3000);</script>
  `));
});

// 19. Submission Failure
router.get('/scenario-19', (req, res) => {
  res.send(renderScenarioHtml('Scenario 19: Submission Failure', `
    <div class="card">
      <h1>Application Error</h1>
      <div class="alert-danger" role="alert">Submission failed due to server timeout. Please try again.</div>
      <button>Retry Submission</button>
    </div>
  `));
});

// 20. Submission Success
router.get('/scenario-20', (req, res) => {
  res.send(renderScenarioHtml('Scenario 20: Submission Success', `
    <div class="card">
      <h1>Application Received</h1>
      <p>Thank you for applying. Your confirmation reference number is CONF-88392.</p>
    </div>
  `));
});

// 21. Success-like URL without submission
router.get('/scenario-21', (req, res) => {
  res.send(renderScenarioHtml('Scenario 21: Fake Success Landing', `
    <div class="card">
      <h1>Welcome to Career Portal Dashboard</h1>
      <p>You have not submitted an application yet. Please complete the form below.</p>
      <label>Full Name <input type="text"></label>
    </div>
  `));
});

// 22. Changed form after final review
router.get('/scenario-22', (req, res) => {
  res.send(renderScenarioHtml('Scenario 22: Form Drift Post-Review', `
    <div class="card" id="form-area">
      <h1>Final Review State</h1>
      <label>Email <input type="email" id="email" value="jane@example.com"></label>
      <button onclick="document.getElementById('form-area').innerHTML+='<label style=\'color:red\'>Newly Added Required Field <input required></label>';">Simulate Drift</button>
    </div>
  `));
});

export default router;
