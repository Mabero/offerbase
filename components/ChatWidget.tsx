// FILE PURPOSE: Chat widget wrapper component - handles widget positioning, toggle, and initialization
import React, { useState, useEffect, useCallback } from 'react';
import { X } from "lucide-react";
import ChatWidgetCore, { 
  type ChatSettings, 
  type Session, 
  type Link 
} from './ChatWidgetCore';

// Extend Window interface for custom properties
declare global {
  interface Window {
    lastChatIntroMessage?: string;
  }
}

interface ChatWidgetProps {
  session: Session | null;
  chatSettings: ChatSettings;
  siteId: string;
  introMessage: string;
  apiUrl?: string;
  isEmbedded?: boolean;
  widgetType?: 'floating' | 'inline';
}

// Custom Chat Icon Component (preserving the original design)
const ChatIcon = ({ color = '#fff', ...props }: { color?: string; [key: string]: unknown }) => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 800 800"
    {...props}
  >
    <path
      d="M400,26.74C183.35,26.74,7.1,185.37,7.1,380.35c0,68.17,21.57,134.19,62.44,191.26-7.74,85.61-28.49,149.17-58.61,179.28-3.98,3.98-4.98,10.07-2.46,15.10,2.24,4.49,6.81,7.26,11.72,7.26.6,0,1.22-.04,1.83-.13,5.3-.75,128.52-18.49,217.63-69.91,50.62,20.42,104.52,30.75,160.34,30.75,43.33,0,85.05-6.35,124.06-18.07-9.78-21.86-19.32-43.83-28.5-65.95-10.09-24.3-27.21-41.15-51.18-51.57-26.22-11.4-52.39-22.91-78.36-34.86-3.83-1.76-8.85-6.14-8.92-9.4-.07-3.2,4.88-7.84,8.67-9.55,25.71-11.63,51.65-22.74,77.59-33.83,23.28-9.95,40.14-26.19,50.2-49.56,11.3-26.26,22.8-52.43,34.5-78.51,1.78-3.97,5.11-7.24,9.53-13.32,4.43,5.97,7.8,9.18,9.58,13.12,11.3,25.04,22.71,50.04,33.18,75.43,11.01,26.69,29.94,44.33,56.54,55.02,24.45,9.82,48.5,20.67,72.49,31.58,3.82,1.74,8.8,6.16,8.86,9.42.06,3.18-4.92,7.75-8.71,9.48-25.33,11.56-50.86,22.68-76.46,33.65-23.99,10.28-41.42,26.93-51.79,51.03-8.14,18.91-16.34,37.79-24.74,56.59,138.96-54.55,236.34-179.39,236.34-324.31,0-194.98-176.26-353.61-392.9-353.61ZM421.15,423.82c-19.85,6.7-32.47,19.54-39.01,39.41-3.39,10.3-8.71,19.97-13.95,31.71-3.23-3.85-4.93-5.57-6.24-7.55-1.01-1.52-1.53-3.37-2.25-5.08-22.49-53.65-17-43.59-65.12-65.99-4.45-2.07-8.69-4.62-15.37-8.2,5.54-2.99,8.54-4.85,11.73-6.3,10.8-4.91,22.53-8.39,32.26-14.88,8.85-5.9,17.02-14.05,22.85-22.95,6.41-9.79,9.64-21.62,14.6-32.41,1.28-2.79,3.84-4.99,5.81-7.46,2.26,2.59,5.24,4.85,6.66,7.84,4.74,10.06,9.14,20.31,13.27,30.64,4.83,12.08,13.24,20.3,25.11,25.36,10.57,4.51,21.05,9.24,31.51,14.02,3.14,1.44,6.06,3.36,12.14,6.78-13.31,5.98-23.34,11.45-34,15.06ZM491.62,352.41c-7.16-24.34-22.39-37.93-46.14-45.02,23.14-7.66,39.22-20.85,45.15-45.85,8.79,22.11,20.21,40,46.28,44.61-22.21,9.21-39.85,20.79-45.29,46.26Z"
      fill={color}
    />
  </svg>
);

