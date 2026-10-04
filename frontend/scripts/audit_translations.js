const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../src');
const enFile = path.resolve(srcDir, 'i18n/translations/en.ts');
const taFile = path.resolve(srcDir, 'i18n/translations/ta.ts');

function extractKeysFromTs(filepath) {
    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.split('\n');
    const stack = [];
    const keys = {};

    for (const line of lines) {
        const line_s = line.trim();
        if (!line_s || line_s.startsWith('//') || line_s.startsWith('/*')) continue;
        if (line_s.startsWith('}') || line_s.startsWith('},')) {
            if (stack.length > 0) stack.pop();
            continue;
        }
        const m_obj = line_s.match(/^([a-zA-Z0-9_]+)\s*:\s*\{/);
        if (m_obj) {
            stack.push(m_obj[1]);
            continue;
        }
        const m_val = line_s.match(/^([a-zA-Z0-9_]+)\s*:\s*["`'](.*)["`'],?/);
        if (m_val) {
            const k = m_val[1];
            const v = m_val[2];
            const fullKey = [...stack, k].join('.');
            keys[fullKey] = v;
            continue;
        }
    }
    return keys;
}

const enKeys = extractKeysFromTs(enFile);
const taKeys = extractKeysFromTs(taFile);

// Scan frontend files for t("...")
const tRegex = /\bt\(\s*["']([^"']+)["']/g;
const foundKeys = new Map();

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const f of files) {
        const full = path.join(dir, f);
        const st = fs.statSync(full);
        if (st.isDirectory()) {
            if (f !== 'node_modules' && f !== '.next') walk(full);
        } else if (/\.(tsx|ts|jsx|js)$/.test(f) && !f.endsWith('.d.ts')) {
            const code = fs.readFileSync(full, 'utf8');
            let m;
            while ((m = tRegex.exec(code)) !== null) {
                const k = m[1];
                if (!foundKeys.has(k)) foundKeys.set(k, []);
                foundKeys.get(k).push(path.relative(srcDir, full));
            }
        }
    }
}

walk(srcDir);

console.log('==============================================');
console.log('RAG UZHAVAN I18N VERIFICATION AUDIT');
console.log('==============================================');
console.log(`Total unique t(...) calls detected: ${foundKeys.size}`);
console.log(`Total keys in en.ts: ${Object.keys(enKeys).length}`);
console.log(`Total keys in ta.ts: ${Object.keys(taKeys).length}`);

let hasError = false;

const missingEn = [];
const missingTa = [];
const rawPattern = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_.-]+$/;

for (const [key, files] of foundKeys.entries()) {
    if (!enKeys[key]) {
        missingEn.push({ key, files });
        hasError = true;
    }
    if (!taKeys[key]) {
        missingTa.push({ key, files });
        hasError = true;
    }
}

if (missingEn.length > 0) {
    console.error(`\n❌ ERROR: ${missingEn.length} keys missing in en.ts:`);
    for (const item of missingEn) {
        console.error(`  - ${item.key} (used in ${item.files.join(', ')})`);
    }
} else {
    console.log('✅ All UI keys exist in en.ts');
}

if (missingTa.length > 0) {
    console.error(`\n❌ ERROR: ${missingTa.length} keys missing in ta.ts:`);
    for (const item of missingTa) {
        console.error(`  - ${item.key} (used in ${item.files.join(', ')})`);
    }
} else {
    console.log('✅ All UI keys exist in ta.ts');
}

// Check that no English or Tamil translation is accidentally a dot-separated raw key
for (const [k, v] of Object.entries(enKeys)) {
    if (rawPattern.test(v.trim()) && !v.includes(' ') && v.split('.').length > 1) {
        console.error(`⚠️ WARNING: en.ts key "${k}" value looks like a raw key: "${v}"`);
        hasError = true;
    }
}
for (const [k, v] of Object.entries(taKeys)) {
    if (rawPattern.test(v.trim()) && !v.includes(' ') && v.split('.').length > 1) {
        console.error(`⚠️ WARNING: ta.ts key "${k}" value looks like a raw key: "${v}"`);
        hasError = true;
    }
}

if (hasError) {
    console.error('\n❌ AUDIT FAILED.');
    process.exit(1);
} else {
    console.log('\n🎉 AUDIT PASSED: 100% translation coverage with ZERO raw keys.');
    process.exit(0);
}
