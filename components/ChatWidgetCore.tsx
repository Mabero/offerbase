import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PredefinedQuestions } from './PredefinedQuestions';
import { PredefinedQuestionButton } from '@/types/predefined-questions';

// Types
export interface ChatSettings {
  chat_name: string;
  chat_color: string;
  chat_icon_url?: string;
  chat_name_color: string;
  chat_bubble_icon_color: string;
  input_placeholder: string;
  font_size: string;
  intro_message?: string;
}

export interface Session {
  user?: {
    id: string;
  };
}

export interface MessageContent {
  type: 'message' | 'links' | 'simple_link';
  message: string;
  links?: Link[];
  simple_link?: {
    text: string;
    url: string;
  };
}

export interface UserMessage {
  type: 'user';
  content: string;
  id: string;
  timestamp: number;
}

export interface BotMessage {
  type: 'bot';
  content: MessageContent;
  id: string;
  timestamp: number;
}

export type Message = UserMessage | BotMessage;

export interface Link {
  url: string;
  name: string;
  description: string;
  image_url?: string;
  button_text?: string;
}

export interface ChatWidgetCoreProps {
  session?: Session | null;
  chatSettings: ChatSettings;
  siteId: string;
  introMessage?: string;
  apiUrl?: string;
  isEmbedded?: boolean;
  widgetType?: 'floating' | 'inline';
  onLinkClick?: (link: Link) => void;
  onMessageSent?: (message: string) => void;
  onWidgetOpen?: () => void;
}

// Utility function to generate unique message IDs
const generateMessageId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Simple icon components using SVG (no external dependencies)
const SendIcon = ({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m22 2-7 20-4-9-9-4 20-7z" />
  </svg>
);

const CloseIcon = ({ size = 24, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const CopyIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
  </svg>
);

const ThumbsUpIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
  </svg>
);

const ThumbsDownIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
  </svg>
);

const RetryIcon = ({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
    <path d="M3 21v-5h5"/>
  </svg>
);

const MessageActions = ({ 
  messageContent, 
  onCopy, 
  onThumbsUp, 
  onThumbsDown, 
  onRetry,
  isVisible = true
}: { 
  messageContent: string;
  onCopy: () => void;
  onThumbsUp: () => void;
  onThumbsDown: () => void;
  onRetry: () => void;
  isVisible?: boolean;
}) => {
  const [copied, setCopied] = useState(false);

  const buttonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    padding: '6px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    color: '#6b7280'
  };

  const buttonHoverStyle: React.CSSProperties = {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    color: '#374151'
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageContent);
      setCopied(true);
      onCopy();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
    }
  };

  return (
    <div 
      style={{
        display: 'flex',
        gap: '4px',
        marginTop: '8px',
        marginLeft: '44px', // Align with message content
        opacity: isVisible ? 1 : 0,
        transition: 'opacity 0.2s ease'
      }}
    >
      <button
        onClick={handleCopy}
        style={buttonStyle}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { backgroundColor: 'transparent', color: '#6b7280' })}
        title={copied ? 'Copied!' : 'Copy message'}
      >
        <CopyIcon size={16} color={copied ? '#10b981' : 'currentColor'} />
      </button>
      
      <button
        onClick={onThumbsUp}
        style={buttonStyle}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { backgroundColor: 'transparent', color: '#6b7280' })}
        title="Good response"
      >
        <ThumbsUpIcon size={16} />
      </button>
      
      <button
        onClick={onThumbsDown}
        style={buttonStyle}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { backgroundColor: 'transparent', color: '#6b7280' })}
        title="Poor response"
      >
        <ThumbsDownIcon size={16} />
      </button>
      
      <button
        onClick={onRetry}
        style={buttonStyle}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, buttonHoverStyle)}
        onMouseLeave={(e) => Object.assign(e.currentTarget.style, { backgroundColor: 'transparent', color: '#6b7280' })}
        title="Retry message"
      >
        <RetryIcon size={16} />
      </button>
    </div>
  );
};

const TypingIndicator = ({ chatSettings, styles }: { 
  chatSettings: ChatSettings; 
  styles: Record<string, React.CSSProperties> 
}) => (
  <div style={styles.messageRow}>
    <Avatar
      src={chatSettings?.chat_icon_url}
      name={chatSettings?.chat_name}
      style={styles.avatarSpacing}
    />
    <div style={{ maxWidth: '80%' }}>
      <div
        style={{
          ...styles.messageBubbleBot,
          fontSize: chatSettings?.font_size || '14px',
          padding: '16px 20px'
        }}
      >
        <div style={styles.typingContainer}>
          <div style={{...styles.typingDot, ...styles.typingDot1}}></div>
          <div style={{...styles.typingDot, ...styles.typingDot2}}></div>
          <div style={{...styles.typingDot, ...styles.typingDot3}}></div>
        </div>
      </div>
    </div>
  </div>
);

