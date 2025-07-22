(function() {
    'use strict';
    
    // Prevent multiple instances
    if (window.ChatWidgetLoaded) {
        return;
    }
    window.ChatWidgetLoaded = true;
    
    // Configuration
    const script = document.currentScript;
    const siteId = script.getAttribute('data-site-id');
    const encodedSettings = script.getAttribute('data-settings');
    const apiUrl = script.src.replace('/widget.js', '');
    
    if (!siteId) {
        console.error('ChatWidget: data-site-id attribute is required');
        return;
    }
    
    // Decode settings if provided
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
    
    if (encodedSettings) {
        try {
            chatSettings = JSON.parse(atob(encodedSettings));
        } catch (e) {
            console.warn('ChatWidget: Failed to decode settings, using defaults', e);
        }
    }
    
    console.log('ChatWidget: Initializing with siteId:', siteId, 'apiUrl:', apiUrl);
    
    // Widget configuration
    const config = {
        siteId: siteId,
        apiUrl: apiUrl,
        settings: chatSettings,
        embedded: false
    };
    
    // Create widget container
    function createWidgetContainer() {
        const container = document.createElement('div');
        container.id = 'chat-widget-' + siteId;
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 400px;
            height: 600px;
            z-index: 1000;
            border: none;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
            background: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            overflow: hidden;
            display: none;
        `;
        
        // Create iframe
        const iframe = document.createElement('iframe');
        const settingsParam = encodeURIComponent(JSON.stringify(chatSettings));
        iframe.src = `${apiUrl}/widget-frame.html?siteId=${encodeURIComponent(siteId)}&apiUrl=${encodeURIComponent(apiUrl)}&settings=${settingsParam}`;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            border-radius: 12px;
        `;
        iframe.title = 'Chat Widget';
        
        container.appendChild(iframe);
        document.body.appendChild(container);
        
        return { container, iframe };
    }
    
    // Create chat button
    function createChatButton() {
        const button = document.createElement('button');
        button.id = 'chat-widget-button-' + siteId;
        button.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: none;
            background: ${chatSettings.chat_color || '#000'};
            color: ${chatSettings.chat_bubble_icon_color || 'white'};
            cursor: pointer;
            z-index: 1001;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        `;
        
        // Chat icon SVG
        button.innerHTML = `
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
            </svg>
        `;
        
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
    function initializeWidget() {
        const { container, iframe } = createWidgetContainer();
        const button = createChatButton();
        
        let isOpen = false;
        
        // Toggle widget
        function toggleWidget() {
            isOpen = !isOpen;
            
            if (isOpen) {
                container.style.display = 'block';
                button.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                `;
                
                // Track widget open
                trackEvent('widget_open');
            } else {
                container.style.display = 'none';
                button.innerHTML = `
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
                    </svg>
                `;
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
                console.log('ChatWidget: Widget ready');
            }
        });
        
        // Responsive behavior
        function updateResponsiveStyles() {
            if (window.innerWidth < 768) {
                container.style.cssText = `
                    position: fixed;
                    bottom: 0;
                    right: 0;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 1000;
                    border: none;
                    border-radius: 0;
                    box-shadow: none;
                    background: white;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
                    overflow: hidden;
                    display: ${isOpen ? 'block' : 'none'};
                `;
                
                iframe.style.borderRadius = '0';
            } else {
                container.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    width: 400px;
                    height: 600px;
                    z-index: 1000;
                    border: none;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                    background: white;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
                    overflow: hidden;
                    display: ${isOpen ? 'block' : 'none'};
                `;
                
                iframe.style.borderRadius = '12px';
            }
        }
        
        // Update on resize
        window.addEventListener('resize', updateResponsiveStyles);
        updateResponsiveStyles();
        
        console.log('ChatWidget: Initialized successfully');
    }
    
    // Analytics tracking
    function trackEvent(eventType, details = {}) {
        try {
            fetch(`${apiUrl}/api/analytics`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    event_type: eventType,
                    site_id: siteId,
                    user_id: null,
                    details: details,
                    timestamp: new Date().toISOString(),
                    url: window.location.href,
                    user_agent: navigator.userAgent
                })
            }).catch(error => {
                console.warn('ChatWidget: Analytics tracking failed:', error);
            });
        } catch (error) {
            console.warn('ChatWidget: Analytics tracking failed:', error);
        }
    }
    
    // Auto-popup functionality
    function setupAutoPopup() {
        // Show intro popup after 3 seconds if not already shown
        setTimeout(() => {
            if (!localStorage.getItem('chat-widget-intro-shown-' + siteId)) {
                // Create intro popup
                const popup = document.createElement('div');
                popup.style.cssText = `
                    position: fixed;
                    bottom: 100px;
                    right: 20px;
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
                
                popup.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                        <div style="font-weight: 600; color: #111827;">${chatSettings.chat_name || 'Affi'} 👋</div>
                        <button style="background: none; border: none; cursor: pointer; padding: 0; color: #6b7280; font-size: 16px;" onclick="this.parentElement.parentElement.remove();">×</button>
                    </div>
                    <div style="margin-bottom: 12px; cursor: pointer;">${chatSettings.intro_message || 'Hello! How can I help you today?'}</div>
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
                
                // Mark as shown
                localStorage.setItem('chat-widget-intro-shown-' + siteId, 'true');
                
                // Track popup shown
                trackEvent('intro_popup_shown');
            }
        }, 3000);
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeWidget();
            setupAutoPopup();
        });
    } else {
        initializeWidget();
        setupAutoPopup();
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
        }
    };
    
})();