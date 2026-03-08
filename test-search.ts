import { RedNoteTools } from './src/tools/rednoteTools';
import { BrowserManager } from './src/browser/browserManager';

async function main() {
    const accountId = 'acc_mmd11xuk_h2k5';
    console.log(`[TEST] Using account ID: ${accountId}`);
    const tools = new RedNoteTools();

    console.log(`[TEST] Initiating headless search for "春天" ...`);
    try {
        const result = await tools.searchNotes('春天', 3, accountId);
        console.log(`[TEST] Result length:`, result.length);
    } catch (e) {
        console.error(`[TEST] Search Failed:`, e);
    } finally {
        // Take a screenshot to see what headless XHS looks like
        console.log(`[TEST] Taking debug snapshot...`);
        const bm = BrowserManager.getInstance(accountId);
        const lease = await bm.acquirePage();
        try {
            await lease.page.screenshot({ path: 'headless-debug.png', fullPage: true });
            console.log(`[TEST] Saved debug screenshot to headless-debug.png`);

            const html = await lease.page.content();
            require('fs').writeFileSync('headless-debug.html', html);
            console.log(`[TEST] Saved debug HTML to headless-debug.html`);
        } catch (innerErr) {
            console.error(`[TEST] Failed to capture debug state:`, innerErr);
        } finally {
            await lease.release();
        }
    }
}

main().then(() => {
    console.log('[TEST] Done.');
    process.exit(0);
}).catch(e => {
    console.error('[TEST] Fatal:', e);
    process.exit(1);
});
