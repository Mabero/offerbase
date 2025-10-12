(function () {
    'use strict';

    // Registry for multi-widget protection
    if (!window.ChatWidgets) {
        window.ChatWidgets = { floating: new Set(), inline: new Set(), sidebar: new Set() };
    } else if (!window.ChatWidgets.sidebar) {
        window.ChatWidgets.sidebar = new Set();
    }

    const script = document.currentScript;
    if (!script) return;
    const siteId = script.getAttribute('data-site-id');
    if (!siteId) {
        console.error('ChatSidebar: data-site-id attribute is required');
        return;
    }

    const apiUrl = script.src.replace('/widget-sidebar.js', '');
    const rawWidth = parseInt(script.getAttribute('data-sidebar-width') || '440', 10);
    const sidebarWidth = Math.max(280, Math.min(540, isFinite(rawWidth) ? rawWidth : 360));
    const widgetType = 'sidebar';

    // Default settings (overridden by API)
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

    async function loadChatSettings() {
        try {
            const res = await fetch(`${apiUrl}/api/widget-settings?siteId=${encodeURIComponent(siteId)}`);
            if (res.ok) {
                const s = await res.json();
                chatSettings = { ...chatSettings, ...s };
            }
        } catch (e) {
            // Best-effort; fall back to defaults
        }
    }

    function normalizePatterns(input) {
        if (!input) return [];
        if (Array.isArray(input)) return input.filter(Boolean).map(String);
        if (typeof input === 'string') return input.split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
        return [];
    }

    function matchesPattern(url, pathname, pattern) {
        if (!pattern) return false;
        if (pattern.startsWith('re:')) {
            try {
                const re = new RegExp(pattern.slice(3));
                return re.test(url) || re.test(pathname);
            } catch { return false; }
        }
        const globToRegExp = (g) => new RegExp('^' + g.replace(/[.+^${}()|\[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        const target = pattern.startsWith('/') ? pathname : url;
        if (pattern.includes('*') || pattern.includes('?')) {
            try { return globToRegExp(pattern).test(target); } catch { return false; }
        }
        return target.indexOf(pattern) !== -1;
    }

    function anyMatch(url, pathname, patterns) {
        return normalizePatterns(patterns).some(p => matchesPattern(url, pathname, p));
    }

    // Analytics batching (copied from widget.js for consistency)
    const analyticsQueue = [];
    const BATCH_SIZE = 5;
    const BATCH_TIMEOUT = 3000;
    let batchTimer = null;
    let isProcessingBatch = false;
    let sessionId = null;
    let sessionEndSent = false;

    function trackEvent(eventType, details = {}) {
        if (!sessionId) sessionId = 'session_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
        const topSessionId = (details && details.session_id) ? details.session_id : sessionId;
        const topUserSessionId = (details && details.user_session_id) ? details.user_session_id : sessionId;
        const event = {
            event_type: eventType,
            site_id: siteId,
            user_id: null,
            user_session_id: topUserSessionId,
            session_id: topSessionId,
            details: { ...details, widget_type: widgetType, session_id: topSessionId, user_session_id: topUserSessionId, page_url: window.location.href, page_title: document.title },
            timestamp: new Date().toISOString(),
            url: window.location.href,
            user_agent: navigator.userAgent
        };
        analyticsQueue.push(event);
        if (eventType === 'widget_open' || eventType === 'session_start' || analyticsQueue.length >= BATCH_SIZE) {
            processBatch();
        } else if (!batchTimer) {
            batchTimer = setTimeout(processBatch, BATCH_TIMEOUT);
        }
    }

    function processBatch(retryCount = 0) {
        if (isProcessingBatch || analyticsQueue.length === 0) return;
        isProcessingBatch = true;
        if (batchTimer) { clearTimeout(batchTimer); batchTimer = null; }
        const eventsToSend = analyticsQueue.splice(0, BATCH_SIZE);
        fetch(`${apiUrl}/api/analytics/batch`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: eventsToSend })
        }).then(r => {
            isProcessingBatch = false;
            if (!r.ok) throw new Error('HTTP ' + r.status);
            if (analyticsQueue.length > 0) setTimeout(processBatch, 100);
        }).catch(() => {
            isProcessingBatch = false;
            // Drop or retry lightly; keep simple
            if (retryCount < 1) setTimeout(() => processBatch(retryCount + 1), 1000);
        });
    }

    // Icons
    const chatIconSVG = `
        <svg width="24" height="24" viewBox="0 0 800 800"><path d="M400,26.74C183.35,26.74,7.1,185.37,7.1,380.35c0,68.17,21.57,134.19,62.44,191.26-7.74,85.61-28.49,149.17-58.61,179.28-3.98,3.98-4.98,10.07-2.46,15.10,2.24,4.49,6.81,7.26,11.72,7.26.6,0,1.22-.04,1.83-.13,5.3-.75,128.52-18.49,217.63-69.91,50.62,20.42,104.52,30.75,160.34,30.75,43.33,0,85.05-6.35,124.06-18.07-9.78-21.86-19.32-43.83-28.5-65.95-10.09-24.3-27.21-41.15-51.18-51.57-26.22-11.4-52.39-22.91-78.36-34.86-3.83-1.76-8.85-6.14-8.92-9.4-.07-3.2,4.88-7.84,8.67-9.55,25.71-11.63,51.65-22.74,77.59-33.83,23.28-9.95,40.14-26.19,50.2-49.56,11.3-26.26,22.8-52.43,34.5-78.51,1.78-3.97,5.11-7.24,9.53-13.32,4.43,5.97,7.8,9.18,9.58,13.12,11.3,25.04,22.71,50.04,33.18,75.43,11.01,26.69,29.94,44.33,56.54,55.02,24.45,9.82,48.5,20.67,72.49,31.58,3.82,1.74,8.8,6.16,8.86,9.42.06,3.18-4.92,7.75-8.71,9.48-25.33,11.56-50.86,22.68-76.46,33.65-23.99,10.28-41.42,26.93-51.79,51.03-8.14,18.91-16.34,37.79-24.74,56.59,138.96-54.55,236.34-179.39,236.34-324.31,0-194.98-176.26-353.61-392.9-353.61ZM421.15,423.82c-19.85,6.7-32.47,19.54-39.01,39.41-3.39,10.3-8.71,19.97-13.95,31.71-3.23-3.85-4.93-5.57-6.24-7.55-1.01-1.52-1.53-3.37-2.25-5.08-22.49-53.65-17-43.59-65.12-65.99-4.45-2.07-8.69-4.62-15.37-8.2,5.54-2.99,8.54-4.85,11.73-6.3,10.8-4.91,22.53-8.39,32.26-14.88,8.85-5.9,17.02-14.05,22.85-22.95,6.41-9.79,9.64-21.62,14.6-32.41,1.28-2.79,3.84-4.99,5.81-7.46,2.26,2.59,5.24,4.85,6.66,7.84,4.74,10.06,9.14,20.31,13.27,30.64,4.83,12.08,13.24,20.3,25.11,25.36,10.57,4.51,21.05,9.24,31.51,14.02,3.14,1.44,6.06,3.36,12.14,6.78-13.31,5.98-23.34,11.45-34,15.06ZM491.62,352.41c-7.16-24.34-22.39-37.93-46.14-45.02,23.14-7.66,39.22-20.85,45.15-45.85,8.79,22.11,20.21,40,46.28,44.61-22.21,9.21-39.85,20.79-45.29,46.26Z" fill="currentColor"/></svg>
    `;
    const closeIconSVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;

    function createSidebarContainer() {
        const container = document.createElement('div');
        container.id = 'chat-sidebar-' + siteId;
        container.style.cssText = `position: fixed; top: 0; right: 0; height: 100vh; width: ${sidebarWidth}px; z-index: 1000; background: white; border-left: 1px solid rgba(0,0,0,0.06); box-shadow: -8px 0 40px rgba(0,0,0,0.10); display: block;`;

        const iframe = document.createElement('iframe');
        iframe.src = `${apiUrl}/widget?siteId=${encodeURIComponent(siteId)}&apiUrl=${encodeURIComponent(apiUrl)}&embedded=true&widgetType=sidebar&parentOrigin=${encodeURIComponent(window.location.origin)}&parentUrl=${encodeURIComponent(window.location.href)}&pageTitle=${encodeURIComponent(document.title || '')}&v=${Date.now()}`;
        iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:0;';
        iframe.title = 'Chat Sidebar';
        iframe.allow = 'clipboard-write';
        container.appendChild(iframe);
        document.body.appendChild(container);
        return { container, iframe };
    }

    function createToggleTab() {
        const tab = document.createElement('button');
        tab.id = 'chat-sidebar-toggle-' + siteId;
        tab.style.cssText = `position: fixed; bottom: 30px; right: ${sidebarWidth}px; width: 36px; height: 80px; border: none; border-radius: 8px 0 0 8px; background: ${chatSettings?.chat_color || '#000000'}; color: ${chatSettings?.chat_bubble_icon_color || '#ffffff'}; z-index: 1001; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 20px rgba(0,0,0,0.15);`;
        tab.innerHTML = closeIconSVG;

        tab.addEventListener('mouseenter', () => { tab.style.transform = 'translateX(-1px)'; });
        tab.addEventListener('mouseleave', () => { tab.style.transform = 'translateX(0)'; });

        document.body.appendChild(tab);
        return tab;
    }

    async function initializeSidebar() {
        // prevent multiple
        const key = `${siteId}-sidebar`;
        if (window.ChatWidgets.sidebar.has(key)) return;
        window.ChatWidgets.sidebar.add(key);

        await loadChatSettings();

        // Mobile fallback: use floating widget implementation
        let usingFloatingFallback = false;
        function activateFloatingWidget() {
            if (usingFloatingFallback) return;
            usingFloatingFallback = true;
            try {
                // Avoid duplicate widget.js loads
                const alreadyLoaded = Array.from(document.scripts).some(s => (s.src || '').indexOf('/widget.js') !== -1);
                if (!alreadyLoaded) {
                    const s = document.createElement('script');
                    s.src = `${apiUrl}/widget.js`;
                    s.async = true;
                    s.setAttribute('data-site-id', siteId);
                    document.head.appendChild(s);
                }
            } catch {}
        }

        // Prewarm page-context (best-effort)
        try {
            const pageUrl = window.location.href;
            fetch(`${apiUrl}/api/widget/page-context?siteId=${encodeURIComponent(siteId)}&url=${encodeURIComponent(pageUrl)}`, { method: 'GET', mode: 'cors', credentials: 'omit' }).catch(() => {});
        } catch {}

        // Evaluate sidebar visibility rules before injecting anything
        const rules = (chatSettings && chatSettings.sidebar_rules) || {};
        const showByDefault = !!rules.show_by_default;
        const openByDefault = !!rules.open_by_default;
        const showPatterns = rules.show_patterns || [];
        const hidePatterns = rules.hide_patterns || [];

        const fullUrl = window.location.href;
        const path = window.location.pathname || '/';
        const isHidden = anyMatch(fullUrl, path, hidePatterns);
        const explicitlyShown = anyMatch(fullUrl, path, showPatterns);
        const shouldShow = !isHidden && (showByDefault || explicitlyShown);

        if (!shouldShow) {
            return; // Do not inject nor fallback
        }

        // If mobile on load → switch to floating and stop here
        if (window.innerWidth < 768) {
            activateFloatingWidget();
            return;
        }

        const { container, iframe } = createSidebarContainer();
        const toggle = createToggleTab();

        let isOpen = openByDefault; // Respect rules for desktop open-by-default
        let isMobile = window.innerWidth < 768;

        const initialBodyMarginRight = getComputedStyle(document.body).marginRight;
        const initialHtmlMarginRight = getComputedStyle(document.documentElement).marginRight;

        function applyMargins(open, mobile) {
            if (mobile) {
                document.body.style.marginRight = initialBodyMarginRight;
                document.documentElement.style.marginRight = initialHtmlMarginRight;
                return;
            }
            if (open) {
                document.body.style.marginRight = sidebarWidth + 'px';
                document.documentElement.style.marginRight = sidebarWidth + 'px';
            } else {
                document.body.style.marginRight = initialBodyMarginRight;
                document.documentElement.style.marginRight = initialHtmlMarginRight;
            }
        }

        function updateLayout() {
            isMobile = window.innerWidth < 768;
            if (isMobile) {
                // Overlay fullscreen
                container.style.cssText = `position: fixed; top: 0; right: 0; left: 0; height: 100vh; width: 100%; z-index: 1000; background: white; border-left: none; box-shadow: none;`;
                container.style.transition = 'transform 250ms ease';
                container.style.transform = isOpen ? 'translateX(0)' : 'translateX(100%)';
                container.style.pointerEvents = isOpen ? 'auto' : 'none';
                toggle.style.display = isOpen ? 'none' : 'flex';
                toggle.style.right = '16px';
                toggle.style.bottom = '30px';
                toggle.style.top = '';
                toggle.style.width = '52px';
                toggle.style.height = '52px';
                toggle.style.borderRadius = '50%';
                toggle.innerHTML = chatIconSVG;
                applyMargins(false, true);
            } else {
                // Desktop: fixed sidebar
                container.style.cssText = `position: fixed; top: 0; right: 0; height: 100vh; width: ${sidebarWidth}px; z-index: 1000; background: white; border-left: 1px solid rgba(0,0,0,0.06); box-shadow: -8px 0 40px rgba(0,0,0,0.10);`;
                container.style.transition = 'transform 250ms ease';
                container.style.transform = isOpen ? 'translateX(0)' : 'translateX(100%)';
                container.style.pointerEvents = isOpen ? 'auto' : 'none';
                toggle.style.display = 'flex';
                toggle.style.top = '';
                toggle.style.bottom = '30px';
                toggle.style.width = '36px';
                toggle.style.height = '80px';
                toggle.style.borderRadius = '8px 0 0 8px';
                toggle.innerHTML = isOpen ? closeIconSVG : chatIconSVG;
                toggle.style.right = isOpen ? (sidebarWidth + 'px') : '0px';
                applyMargins(isOpen, false);
            }
        }

        function openSidebar() {
            if (isOpen) return;
            isOpen = true;
            trackEvent('widget_open', { opened_at: new Date().toISOString(), is_mobile: window.innerWidth < 768 });
            updateLayout();
        }
        function closeSidebar() {
            if (!isOpen) return;
            isOpen = false;
            updateLayout();
        }
        function toggleSidebar() { isOpen ? closeSidebar() : openSidebar(); }

        // Events
        toggle.addEventListener('click', toggleSidebar);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) closeSidebar(); });
        window.addEventListener('resize', () => {
            const nowMobile = window.innerWidth < 768;
            if (nowMobile && !usingFloatingFallback) {
                // Switch to floating widget and remove sidebar UI
                try { applyMargins(false, false); } catch {}
                if (container && container.parentElement) container.parentElement.removeChild(container);
                if (toggle && toggle.parentElement) toggle.parentElement.removeChild(toggle);
                activateFloatingWidget();
                return;
            }
            updateLayout();
        });

        // iframe messages
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'WIDGET_READY') {
                // noop
            } else if (event.data && event.data.type === 'ANALYTICS_EVENT') {
                trackEvent(event.data.eventType, event.data.data);
            } else if (event.data && event.data.type === 'CLOSE_WIDGET') {
                closeSidebar();
            } else if (event.data && event.data.type === 'GET_PAGE_URL') {
                iframe.contentWindow.postMessage({ type: 'PAGE_URL_RESPONSE', url: window.location.href }, '*');
            }
        });

    // Start analytics
    trackEvent('session_start', { initial_page_url: window.location.href, referrer: document.referrer, viewport_width: window.innerWidth, viewport_height: window.innerHeight });
    trackEvent('sidebar_widget_loaded', { width: sidebarWidth });

        // Initial layout (open by default)
        updateLayout();

        // Expose API
        window.ChatSidebarAPI = window.ChatSidebarAPI || {};
        window.ChatSidebarAPI[siteId] = { open: openSidebar, close: closeSidebar, toggle: toggleSidebar };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeSidebar);
    } else {
        initializeSidebar();
    }

    // Session end reliability
    function sendSessionEnd() {
        if (sessionEndSent) return;
        sessionEndSent = true;
        if (!sessionId) return;
        trackEvent('session_end', {
            session_duration: Date.now() - parseInt(sessionId.split('_')[1], 36),
            final_page_url: window.location.href
        });
    }
    window.addEventListener('beforeunload', sendSessionEnd);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') sendSessionEnd();
    });
    window.addEventListener('pagehide', sendSessionEnd);
})();
