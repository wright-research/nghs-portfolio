// AuthenticationManager (legacy hash: username|password|displayName)
// - Injects a Shoelace-based login overlay and a loading overlay
// - Gates access to the app by covering the UI until valid credentials are entered
// - Stores auth state in sessionStorage (no "remember me")
// - On login, updates the main drawer with Welcome text and a Logout button

class AuthenticationManager {
    constructor(options = {}) {
        /** @type {string[]} */
        this.validCredentialHashes = Array.isArray(options.validCredentialHashes)
            ? options.validCredentialHashes.slice()
            : [
                '00rf45p84o1zu.d3dyaWdodDJ8dHJpcGxlanVtcHxXaWxs', // Will
                '00ez1v013p1e3.YWVpZnJpZDJ8YW15NDU2fEFteQ==', // Amy 
                '00slq9eu4v1yw.Z2hva2F5ZW0yfGhva2F5ZW0yfEdlb3JnZQ==', // George
                '00tb11ea5221q.d2JhZ3dlbGwyfHdpbGxpYW0hfFdpbGxpYW0=' // William Bagwell
            ];

        this.onLogin = typeof options.onLogin === 'function' ? options.onLogin : null;
        this.onLogout = typeof options.onLogout === 'function' ? options.onLogout : null;

        // DOM refs created on init
        this.loginOverlay = null;
        this.authForm = null;
        this.usernameInput = null;
        this.passwordInput = null;
        this.errorMessage = null;
        this.loadingOverlay = null;
        this.loadingProgress = null;
        this.loadingPercent = null;
        this._suspendedDrawers = [];
    }

