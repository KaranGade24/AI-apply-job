import express from 'express';

export const createTestServer = (port = 0) => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.get('/simple-form', (req, res) => {
    res.send(`<!DOCTYPE html><html><head><title>Simple Form</title></head><body>
      <form action="/success" method="POST">
        <label>Name: <input type="text" name="name" id="name" required></label>
        <label>Email: <input type="email" name="email" id="email" required></label>
        <button type="submit">Submit Application</button>
      </form>
    </body></html>`);
  });

  app.get('/multi-step-form', (req, res) => {
    const step = req.query.step || '1';
    if (step === '1') {
      res.send(`<!DOCTYPE html><html><body><form action="/multi-step-form?step=2" method="GET">
        <label>First Name: <input type="text" name="fname"></label>
        <button type="submit">Next</button>
      </form></body></html>`);
    } else {
      res.send(`<!DOCTYPE html><html><body><form action="/success" method="POST">
        <label>Resume: <input type="file" name="resume"></label>
        <button type="submit">Submit Application</button>
      </form></body></html>`);
    }
  });

  app.get('/dynamic-form', (req, res) => {
    res.send(`<!DOCTYPE html><html><body>
      <select id="visa" onchange="document.getElementById('details').style.display='block'">
        <option value="no">No</option><option value="yes">Yes</option>
      </select>
      <div id="details" style="display:none;"><input type="text" name="visa_details" placeholder="Explain"></div>
      <button type="submit">Submit</button>
    </body></html>`);
  });

  app.get('/success', (req, res) => {
    res.send(`<!DOCTYPE html><html><body><h1>Thank You! Application Submitted.</h1><p>Confirmation #: REC-123456</p></body></html>`);
  });

  app.get('/error', (req, res) => {
    res.send(`<!DOCTYPE html><html><body><div class="error">Please fix the following errors: Required field missing.</div></body></html>`);
  });

  app.get('/captcha', (req, res) => {
    res.send(`<!DOCTYPE html><html><body><div class="g-recaptcha">Please solve CAPTCHA</div></body></html>`);
  });

  app.get('/consent', (req, res) => {
    res.send(`<!DOCTYPE html><html><body><form action="/success">
      <input type="checkbox" id="consent" required><label for="consent">I agree to terms</label>
      <button type="submit">Submit</button>
    </form></body></html>`);
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      const address = server.address();
      resolve({ server, port: address.port, baseUrl: `http://localhost:${address.port}` });
    });
  });
};