function ChatWidget({ 
  session, 
  chatSettings: initialChatSettings, 
  siteId, 
  introMessage: initialIntroMessage, 
  apiUrl = '', 
  isEmbedded = false,
  widgetType = 'floating'
}: ChatWidgetProps) {
  
  const [isOpen, setIsOpen] = useState(isEmbedded); // Auto-open if embedded
  const [internalIntroMessage, setInternalIntroMessage] = useState(initialIntroMessage || '');
  const [chatSettings, setChatSettings] = useState(initialChatSettings);
  const [introMessage, setIntroMessage] = useState(initialIntroMessage);
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile on mount and window resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    // Initial check
    checkMobile();
    
    // Add resize listener
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Responsive values - adjust for embedded mode and mobile
  const chatWidth = isEmbedded ? '100%' : (isMobile ? 'calc(100% - 32px)' : '440px');
  const chatHeight = isEmbedded ? '100%' : (isMobile ? 'calc(100vh - 120px)' : '700px');
  const chatBottom = isEmbedded ? '0' : (isMobile ? '80px' : '100px');
  const chatRight = isEmbedded ? '0' : '16px';
  const buttonBottom = '16px';
  const buttonRight = '16px';

  // Update local state when props change
  useEffect(() => {
    setChatSettings(initialChatSettings);
  }, [initialChatSettings]);

  useEffect(() => {
    setIntroMessage(initialIntroMessage);
    setInternalIntroMessage(initialIntroMessage || '');
  }, [initialIntroMessage]);

  useEffect(() => {
    const handleOpenChat = () => setIsOpen(true);
    const handleCloseChat = () => setIsOpen(false);
    
    window.addEventListener('open-chat-widget', handleOpenChat);
    window.addEventListener('close-chat-widget', handleCloseChat);
    
    return () => {
      window.removeEventListener('open-chat-widget', handleOpenChat);
      window.removeEventListener('close-chat-widget', handleCloseChat);
    };
  }, []);

  useEffect(() => {
    // Handle window.lastChatIntroMessage for widget mode only if no custom intro message
    if (!introMessage && window.lastChatIntroMessage) {
      setInternalIntroMessage(window.lastChatIntroMessage);
    }
    
    const handler = () => {
      if (!introMessage && window.lastChatIntroMessage) {
        setInternalIntroMessage(window.lastChatIntroMessage);
      }
    };
    window.addEventListener('chat-intro-message', handler);
    return () => window.removeEventListener('chat-intro-message', handler);
  }, [introMessage]);

  // Analytics: track widget open
  const handleWidgetOpen = useCallback(() => {
    if (isOpen) {
      fetch(`${apiUrl}/api/analytics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'widget_open',
          user_id: session?.user?.id || null,
          site_id: siteId,
          details: {}
        })
      }).catch(() => {
        // Silently handle analytics errors to avoid console noise
      });
    }
  }, [isOpen, apiUrl, session?.user?.id, siteId]);

  // Analytics: track link clicks
  const handleLinkClick = (link: Link) => {
    fetch(`${apiUrl}/api/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'link_click',
        user_id: session?.user?.id || null,
        site_id: siteId,
        details: { link_url: link.url, link_name: link.name }
      })
    }).catch(() => {
      // Silently handle analytics errors to avoid console noise
    });
  };

  // Analytics: track message sent
  const handleMessageSent = (message: string) => {
    fetch(`${apiUrl}/api/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'message_sent',
        user_id: session?.user?.id || null,
        site_id: siteId,
        details: { message_length: message.length }
      })
    }).catch(() => {
      // Silently handle analytics errors to avoid console noise
    });
  };

  // Listen for settings updates
  useEffect(() => {
    const handleSettingsUpdate = (event: CustomEvent<ChatSettings & { introMessage: string }>) => {
      const newSettings = event.detail;
      setChatSettings(newSettings);
      if (newSettings.introMessage !== introMessage) {
        setIntroMessage(newSettings.introMessage);
        setInternalIntroMessage(newSettings.introMessage);
      }
    };

    window.addEventListener('chat-settings-updated', handleSettingsUpdate as EventListener);
    return () => window.removeEventListener('chat-settings-updated', handleSettingsUpdate as EventListener);
  }, [introMessage]);

  // Call analytics when opened
  useEffect(() => {
    if (isOpen) {
      handleWidgetOpen();
    }
  }, [isOpen, handleWidgetOpen]);

  const chatButtonStyles: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1400,
    borderRadius: '50%',
    width: '52px',
    height: '52px',
    padding: '0',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    bottom: buttonBottom,
    right: buttonRight,
    backgroundColor: chatSettings?.chat_color || '#000',
    color: chatSettings?.chat_bubble_icon_color || '#fff',
  };

  // Mobile-specific styles
  const mobileStyles: React.CSSProperties = {
    maxWidth: '400px',
    maxHeight: '600px',
    left: '16px', // Add left constraint for mobile
  };

  const chatContainerStyles: React.CSSProperties = {
    position: 'fixed',
    zIndex: 1300,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(8px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
    borderRadius: '20px',
    bottom: chatBottom,
    right: chatRight,
    width: chatWidth,
    height: chatHeight,
    ...(isMobile && !isEmbedded ? mobileStyles : {}),
  };

  const embeddedStyles: React.CSSProperties = {
    width: '100%',
    height: '100%',
    backgroundColor: 'white',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  };

  return (
    <>
      {/* Chat Button - only show if not embedded and not in iframe */}
      {!isEmbedded && window === window.top && (
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={chatButtonStyles}
          aria-label={isOpen ? 'Close chat' : 'Open chat'}
        >
          {isOpen ? (
            <X size={24} />
          ) : (
            <ChatIcon color={chatSettings?.chat_bubble_icon_color || '#fff'} />
          )}
        </button>
      )}

      {/* Chat Container */}
      {isOpen && (
        <div style={isEmbedded ? embeddedStyles : chatContainerStyles}>
          <ChatWidgetCore
            session={session}
            chatSettings={chatSettings}
            siteId={siteId}
            introMessage={introMessage || internalIntroMessage}
            apiUrl={apiUrl}
            isEmbedded={isEmbedded}
            widgetType={widgetType}
            onLinkClick={handleLinkClick}
            onMessageSent={handleMessageSent}
          />
        </div>
      )}
    </>
  );
}

export default ChatWidget;