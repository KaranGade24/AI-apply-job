import { createSession, closeSession } from '../browser/session/sessionRegistry.js';
import { runUnknownAgentLoop } from '../application/unknown/unknownAgent.js';

const main = async () => {
  const url = process.argv[2];
  if (!url) {
    console.log('Usage: node src/api/src/scripts/runUnknownAgent.js <url> [--dry-run] [--headed]');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const headed = process.argv.includes('--headed');

  console.log(`\n=== RUN UNKNOWN AGENT LOOP TOOL ===`);
  console.log(`Target URL: ${url}`);
  console.log(`Config: dryRun=${dryRun}, headed=${headed}`);

  if (headed) {
    // Configure Playwright launch config globally for this run
    process.env.BROWSER_HEADLESS = 'false';
  }

  const tempAppId = 'test_loop_app_' + Math.random().toString(36).substring(2, 11);
  const tempUserId = 'test_user_loop';

  const fakeCandidate = {
    personalInfo: {
      fullName: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+1 555-0199'
    },
    summary: 'Senior Software Engineer with 8+ years of React and Node.js expertise.',
    skills: ['JavaScript', 'React', 'Node.js', 'Playwright', 'MongoDB'],
    experience: [
      {
        role: 'Full Stack Engineer',
        company: 'Cloudtech Corp',
        duration: '2020 - Present',
        description: 'Built high-throughput backend APIs and modern interactive UI pages.'
      }
    ]
  };

  const fakeJob = {
    title: 'Senior Node.js Developer',
    company: 'Innovate Solutions Inc',
    applicationUrl: url,
    description: 'Looking for a Senior Backend Node.js Developer with database experience.'
  };

  try {
    console.log('Spawning session and context...');
    const session = await createSession(tempAppId, tempUserId);

    console.log('Starting Agent Loop...');
    const result = await runUnknownAgentLoop({
      applicationId: tempAppId,
      userId: tempUserId,
      candidateInfo: fakeCandidate,
      jobDetails: fakeJob,
      maxSteps: 8
    });

    console.log(`\n--- LOOP CONCLUDED ---`);
    console.log(`Status:  ${result.status}`);
    console.log(`Summary: ${result.summary}`);
    console.log(`Steps Performed: ${result.history.length}`);
    console.log(`-----------------------\n`);

    console.log('Step Execution Traces:');
    result.history.forEach((step, idx) => {
      console.log(`\n  [Step ${step.step}] URL: ${step.url}`);
      console.log(`    Page Type: ${step.pageType}`);
      console.log(`    Goal:      "${step.goal}"`);
      console.log(`    Actions attempted:`);
      step.actions.forEach((act, actIdx) => {
        const res = step.results[actIdx] || { success: false, error: 'Cancelled' };
        console.log(`      (${actIdx + 1}) ${act.type} -> success=${res.success} ${res.error ? `[Error: ${res.error}]` : ''}`);
      });
    });

  } catch (err) {
    console.error('Error running unknown agent CLI tool:', err.message);
  } finally {
    // Session is closed by the loop itself, but let's make sure
    await closeSession(tempAppId).catch(() => {});
    console.log('\n=== DONE ===\n');
  }
};

main();
