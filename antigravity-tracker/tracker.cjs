const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');

// Default Configuration
const DEFAULT_CONFIG = {
    productionFile: 'public/production.json',
    trackingStateFile: '.tracking-state.json',
    watchDirs: ['src', 'public'],
    inactivityTimeout: 2 * 60 * 1000, // 2 minutes
    saveInterval: 10 * 1000, // 10 seconds
    promptThreshold: 50,
    rulesFile: 'antigravity-tracker/antigravity_rules.txt',
    cursorRulesFile: '.cursorrules'
};

class AntigravityTracker {
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Resolve paths relative to project root (cwd)
        this.productionPath = path.resolve(process.cwd(), this.config.productionFile);
        this.trackingStatePath = path.resolve(process.cwd(), this.config.trackingStateFile);
        this.rulesSourcePath = path.resolve(process.cwd(), this.config.rulesFile);
        this.rulesDestPath = path.resolve(process.cwd(), this.config.cursorRulesFile);

        // State
        this.isTracking = false;
        this.sessionStartTime = null;
        this.lastActivityTime = null;
        this.accumulatedMinutes = 0;
        this.sessionPrompts = 0;
        this.inactivityTimer = null;
        this.saveTimer = null;
        this.fileChangeBuffer = {};

        // Bind methods
        this.onFileChange = this.onFileChange.bind(this);
    }

    loadProductionData() {
        try {
            if (fs.existsSync(this.productionPath)) {
                const data = fs.readFileSync(this.productionPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (e) {
            console.error('Error loading production data:', e.message);
        }
        return { version: '1.0.0', prompts: 0, timeSpentMinutes: 0 };
    }

    saveProductionData(data) {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.productionPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(this.productionPath, JSON.stringify(data, null, 2), 'utf8');
            console.log(`✅ Updated stats: ${data.prompts} prompts, ${this.formatTime(data.timeSpentMinutes)}`);
        } catch (e) {
            console.error('Error saving production data:', e.message);
        }
    }

    loadTrackingState() {
        try {
            if (fs.existsSync(this.trackingStatePath)) {
                const data = fs.readFileSync(this.trackingStatePath, 'utf8');
                const state = JSON.parse(data);

                // Restore state if valid
                this.sessionStartTime = state.sessionStartTime;
                this.lastActivityTime = state.lastActivityTime;
                this.accumulatedMinutes = state.accumulatedMinutes || 0;
                this.sessionPrompts = state.sessionPrompts || 0;

                // If we were tracking and crashed/stopped recently (< 5 mins ago), resume
                if (state.isTracking && (Date.now() - state.lastActivityTime < 5 * 60 * 1000)) {
                    console.log('🔄 Resuming previous session...');
                    this.startTracking();
                }
            }
        } catch (e) {
            console.error('Error loading tracking state:', e.message);
        }
    }

    saveTrackingState() {
        const state = {
            sessionStartTime: this.sessionStartTime,
            lastActivityTime: this.lastActivityTime,
            accumulatedMinutes: this.accumulatedMinutes,
            sessionPrompts: this.sessionPrompts,
            isTracking: this.isTracking
        };
        try {
            fs.writeFileSync(this.trackingStatePath, JSON.stringify(state, null, 2), 'utf8');
        } catch (e) {
            console.error('Error saving tracking state:', e.message);
        }
    }

    formatTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${m}m`;
    }

    getSessionMinutes() {
        if (!this.sessionStartTime || !this.isTracking) return 0;
        const now = Date.now();
        const elapsed = now - this.sessionStartTime;
        return Math.floor(elapsed / 60000);
    }

    startTracking() {
        if (this.isTracking) return;

        this.isTracking = true;
        this.sessionStartTime = this.sessionStartTime || Date.now(); // Keep existing start if resuming
        this.lastActivityTime = Date.now();

        console.log('🟢 Tracking started');

        this.saveTimer = setInterval(() => {
            if (this.isTracking) {
                this.updateProductionData();
            }
        }, this.config.saveInterval);

        this.resetInactivityTimer();
    }

    stopTracking(reason = 'Manual stop') {
        if (!this.isTracking) return;

        this.isTracking = false;
        this.updateProductionData();
        this.saveTrackingState();

        console.log(`🔴 Tracking stopped: ${reason}`);
        console.log(`   Session time: ${this.formatTime(this.getSessionMinutes())}`);
        console.log(`   Session prompts: ${this.sessionPrompts}`);

        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
        if (this.saveTimer) clearInterval(this.saveTimer);

        this.sessionStartTime = null;
        this.sessionPrompts = 0;
    }

    resetInactivityTimer() {
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
        this.inactivityTimer = setTimeout(() => {
            this.stopTracking('Inactivity timeout');
        }, this.config.inactivityTimeout);
    }

    updateProductionData() {
        const production = this.loadProductionData();
        const sessionMinutes = this.getSessionMinutes();

        // Update time (accumulated from previous sessions + current session)
        const totalMinutes = this.accumulatedMinutes + sessionMinutes;
        production.timeSpentMinutes = totalMinutes;

        // Update prompts
        if (this.sessionPrompts > 0) {
            production.prompts = (production.prompts || 0) + this.sessionPrompts;
            this.sessionPrompts = 0; // Reset after saving to avoid double counting
        }

        this.saveProductionData(production);
        this.saveTrackingState();
    }

    analyzeFileChange(filePath) {
        try {
            const stats = fs.statSync(filePath);
            const key = filePath;

            if (!this.fileChangeBuffer[key]) {
                this.fileChangeBuffer[key] = { size: stats.size, time: Date.now() };
                return false;
            }

            const prev = this.fileChangeBuffer[key];
            const sizeDiff = Math.abs(stats.size - prev.size);
            const timeDiff = Date.now() - prev.time;

            this.fileChangeBuffer[key] = { size: stats.size, time: Date.now() };

            // Heuristic: Large change in short time = likely AI prompt
            if (sizeDiff > 500 && timeDiff < 5000) {
                return true;
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    syncRules() {
        try {
            if (fs.existsSync(this.rulesSourcePath)) {
                const content = fs.readFileSync(this.rulesSourcePath, 'utf8');
                fs.writeFileSync(this.rulesDestPath, content);
                console.log('✅ Synced .cursorrules from antigravity_rules.txt');
            }
        } catch (e) {
            console.error('❌ Error syncing rules:', e.message);
        }
    }

    onFileChange(filePath) {
        // Check if rules file changed
        if (path.resolve(filePath) === this.rulesSourcePath) {
            this.syncRules();
            return;
        }

        this.lastActivityTime = Date.now();

        if (!this.isTracking) {
            this.startTracking();
        } else {
            this.resetInactivityTimer();
        }

        if (this.analyzeFileChange(filePath)) {
            this.sessionPrompts++;
            console.log(`📝 Prompt detected (total this session: ${this.sessionPrompts})`);
        }
    }

    init() {
        console.log('🚀 Antigravity Tracker Initialized');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        const production = this.loadProductionData();
        this.accumulatedMinutes = production.timeSpentMinutes || 0;

        // Try to load previous state
        this.loadTrackingState();

        console.log(`📊 Current stats: v${production.version} | ${production.prompts} prompts | ${this.formatTime(production.timeSpentMinutes)}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('👀 Watching for file changes...');

        // Watch source dirs AND the rules file
        const watchPaths = [...this.config.watchDirs, this.config.rulesFile];

        const watcher = chokidar.watch(watchPaths, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });

        watcher
            .on('add', this.onFileChange)
            .on('change', this.onFileChange)
            .on('unlink', this.onFileChange);

        process.on('SIGINT', () => {
            console.log('\n\n🛑 Shutting down...');
            this.stopTracking('User exit');
            process.exit(0);
        });
    }
}

// Run if called directly
if (require.main === module) {
    const tracker = new AntigravityTracker();
    tracker.init();
}

module.exports = AntigravityTracker;
