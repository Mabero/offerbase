import React, { useState, useEffect, useRef } from 'react';
import { Loader2, X, Send } from "lucide-react";

// Types
interface ChatSettings {
  chat_name: string;
  chat_color: string;
  chat_icon_url?: string;
  chat_name_color: string;
  chat_bubble_icon_color: string;
  input_placeholder: string;
  font_size: string;
}

interface Session {
  user?: {
    id: string;
  };
}

interface MessageContent {
  type: 'message' | 'links';
  message: string;
  links?: Link[];
}

interface UserMessage {
  type: 'user';
  content: string;
}

interface BotMessage {
  type: 'bot';
  content: MessageContent;
}

type Message = UserMessage | BotMessage;

interface Link {
  url: string;
  name: string;
  description: string;
  image_url?: string;
  button_text?: string;
}

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
}

// LinkCard component to handle individual link rendering with hooks
const LinkCard = ({ link, chatSettings, styles, onLinkClick }: {
  link: Link;
  chatSettings: ChatSettings;
  styles: Record<string, React.CSSProperties>;
  onLinkClick: (link: Link) => void;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  
  return (
    <div
      style={{
        ...styles.linkCard,
        ...(isHovered ? styles.linkCardHover : {})
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {link.image_url && (
        <div style={styles.linkImage}>
          <img
            src={link.image_url}
            alt={link.name}
            style={styles.linkImageInner}
          />
        </div>
      )}
      
      <h4 
        style={{
          ...styles.linkTitle,
          fontSize: chatSettings?.font_size || '14px'
        }}
      >
        {link.name}
      </h4>
      
      <p 
        style={{
          ...styles.linkDescription,
          fontSize: chatSettings?.font_size || '14px'
        }}
      >
        {link.description}
      </p>
      
      <a
        href={link.url}
        target="_blank"
        rel="noopener"
        onClick={() => onLinkClick(link)}
        style={{
          ...styles.linkButton,
          ...(isButtonHovered ? styles.linkButtonHover : {}),
          backgroundColor: chatSettings?.chat_color || '#000',
          fontSize: chatSettings?.font_size || '14px',
          textDecoration: 'none',
          color: 'white'
        }}
        onMouseEnter={() => setIsButtonHovered(true)}
        onMouseLeave={() => setIsButtonHovered(false)}
      >
        {link.button_text && link.button_text.trim() ? link.button_text : 'Learn more'}
      </a>
    </div>
  );
};

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

function ChatWidget({ session, chatSettings: initialChatSettings, siteId, introMessage: initialIntroMessage, apiUrl = '', isEmbedded = false }: ChatWidgetProps) {
  console.log('ChatWidget received apiUrl:', apiUrl); // Debug log
  
  // Initialize messages with intro message if available
  const getInitialMessages = (): Message[] => {
    if (initialIntroMessage && initialIntroMessage.trim()) {
      return [{
        type: 'bot',
        content: {
          type: 'message',
          message: initialIntroMessage
        }
      } as BotMessage];
    }
    return [];
  };

  // Define reusable style objects matching the embed widget exactly
  const styles = {
    container: {
      width: '100%',
      height: '100%',
      backgroundColor: 'white',
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Inter", sans-serif'
    },
    header: {
      padding: '16px',
      display: 'flex',
      alignItems: 'center',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    },
    messagesContainer: {
      flex: '1',
      overflowY: 'auto' as const,
      padding: '16px',
      backgroundColor: '#f9fafb'
    },
    messageBubbleBot: {
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: '16px',
      padding: '12px 16px',
      maxWidth: '80%',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      marginBottom: '12px'
    },
    messageBubbleUser: {
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: '16px',
      padding: '12px 16px',
      maxWidth: '80%',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      marginBottom: '12px'
    },
    messageText: {
      color: '#1f2937',
      lineHeight: '1.5',
      margin: '0'
    },
    inputContainer: {
      padding: '16px',
      borderTop: '1px solid #e5e7eb',
      backgroundColor: '#f9fafb'
    },
    inputWrapper: {
      position: 'relative' as const,
      display: 'flex',
      alignItems: 'center'
    },
    input: {
      width: '100%',
      padding: '12px 48px 12px 16px',
      border: '1px solid #d1d5db',
      borderRadius: '24px',
      outline: 'none',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Inter", sans-serif',
      backgroundColor: 'white'
    },
    sendButton: {
      position: 'absolute' as const,
      right: '8px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      border: 'none',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      transition: 'all 0.2s ease'
    },
    messageRow: {
      display: 'flex',
      marginBottom: '12px',
      alignItems: 'flex-start'
    },
    messageRowUser: {
      display: 'flex',
      marginBottom: '12px',
      alignItems: 'flex-end',
      justifyContent: 'flex-end'
    },
    avatarSpacing: {
      marginRight: '12px'
    },
    avatar: {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f3f4f6',
      color: '#6b7280',
      fontSize: '14px',
      fontWeight: '600',
      overflow: 'hidden'
    },
    chatButton: {
      position: 'fixed' as const,
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
      transition: 'all 0.2s ease'
    },
    chatContainer: {
      position: 'fixed' as const,
      zIndex: 1300,
      display: 'flex',
      flexDirection: 'column' as const,
      overflow: 'hidden',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.15)',
      borderRadius: '20px'
    },
    linkCard: {
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255, 255, 255, 0.4)',
      borderRadius: '16px',
      padding: '16px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      transition: 'all 0.2s ease',
      minWidth: '220px',
      maxWidth: '340px',
      marginBottom: '12px'
    },
    linkCardHover: {
      transform: 'translateY(-2px)',
      boxShadow: '0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
    },
    linkImage: {
      width: '80px',
      height: '80px',
      borderRadius: '12px',
      overflow: 'hidden',
      backgroundColor: 'white',
      padding: '2px',
      marginBottom: '12px',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
    },
    linkImageInner: {
      width: '100%',
      height: '100%',
      objectFit: 'contain' as const,
      borderRadius: '8px'
    },
    linkTitle: {
      fontWeight: '700',
      color: '#1f2937',
      lineHeight: '1.25',
      marginBottom: '8px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Inter", sans-serif',
      margin: '0 0 8px 0'
    },
    linkDescription: {
      color: '#6b7280',
      lineHeight: '1.5',
      marginBottom: '16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Inter", sans-serif',
      margin: '0 0 16px 0'
    },
    linkButton: {
      borderRadius: '8px',
      fontWeight: '600',
      padding: '8px 16px',
      transition: 'all 0.2s ease',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
      border: 'none',
      color: 'white',
      textDecoration: 'none',
      display: 'inline-block',
      cursor: 'pointer'
    },
    linkButtonHover: {
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
    },
    linksContainer: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px'
    },
    loadingSpinner: {
      display: 'flex',
      justifyContent: 'center',
      margin: '16px 0'
    }
  };
  
  const [messages, setMessages] = useState<Message[]>(getInitialMessages);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(isEmbedded); // Auto-open if embedded
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [internalIntroMessage, setInternalIntroMessage] = useState(initialIntroMessage || '');
  const [chatSettings, setChatSettings] = useState(initialChatSettings);
  const [introMessage, setIntroMessage] = useState(initialIntroMessage);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`);

  // Responsive values - adjust for embedded mode
  const chatWidth = isEmbedded ? '100%' : '440px';
  const chatHeight = isEmbedded ? '100%' : '700px';
  const chatBottom = isEmbedded ? '0' : '100px';
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
    // Update messages if intro message changed and we have a custom intro message
    if (initialIntroMessage && initialIntroMessage.trim()) {
      setMessages([{
        type: 'bot',
        content: {
          type: 'message',
          message: initialIntroMessage
        }
      } as BotMessage]);
    }
  }, [initialIntroMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Scroll to bottom when chat is opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        scrollToBottom();
      }, 0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleOpenChat = () => setIsOpen(true);
    window.addEventListener('open-chat-widget', handleOpenChat);
    return () => window.removeEventListener('open-chat-widget', handleOpenChat);
  }, []);

  useEffect(() => {
    // Handle window.lastChatIntroMessage for widget mode only if no custom intro message
    if (!introMessage && window.lastChatIntroMessage && messages.length === 0) {
      setInternalIntroMessage(window.lastChatIntroMessage);
      setMessages([{
        type: 'bot',
        content: {
          type: 'message',
          message: window.lastChatIntroMessage
        }
      } as BotMessage]);
    }
    
    const handler = () => {
      if (!introMessage && window.lastChatIntroMessage) {
        setInternalIntroMessage(window.lastChatIntroMessage);
        setMessages([{
          type: 'bot',
          content: {
            type: 'message',
            message: window.lastChatIntroMessage
          }
        } as BotMessage]);
      }
    };
    window.addEventListener('chat-intro-message', handler);
    return () => window.removeEventListener('chat-intro-message', handler);
  }, [introMessage, messages.length]);

  // Analytics: track widget open
  useEffect(() => {
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

  // Listen for settings updates
  useEffect(() => {
    const handleSettingsUpdate = (event: CustomEvent<ChatSettings & { introMessage: string }>) => {
      const newSettings = event.detail;
      setChatSettings(newSettings);
      if (newSettings.introMessage !== introMessage) {
        setIntroMessage(newSettings.introMessage);
        setInternalIntroMessage(newSettings.introMessage);
        setMessages([{
          type: 'bot',
          content: {
            type: 'message',
            message: newSettings.introMessage
          }
        } as BotMessage]);
      }
    };

    window.addEventListener('chat-settings-updated', handleSettingsUpdate as EventListener);
    return () => window.removeEventListener('chat-settings-updated', handleSettingsUpdate as EventListener);
  }, [introMessage]);

  // Avatar component using inline styles
  const Avatar = ({ src, name, style = {} }: { src?: string; name?: string; style?: React.CSSProperties }) => {
    const avatarStyle = {
      ...styles.avatar,
      ...style
    };

    if (src) {
      return (
        <div style={avatarStyle}>
          <img
            src={src}
            alt={name || 'AI'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' as const, borderRadius: '50%' }}
            onError={(e) => {
              // Hide image and show fallback text
              (e.target as HTMLImageElement).style.display = 'none';
              const parent = (e.target as HTMLImageElement).parentNode as HTMLElement;
              if (parent) {
                parent.textContent = name ? name.charAt(0).toUpperCase() : 'AI';
              }
            }}
          />
        </div>
      );
    }

    return (
      <div style={avatarStyle}>
        {name ? name.charAt(0).toUpperCase() : 'AI'}
      </div>
    );
  };

  // Analytics: track message sent
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage;
    setInputMessage('');
    setMessages(prev => [...prev, { type: 'user', content: userMessage } as UserMessage]);
    setIsLoading(true);

    // Fire analytics event (non-blocking)
    fetch(`${apiUrl}/api/analytics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'message_sent',
        user_id: session?.user?.id || null,
        site_id: siteId,
        details: { message_length: userMessage.length }
      })
    }).catch(() => {
      // Silently handle analytics errors to avoid console noise
    });

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-site-id': siteId
      };
      
      // Only add user ID if session exists
      if (session?.user?.id) {
        headers['x-user-id'] = session.user.id;
      }

      // Build conversation history from current messages (excluding intro message)
      const conversationHistory = messages
        .filter(msg => {
          // Skip intro messages that are just the default greeting
          if (msg.type === 'bot' && msg.content.type === 'message') {
            const content = msg.content.message;
            // Add safety check to prevent undefined.includes() error
            if (content && typeof content === 'string') {
              const isIntroMessage = content.includes('Hi! I am') || content.includes('How can I help');
              return !isIntroMessage;
            }
          }
          return true;
        })
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.type === 'user' ? msg.content : msg.content.message || ''
        }))
        .filter(msg => msg.content.trim().length > 0); // Remove empty messages

      console.log('Making request to:', `${apiUrl}/api/chat`); // Debug log
      console.log('Conversation history:', conversationHistory); // Debug log
      
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          message: userMessage,
          siteId: siteId,
          conversationHistory: conversationHistory,
          sessionId: sessionId
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { type: 'bot', content: data } as BotMessage]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        type: 'bot',
        content: {
          type: 'message',
          message: 'Sorry, I encountered an error. Please try again.'
        }
      } as BotMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // Analytics: track link clicks in bot messages
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

  const renderMessage = (message: Message) => {
    if (message.type === 'user') {
      return (
        <div style={styles.messageRowUser}>
          <div
            style={{
              ...styles.messageBubbleUser,
              fontSize: chatSettings?.font_size || '14px'
            }}
          >
            <p style={styles.messageText}>
              {message.content}
            </p>
          </div>
        </div>
      );
    }

    // Bot message - content is always MessageContent
    const botContent = message.content;
    if (botContent.type === 'links') {
      return (
        <div style={styles.messageRow}>
          <Avatar
            src={chatSettings?.chat_icon_url}
            name={chatSettings?.chat_name || 'AI'}
            style={styles.avatarSpacing}
          />
          <div style={{ maxWidth: '80%' }}>
            <div
              style={{
                ...styles.messageBubbleBot,
                fontSize: chatSettings?.font_size || '14px',
                marginBottom: '12px'
              }}
            >
              <p style={{...styles.messageText, marginBottom: '12px'}}>
                {botContent.message}
              </p>
            </div>
            
            <div style={styles.linksContainer}>
              {botContent.links?.map((link, index) => (
                <LinkCard 
                  key={index} 
                  link={link} 
                  chatSettings={chatSettings} 
                  styles={styles} 
                  onLinkClick={handleLinkClick}
                />
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Regular message response
    const messageContent = botContent?.message || (typeof botContent === 'string' ? botContent : 'Sorry, I could not understand the response.');
    
    // Additional safety check for production
    if (typeof messageContent !== 'string') {
      console.error('React Error #31 Prevention: Non-string message detected:', messageContent, botContent);
      const fallbackMessage = 'Sorry, I encountered an error processing the response.';

      return (
        <div style={styles.messageRow}>
          <Avatar
            src={chatSettings?.chat_icon_url}
            name={chatSettings?.chat_name || 'AI'}
            style={styles.avatarSpacing}
          />
          <div
            style={{
              ...styles.messageBubbleBot,
              fontSize: chatSettings?.font_size || '14px'
            }}
          >
            <p style={styles.messageText}>
              {fallbackMessage}
            </p>
          </div>
        </div>
      );
    }
    
    return (
      <div style={styles.messageRow}>
        <Avatar
          src={chatSettings?.chat_icon_url}
          name={chatSettings?.chat_name || 'AI'}
          style={styles.avatarSpacing}
        />
        <div
          style={{
            ...styles.messageBubbleBot,
            fontSize: chatSettings?.font_size || '14px'
          }}
        >
          <p style={styles.messageText}>
            {messageContent}
          </p>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Chat Button - only show if not embedded and not in iframe */}
      {!isEmbedded && window === window.top && (
        <div
          style={{
            position: 'fixed',
            zIndex: 1400,
            bottom: buttonBottom,
            right: buttonRight,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
          }}
        >
          <button
            onClick={() => setIsOpen(!isOpen)}
            style={{
              ...styles.chatButton,
              backgroundColor: chatSettings?.chat_color || '#000',
              color: chatSettings?.chat_bubble_icon_color || '#fff',
            }}
            aria-label={isOpen ? 'Close chat' : 'Open chat'}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
            }}
          >
            {isOpen ? (
              <X size={24} />
            ) : (
              <ChatIcon color={chatSettings?.chat_bubble_icon_color || '#fff'} />
            )}
          </button>
        </div>
      )}

      {/* Chat Container */}
      {isOpen && (
        isEmbedded ? (
          // Embedded mode - no Portal, fill container
          <div style={styles.container}>
            {/* Chat Header */}
            <div
              style={{
                ...styles.header,
                backgroundColor: chatSettings?.chat_color || '#000',
                color: chatSettings?.chat_name_color || '#fff',
              }}
            >
              <Avatar
                src={chatSettings?.chat_icon_url}
                name={chatSettings?.chat_name || 'AI'}
                style={styles.avatarSpacing}
              />
              <p 
                style={{
                  ...styles.messageText,
                  fontWeight: '600',
                  fontSize: chatSettings?.font_size || '14px',
                  color: chatSettings?.chat_name_color || '#fff',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Inter", sans-serif'
                }}
              >
                {chatSettings?.chat_name || 'Affi'}
              </p>
            </div>

            {/* Messages Area */}
            <div style={styles.messagesContainer}>
              {messages.length === 0 && !isLoading && (
                <div style={styles.messageRow}>
                  <Avatar
                    src={chatSettings?.chat_icon_url}
                    name={chatSettings?.chat_name || 'AI'}
                    style={styles.avatarSpacing}
                  />
                  <div
                    style={{
                      ...styles.messageBubbleBot,
                      fontSize: chatSettings?.font_size || '14px'
                    }}
                  >
                    <p style={styles.messageText}>
                      {introMessage || internalIntroMessage || `Hi! I am ${chatSettings?.chat_name || 'Affi'}, your assistant. How can I help you today?`}
                    </p>
                  </div>
                </div>
              )}
              
              {messages.map((message, index) => (
                <div key={index}>
                  {renderMessage(message)}
                </div>
              ))}
              
              {isLoading && (
                <div style={styles.loadingSpinner}>
                  <Loader2 
                    size={24}
                    style={{ 
                      color: chatSettings?.chat_color || '#6B7280',
                      animation: 'spin 1s linear infinite'
                    }}
                  />
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={styles.inputContainer}>
              <div style={styles.inputWrapper}>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={chatSettings?.input_placeholder || 'Type your message...'}
                  style={{
                    ...styles.input,
                    fontSize: chatSettings?.font_size || '14px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)'
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isLoading || !inputMessage.trim()}
                  style={{
                    ...styles.sendButton,
                    backgroundColor: chatSettings?.chat_color || '#000',
                    opacity: (isLoading || !inputMessage.trim()) ? 0.5 : 1,
                    cursor: (isLoading || !inputMessage.trim()) ? 'not-allowed' : 'pointer'
                  }}
                  aria-label="Send message"
                  onMouseEnter={(e) => {
                    if (!isLoading && inputMessage.trim()) {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-50%) scale(1.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-50%) scale(1)';
                  }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        ) : (
          // Regular mode - Fixed positioning
          <div
            style={{
              ...styles.chatContainer,
              bottom: chatBottom,
              right: chatRight,
              width: chatWidth,
              height: chatHeight,
            }}
          >
            {/* Chat Header */}
            <div
              style={{
                ...styles.header,
                backgroundColor: chatSettings?.chat_color || '#000',
                color: chatSettings?.chat_name_color || '#fff',
                borderRadius: '20px 20px 0 0'
              }}
            >
              <Avatar
                src={chatSettings?.chat_icon_url}
                name={chatSettings?.chat_name || 'AI'}
                style={styles.avatarSpacing}
              />
              <p 
                style={{
                  ...styles.messageText,
                  fontWeight: '600',
                  fontSize: chatSettings?.font_size || '14px',
                  color: chatSettings?.chat_name_color || '#fff',
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Inter", sans-serif'
                }}
              >
                {chatSettings?.chat_name || 'Affi'}
              </p>
            </div>

            {/* Messages Area */}
            <div style={styles.messagesContainer}>
              {messages.length === 0 && !isLoading && (
                <div style={styles.messageRow}>
                  <Avatar
                    src={chatSettings?.chat_icon_url}
                    name={chatSettings?.chat_name || 'AI'}
                    style={styles.avatarSpacing}
                  />
                  <div
                    style={{
                      ...styles.messageBubbleBot,
                      fontSize: chatSettings?.font_size || '14px'
                    }}
                  >
                    <p style={styles.messageText}>
                      {introMessage || internalIntroMessage || `Hi! I am ${chatSettings?.chat_name || 'Affi'}, your assistant. How can I help you today?`}
                    </p>
                  </div>
                </div>
              )}
              
              {messages.map((message, index) => (
                <div key={index}>
                  {renderMessage(message)}
                </div>
              ))}
              
              {isLoading && (
                <div style={styles.loadingSpinner}>
                  <Loader2 
                    size={24}
                    style={{ 
                      color: chatSettings?.chat_color || '#6B7280',
                      animation: 'spin 1s linear infinite'
                    }}
                  />
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={styles.inputContainer}>
              <div style={styles.inputWrapper}>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={chatSettings?.input_placeholder || 'Type your message...'}
                  style={{
                    ...styles.input,
                    fontSize: chatSettings?.font_size || '14px',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)'
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isLoading || !inputMessage.trim()}
                  style={{
                    ...styles.sendButton,
                    backgroundColor: chatSettings?.chat_color || '#000',
                    opacity: (isLoading || !inputMessage.trim()) ? 0.5 : 1,
                    cursor: (isLoading || !inputMessage.trim()) ? 'not-allowed' : 'pointer'
                  }}
                  aria-label="Send message"
                  onMouseEnter={(e) => {
                    if (!isLoading && inputMessage.trim()) {
                      (e.currentTarget as HTMLElement).style.transform = 'translateY(-50%) scale(1.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = 'translateY(-50%) scale(1)';
                  }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </>
  );
}

export default ChatWidget;