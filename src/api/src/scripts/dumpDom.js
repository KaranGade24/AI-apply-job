import { BrowserManager } from '../browser/browserManager.js';
import { getDomSnapshot } from '../browser/dom/domService.js';
import { waitForSettled } from '../browser/session/sessionRegistry.js';

const main = async () => {
  const url = process.argv[2];
  if (!url) {
    console.log('Usage: node src/api/src/scripts/dumpDom.js <url>');
    process.exit(1);
  }

  console.log(`\n=== DUMP DOM TOOL ===`);
  console.log(`Target URL: ${url}`);
  console.log('Launching browser...');

  let browser = null;
  try {
    browser = await BrowserManager.launch();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      locale: 'en-US'
    });
    const page = await context.newPage();

    console.log('Navigating to page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });

    console.log('Waiting for page settlement...');
    await waitForSettled(page);

    console.log('Capturing DOM snapshot...');
    const snapshot = await getDomSnapshot(page);

    console.log(`\n--- SNAPSHOT CAPTURED ---`);
    console.log(`Title:       ${snapshot.title}`);
    console.log(`Final URL:   ${snapshot.url}`);
    console.log(`Timestamp:   ${new Date(snapshot.timestamp).toISOString()}`);
    console.log(`Total Pages/Frames: ${snapshot.frames.length}`);
    console.log(`Interactive Elements Found: ${snapshot.elements.length}`);
    console.log(`Page Dimensions Height: ${snapshot.scroll.height}px`);
    console.log(`-------------------------\n`);

    if (snapshot.elements.length === 0) {
      console.log('No interactive elements matched interactive rules on this page.');
    } else {
      console.log('Top Matchable Interactive Elements:\n');
      const sample = snapshot.elements.slice(0, 30);
      sample.forEach((el, index) => {
        const textLabel = el.accessibleName ? `"${el.accessibleName}"` : '<empty>';
        const idLabel = el.id ? `ID: ${el.id}` : 'N/A';
        const frameLabel = el.frameId === 'main' ? '' : ` [Frame: ${el.frameId}]`;
        const visibleLabel = el.inViewport ? 'Visible' : 'Offscreen';
        const occludedLabel = el.occluded ? ' (Covered)' : '';
        console.log(`  [${index + 1}] <${el.tag}> ${idLabel}${frameLabel} | Name: ${textLabel} | Viewport: ${visibleLabel}${occludedLabel}`);
      });
      if (snapshot.elements.length > 30) {
        console.log(`\n  ... and ${snapshot.elements.length - 30} more elements (capped display to first 30)`);
      }
    }

  } catch (error) {
    console.error('Error dumping DOM:', error.message);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    console.log('\n=== DONE ===\n');
  }
};

main();
