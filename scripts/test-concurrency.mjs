import { spawn } from 'child_process';
import path from 'path';

function runProcess(name, args, delayMs = 0) {
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log(`[${name}] Starting at +${delayMs}ms...`);
            const startTime = Date.now();

            const p = spawn('npx', ['tsx', '-e', `
        import { RedNoteTools } from './src/tools/rednoteTools';
        const tools = new RedNoteTools();
        tools.searchNotes('科技', 2)
          .then(() => console.log('SUCCESS'))
          .catch(e => console.error('ERROR:', e))
          .finally(() => process.exit(0));
      `], {
                cwd: process.cwd(),
                env: { ...process.env, DEBUG: 'mcp:*' }
            });

            let output = '';
            p.stdout.on('data', d => output += d.toString());
            p.stderr.on('data', d => output += d.toString());

            p.on('close', code => {
                const time = (Date.now() - startTime) / 1000;
                console.log(`\n[${name}] Finished in ${time.toFixed(1)}s (code ${code})`);

                // Filter out playwright/puppeteer noise to see our logs
                const relevantLines = output.split('\n').filter(l =>
                    l.includes('Launching new browser') ||
                    l.includes('Attempting to connect') ||
                    l.includes('Successfully connected') ||
                    l.includes('SUCCESS') ||
                    l.includes('ERROR') ||
                    l.includes('BrowserManager')
                );
                console.log(relevantLines.join('\n'));
                resolve({ code, output });
            });
        }, delayMs);
    });
}

async function main() {
    console.log('=== Starting Real-World Concurrency Test ===');

    // Clean up any existing lockfiles to simulate a fresh start
    const fs = await import('fs');
    const lockfile = path.join(process.env.HOME || process.env.USERPROFILE, '.mcp', 'rednote', 'profiles', 'default', 'browser.wsEndpoint');
    try { fs.unlinkSync(lockfile); } catch (e) { }

    const lockfile2 = path.join(process.env.HOME || process.env.USERPROFILE, '.mcp', 'rednote', 'profiles', 'acc_mm9oyefb_pvqe', 'browser.wsEndpoint');
    try { fs.unlinkSync(lockfile2); } catch (e) { }

    // Process 1 starts immediately
    const p1 = runProcess('Process 1', [], 0);

    // Process 2 starts 2 seconds later (should connect to Process 1's browser)
    const p2 = runProcess('Process 2', [], 2000);

    // Process 3 starts 4 seconds later
    const p3 = runProcess('Process 3', [], 4000);

    await Promise.all([p1, p2, p3]);
    console.log('\n=== Test Complete ===');
}

main().catch(console.error);
