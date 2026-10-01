import fs from 'fs';
import path from 'path';
import { BrowserManager } from '../browser/browserManager.js';
import { createSession, closeSession } from '../browser/session/sessionRegistry.js';
import { getBrowserState } from '../browser/state/browserState.js';
import { serializeState } from '../browser/state/serializer.js';
import { takeScreenshot } from '../browser/screenshot/screenshotService.js';

const main = async () => {
  const url = process.argv[2];
  if (!url) {
    console.log('Usage: node src/api/src/scripts/dumpState.js <url>');
    process.exit(1);
  }

  const tempAppId = 'dump_app_' + Math.random().toString(36).substring(2, 11);
  const tempUserId = 'dump_user_123';

  console.log(`\n=== DUMP STATE TOOL ===`);
  console.log(`Target URL: ${url}`);
  console.log('Spawning persistent session context...');

  try {
    const session = await createSession(tempAppId, tempUserId);
    const page = session.tabs[0]?.page || await session.context.newPage();

    console.log('Navigating and settling...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForTimeout(3000); // Settle slightly

    console.log('Compiling consolidated BrowserState...');
    const state = await getBrowserState(page, tempAppId);

    console.log('Serializing tree state for LLM...');
    const serialized = serializeState(state);

    console.log('\n--- SERIALIZED TREE REPRESENTATION ---');
    console.log(serialized);
    console.log('--------------------------------------\n');

    console.log('Generating highlighted viewport screenshot...');
    const base64 = await takeScreenshot(page, { highlight: true });
    
    const outputPath = path.join(process.cwd(), 'highlighted.png');
    fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));

    console.log(`\nHighlight screenshot successfully written to: ${outputPath}`);
    console.log(`Captcha Signals Detected: ${state.hasCaptchaSignals}`);
    console.log(`Login Signals Detected:   ${state.hasLoginSignals}`);
    console.log(`Is PDF Frame:             ${state.isPdf}`);

    await closeSession(tempAppId);
  } catch (error) {
    console.error('Error during state dumping:', error.message);
  } finally {
    console.log('\n=== DONE ===\n');
  }
};

main();
