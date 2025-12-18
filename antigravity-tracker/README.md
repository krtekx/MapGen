# Antigravity Tracker

A reusable productivity tracking system for Antigravity projects. Tracks time, prompt counts, and manages versioning.

## Features
- **Time Tracking**: Automatically tracks time spent on the project.
- **Prompt Counting**: Detects potential AI prompts based on file change heuristics.
- **Versioning**: Enforces version updates in `package.json` and `production.json`.
- **Dashboard**: Updates `public/production.json` for display in your app.
- **Rules**: Sets up `.cursorrules` for AI behavior.

## Installation

1.  **Copy Folder**: Copy the entire `antigravity-tracker` folder to the root of your new project.
2.  **Run Setup**: Execute the setup script:
    ```bash
    node antigravity-tracker/setup.cjs
    ```
    This will:
    - Install `chokidar` dependency.
    - Add `track` and `track:stop` scripts to `package.json`.
    - Create/Update `.cursorrules`.
    - Initialize `public/production.json`.
    - Update `.gitignore`.

## Usage

### Start Tracking
Run the following command when you start working:
```bash
npm run track
```
The tracker will run in the background, monitoring file changes. It auto-saves every 10 seconds.

### Stop Tracking
To stop tracking manually:
```bash
npm run track:stop
```
(Or simply kill the terminal process).

### Configuration
You can modify `antigravity-tracker/tracker.cjs` to adjust:
- `inactivityTimeout`: Default 2 minutes.
- `saveInterval`: Default 10 seconds.
- `watchDirs`: Directories to monitor (default `['src', 'public']`).

### Display Debug Panel
To show the debug panel in your application, simply import the client script in your main JavaScript entry point (e.g., `main.js` or `index.js`):

```javascript
import '../antigravity-tracker/client.js';
```

This will automatically fetch the data from `production.json` and display the overlay.
