import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiDir = path.resolve(__dirname, '..');

function getAllJsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        results = results.concat(getAllJsFiles(filePath));
      }
    } else if (file.endsWith('.js') && !file.endsWith('.test.js') && file !== 'checkImports.js') {
      results.push(filePath);
    }
  }
  return results;
}

async function verifyAllImports() {
  const files = getAllJsFiles(apiDir);
  console.log(`Found ${files.length} JS files to import check.`);
  let failed = 0;
  const errors = [];

  for (const file of files) {
    const fileUrl = pathToFileURL(file).href;
    try {
      await import(fileUrl);
    } catch (err) {
      failed++;
      errors.push({ file: path.relative(apiDir, file), error: err.message, stack: err.stack });
    }
  }

  if (failed > 0) {
    console.error(`❌ ${failed} files failed to import:`);
    errors.forEach((e) => console.error(`  - ${e.file}: ${e.error}`));
    process.exit(1);
  } else {
    console.log(`✅ All ${files.length} JS files imported successfully!`);
  }
}

verifyAllImports();
