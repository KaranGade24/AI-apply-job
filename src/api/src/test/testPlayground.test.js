import assert from 'assert';
import http from 'http';

// We can test the local scenarios via express or fetch against a test instance or test the scenario route generators directly
import express from 'express';
import testPlaygroundRouter from '../router/testPlayground.router.js';

const app = express();
app.use('/api/test-pages', testPlaygroundRouter);

async function runTestPlaygroundScenariosTests() {
  console.log('--- STARTING 22 LOCAL TEST PLAYGROUND SCENARIOS TESTS ---');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/test-pages`;

  try {
    for (let i = 1; i <= 22; i++) {
      const url = `${baseUrl}/scenario-${i}`;
      const res = await fetch(url);
      assert.strictEqual(res.status, 200, `Scenario ${i} failed to return 200 OK`);
      const html = await res.text();
      assert.ok(html.includes('Scenario'), `Scenario ${i} HTML does not contain scenario title`);
      console.log(`✅ Scenario ${i} HTML generated and verified successfully.`);
    }

    console.log('🎉 ALL 22 TEST PLAYGROUND SCENARIOS VERIFIED SUCCESSFULLY.');
  } catch (error) {
    console.error('❌ Test Playground Scenarios Failed:', error);
    process.exit(1);
  } finally {
    server.close();
  }
}

runTestPlaygroundScenariosTests();
