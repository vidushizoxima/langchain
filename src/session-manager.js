/**
 * SessionManager - Handles localStorage-based session persistence
 * Manages session_id, lead_id, and expiry logic
 * 
 * IMPORTANT: Session is cached in memory to prevent regenerating session_id on every call
 */

class SessionManager {
    constructor(config) {
        this.storageKey = config.sessionStorageKey;
        this.expiryDays = config.expiryDays;
        this._cachedSession = null; // In-memory cache to prevent repeated regeneration
    }

    /**
     * Generate a unique session ID using Web Crypto API
     * Format: sess_<uuid>
     * 
     * Uses crypto.randomUUID() for cryptographically secure random IDs
     * More secure than Math.random() and standards-compliant
     */
    generateSessionId() {
        return `sess_${crypto.randomUUID()}`;
    }

    /**
     * Get or create session data (with caching)
     * Returns: { session_id, lead_id, phone, email, name, created_at, last_activity, isReturning }
     * 
     * NOTE: Session is cached in memory. session_id is generated ONCE per page load.
     */
    getOrCreateSession() {
        // Return cached session if available (prevents regenerating session_id)
        if (this._cachedSession) {
            return this._cachedSession;
        }

        const stored = localStorage.getItem(this.storageKey);

        if (stored) {
            try {
                const data = JSON.parse(stored);

                // Check if expired
                const lastActivity = new Date(data.last_activity);
                const now = new Date();
                const daysSinceActivity = (now - lastActivity) / (1000 * 60 * 60 * 24);

                if (daysSinceActivity > this.expiryDays) {
                    // Expired - clear and create new
                    window.DebugLogger.log('Session expired, creating new session');
                    localStorage.removeItem(this.storageKey);
                    return this._createNewSession();
                }

                // Returning user - generate NEW session_id for this conversation
                // Each page load (refresh/tab close) starts a new conversation session
                // but lead_id and user data persist for recognition
                const isReturning = data.lead_id !== null;
                const newSession = {
                    ...data,
                    session_id: this.generateSessionId(), // New session per page load
                    last_activity: now.toISOString(),
                    isReturning: isReturning,
                    contactProvidedInSession: false
                };

                // Cache and save
                this._cachedSession = newSession;
                this._saveToStorage(newSession);

                if (isReturning) {
                    window.DebugLogger.log('Returning user detected, lead_id:', data.lead_id);
                }
                return newSession;

            } catch (e) {
                window.DebugLogger.error('Error parsing session data:', e);
                return this._createNewSession();
            }
        } else {
            // New user
            return this._createNewSession();
        }
    }


    /**
     * Create a new session for first-time user
     */
    _createNewSession() {
        const now = new Date().toISOString();
        const newSession = {
            session_id: this.generateSessionId(),
            lead_id: null,
            phone: null,
            email: null,
            name: null,
            created_at: now,
            last_activity: now,
            isReturning: false,
            messageCount: 0,
            contactProvidedInSession: false

        };

        // Cache and save
        this._cachedSession = newSession;
        this._saveToStorage(newSession);
        window.DebugLogger.log('New session created:', newSession.session_id);
        return newSession;
    }

    
    //track user messages
/**
 * Increment user message count
 */
incrementMessageCount() {
    if (!this._cachedSession) {
        this.getOrCreateSession();
    }
    
    if (!this._cachedSession.messageCount) {
        this._cachedSession.messageCount = 0;
    }
    
    this._cachedSession.messageCount++;
    this._saveToStorage(this._cachedSession);
    
    return this._cachedSession.messageCount;
}

/**
 * Get current message count
 */
getMessageCount() {
    const session = this.getOrCreateSession();
    return session.messageCount || 0;
}

/**
 * Reset message count (call this when lead is captured)
 */
resetMessageCount() {
    if (this._cachedSession) {
        this._cachedSession.messageCount = 0;
        this._saveToStorage(this._cachedSession);
    }
}

/**
 * Mark that contact details were provided in this session
 */
markContactProvided() {
    if (this._cachedSession) {
        this._cachedSession.contactProvidedInSession = true;
        this._saveToStorage(this._cachedSession);
        window.DebugLogger.log('Contact provided flag set for current session');
    }
}


    /**
     * Internal: Save session to localStorage without triggering cache invalidation
     */
    _saveToStorage(sessionData) {
        localStorage.setItem(this.storageKey, JSON.stringify(sessionData));
    }

    /**
     * Save/update session data to localStorage and update cache
     */
    saveSession(sessionData) {
        sessionData.last_activity = new Date().toISOString();
        this._cachedSession = sessionData;  // Update cache
        this._saveToStorage(sessionData);
    }

    /**
     * Update session with lead information
     * Called when agent captures user's contact info
     */
    updateLeadInfo(leadId, phone, email, name) {
        // Use cached session directly - don't call getOrCreateSession()
        if (!this._cachedSession) {
            this.getOrCreateSession();  // Initialize if needed
        }

        this._cachedSession.lead_id = leadId;
        this._cachedSession.phone = phone || this._cachedSession.phone;
        this._cachedSession.email = email || this._cachedSession.email;
        this._cachedSession.name = name || this._cachedSession.name;
        
        this.resetMessageCount();  // Add this line
        this.saveSession(this._cachedSession);
        window.DebugLogger.log('Lead info updated:', { leadId, phone, email, name });
    }

    /**
     * Update activity timestamp (lightweight - no session regeneration)
     * Call this on every message sent/received
     */
    updateActivity() {
        // Only update timestamp in storage, don't regenerate session
        if (this._cachedSession) {
            this._cachedSession.last_activity = new Date().toISOString();
            this._saveToStorage(this._cachedSession);
        }
    }

    /**
     * Clear session data (logout/reset)
     */
    clearSession() {
        this._cachedSession = null;  // Clear cache
        localStorage.removeItem(this.storageKey);
        window.DebugLogger.log('Session cleared');
    }

    /**
     * Get current session ID
     */
    getSessionId() {
        const session = this.getOrCreateSession();
        return session.session_id;
    }

    /**
     * Get current lead ID (null if not registered)
     */
    getLeadId() {
        const session = this.getOrCreateSession();
        return session.lead_id;
    }

    /**
     * Check if user is a returning user
     */
    isReturningUser() {
        const session = this.getOrCreateSession();
        return session.isReturning && session.lead_id !== null;
    }
}

// Export for use in other modules
window.SessionManager = SessionManager;
