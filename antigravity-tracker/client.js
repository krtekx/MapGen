/**
 * Antigravity Tracker Client
 * Imports this file to automatically render the debug panel in your app.
 */

(function () {
    // Prevent multiple instances (HMR)
    if (window.__antigravityInterval) clearInterval(window.__antigravityInterval);
    const existingPanel = document.querySelector('.antigravity-debug-panel');
    if (existingPanel) existingPanel.remove();

    // Styles
    const style = document.createElement('style');
    style.textContent = `
        .antigravity-debug-panel {
            position: fixed;
            bottom: 10px;
            left: 10px;
            background-color: rgba(0, 0, 0, 0.7);
            padding: 6px 10px;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            color: white;
            z-index: 99999;
            line-height: 1.3;
            border-radius: 4px;
            pointer-events: none;
            backdrop-filter: blur(2px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .antigravity-debug-version { font-weight: bold; color: #ffd700; }
        .antigravity-debug-stats { opacity: 0.8; }
    `;
    document.head.appendChild(style);

    // DOM Elements
    const panel = document.createElement('div');
    panel.className = 'antigravity-debug-panel';
    document.body.appendChild(panel);

    // State
    let productionData = { version: '...', prompts: 0, timeSpentMinutes: 0 };

    function formatTime(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h}h ${m}m`;
    }

    function updateDisplay() {
        panel.innerHTML = `
            <div class="antigravity-debug-version">v${productionData.version}</div>
            <div class="antigravity-debug-stats">
                Prompts: ${productionData.prompts} | Time: ${formatTime(productionData.timeSpentMinutes)}
            </div>
        `;
    }

    async function fetchData() {
        try {
            // Add timestamp to prevent caching
            // Fix: fetching directly from root, not /public/
            const response = await fetch('/production.json?t=' + Date.now());
            if (response.ok) {
                productionData = await response.json();
                updateDisplay();
            }
        } catch (e) {
            // Silent fail
        }
    }

    // Initial load
    fetchData();

    // Poll every 10 seconds
    window.__antigravityInterval = setInterval(fetchData, 10000);

    console.log('🚀 Antigravity Debug Panel Loaded');
})();
