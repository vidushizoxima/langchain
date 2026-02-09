/**
 * APIClient - Handles all communication with the FastAPI backend
 * Supports streaming responses via NDJSON
 * UPDATED: Now properly handles tool_start, tool_end, and error events
 */

class APIClient {
    constructor(config) {
        this.baseUrl = config.apiUrl;
    }

    /**
     * Send a chat message and handle streaming response
     * @param {string} query - User's message
     * @param {string} sessionId - Current session ID
     * @param {object} callbacks - Object with callback functions
     */
    async sendMessage(query, sessionId, callbacks) {
        const { onToken, onToolStart, onToolEnd, onToolResult, onComplete, onError } = callbacks;

        // 60 second timeout to prevent browser from randomly aborting
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
            const response = await fetch(`${this.baseUrl}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    session_id: sessionId
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);  // Clear timeout on successful response

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Handle streaming NDJSON response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    window.DebugLogger.log('Stream complete');
                    if (onComplete) onComplete();
                    break;
                }

                // Decode chunk and add to buffer
                buffer += decoder.decode(value, { stream: true });

                // Process complete JSON lines
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.trim() === '') continue;

                    try {
                        const data = JSON.parse(line);
                        window.DebugLogger.log('Received chunk:', data);

                        // Handle different message types
                        if (data.type === 'token') {
                            // Text content from assistant
                            if (onToken) onToken(data.content, data.node);
                            
                        } else if (data.type === 'tool_start') {
                            // Tool call started - CRITICAL FIX
                            window.DebugLogger.log('Tool started:', data.tool_name);
                            if (onToolStart) onToolStart(data.tool_name, data.tool_id);
                            
                        } else if (data.type === 'tool_end') {
                            // Tool call completed - CRITICAL FIX
                            window.DebugLogger.log('Tool completed:', data.tool_name);
                            if (onToolEnd) onToolEnd(data.tool_name, data.tool_id);
                            
                        } else if (data.type === 'tool_result') {
                            // Tool result (legacy support)
                            if (onToolResult) onToolResult(data.tool_name, data.content);
                            
                        } else if (data.type === 'error') {
                            // Error from backend - CRITICAL FIX
                            window.DebugLogger.error('Backend error:', data.error);
                            if (onError) onError(new Error(data.error));
                            
                        } else if (data.type === 'done' || data.done) {
                            // Stream completion signal
                            window.DebugLogger.log('Received done signal');
                            if (onComplete) onComplete();
                            
                        } else {
                            // Unknown type - log but don't crash - CRITICAL FIX
                            window.DebugLogger.warn('Unknown chunk type:', data.type, data);
                        }
                        
                    } catch (e) {
                        // DON'T crash on parse errors - log and continue
                        window.DebugLogger.error('Error parsing JSON line:', { line, error: e });
                    }
                }
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                window.DebugLogger.error('Request timed out after 60 seconds');
                if (onError) onError(new Error('Request timed out'));
            } else {
                window.DebugLogger.error('Error sending message:', error);
                if (onError) onError(error);
            }
        }
    }

    /**
     * Check if a session is still active
     */
    async checkSessionStatus(sessionId) {
        try {
            const response = await fetch(`${this.baseUrl}/session/${sessionId}/status`);
            return await response.json();
        } catch (error) {
            window.DebugLogger.error('Status check failed:', error);
            return { expired: false, exists: false };
        }
    }

    /**
     * Initialize session with lead_id for returning users
     * @param {string} sessionId - New session ID
     * @param {string} leadId - Existing lead ID from localStorage
     */
    async initSession(sessionId, leadId) {
        try {
            const response = await fetch(`${this.baseUrl}/session/init`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    lead_id: leadId
                })
            });

            const data = await response.json();
            window.DebugLogger.log('Session initialized:', data);
            return data;
        } catch (error) {
            window.DebugLogger.error('Error initializing session:', error);
            // Non-critical error, continue anyway
            return null;
        }
    }
}

// Export for use in other modules
window.APIClient = APIClient;