const TypewriterMessage = ({ 
  message, 
  chatSettings, 
  styles, 
  onComplete,
  onScroll
}: { 
  message: string;
  chatSettings: ChatSettings;
  styles: Record<string, React.CSSProperties>;
  onComplete: () => void;
  onScroll?: () => void;
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    let index = 0;
    let timeoutId: NodeJS.Timeout | null = null;
    let isCancelled = false;
    
    setDisplayedText('');
    setIsTyping(true);

    const typeCharacter = () => {
      if (isCancelled) return;
      
      if (index < message.length) {
        const char = message[index];
        setDisplayedText(prev => {
          const newText = prev + char;
          // Trigger scroll after state update
          setTimeout(() => onScroll?.(), 0);
          return newText;
        });
        index++;
        
        // Add slight pause after punctuation for more natural feel
        const delay = (char === '.' || char === '!' || char === '?') ? 50 : 5;
        timeoutId = setTimeout(typeCharacter, delay);
      } else {
        if (!isCancelled) {
          setIsTyping(false);
          onComplete();
        }
      }
    };
    
    timeoutId = setTimeout(typeCharacter, 25);

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [message, onComplete, onScroll]);

  return (
    <div style={styles.messageRow}>
      <Avatar
        src={chatSettings?.chat_icon_url}
        name={chatSettings?.chat_name}
        style={styles.avatarSpacing}
      />
      <div style={{ maxWidth: '80%' }}>
        <div
          style={{
            ...styles.messageBubbleBot,
            fontSize: chatSettings?.font_size || '14px'
          }}
        >
          <p style={styles.messageText}>
            {displayedText}
            {isTyping && <span style={styles.typingCursor}>|</span>}
          </p>
        </div>
      </div>
    </div>
  );
};

// Avatar component
const Avatar = ({ src, name, style = {} }: { src?: string; name?: string; style?: React.CSSProperties }) => {
  const avatarStyle: React.CSSProperties = {
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
    overflow: 'hidden',
    ...style
  };

  if (src) {
    return (
      <div style={avatarStyle}>
        <img
          src={src}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            if (target.nextSibling) {
              (target.nextSibling as HTMLElement).style.display = 'flex';
            }
          }}
        />
        <div style={{ ...avatarStyle, display: 'none', position: 'absolute' }}>
          {name ? name.charAt(0).toUpperCase() : 'AI'}
        </div>
      </div>
    );
  }

  return (
    <div style={avatarStyle}>
      {name ? name.charAt(0).toUpperCase() : 'AI'}
    </div>
  );
};

// LinksContainer component to handle offer impression tracking
const LinksContainer = ({ links, chatSettings, styles, onLinkClick }: {
  links: Link[];
  chatSettings: ChatSettings;
  styles: Record<string, React.CSSProperties>;
  onLinkClick?: (link: Link) => void;
}) => {
  // Track offer impressions when links are rendered
  useEffect(() => {
    if (window.parent !== window) {
      links.forEach((link, index) => {
        window.parent.postMessage({
          type: 'ANALYTICS_EVENT',
          eventType: 'offer_impression',
          data: {
            link_url: link.url,
            link_name: link.name,
            link_position: index,
            total_offers: links.length
          }
        }, '*');
      });
    }
  }, [links]);

  return (
    <div style={styles.linksContainer}>
      {links.map((link, index) => (
        <LinkCard 
          key={index} 
          link={link} 
          chatSettings={chatSettings} 
          styles={styles} 
          onLinkClick={onLinkClick}
        />
      ))}
    </div>
  );
};

