import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatWidgetCore, type ChatSettings, type Session } from './components/ChatWidgetCore';

// Global interface for widget initialization
interface WidgetConfig {
  siteId: string;
  apiUrl: string;
  settings: ChatSettings;
  embedded: boolean;
}

// Widget initialization function
function initializeChatWidget(config: WidgetConfig, container: HTMLElement) {
  const root = createRoot(container);
  
  const handleLinkClick = (link: any) => {
    // Analytics tracking for link clicks
    try {
      fetch(`${config.apiUrl}/api/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'link_click',
          site_id: config.siteId,
          user_id: null,
          details: { link_url: link.url, link_name: link.name }
        })
      }).catch(() => {
        // Silently handle analytics errors
      });
    } catch (error) {
      // Silently handle analytics errors
    }
  };

  const handleMessageSent = (message: string) => {
    // Analytics tracking for message sent
    try {
      fetch(`${config.apiUrl}/api/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'message_sent',
          site_id: config.siteId,
          user_id: null,
          details: { message_length: message.length }
        })
      }).catch(() => {
        // Silently handle analytics errors
      });
    } catch (error) {
      // Silently handle analytics errors
    }
  };

  const handleWidgetOpen = () => {
    // Analytics tracking for widget open
    try {
      fetch(`${config.apiUrl}/api/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'widget_open',
          site_id: config.siteId,
          user_id: null,
          details: {}
        })
      }).catch(() => {
        // Silently handle analytics errors
      });
    } catch (error) {
      // Silently handle analytics errors
    }
  };

  root.render(
    <ChatWidgetCore
      chatSettings={config.settings}
      siteId={config.siteId}
      introMessage={config.settings.intro_message || 'Hello! How can I help you today?'}
      apiUrl={config.apiUrl}
      isEmbedded={config.embedded}
      onLinkClick={handleLinkClick}
      onMessageSent={handleMessageSent}
      onWidgetOpen={handleWidgetOpen}
    />
  );

  return root;
}

// Export for global access
(window as any).ChatWidgetCore = {
  ChatWidgetCore,
  initializeChatWidget,
  React,
  createRoot
};

export { ChatWidgetCore, initializeChatWidget };