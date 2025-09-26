(function () {
    'use strict';

    // Initialize widget registry for multi-widget support  
    // Version: v2.1.0 - Added AI reasoning debugging
    if (!window.ChatWidgets) {
        window.ChatWidgets = {
            floating: new Set(),
            inline: new Set()
        };
    }

    // Configuration
    const script = document.currentScript;
    const siteId = script.getAttribute('data-site-id');
    let widgetType = script.getAttribute('data-widget-type') || 'floating';
    const apiUrl = script.src.replace('/widget.js', '');


    // WordPress workaround: Check if there's a placeholder container nearby
    // If so, assume this should be an inline widget
    async function determineWidgetType() {
        if (widgetType === 'floating') {
            // Only check for container if this script is actually near one
            // Check if this script element is close to a placeholder container
            const placeholder = document.querySelector('[data-chat-widget-inline]');
            if (placeholder && script && script.parentElement) {
                // Check if the script is within the same section as the placeholder
                const scriptContainer = script.parentElement;
                const placeholderContainer = placeholder.parentElement;
                
                // If they share a common ancestor within a reasonable distance, assume inline
                if (scriptContainer === placeholderContainer || 
                    scriptContainer.contains(placeholder) || 
                    placeholderContainer.contains(script)) {
                    console.log('ChatWidget: Script is near placeholder container, switching to inline mode');
                    return 'inline';
                }
            }
            console.log('ChatWidget: No nearby container found, staying in floating mode');
        }
        return widgetType;
    }

    if (!siteId) {
        console.error('ChatWidget: data-site-id attribute is required');
        return;
    }

    // Default settings (will be overridden by API call)
    let chatSettings = {
        chat_name: 'Affi',
        chat_color: '#000000',
        chat_icon_url: '',
        chat_name_color: '#FFFFFF',
        chat_bubble_icon_color: '#FFFFFF',
        input_placeholder: 'Type your message...',
        font_size: '14px',
        intro_message: 'Hello! How can I help you today?'
    };


    // Fetch settings dynamically
    async function loadChatSettings() {
        try {
            const response = await fetch(`${apiUrl}/api/widget-settings?siteId=${encodeURIComponent(siteId)}`);
            
            if (response.ok) {
                const settings = await response.json();
                // Merge with defaults to ensure all required fields exist
                chatSettings = { ...chatSettings, ...settings };
                return true; // Indicate success
            } else {
                console.warn('ChatWidget: API responded with error status:', response.status, response.statusText);
                console.warn('ChatWidget: Using default settings');
                return false; // Indicate failure but continue with defaults
            }
        } catch (error) {
            console.warn('ChatWidget: Error loading settings (likely CORS or network issue):', error);
            console.warn('ChatWidget: Using default settings');
            return false; // Indicate failure but continue with defaults
        }
    }

    // Widget configuration
    const config = {
        siteId: siteId,
        apiUrl: apiUrl,
        settings: chatSettings,
        embedded: false
    };

    // Create widget container (floating version)
    function createFloatingWidgetContainer() {
        const container = document.createElement('div');
        container.id = 'chat-widget-' + siteId;
        container.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 16px;
            width: 440px;
            height: 700px;
            z-index: 1000;
            border: none;
            border-radius: 20px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
            background: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            display: none;
        `;

        // Create iframe
        const iframe = document.createElement('iframe');
        iframe.src = `${apiUrl}/widget?siteId=${encodeURIComponent(siteId)}&apiUrl=${encodeURIComponent(apiUrl)}&embedded=true&widgetType=floating&parentOrigin=${encodeURIComponent(window.location.origin)}&parentUrl=${encodeURIComponent(window.location.href)}&pageTitle=${encodeURIComponent(document.title || '')}&v=${Date.now()}`;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            border-radius: 20px;
        `;
        iframe.title = 'Chat Widget';

        container.appendChild(iframe);
        document.body.appendChild(container);

        return { container, iframe };
    }

    // Create widget container (inline version)
    function createInlineWidgetContainer() {
        console.log('ChatWidget: Creating inline widget container');
        
        const container = document.createElement('div');
        container.id = 'chat-widget-inline-' + siteId;
        container.style.cssText = `
            position: relative;
            width: 100%;
            height: 600px;
            z-index: 1;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            box-shadow: none;
            background: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            display: block;
            margin: 20px 0;
        `;

        // Create iframe
        const iframe = document.createElement('iframe');
        iframe.src = `${apiUrl}/widget?siteId=${encodeURIComponent(siteId)}&apiUrl=${encodeURIComponent(apiUrl)}&embedded=true&widgetType=inline&parentOrigin=${encodeURIComponent(window.location.origin)}&parentUrl=${encodeURIComponent(window.location.href)}&pageTitle=${encodeURIComponent(document.title || '')}&v=${Date.now()}`;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            border-radius: 8px;
        `;
        iframe.title = 'Chat Widget';
        iframe.allow = 'clipboard-write';

        container.appendChild(iframe);
        
        // WordPress and other CMSs might strip script tags, so we need to be more careful
        // First check if there's a placeholder container that was specifically created for this widget
        const placeholder = document.querySelector('[data-chat-widget-inline]');
        if (placeholder) {
            console.log('ChatWidget: Found placeholder element, using it');
            placeholder.appendChild(container);
        } else if (script && script.parentElement) {
            // If no placeholder, try to insert after the script element
            console.log('ChatWidget: No placeholder found, inserting after script element');
            script.parentElement.insertBefore(container, script.nextSibling);
        } else {
            // Last resort: append to body
            console.log('ChatWidget: No placeholder or script parent, appending to body as fallback');
            document.body.appendChild(container);
        }

        return { container, iframe };
    }

    // SVG icons defined globally for access across functions
    const chatIconSVG = `
        <svg
            width="28"
            height="28"
            viewBox="0 0 800 800"
        >
            <path
                d="M400,26.74C183.35,26.74,7.1,185.37,7.1,380.35c0,68.17,21.57,134.19,62.44,191.26-7.74,85.61-28.49,149.17-58.61,179.28-3.98,3.98-4.98,10.07-2.46,15.10,2.24,4.49,6.81,7.26,11.72,7.26.6,0,1.22-.04,1.83-.13,5.3-.75,128.52-18.49,217.63-69.91,50.62,20.42,104.52,30.75,160.34,30.75,43.33,0,85.05-6.35,124.06-18.07-9.78-21.86-19.32-43.83-28.5-65.95-10.09-24.3-27.21-41.15-51.18-51.57-26.22-11.4-52.39-22.91-78.36-34.86-3.83-1.76-8.85-6.14-8.92-9.4-.07-3.2,4.88-7.84,8.67-9.55,25.71-11.63,51.65-22.74,77.59-33.83,23.28-9.95,40.14-26.19,50.2-49.56,11.3-26.26,22.8-52.43,34.5-78.51,1.78-3.97,5.11-7.24,9.53-13.32,4.43,5.97,7.8,9.18,9.58,13.12,11.3,25.04,22.71,50.04,33.18,75.43,11.01,26.69,29.94,44.33,56.54,55.02,24.45,9.82,48.5,20.67,72.49,31.58,3.82,1.74,8.8,6.16,8.86,9.42.06,3.18-4.92,7.75-8.71,9.48-25.33,11.56-50.86,22.68-76.46,33.65-23.99,10.28-41.42,26.93-51.79,51.03-8.14,18.91-16.34,37.79-24.74,56.59,138.96-54.55,236.34-179.39,236.34-324.31,0-194.98-176.26-353.61-392.9-353.61ZM421.15,423.82c-19.85,6.7-32.47,19.54-39.01,39.41-3.39,10.3-8.71,19.97-13.95,31.71-3.23-3.85-4.93-5.57-6.24-7.55-1.01-1.52-1.53-3.37-2.25-5.08-22.49-53.65-17-43.59-65.12-65.99-4.45-2.07-8.69-4.62-15.37-8.2,5.54-2.99,8.54-4.85,11.73-6.3,10.8-4.91,22.53-8.39,32.26-14.88,8.85-5.9,17.02-14.05,22.85-22.95,6.41-9.79,9.64-21.62,14.6-32.41,1.28-2.79,3.84-4.99,5.81-7.46,2.26,2.59,5.24,4.85,6.66,7.84,4.74,10.06,9.14,20.31,13.27,30.64,4.83,12.08,13.24,20.3,25.11,25.36,10.57,4.51,21.05,9.24,31.51,14.02,3.14,1.44,6.06,3.36,12.14,6.78-13.31,5.98-23.34,11.45-34,15.06ZM491.62,352.41c-7.16-24.34-22.39-37.93-46.14-45.02,23.14-7.66,39.22-20.85,45.15-45.85,8.79,22.11,20.21,40,46.28,44.61-22.21,9.21-39.85,20.79-45.29,46.26Z"
                fill="currentColor"
            />
        </svg>
    `;
    
    const closeIconSVG = `
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
    `;

    // Create chat button
    function createChatButton() {
        const button = document.createElement('button');
        button.id = 'chat-widget-button-' + siteId;
        button.style.cssText = `
            position: fixed;
            bottom: 16px;
            right: 16px;
            width: 52px;
            height: 52px;
            border-radius: 50%;
            border: none;
            background: ${chatSettings?.chat_color || '#000000'};
            color: ${chatSettings?.chat_bubble_icon_color || 'white'};
            cursor: pointer;
            z-index: 1001;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        `;
        
        button.innerHTML = chatIconSVG;

        // Hover effects
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'scale(1.1)';
            button.style.boxShadow = '0 6px 25px rgba(0, 0, 0, 0.3)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'scale(1)';
            button.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.25)';
        });

        document.body.appendChild(button);
        return button;
    }

    // Initialize widget
    async function initializeWidget() {
        console.log('ChatWidget: Starting initialization');
        
        // Determine the actual widget type (may detect inline from container)
        const finalWidgetType = await determineWidgetType();
        console.log('ChatWidget: Final widget type:', finalWidgetType);
        console.log('ChatWidget: Site ID:', siteId);
        
        // Prevent duplicate widgets of same type for same site
        const widgetKey = `${siteId}-${finalWidgetType}`;
        if (window.ChatWidgets[finalWidgetType].has(widgetKey)) {
            console.log(`ChatWidget: ${finalWidgetType} widget already exists for site ${siteId}, skipping initialization`);
            return finalWidgetType;
        }
        
        // Register this widget instance
        window.ChatWidgets[finalWidgetType].add(widgetKey);
        console.log(`ChatWidget: Registered ${finalWidgetType} widget for site ${siteId}`);
        
        // Load settings first (returns true/false indicating success)
        await loadChatSettings();

        // Prewarm ephemeral page context cache for this URL (non-blocking)
        (async () => {
            try {
                if (typeof window !== 'undefined' && window.location && siteId && apiUrl) {
                    const pageUrl = window.location.href;
                    const res = await fetch(`${apiUrl}/api/widget/page-context?siteId=${encodeURIComponent(siteId)}&url=${encodeURIComponent(pageUrl)}`, {
                        method: 'GET',
                        mode: 'cors',
                        credentials: 'omit'
                        // No headers → remains a simple request; avoids CORS preflight OPTIONS
                    });
                    // Optional: log once for visibility
                    if (res.ok) {
                        res.json().then(data => {
                            if (data && data.success) {
                                console.log('ChatWidget: Page context', data.cached ? 'cache hit' : 'cached');
                            }
                        }).catch(() => {});
                    }
                }
            } catch (e) {
                // Silent fail; page context is a best-effort feature
            }
        })();
        

        // Update config with loaded settings (either from API or defaults)
        config.settings = chatSettings;

        // Track session start
        trackEvent('session_start', {
            initial_page_url: window.location.href,
            referrer: document.referrer,
            viewport_width: window.innerWidth,
            viewport_height: window.innerHeight
        });

        // Handle different widget types
        if (finalWidgetType === 'inline') {
            console.log('ChatWidget: Initializing as inline widget');
            initializeInlineWidget();
        } else {
            console.log('ChatWidget: Initializing as floating widget');
            initializeFloatingWidget();
        }
        
        return finalWidgetType;
    }

    // Initialize floating widget
    function initializeFloatingWidget() {
        const { container, iframe } = createFloatingWidgetContainer();
        const button = createChatButton();

        let isOpen = false;

        // Toggle widget
        function toggleWidget() {
            isOpen = !isOpen;

            if (isOpen) {
                container.style.display = 'block';
                // Update button icon to close on desktop, hide on mobile
                if (window.innerWidth < 768) {
                    button.style.display = 'none';
                } else {
                    button.innerHTML = closeIconSVG;
                }

                // Track widget open
                trackEvent('widget_open', {
                    opened_at: new Date().toISOString(),
                    is_mobile: window.innerWidth < 768
                });
            } else {
                container.style.display = 'none';
                // Show button again when widget closes and restore chat icon
                button.style.display = 'flex';
                button.innerHTML = chatIconSVG;
            }
        }

        // Event listeners
        button.addEventListener('click', toggleWidget);

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) {
                toggleWidget();
            }
        });

        // Listen for messages from iframe
        window.addEventListener('message', (event) => {
            if (event.data.type === 'WIDGET_READY') {
                // Widget ready - no action needed
            } else if (event.data.type === 'ANALYTICS_EVENT') {
                // Handle analytics events from the iframe
                trackEvent(event.data.eventType, event.data.data);
            } else if (event.data.type === 'CLOSE_WIDGET') {
                // Close widget when requested from iframe
                toggleWidget();
            } else if (event.data.type === 'GET_PAGE_URL') {
                // Send current page URL to iframe for predefined questions
                iframe.contentWindow.postMessage({
                    type: 'PAGE_URL_RESPONSE',
                    url: window.location.href
                }, '*');
            }
        });

        // Responsive behavior with better mobile breakpoints
        function updateResponsiveStyles() {
            const screenWidth = window.innerWidth;
            const isMobile = screenWidth < 768;
            
            if (isMobile) {
                // Fullscreen on mobile
                container.style.cssText = `
                    position: fixed;
                    top: 0;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 1000;
                    border: none;
                    border-radius: 0;
                    box-shadow: none;
                    background: white;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
                    display: ${isOpen ? 'block' : 'none'};
                `;

                iframe.style.borderRadius = '0';
                
                // Hide button on mobile when widget is open
                if (isOpen) {
                    button.style.display = 'none';
                }
            } else {
                container.style.cssText = `
                    position: fixed;
                    bottom: 100px;
                    right: 16px;
                    width: 440px;
                    height: 700px;
                    z-index: 1000;
                    border: none;
                    border-radius: 20px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                    background: white;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
                    display: ${isOpen ? 'block' : 'none'};
                `;

                iframe.style.borderRadius = '20px';
                
                // Show button on desktop and update icon based on state
                button.style.display = 'flex';
                if (isOpen) {
                    button.innerHTML = closeIconSVG;
                }
            }
        }

        // Mobile keyboard detection and handling
        let initialViewportHeight = window.innerHeight;
        let keyboardVisible = false;
        
        function handleViewportChange() {
            const currentHeight = window.innerHeight;
            const currentWidth = window.innerWidth;
            const heightDifference = initialViewportHeight - currentHeight;
            
            // On mobile, if viewport shrinks by more than 150px, assume keyboard is visible
            if (currentWidth < 768 && heightDifference > 150) {
                if (!keyboardVisible) {
                    keyboardVisible = true;
                    // When keyboard appears, keep fullscreen but adjust height
                    if (isOpen) {
                        container.style.cssText = `
                            position: fixed;
                            top: 0;
                            bottom: 0;
                            left: 0;
                            right: 0;
                            width: 100%;
                            height: ${currentHeight}px;
                            z-index: 1000;
                            border: none;
                            border-radius: 0;
                            box-shadow: none;
                            background: white;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
                            display: block;
                        `;
                    }
                }
            } else if (keyboardVisible && heightDifference < 50) {
                keyboardVisible = false;
                // Reset to normal layout when keyboard hides
                updateResponsiveStyles();
            }
        }
        
        // Update on resize and viewport changes
        window.addEventListener('resize', () => {
            updateResponsiveStyles();
            handleViewportChange();
        });
        
        // Listen for viewport changes (mobile keyboard)
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                initialViewportHeight = window.innerHeight;
                updateResponsiveStyles();
            }, 500);
        });
        
        updateResponsiveStyles();

    }

    // Initialize inline widget
    function initializeInlineWidget() {
        console.log('ChatWidget: Initializing inline widget');
        console.log('ChatWidget: Script element:', script);
        console.log('ChatWidget: Parent element:', script.parentElement);
        
        const { container, iframe } = createInlineWidgetContainer();
        
        console.log('ChatWidget: Container created:', container);
        console.log('ChatWidget: Container parent:', container.parentElement);
        
        // No button needed for inline widgets - they're always visible
        
        // Listen for messages from iframe
        window.addEventListener('message', (event) => {
            if (event.data.type === 'WIDGET_READY') {
                console.log('ChatWidget: Inline widget ready');
            } else if (event.data.type === 'ANALYTICS_EVENT') {
                // Handle analytics events from the iframe
                trackEvent(event.data.eventType, event.data.data);
            } else if (event.data.type === 'GET_PAGE_URL') {
                // Send current page URL to iframe for predefined questions
                iframe.contentWindow.postMessage({
                    type: 'PAGE_URL_RESPONSE',
                    url: window.location.href
                }, '*');
            }
        });

        // Track inline widget loaded
        trackEvent('inline_widget_loaded', {
            container_height: container.style.height,
            insertion_method: 'parent_element'
        });
    }


    // Analytics batching system for scalability
    const analyticsQueue = [];
    const BATCH_SIZE = 5;
    const BATCH_TIMEOUT = 3000; // 3 seconds
    let batchTimer = null;
    let isProcessingBatch = false;
    
    let sessionId = null;
    
    function trackEvent(eventType, details = {}) {
        // Generate session ID on first event
        if (!sessionId) {
            sessionId = 'session_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
        }
        // Prefer explicit IDs from details (sent by ChatWidgetCore) to match chat_sessions
        const topSessionId = (details && details.session_id) ? details.session_id : sessionId;
        const topUserSessionId = (details && details.user_session_id) ? details.user_session_id : sessionId;

        const event = {
            event_type: eventType,
            site_id: siteId,
            user_id: null,
            // Provide stable identifiers at top-level so backend can aggregate per session
            user_session_id: topUserSessionId,
            session_id: topSessionId,
            details: {
                ...details,
                widget_type: widgetType,
                session_id: topSessionId,
                user_session_id: topUserSessionId,
                page_url: window.location.href,
                page_title: document.title
            },
            timestamp: new Date().toISOString(),
            url: window.location.href,
            user_agent: navigator.userAgent
        };
        
        analyticsQueue.push(event);
        
        // Process immediately if critical event or queue is full
        if (eventType === 'widget_open' || eventType === 'session_start' || analyticsQueue.length >= BATCH_SIZE) {
            processBatch();
        } else {
            // Set timer to process batch after timeout
            if (!batchTimer) {
                batchTimer = setTimeout(() => {
                    processBatch();
                }, BATCH_TIMEOUT);
            }
        }
    }
    
    function processBatch(retryCount = 0) {
        if (isProcessingBatch || analyticsQueue.length === 0) {
            return;
        }
        
        isProcessingBatch = true;
        const maxRetries = 2;
        const retryDelay = 1000 * Math.pow(2, retryCount);
        
        // Clear the timer
        if (batchTimer) {
            clearTimeout(batchTimer);
            batchTimer = null;
        }
        
        // Take events from queue
        const eventsToSend = analyticsQueue.splice(0, BATCH_SIZE);
        
        try {
            // Try batch endpoint first, fallback to individual if it doesn't exist
            fetch(`${apiUrl}/api/analytics/batch`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    events: eventsToSend
                })
            })
            .then(response => {
                isProcessingBatch = false;
                
                if (!response.ok) {
                    console.warn('ChatWidget: Analytics batch API responded with status:', response.status);
                    return response.text().then(text => {
                        console.warn('ChatWidget: Analytics batch API error response:', text);
                        throw new Error(`HTTP ${response.status}: ${text}`);
                    });
                }
                return response.json();
            })
            .then(data => {
                
                // Process remaining events if any
                if (analyticsQueue.length > 0) {
                    setTimeout(() => processBatch(), 100);
                }
            })
            .catch(error => {
                isProcessingBatch = false;
                console.warn('ChatWidget: Analytics batch processing failed:', error);
                
                // Retry logic for transient failures
                if (retryCount < maxRetries && (
                    error.message.includes('Failed to fetch') || 
                    error.message.includes('500') ||
                    error.message.includes('503') ||
                    error.message.includes('CORS')
                )) {
                    // Put events back in queue
                    analyticsQueue.unshift(...eventsToSend);
                    setTimeout(() => {
                        processBatch(retryCount + 1);
                    }, retryDelay);
                } else {
                    // Check if batch endpoint doesn't exist (404) - fallback to individual
                    if (error.message.includes('404')) {
                        eventsToSend.forEach(event => trackEventIndividual(event));
                    } else {
                        // Fallback to individual event tracking for critical events only
                        const criticalEvents = eventsToSend.filter(e => 
                            e.event_type === 'widget_open' || 
                            e.event_type === 'session_start' ||
                            e.event_type === 'link_click'
                        );
                        
                        if (criticalEvents.length > 0) {
                            criticalEvents.forEach(event => trackEventIndividual(event));
                        }
                    }
                    
                    // Process any remaining events
                    if (analyticsQueue.length > 0) {
                        setTimeout(() => processBatch(), 5000);
                    }
                }
            });
        } catch (error) {
            isProcessingBatch = false;
            console.warn('ChatWidget: Analytics batch setup failed:', error);
            // Put events back in queue
            analyticsQueue.unshift(...eventsToSend);
        }
    }
    
    // Fallback individual event tracking
    function trackEventIndividual(event, retryCount = 0) {
        const maxRetries = 1;
        const retryDelay = 1000 * Math.pow(2, retryCount);
        
        fetch(`${apiUrl}/api/analytics`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(event)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
        })
        .catch(error => {
            if (retryCount < maxRetries) {
                setTimeout(() => {
                    trackEventIndividual(event, retryCount + 1);
                }, retryDelay);
            } else {
                console.warn('ChatWidget: Individual event tracking failed permanently:', error);
            }
        });
    }
    
    // Process any remaining events when page is about to unload
    window.addEventListener('beforeunload', () => {
        // Track session end
        if (sessionId) {
            trackEvent('session_end', {
                session_duration: Date.now() - parseInt(sessionId.split('_')[1], 36),
                final_page_url: window.location.href
            });
        }
        
        if (analyticsQueue.length > 0) {
            // Use sendBeacon for more reliable delivery on page unload
            if (navigator.sendBeacon) {
                const eventsToSend = analyticsQueue.splice(0);
                navigator.sendBeacon(
                    `${apiUrl}/api/analytics/batch`,
                    JSON.stringify({ events: eventsToSend })
                );
            }
        }
    });

    // Auto-popup functionality
    function setupAutoPopup() {
        // Helper function to get the appropriate intro message
        function getIntroMessage() {
            const introMsg = chatSettings.intro_message || 'Hello! How can I help you today?';
            return introMsg;
        }
        
        // Show intro popup after 3 seconds if not already shown recently
        setTimeout(() => {
            const lastShown = localStorage.getItem('chat-widget-intro-shown-' + siteId);
            const now = Date.now();
            
            // Show popup if never shown or if more than 1 hour has passed (for testing)
            if (!lastShown || (now - parseInt(lastShown)) > 3600000) {
                // Create intro popup
                const popup = document.createElement('div');
                popup.style.cssText = `
                    position: fixed;
                    bottom: 84px;
                    right: 16px;
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 16px;
                    max-width: 300px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                    z-index: 999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
                    font-size: 14px;
                    line-height: 1.4;
                    color: #374151;
                    animation: slideIn 0.3s ease-out;
                `;

                // Add CSS animation
                const style = document.createElement('style');
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateY(20px); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);

                const chatName = chatSettings.chat_name || 'Affi';
                const introMessage = getIntroMessage();
                
                popup.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div style="font-weight: 600; color: #111827;">${chatName} 👋</div>
                        <button style="background: none; border: none; cursor: pointer; padding: 0; color: #6b7280; font-size: 16px;" onclick="this.parentElement.parentElement.remove();">×</button>
                    </div>
                    <div style="margin-bottom: 12px; cursor: pointer;">${introMessage}</div>
                `;


                // Make the entire popup clickable to open chat
                popup.style.cursor = 'pointer';
                popup.addEventListener('click', (e) => {
                    // Prevent close button from triggering chat open
                    if (e.target.tagName === 'BUTTON') return;

                    // Open chat and remove popup
                    document.getElementById('chat-widget-button-' + siteId).click();
                    popup.remove();
                });

                document.body.appendChild(popup);

                // Auto-dismiss after 10 seconds
                setTimeout(() => {
                    if (popup.parentElement) {
                        popup.remove();
                    }
                }, 10000);

                // Mark as shown with timestamp
                localStorage.setItem('chat-widget-intro-shown-' + siteId, now.toString());

                // Track popup shown
                trackEvent('intro_popup_shown');
            }
        }, 3000);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', async () => {
            const finalType = await initializeWidget();
            // Only show auto popup for floating widgets
            if (finalType === 'floating') {
                setupAutoPopup();
            }
        });
    } else {
        initializeWidget().then((finalType) => {
            // Only show auto popup for floating widgets
            if (finalType === 'floating') {
                setupAutoPopup();
            }
        });
    }

    // Expose API for external control
    window.ChatWidgetAPI = {
        open: () => {
            const button = document.getElementById('chat-widget-button-' + siteId);
            if (button) button.click();
        },
        close: () => {
            const container = document.getElementById('chat-widget-' + siteId);
            if (container && container.style.display === 'block') {
                const button = document.getElementById('chat-widget-button-' + siteId);
                if (button) button.click();
            }
        },
        toggle: () => {
            const button = document.getElementById('chat-widget-button-' + siteId);
            if (button) button.click();
        },
        resetPopup: () => {
            localStorage.removeItem('chat-widget-intro-shown-' + siteId);
        }
    };

})();