// LinkCard component
const LinkCard = ({ link, chatSettings, styles, onLinkClick }: {
  link: Link;
  chatSettings: ChatSettings;
  styles: Record<string, React.CSSProperties>;
  onLinkClick?: (link: Link) => void;
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
        onClick={() => onLinkClick?.(link)}
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

// Main ChatWidget component
export function ChatWidgetCore({
  session,
  chatSettings,
  siteId,
  introMessage = '',
  apiUrl = '',
  isEmbedded = false,
  widgetType = 'floating',
  onLinkClick,
  onMessageSent,
  onWidgetOpen
}: ChatWidgetCoreProps) {
  
  // Initialize messages with intro message if available and no existing session
  const getInitialMessages = (): Message[] => {
    // Check if there's an existing sessionId - if so, don't show intro message yet (wait for history)
    const existingSessionId = typeof window !== 'undefined' ? 
      localStorage.getItem(`chat_session_uuid_${siteId}`) : null;
    
    if (!existingSessionId && introMessage && introMessage.trim()) {
      return [{
        type: 'bot',
        content: {
          type: 'message',
          message: introMessage
        }
      } as BotMessage];
    }
    return [];
  };

  // Define reusable style objects
  const styles: Record<string, React.CSSProperties> = {
    container: {
      width: '100%',
      height: '100%',
      backgroundColor: 'white',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Inter", sans-serif'
    },
    header: {
      padding: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
      backgroundColor: chatSettings?.chat_color || '#000000',
      color: chatSettings?.chat_name_color || '#ffffff'
    },
    messagesContainer: {
      flex: '1',
      overflowY: 'auto',
      padding: '16px',
      backgroundColor: '#f9fafb'
    },
    messageBubbleBot: {
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: '16px',
      padding: '12px 16px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    },
    messageBubbleUser: {
      backgroundColor: chatSettings?.chat_color || '#000000',
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: '16px',
      padding: '12px 16px',
      maxWidth: '80%',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
      marginBottom: '12px',
      marginTop: '15px'
    },
    messageText: {
      color: '#1f2937',
      lineHeight: '1.5',
      fontSize: chatSettings?.font_size || '14px',
      margin: '0'
    },
    messageTextUser: {
      color: chatSettings?.chat_bubble_icon_color || '#1f2937',
      lineHeight: '1.5',
      fontSize: chatSettings?.font_size || '14px',
      margin: '0'
    },
    inputContainer: {
      padding: '16px',
      borderTop: '1px solid #e5e7eb',
      backgroundColor: '#f9fafb'
    },
    inputWrapper: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center'
    },
    input: {
      width: '100%',
      padding: '12px 48px 12px 16px',
      border: '1px solid #d1d5db',
      borderRadius: '24px',
      outline: 'none',
      fontSize: '16px', // Fixed at 16px to prevent mobile zoom
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Inter", sans-serif',
      backgroundColor: 'white',
      touchAction: 'manipulation' // Prevents double-tap zoom on mobile
    },
    sendButton: {
      position: 'absolute',
      right: '8px',
      top: '50%',
      transform: 'translateY(-50%)',
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      border: 'none',
      backgroundColor: chatSettings?.chat_color || '#000000',
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
    linksContainer: {
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    },
    linkCard: {
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.4)',
      borderRadius: '16px',
      padding: '16px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
      minWidth: '220px',
      maxWidth: '340px',
      transition: 'all 0.2s ease'
    },
    linkCardHover: {
      boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
      transform: 'translateY(-2px)'
    },
    linkImage: {
      width: '80px',
      height: '80px',
      borderRadius: '12px',
      overflow: 'hidden',
      backgroundColor: 'white',
      padding: '2px',
      marginBottom: '12px',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
    },
    linkImageInner: {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      borderRadius: '8px'
    },
    linkTitle: {
      fontWeight: '700',
      color: '#1f2937',
      lineHeight: '1.3',
      marginBottom: '2px',
      margin: '0 0 8px 0'
    },
    linkDescription: {
      color: '#6b7280',
      lineHeight: '1.5',
      marginBottom: '12px',
      margin: '0 0 16px 0'
    },
    linkButton: {
      display: 'inline-block',
      padding: '8px 16px',
      borderRadius: '8px',
      fontWeight: '500',
      fontSize: '12px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      border: 'none',
    },
    linkButtonHover: {
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
    },
    typingContainer: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      height: '20px'
    },
    typingDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      backgroundColor: '#6b7280',
      opacity: 0.4,
      animation: 'bounce 1.4s infinite ease-in-out'
    },
    typingDot1: {
      animationDelay: '0s'
    },
    typingDot2: {
      animationDelay: '0.2s'  
    },
    typingDot3: {
      animationDelay: '0.4s'
    },
    typingCursor: {
      animation: 'blink 1s infinite'
    }
  };

  const [messages, setMessages] = useState<Message[]>(getInitialMessages);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [typingMessage, setTypingMessage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    // Clean up old session format and try to get existing session UUID from localStorage (backend-generated)
    const oldStorageKey = `chat_session_${siteId}`;
    const newStorageKey = `chat_session_uuid_${siteId}`;
    
    if (typeof window !== 'undefined') {
      // Clean up old format
      localStorage.removeItem(oldStorageKey);
      
      const existingSessionId = localStorage.getItem(newStorageKey);
      if (existingSessionId) {
        return existingSessionId;
      }
    }
    
    // No existing session - will be created by backend on first message
    return null;
  });

  const scrollToBottom = (force = false) => {
    // On mobile, don't auto-scroll when input is focused unless forced
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isMobile && isInputFocused && !force) {
      return;
    }
    
    // Scroll the messages container instead of the entire page
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, isLoadingHistory]);

  // Track if history has been loaded to prevent re-loading
  const [historyLoaded, setHistoryLoaded] = useState(false);
  
  // Predefined questions state
  const [predefinedQuestions, setPredefinedQuestions] = useState<PredefinedQuestionButton[]>([]);
  const [pageUrl, setPageUrl] = useState<string>('');

  // Restore chat history when sessionId exists
  useEffect(() => {
    async function restoreChatHistory() {
      if (!sessionId || historyLoaded) {
        return; // No session or history already loaded
      }

      setIsLoadingHistory(true);

      try {
        const response = await fetch(`${apiUrl}/api/chat-sessions/${sessionId}/messages`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'x-site-id': siteId
          }
        });

        if (!response.ok) {
          if (response.status === 404) {
            // Clear invalid sessionId from localStorage
            const storageKey = `chat_session_uuid_${siteId}`;
            if (typeof window !== 'undefined') {
              localStorage.removeItem(storageKey);
            }
            setSessionId(null);
          } else {
          }
          return;
        }

        const data = await response.json();
        const chatMessages = data.messages || [];

        if (chatMessages.length > 0) {
          
          // Convert database messages to UI message format
          const restoredMessages: Message[] = chatMessages.map((dbMessage: { role: string; content: string; created_at: string; id: string }) => {
            if (dbMessage.role === 'user') {
              return {
                type: 'user',
                content: dbMessage.content
              } as UserMessage;
            } else {
              // Parse assistant message content - it might be JSON for complex responses
              let messageContent: MessageContent;
              try {
                const parsed = JSON.parse(dbMessage.content);
                // Check if it's a structured response with type and message
                if (parsed && typeof parsed === 'object' && parsed.type && parsed.message) {
                  // It's a structured response (message, links, simple_link)
                  messageContent = {
                    type: parsed.type,
                    message: parsed.message,
                    ...(parsed.links && Array.isArray(parsed.links) && { links: parsed.links }),
                    ...(parsed.simple_link && typeof parsed.simple_link === 'object' && { simple_link: parsed.simple_link })
                  };
                  // Debug log for complex content restoration
                  if (parsed.type === 'links' && parsed.links && Array.isArray(parsed.links)) {
                    console.log('Restored links message:', { type: parsed.type, linksCount: parsed.links.length, links: parsed.links });
                  }
                  if (parsed.type === 'simple_link' && parsed.simple_link) {
                    console.log('Restored simple_link message:', { type: parsed.type, simple_link: parsed.simple_link });
                  }
                } else if (typeof parsed === 'string') {
                  // It's a simple string that was JSON-stringified
                  messageContent = {
                    type: 'message',
                    message: parsed
                  };
                } else if (parsed && typeof parsed === 'object' && !parsed.type && !parsed.message) {
                  // Check if it's an old format structured response (direct message with links)
                  if (parsed.links && Array.isArray(parsed.links)) {
                    messageContent = {
                      type: 'links',
                      message: parsed.message || 'Here are some relevant products:',
                      links: parsed.links
                    };
                  } else if (parsed.simple_link && typeof parsed.simple_link === 'object') {
                    messageContent = {
                      type: 'simple_link', 
                      message: parsed.message || 'Here\'s a relevant link:',
                      simple_link: parsed.simple_link
                    };
                  } else {
                    // Fallback to original content
                    messageContent = {
                      type: 'message',
                      message: dbMessage.content
                    };
                  }
                } else {
                  // Fallback to original content
                  messageContent = {
                    type: 'message',
                    message: dbMessage.content
                  };
                }
              } catch {
                // It's a plain text message (not JSON)
                messageContent = {
                  type: 'message',
                  message: dbMessage.content
                };
              }

              return {
                type: 'bot',
                content: messageContent
              } as BotMessage;
            }
          });

          // Set messages, preserving intro message if it exists
          setMessages(prevMessages => {
            // Check if the first message in current messages is an intro message
            const hasIntroMessage = prevMessages.length > 0 && 
                                  prevMessages[0].type === 'bot' && 
                                  prevMessages[0].content.type === 'message' &&
                                  (prevMessages[0].content.message.includes('Hi! I am') || 
                                   prevMessages[0].content.message.includes('How can I help') || 
                                   prevMessages[0].content.message.includes('your assistant'));
            
            // If we have an intro message and restored messages, combine them
            if (hasIntroMessage) {
              return [prevMessages[0], ...restoredMessages];
            } else {
              // Otherwise just set the restored messages
              return restoredMessages;
            }
          });
          
          // Scroll to bottom after messages are set
          setTimeout(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
          }, 100); // Small delay to ensure DOM has updated
        }
      } catch (error) {
        console.error('Error restoring chat history:', error);
        // Continue with fresh conversation on error
      } finally {
        setIsLoadingHistory(false);
        setHistoryLoaded(true); // Mark history as attempted/loaded
      }
    }

    restoreChatHistory();
  }, [sessionId, apiUrl, siteId, historyLoaded]); // Only include necessary dependencies

  // Handle link clicks
  const handleLinkClick = (link: Link) => {
    onLinkClick?.(link);
    
    // Send analytics event to parent window for tracking
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'ANALYTICS_EVENT',
        eventType: 'link_click',
        data: {
          link_url: link.url,
          link_name: link.name,
          link_description: link.description,
          button_text: link.button_text || 'Learn more'
        }
      }, '*');
    }
  };

  // Check if a message is an intro message that shouldn't have action buttons
  const isIntroMessage = useCallback((message: BotMessage): boolean => {
    if (message.content.type === 'message' && message.content.message) {
      const content = message.content.message;
      return content.includes('Hi! I am') || 
             content.includes('How can I help') || 
             content.includes('your assistant') ||
             content === (introMessage || `Hi! I am ${chatSettings?.chat_name || 'Affi'}, your assistant. How can I help you today?`);
    }
    return false;
  }, [introMessage, chatSettings?.chat_name]);

  // State to hold structured content that should replace the typing message
  const [pendingStructuredContent, setPendingStructuredContent] = useState<MessageContent | null>(null);
  
  // Track processed responses to prevent duplicates
  const [processedResponses, setProcessedResponses] = useState<Set<string>>(new Set());

  // Handle typewriter completion
  const handleTypewriterComplete = (message: string) => {
    setIsTyping(false);
    setTypingMessage(null);
    
    // If there's pending structured content, use it; otherwise create simple message
    const finalContent = pendingStructuredContent || { 
      type: 'message', 
      message: message 
    };
    
    setMessages(prev => [...prev, { 
      type: 'bot', 
      content: finalContent,
      id: generateMessageId(),
      timestamp: Date.now()
    } as BotMessage]);
    
    // Clear pending content
    setPendingStructuredContent(null);
    
    // Clean up old processed responses to prevent memory growth (keep last 10)
    setProcessedResponses(prev => {
      const responses = Array.from(prev);
      if (responses.length > 10) {
        return new Set(responses.slice(-10));
      }
      return prev;
    });
  };

  // Centralized function to process AI responses with typing animation
  const processAIResponse = (data: MessageContent) => {
    // Create a unique ID for this response to prevent duplicates
    const responseId = JSON.stringify({
      type: data.type,
      message: data.message,
      hasLinks: !!data.links,
      hasSimpleLink: !!data.simple_link,
      timestamp: Date.now()
    });
    
    // Check if we've already processed this response
    if (processedResponses.has(responseId)) {
      console.warn('Duplicate response detected, skipping:', responseId);
      return;
    }
    
    // Mark this response as processed
    setProcessedResponses(prev => new Set([...prev, responseId]));
    
    // Extract the main message text for typing animation
    const messageText = data.message || 'Sorry, I could not understand the response.';
    
    // Always show typing animation first
    setTypingMessage(messageText);
    setIsTyping(true);
    
    // If it's a complex response (links or simple_link), store the full structure
    if (data.type === 'links' || data.type === 'simple_link') {
      setPendingStructuredContent(data);
    } else {
      // For simple messages, clear any pending content
      setPendingStructuredContent(null);
    }
  };

  // Handle message actions
  const handleCopyMessage = () => {
    // Message copied - no action needed
  };

  const handleThumbsUp = () => {
    // TODO: Send feedback to backend
  };

  const handleThumbsDown = () => {
    // TODO: Send feedback to backend
  };

  const handleRetryMessage = async (messageContent: string) => {
    
    if (isLoading) return; // Prevent multiple simultaneous retries
    
    // Get the last user message and resend it
    const lastUserMessage = messages.filter(msg => msg.type === 'user').pop();
    if (!lastUserMessage) {
      return;
    }
    
    const userMessage = lastUserMessage.content;
    
    // Find and remove the bot's response we want to retry (compatible with older browsers)
    setMessages(prev => {
      let lastBotIndex = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        const msg = prev[i];
        if (msg.type === 'bot') {
          if (msg.content.type === 'message' && msg.content.message === messageContent) {
            lastBotIndex = i;
            break;
          } else if (msg.content.type === 'links' && msg.content.message === messageContent) {
            lastBotIndex = i;
            break;
          } else if (msg.content.type === 'simple_link' && msg.content.message === messageContent) {
            lastBotIndex = i;
            break;
          }
        }
      }
      
      if (lastBotIndex !== -1) {
        return prev.slice(0, lastBotIndex);
      }
      return prev;
    });
    
    setIsLoading(true);
    onMessageSent?.(userMessage);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-site-id': siteId
      };
      
      if (session?.user?.id) {
        headers['x-user-id'] = session.user.id;
      }

      // Build conversation history for the retry (exclude the failed message)
      const conversationHistory = messages
        .filter(msg => {
          if (msg.type === 'bot') {
            const content = msg.content.message;
            if (content && typeof content === 'string') {
              const isIntroMessage = content.includes('Hi! I am') || content.includes('How can I help');
              const isRetryMessage = content === messageContent;
              return !isIntroMessage && !isRetryMessage;
            }
          }
          return msg.type === 'user'; // Keep all user messages
        })
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.type === 'user' ? msg.content : (msg.content.message || '')
        }))
        .filter(msg => msg.content.trim().length > 0);
      
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
      
      // Debug logging
      console.log('AI Retry Response data:', { type: data.type, hasLinks: !!data.links, hasSimpleLink: !!data.simple_link, message: data.message });
      
      setIsLoading(false);
      
      // Use typing animation for all response types
      processAIResponse(data);
    } catch (error) {
      console.error('Error retrying message:', error);
      setIsLoading(false);
      setMessages(prev => [...prev, {
        type: 'bot',
        content: {
          type: 'message',
          message: 'Sorry, I encountered an error while retrying. Please try again.'
        }
      } as BotMessage]);
    }
  };

  // Handle sending messages
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage;
    setInputMessage('');
    setMessages(prev => [...prev, { 
      type: 'user', 
      content: userMessage,
      id: generateMessageId(),
      timestamp: Date.now()
    } as UserMessage]);
    setIsLoading(true);
    
    // Force scroll to bottom when sending a message
    setTimeout(() => scrollToBottom(true), 100);
    
    onMessageSent?.(userMessage);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-site-id': siteId
      };
      
      if (session?.user?.id) {
        headers['x-user-id'] = session.user.id;
      }

      // Build conversation history (include all messages for better context)
      const conversationHistory = messages
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.type === 'user' ? msg.content : msg.content.message || ''
        }))
        .filter(msg => msg.content.trim().length > 0);
      
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          message: userMessage,
          siteId: siteId,
          conversationHistory: conversationHistory,
          sessionId: sessionId // null on first message, UUID on subsequent messages
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      
      // Debug logging
      console.log('AI Response data:', { type: data.type, hasLinks: !!data.links, hasSimpleLink: !!data.simple_link, message: data.message });
      
      // Update sessionId if server returned a new one (UUID format)
      if (data.sessionId) {
        const storageKey = `chat_session_uuid_${siteId}`;
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, data.sessionId);
        }
        // Update state to use this sessionId for subsequent messages
        setSessionId(data.sessionId);
      }
      
      setIsLoading(false);
      
      // Use typing animation for all response types
      processAIResponse(data);
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
      setMessages(prev => [...prev, {
        type: 'bot',
        content: {
          type: 'message',
          message: 'Sorry, I encountered an error. Please try again.'
        },
        id: generateMessageId(),
        timestamp: Date.now()
      } as BotMessage]);
    }
  };

  // Load predefined questions for current page URL
  const loadPredefinedQuestions = useCallback(async (url: string) => {
    try {
      const response = await fetch(`${apiUrl}/api/predefined-questions/match?siteId=${siteId}&pageUrl=${encodeURIComponent(url)}&maxResults=4`);
      
      if (response.ok) {
        const data = await response.json();
        setPredefinedQuestions(data.questions || []);
      } else {
        console.warn('Failed to load predefined questions:', response.status);
        setPredefinedQuestions([]);
      }
    } catch (error) {
      console.error('Error loading predefined questions:', error);
      setPredefinedQuestions([]);
    }
  }, [apiUrl, siteId]);

  // Send a message to AI (used for predefined questions without answers)
  const sendMessageToAI = async (userMessage: string) => {
    setIsLoading(true);
    
    // Force scroll to bottom when sending a message
    setTimeout(() => scrollToBottom(true), 100);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-site-id': siteId
      };
      
      if (session?.user?.id) {
        headers['x-user-id'] = session.user.id;
      }

      // Build conversation history (include all messages for better context)
      const conversationHistory = messages
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.type === 'user' ? msg.content : msg.content.message || ''
        }))
        .filter(msg => msg.content.trim().length > 0);
      
      const response = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          message: userMessage,
          siteId: siteId,
          conversationHistory: conversationHistory,
          sessionId: sessionId,
          pageUrl: pageUrl // Include current page URL
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      
      // Update sessionId if server returned a new one
      if (data.sessionId) {
        const storageKey = `chat_session_uuid_${siteId}`;
        if (typeof window !== 'undefined') {
          localStorage.setItem(storageKey, data.sessionId);
        }
        setSessionId(data.sessionId);
      }
      
      setIsLoading(false);
      
      // Use typing animation for all response types
      processAIResponse(data);
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
      setMessages(prev => [...prev, {
        type: 'bot',
        content: {
          type: 'message',
          message: 'Sorry, I encountered an error. Please try again.'
        },
        id: generateMessageId(),
        timestamp: Date.now()
      } as BotMessage]);
    }
  };

  // Handle predefined question click
  const handlePredefinedQuestionClick = (question: PredefinedQuestionButton) => {
    // Clear predefined questions immediately when one is clicked
    setPredefinedQuestions([]);
    
    // Add user message
    setMessages(prev => [...prev, { 
      type: 'user', 
      content: question.question,
      id: generateMessageId(),
      timestamp: Date.now()
    } as UserMessage]);
    
    if (question.answer && question.answer.trim()) {
      // Has predefined answer - show it with typing animation
      processAIResponse({
        type: 'message',
        message: question.answer
      });
      
      // Scroll to bottom
      setTimeout(() => scrollToBottom(true), 100);
    } else {
      // No predefined answer - send to AI
      sendMessageToAI(question.question);
    }
    
    // Notify parent
    onMessageSent?.(question.question);
  };

  // Get current page URL
  useEffect(() => {
    const getCurrentPageUrl = () => {
      if (typeof window === 'undefined') return;
      
      if (isEmbedded && window.parent !== window) {
        // Widget is embedded, get parent URL
        try {
          window.parent.postMessage({ type: 'GET_PAGE_URL' }, '*');
        } catch (error) {
          // Fallback to current URL if postMessage fails
          console.warn('Failed to get parent URL:', error);
          setPageUrl(window.location.href);
        }
        
        // Listen for URL response from parent
        const handleMessage = (event: MessageEvent) => {
          if (event.data.type === 'PAGE_URL_RESPONSE') {
            setPageUrl(event.data.url);
          }
        };
        
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
      } else {
        // Direct access, use current URL
        setPageUrl(window.location.href);
      }
    };
    
    getCurrentPageUrl();
  }, [isEmbedded]);

  // Load predefined questions when page URL changes
  useEffect(() => {
    if (pageUrl && siteId) {
      loadPredefinedQuestions(pageUrl);
    }
  }, [pageUrl, siteId, loadPredefinedQuestions]);

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
            <p style={styles.messageTextUser}>
              {message.content}
            </p>
          </div>
        </div>
      );
    }

    // Bot message - consistent structure for all types
    const botContent = message.content;
    const messageContent = botContent?.message || 'Sorry, I could not understand the response.';
    
    return (
      <div>
        <div style={styles.messageRow}>
          <Avatar
            src={chatSettings?.chat_icon_url}
            name={chatSettings?.chat_name}
            style={styles.avatarSpacing}
          />
          <div style={{ maxWidth: '80%' }}>
            <div
              style={{
                ...styles.messageBubbleBot,
                fontSize: chatSettings?.font_size || '14px',
                ...(botContent.type === 'links' ? { marginBottom: '12px' } : {})
              }}
            >
              <p style={styles.messageText}>
                {messageContent}
              </p>
              
              {/* Simple link inside message bubble */}
              {botContent.type === 'simple_link' && botContent.simple_link && (
                <a
                  href={botContent.simple_link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleLinkClick({ 
                    name: botContent.simple_link!.text, 
                    url: botContent.simple_link!.url, 
                    description: '',
                    button_text: '',
                    image_url: ''
                  })}
                  style={{
                    display: 'inline-block',
                    color: chatSettings?.chat_color || '#007bff',
                    textDecoration: 'underline',
                    fontSize: chatSettings?.font_size || '14px',
                    cursor: 'pointer',
                    padding: '4px 0',
                    marginTop: '8px'
                  }}
                >
                  {botContent.simple_link.text}
                </a>
              )}
            </div>
            
            {/* Product boxes outside message bubble */}
            {botContent.type === 'links' && botContent.links && (
              <LinksContainer
                links={botContent.links}
                chatSettings={chatSettings}
                styles={styles}
                onLinkClick={handleLinkClick}
              />
            )}
          </div>
        </div>
        {!isIntroMessage(message as BotMessage) && (
          <MessageActions
            messageContent={messageContent}
            onCopy={() => handleCopyMessage()}
            onThumbsUp={() => handleThumbsUp()}
            onThumbsDown={() => handleThumbsDown()}
            onRetry={() => handleRetryMessage(messageContent)}
            isVisible={true}
          />
        )}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* Chat Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Avatar
            src={chatSettings?.chat_icon_url}
            name={chatSettings?.chat_name}
            style={styles.avatarSpacing}
          />
          <p style={{
            ...styles.messageText,
            fontWeight: '600',
            color: chatSettings?.chat_bubble_icon_color || '#ffffff',
            margin: '0'
          }}>
            {chatSettings?.chat_name || 'Affi'}
          </p>
        </div>
        {((isEmbedded && widgetType === 'floating') || (!isEmbedded)) && (
          <button
            onClick={() => {
              if (isEmbedded) {
                // Send close message to parent window for embedded widgets
                if (window.parent !== window) {
                  window.parent.postMessage({ type: 'CLOSE_WIDGET' }, '*');
                }
              } else {
                // For non-embedded widgets (dashboard), dispatch close event
                window.dispatchEvent(new CustomEvent('close-chat-widget'));
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: chatSettings?.chat_name_color || '#ffffff',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            aria-label="Close chat"
          >
            <CloseIcon size={24} />
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div ref={messagesContainerRef} style={styles.messagesContainer}>
        {isLoadingHistory && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{
              width: '24px',
              height: '24px',
              border: '2px solid #e5e7eb',
              borderTopColor: chatSettings?.chat_color || '#000000',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite'
            }} />
          </div>
        )}
        
        {messages.length === 0 && !isLoading && !isLoadingHistory && (
          <div style={styles.messageRow}>
            <Avatar
              src={chatSettings?.chat_icon_url}
              name={chatSettings?.chat_name}
              style={styles.avatarSpacing}
            />
            <div
              style={{
                ...styles.messageBubbleBot,
                fontSize: chatSettings?.font_size || '14px'
              }}
            >
              <p style={styles.messageText}>
                {introMessage || `Hi! I am ${chatSettings?.chat_name || 'Affi'}, your assistant. How can I help you today?`}
              </p>
            </div>
          </div>
        )}
        
        {messages.map((message) => (
          <div key={message.id}>
            {renderMessage(message)}
          </div>
        ))}
        
        {isLoading && (
          <TypingIndicator chatSettings={chatSettings} styles={styles} />
        )}
        
        {isTyping && typingMessage && (
          <TypewriterMessage 
            message={typingMessage}
            chatSettings={chatSettings}
            styles={styles}
            onComplete={() => handleTypewriterComplete(typingMessage)}
            onScroll={() => scrollToBottom()}
          />
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={styles.inputContainer}>
        {/* Predefined Questions */}
        <PredefinedQuestions
          questions={predefinedQuestions}
          onQuestionClick={handlePredefinedQuestionClick}
          chatSettings={chatSettings}
          isVisible={predefinedQuestions.length > 0 && (messages.length === 0 || (messages.length === 1 && messages[0].type === 'bot'))}
        />
        <div style={styles.inputWrapper}>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isLoading && !isLoadingHistory && inputMessage.trim() && handleSendMessage()}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            placeholder={isLoadingHistory ? 'Loading conversation...' : (chatSettings?.input_placeholder || 'Type your message...')}
            style={styles.input}
            disabled={isLoading || isLoadingHistory}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || isLoadingHistory || !inputMessage.trim()}
            style={{
              ...styles.sendButton,
              opacity: (isLoading || isLoadingHistory || !inputMessage.trim()) ? 0.5 : 1,
              cursor: (isLoading || isLoadingHistory || !inputMessage.trim()) ? 'not-allowed' : 'pointer'
            }}
            aria-label="Send message"
          >
            <SendIcon size={16} color="white" />
          </button>
        </div>
      </div>
      {/* CSS animations */}
      <style>{`
        @keyframes bounce {
          0%, 60%, 100% {
            transform: scale(0.8);
            opacity: 0.4;
          }
          30% {
            transform: scale(1.2);
            opacity: 1;
          }
        }
        
        @keyframes blink {
          0%, 50% {
            opacity: 1;
          }
          51%, 100% {
            opacity: 0;
          }
        }
        
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

export default ChatWidgetCore;