    init(options = {}) {
        // Allow passing callbacks/hashes at init time
        if (typeof options.onLogin === 'function') this.onLogin = options.onLogin;
        if (typeof options.onLogout === 'function') this.onLogout = options.onLogout;
        if (Array.isArray(options.validCredentialHashes)) this.validCredentialHashes = options.validCredentialHashes.slice();
        console.log('[Auth] init() begin');
        this.#injectStyles();
        this.#injectLoginOverlay();
        this.#injectLoadingOverlay();

        // Wire submit
        this.authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('[Auth] form submit');
            this.#handleLogin();
        });

		// Allow pressing Enter in inputs to submit the form
		const submitOnEnter = (ev) => {
			if (ev && (ev.key === 'Enter' || ev.keyCode === 13)) {
				ev.preventDefault();
				if (this.authForm && typeof this.authForm.requestSubmit === 'function') {
					this.authForm.requestSubmit();
				} else if (this.authForm) {
					// Fallback for older browsers
					this.authForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
				}
			}
		};
		if (this.usernameInput) this.usernameInput.addEventListener('keydown', submitOnEnter);
		if (this.passwordInput) this.passwordInput.addEventListener('keydown', submitOnEnter);

        // If already authenticated in this session, restore and update drawer UI
        if (sessionStorage.getItem('authenticated') === 'true') {
            const storedUsername = sessionStorage.getItem('username') || '';
            const storedDisplayName = sessionStorage.getItem('displayName') || storedUsername;
            this.#hide(this.loginOverlay);
            console.log('[Auth] session authenticated; restoring and calling onLogin');
            this.#updateDrawerWelcomeAndLogout(storedDisplayName);
            if (this.onLogin) {
                console.log('[Auth] invoking onLogin callback (session restore)');
                this.onLogin({ username: storedUsername, displayName: storedDisplayName });
            }
        } else {
            console.log('[Auth] no session; showing login overlay');
            this.#suspendDrawers();
            this.#show(this.loginOverlay);
            setTimeout(() => this.usernameInput.focus(), 100);
        }
    }

    setValidHashes(hashes) {
        if (Array.isArray(hashes)) this.validCredentialHashes = hashes.slice();
    }

    logout() {
        console.log('[Auth] logout()');
        try {
            sessionStorage.removeItem('authenticated');
            sessionStorage.removeItem('username');
            sessionStorage.removeItem('displayName');
        } catch (_) {}
        // Reset progress ring to prevent counter-clockwise animation on next login
        if (this.loadingProgress) {
            this.loadingProgress.value = 0;
        }
        this.#suspendDrawers();
        this.#show(this.loginOverlay);
        this.errorMessage.style.display = 'none';
        this.authForm.reset();
        setTimeout(() => this.usernameInput.focus(), 100);
        if (this.onLogout) this.onLogout();
    }

    // Internal: UI
    #injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .auth-overlay { position: fixed; inset: 0; background: #F5F5F5; display: flex; justify-content: center; align-items: center; z-index: 9999; }
            .auth-card { background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); width: 100%; max-width: 480px; }
            .auth-header { text-align: center; margin-bottom: 1.5rem; }
            .auth-error { color: #dc3545; background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 0.5rem 0.75rem; margin: 0.5rem 0 1rem 0; display: none; }
            .auth-hidden { display: none !important; }
            .auth-loading { position: fixed; inset: 0; background: #F5F5F5; display: flex; justify-content: center; align-items: center; z-index: 9998; }
            .auth-loading-card { background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); width: 100%; max-width: 420px; text-align: center; }
            .auth-loading-title { margin: 0 0 1rem 0; font-size: 1.2rem; color: #333; }
            .auth-loading-percent { margin-top: 0.5rem; font-weight: 600; color: #333; }
            .auth-welcome-block { margin-bottom: 16px; padding: 0; background: transparent; border: none; }
            .auth-brand-logo { position: fixed; top: 50px; left: 50px; height: 80px; width: auto; z-index: 10000; }
			.auth-input { width: 100%; box-sizing: border-box; }
			.auth-password-wrapper { position: relative; }
            .auth-eye-toggle { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: transparent; border: none; padding: 4px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
            .auth-eye-toggle svg { width: 18px; height: 18px; fill: none; stroke: #555; stroke-width: 2; }
            .auth-eye-toggle:hover svg { stroke: #000; }
            /* Ensure the progress ring matches our RAF updates exactly */
            wa-progress-ring::part(indicator) { transition: stroke-dashoffset 0s linear !important; }
        `;
        document.head.appendChild(style);
    }

    #injectLoginOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'auth-overlay';
        overlay.innerHTML = `
            <img src="assets/nghs_logo.png" alt="NGHS" class="auth-brand-logo" />
            <div class="auth-card">
                <div class="auth-header">
                    <h1 style="margin:0 0 0.5rem 0; font-size: 1.5rem; color:#333; font-weight: 700;">NGHS Interactive Portfolio</h1>
                    <p style="margin:0; color:#666;">Please log in to continue</p>
                </div>
                <form id="auth-form">
                    <div style="margin-bottom: 1rem; display:flex; flex-direction:column; gap:6px;">
                        <label for="auth-username-input" style="font-weight:600; color:#333;">Username</label>
                        <input id="auth-username-input" class="auth-input" name="username" type="text" autocomplete="username" required style="padding:0.65rem 0.75rem; border:1px solid #ddd; border-radius:6px; font-size:1rem;" />
                    </div>
                    <div style="margin-bottom: 1rem; display:flex; flex-direction:column; gap:6px;">
                        <label for="auth-password-input" style="font-weight:600; color:#333;">Password</label>
                        <div class="auth-password-wrapper">
                            <input id="auth-password-input" class="auth-input" name="password" type="password" autocomplete="current-password" required style="padding:0.65rem 2.2rem 0.65rem 0.75rem; border:1px solid #ddd; border-radius:6px; font-size:1rem;" />
                            <button type="button" id="auth-eye-toggle" class="auth-eye-toggle" aria-label="Show password" title="Show password">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                        </div>
                    </div>
                    <div id="auth-error" class="auth-error">Invalid username or password. Please try again.</div>
                    <wa-button type="submit" variant="primary" style="width:100%;">Login</wa-button>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);
        this.loginOverlay = overlay;
        this.authForm = overlay.querySelector('#auth-form');
        this.usernameInput = overlay.querySelector('#auth-username-input');
        this.passwordInput = overlay.querySelector('#auth-password-input');
        this.errorMessage = overlay.querySelector('#auth-error');
        // Password visibility toggle
        const eyeToggle = overlay.querySelector('#auth-eye-toggle');
        if (eyeToggle) {
            eyeToggle.addEventListener('click', () => {
                const isPassword = this.passwordInput.getAttribute('type') === 'password';
                this.passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
                // Swap icon between eye and eye-slash
                const eyeSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
                const slashSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 1l22 22"/><path d="M1 12s4-7 11-7c2.1 0 3.9.6 5.4 1.5"/><path d="M23 12s-4 7-11 7c-2.1 0-3.9-.6-5.4-1.5"/><circle cx="12" cy="12" r="3"/></svg>';
                eyeToggle.innerHTML = isPassword ? slashSvg : eyeSvg;
                eyeToggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
                eyeToggle.setAttribute('title', isPassword ? 'Hide password' : 'Show password');
                this.passwordInput.focus();
                this.passwordInput.setSelectionRange(this.passwordInput.value.length, this.passwordInput.value.length);
            });
        }
    }

    #injectLoadingOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'auth-loading auth-hidden';
        overlay.innerHTML = `
            <img src="assets/nghs_logo.png" alt="NGHS" class="auth-brand-logo" />
            <div class="auth-loading-card">
                <p class="auth-loading-title">Loading...</p>
                <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
                    <wa-progress-ring id="auth-loading-ring" style="--size: 130px; --track-color: #bdbdbd; --track-width: 8px; --indicator-color: #96942E; --indicator-width: 10px;"></wa-progress-ring>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        this.loadingOverlay = overlay;
        this.loadingProgress = overlay.querySelector('#auth-loading-ring');
        this.loadingPercent = overlay.querySelector('#auth-loading-percent');
    }

    // Internal: Logic
    #handleLogin() {
        const username = this.usernameInput.value;
        const password = this.passwordInput.value;
        console.log('[Auth] handleLogin attempt for user:', username);
        const authResult = this.#authenticate(username, password);
        if (authResult.isValid) {
            const userInfo = authResult.userInfo;
            this.errorMessage.style.display = 'none';
            // Persist session immediately so app init can read it
            try {
                sessionStorage.setItem('authenticated', 'true');
                sessionStorage.setItem('username', userInfo.username);
                sessionStorage.setItem('displayName', userInfo.displayName);
            } catch (_) {}

            // Hide the login form and show the loading overlay while we initialize in parallel
            this.#hide(this.loginOverlay);
            console.log('[Auth] credentials valid; starting loading sequence and app init in parallel');

            const spinnerPromise = this.#runLoadingSequence(2200, 2500);
            const initPromise = this.onLogin ? Promise.resolve(this.onLogin(userInfo)) : Promise.resolve();

            // Wait for both: minimum spinner duration and app readiness
            Promise.all([spinnerPromise, initPromise]).then(() => {
                setTimeout(() => {
                    console.log('[Auth] spinner and app init complete; restoring drawers and revealing app');
                    this.#restoreDrawers();
                    this.#updateDrawerWelcomeAndLogout(userInfo.displayName);
                    this.#hide(this.loadingOverlay);
                }, 300);
            });
        } else {
            console.warn('[Auth] invalid credentials');
            this.errorMessage.style.display = 'block';
            this.passwordInput.value = '';
            this.passwordInput.focus();
        }
    }

    // Temporarily close any open Shoelace drawers to prevent focus trapping (inert) from blocking the overlay
    #suspendDrawers() {
        try {
            this._suspendedDrawers = [];
            const drawers = Array.from(document.querySelectorAll('wa-drawer'));
            drawers.forEach((drawer) => {
                const wasOpen = (drawer.open === true) || (drawer.hasAttribute('open') && !drawer.hidden);
                if (wasOpen) {
                    this._suspendedDrawers.push(drawer);
                    drawer.open = false;
                }
            });
            if (this._suspendedDrawers.length) {
                console.log(`[Auth] suspended ${this._suspendedDrawers.length} drawer(s)`);
            }
        } catch (_) {}
    }

    #restoreDrawers() {
        try {
            this._suspendedDrawers.forEach((drawer) => {
                drawer.open = true;
            });
            if (this._suspendedDrawers.length) {
                console.log(`[Auth] restored ${this._suspendedDrawers.length} drawer(s)`);
            }
            this._suspendedDrawers = [];
        } catch (_) {}
    }

    #authenticate(inputUser, inputPass) {
        for (const validHash of this.validCredentialHashes) {
            const extracted = this.#extractFromHash(validHash);
            if (extracted && extracted.username === inputUser && extracted.password === inputPass) {
                const separatorUsed = validHash.includes('.') ? '.' : 'x';
                const regenerated = extracted.includesInitials
                    ? this.#createCredentialHashFull(extracted.username, extracted.password, extracted.displayName, extracted.initials, separatorUsed)
                    : this.#createCredentialHashLegacy(extracted.username, extracted.password, extracted.displayName, separatorUsed);
                if (regenerated === validHash) {
                    return { isValid: true, userInfo: { username: extracted.username, displayName: extracted.displayName } };
                }
            }
        }
        return { isValid: false, userInfo: null };
    }

    // Legacy hash: username|password|displayName (no initials)
    #createCredentialHashLegacy(username, password, displayName, separator = '.') {
        const credentialData = `${username}|${password}|${displayName}`;
        let hash = 0;
        for (let i = 0; i < credentialData.length; i++) {
            const char = credentialData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const positiveHash = Math.abs(hash);
        let result = positiveHash.toString(36);
        while (result.length < 8) result = '0' + result;
        const lengthSuffix = (credentialData.length * 7).toString(36);
        const charSumSuffix = (credentialData.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)).toString(36);
        const encodedData = btoa(credentialData);
        return result + lengthSuffix + charSumSuffix + separator + encodedData;
    }

    #extractFromHash(hash) {
        const tryDecodeFromIndex = (startIdx) => {
            try {
                const encodedPart = hash.substring(startIdx + 1);
                const decoded = atob(encodedPart);
                const parts = decoded.split('|');
                if (parts.length >= 3) {
                    return {
                        username: parts[0],
                        password: parts[1],
                        displayName: parts[2],
                        initials: parts[3] || '',
                        includesInitials: parts.length >= 4
                    };
                }
            } catch (_) {}
            return null;
        };
        const dotIndex = hash.indexOf('.');
        if (dotIndex !== -1) {
            const result = tryDecodeFromIndex(dotIndex);
            if (result) return result;
        }
        for (let i = 0; i < hash.length; i++) {
            if (hash[i] === 'x') {
                const result = tryDecodeFromIndex(i);
                if (result) return result;
            }
        }
        return null;
    }

    // Full variant that includes initials to match generator-produced hashes
    #createCredentialHashFull(username, password, displayName, initials, separator = '.') {
        const credentialData = `${username}|${password}|${displayName}|${initials}`;
        let hash = 0;
        for (let i = 0; i < credentialData.length; i++) {
            const char = credentialData.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        const positiveHash = Math.abs(hash);
        let result = positiveHash.toString(36);
        while (result.length < 8) result = '0' + result;
        const lengthSuffix = (credentialData.length * 7).toString(36);
        const charSumSuffix = (credentialData.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)).toString(36);
        const encodedData = btoa(credentialData);
        return result + lengthSuffix + charSumSuffix + separator + encodedData;
    }

    #runLoadingSequence(durationMs = 2000, maxTotalMs = 3000) {
        return new Promise((resolve) => {
            if (!this.loadingOverlay || !this.loadingProgress) {
                resolve();
                return;
            }
            // Ensure ring starts at 0 and show overlay
            this.loadingProgress.value = 0;
            this.#show(this.loadingOverlay);
            console.log(`[Auth] loading overlay shown; duration=${durationMs} maxTotal=${maxTotalMs}`);
            
            // Small delay to ensure DOM updates before starting animation
            setTimeout(() => {
                const maxPauseBudget = Math.max(0, maxTotalMs - durationMs);
                const pauseCount = 2 + Math.floor(Math.random() * 3);
                const rawDurations = Array.from({ length: pauseCount }, () => 120 + Math.random() * 200);
                const rawSum = rawDurations.reduce((a, b) => a + b, 0);
                const scale = rawSum > maxPauseBudget && rawSum > 0 ? (maxPauseBudget / rawSum) : 1;
                const pauseDurations = rawDurations.map(d => Math.round(d * scale));
                const totalPauseMs = pauseDurations.reduce((a, b) => a + b, 0);

                const minGap = 120;
                const tentative = Array.from({ length: pauseCount }, () => {
                    const min = durationMs * 0.15, max = durationMs * 0.85;
                    return Math.round(min + Math.random() * (max - min));
                }).sort((a, b) => a - b);
                const windows = [];
                for (let i = 0; i < pauseCount; i++) {
                    const startEff = i === 0 ? tentative[i] : Math.max(tentative[i], windows[i - 1].start + minGap);
                    const dur = pauseDurations[i];
                    const clampedStart = Math.min(startEff, Math.max(0, durationMs - dur - 50));
                    windows.push({ start: clampedStart, end: clampedStart + dur, dur });
                }
                const abs = [];
                let accum = 0;
                for (const w of windows) {
                    const s = w.start + accum;
                    abs.push({ start: s, end: s + w.dur, dur: w.dur });
                    accum += w.dur;
                }
                const totalDuration = durationMs + totalPauseMs;

                const pausedElapsedAt = (elapsed) => {
                    let sum = 0;
                    for (const w of abs) {
                        const overlap = Math.max(0, Math.min(elapsed, w.end) - w.start);
                        sum += Math.min(overlap, w.dur);
                    }
                    return sum;
                };

                const start = performance.now();
                const step = (now) => {
                    const elapsed = now - start;
                    const pausedSoFar = pausedElapsedAt(elapsed);
                    const effective = Math.max(0, Math.min(durationMs, elapsed - pausedSoFar));
                    const ratio = effective / durationMs;
                    const pct = Math.min(99, Math.floor(ratio * 100));
                    this.loadingProgress.value = pct;
                    if (elapsed < totalDuration) {
                        requestAnimationFrame(step);
                    } else {
                        this.loadingProgress.value = 100;
                        // Do not hide overlay here; caller controls final hide timing
                        console.log('[Auth] loading sequence complete');
                        resolve();
                    }
                };
                requestAnimationFrame(step);
            }, 10); // Small delay to ensure DOM is ready
        });
    }

    #updateDrawerWelcomeAndLogout(displayName) {
        const drawer = document.querySelector('.drawer-placement');
        if (!drawer) return;

        // Update the drawer's label attribute to show the welcome message
        const safeName = displayName || '';
        try {
            drawer.setAttribute('label', `Welcome, ${safeName}!`);
        } catch (_) {}

        // Logout button in drawer footer area
        let logoutBtn = drawer.querySelector('#auth-logout-button');
        if (!logoutBtn) {
            logoutBtn = document.createElement('wa-button');
            logoutBtn.id = 'auth-logout-button';
            logoutBtn.className = 'auth-logout-button';
            logoutBtn.setAttribute('variant', 'default');
            logoutBtn.setAttribute('size', 'medium');
            logoutBtn.setAttribute('slot', 'footer');
            logoutBtn.style.marginTop = '0';
            logoutBtn.textContent = 'Log out';
            drawer.appendChild(logoutBtn);
            console.log('[Auth] added Logout button to drawer footer');
            logoutBtn.addEventListener('click', () => this.logout());
        }
    }

    #show(el) { el.classList.remove('auth-hidden'); }
    #hide(el) { el.classList.add('auth-hidden'); }
}

// Export a singleton instance for ease of use
export const authenticationManager = new AuthenticationManager();


