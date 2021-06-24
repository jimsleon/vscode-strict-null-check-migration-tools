// @ts-check
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const config = require('./src/config');
const { forStrictNullCheckEligibleFiles } = require('./src/getStrictNullCheckEligibleFiles');
const vscodeRoot = path.join(process.cwd(), process.argv[2]);
const srcRoot = path.join(vscodeRoot, 'src');
const tsc = path.join(vscodeRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const buildCompletePattern = /Found (\d+) errors?\. Watching for file changes\./gi;
forStrictNullCheckEligibleFiles(vscodeRoot, () => { }).then(async (files) => {
    const tsconfigPath = path.join(vscodeRoot, config.targetTsconfig);
    const child = child_process.spawn('node', [tsc, '-p', tsconfigPath, '--watch']);
    for (const file of files) {
        await tryAutoAddStrictNulls(child, tsconfigPath, file);
    }
    child.kill();
});
function tryAutoAddStrictNulls(child, tsconfigPath, file) {
    return new Promise(resolve => {
        const relativeFilePath = path.relative(vscodeRoot, file);
        console.log(`Trying to auto add '${relativeFilePath}'`);
        const originalConifg = JSON.parse(fs.readFileSync(tsconfigPath).toString());
        originalConifg.files = Array.from(new Set(originalConifg.files.sort()));
        // Config on accept
        const newConfig = Object.assign({}, originalConifg);
        newConfig.files = Array.from(new Set(originalConifg.files.concat('./' + relativeFilePath).sort()));
        fs.writeFileSync(tsconfigPath, JSON.stringify(newConfig, null, '\t'));
        const listener = (data) => {
            const textOut = data.toString();
            const match = buildCompletePattern.exec(textOut);
            if (match) {
                const errorCount = +match[1];
                if (errorCount === 0) {
                    console.log(`👍`);
                    fs.writeFileSync(tsconfigPath, JSON.stringify(newConfig, null, '\t'));
                }
                else {
                    console.log(`💥 - ${errorCount}`);
                    fs.writeFileSync(tsconfigPath, JSON.stringify(originalConifg, null, '\t'));
                }
                resolve();
                child.stdout.removeListener('data', listener);
            }
        };
        child.stdout.on('data', listener);
    });
}