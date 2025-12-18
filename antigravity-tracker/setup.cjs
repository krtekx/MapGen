const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const REQUIRED_DEPS = ['chokidar'];
const TRACKER_DIR = 'antigravity-tracker';
const PRODUCTION_FILE = 'public/production.json';
const CURSOR_RULES_FILE = '.cursorrules';

console.log('🚀 Setting up Antigravity Tracker...');

// 1. Install Dependencies
console.log('📦 Checking dependencies...');
try {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        console.error('❌ No package.json found. Please run npm init first.');
        process.exit(1);
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    const missingDeps = REQUIRED_DEPS.filter(dep => !deps[dep]);

    if (missingDeps.length > 0) {
        console.log(`Installing missing dependencies: ${missingDeps.join(', ')}...`);
        execSync(`npm install -D ${missingDeps.join(' ')}`, { stdio: 'inherit' });
    } else {
        console.log('✅ Dependencies already installed.');
    }

    // 2. Add Scripts
    console.log('📜 Updating npm scripts...');
    packageJson.scripts = packageJson.scripts || {};
    packageJson.scripts['track'] = `node ${TRACKER_DIR}/tracker.cjs`;
    packageJson.scripts['track:stop'] = 'taskkill /F /IM node.exe /FI "WINDOWTITLE eq tracker.cjs" || echo No tracking process found';

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('✅ Scripts added to package.json');

} catch (e) {
    console.error('❌ Error updating package.json:', e.message);
}

// 3. Initialize Production Data
console.log('📊 Initializing production data...');
const productionPath = path.resolve(process.cwd(), PRODUCTION_FILE);
if (!fs.existsSync(productionPath)) {
    const dir = path.dirname(productionPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const initialData = {
        version: '1.0.0',
        prompts: 0,
        timeSpentMinutes: 0
    };
    fs.writeFileSync(productionPath, JSON.stringify(initialData, null, 2));
    console.log(`✅ Created ${PRODUCTION_FILE}`);
} else {
    console.log(`✅ ${PRODUCTION_FILE} already exists.`);
}

// 4. Update .cursorrules
console.log('🤖 Updating .cursorrules...');
const rulesSourcePath = path.resolve(process.cwd(), TRACKER_DIR, 'antigravity_rules.txt');
const rulesDestPath = path.resolve(process.cwd(), CURSOR_RULES_FILE);

if (fs.existsSync(rulesSourcePath)) {
    const rulesContent = fs.readFileSync(rulesSourcePath, 'utf8');
    fs.writeFileSync(rulesDestPath, rulesContent);
    console.log('✅ Synced .cursorrules from antigravity_rules.txt');
} else {
    console.warn('⚠️ antigravity_rules.txt not found in tracker directory.');
}

// 5. Update .gitignore
console.log('🙈 Updating .gitignore...');
const gitignorePath = path.resolve(process.cwd(), '.gitignore');
const ignoreItem = '.tracking-state.json';

if (fs.existsSync(gitignorePath)) {
    let gitignore = fs.readFileSync(gitignorePath, 'utf8');
    if (!gitignore.includes(ignoreItem)) {
        fs.appendFileSync(gitignorePath, `\n${ignoreItem}`);
        console.log(`✅ Added ${ignoreItem} to .gitignore`);
    } else {
        console.log('✅ .gitignore already configured.');
    }
} else {
    fs.writeFileSync(gitignorePath, ignoreItem);
    console.log('✅ Created .gitignore');
}

console.log('\n✨ Antigravity Tracker setup complete!');
console.log('👉 Run "npm run track" to start tracking.');
