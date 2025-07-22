import React, { useState, useEffect, useRef } from 'react';

// Types
export interface ChatSettings {
  chat_name: string;
  chat_color: string;
  chat_icon_url?: string;
  chat_name_color: string;
  chat_bubble_icon_color: string;
  input_placeholder: string;
  font_size: string;
}

export interface Session {
  user?: {
    id: string;
  };
}

export interface MessageContent {
  type: 'message' | 'links';
  message: string;
  links?: Link[];
}

export interface UserMessage {
  type: 'user';
  content: string;
}

export interface BotMessage {
  type: 'bot';
  content: MessageContent;
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
  onLinkClick?: (link: Link) => void;
  onMessageSent?: (message: string) => void;
  onWidgetOpen?: () => void;
}

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
);

const TypewriterMessage = ({ 
  message, 
  chatSettings, 
  styles, 
  onComplete 
}: { 
  message: string;
  chatSettings: ChatSettings;
  styles: Record<string, React.CSSProperties>;
  onComplete: () => void;
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
        setDisplayedText(prev => prev + char);
        index++;
        
        // Add slight pause after punctuation for more natural feel
        const delay = (char === '.' || char === '!' || char === '?') ? 300 : 40;
        timeoutId = setTimeout(typeCharacter, delay);
      } else {
        if (!isCancelled) {
          setIsTyping(false);
          onComplete();
        }
      }
    };
    
    timeoutId = setTimeout(typeCharacter, 40);

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [message, onComplete]);

  return (
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
          {displayedText}
          {isTyping && <span style={styles.typingCursor}>|</span>}
        </p>
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
  onLinkClick,
  onMessageSent,
  onWidgetOpen
}: ChatWidgetCoreProps) {
  
  // Initialize messages with intro message if available
  const getInitialMessages = (): Message[] => {
    if (introMessage && introMessage.trim()) {
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
      fontSize: chatSettings?.font_size || '14px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Inter", sans-serif',
      backgroundColor: 'white'
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
      marginBottom: '8px',
      margin: '0 0 8px 0'
    },
    linkDescription: {
      color: '#6b7280',
      lineHeight: '1.5',
      marginBottom: '16px',
      margin: '0 0 16px 0'
    },
    linkButton: {
      display: 'inline-block',
      padding: '8px 16px',
      borderRadius: '8px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      border: 'none'
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
  const [typingMessage, setTypingMessage] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Handle link clicks
  const handleLinkClick = (link: Link) => {
    onLinkClick?.(link);
  };

  // Handle typewriter completion
  const handleTypewriterComplete = (message: string) => {
    setIsTyping(false);
    setTypingMessage(null);
    setMessages(prev => [...prev, { 
      type: 'bot', 
      content: { 
        type: 'message', 
        message: message 
      } 
    } as BotMessage]);
  };

  // Handle sending messages
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage;
    setInputMessage('');
    setMessages(prev => [...prev, { type: 'user', content: userMessage } as UserMessage]);
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

      // Build conversation history
      const conversationHistory = messages
        .filter(msg => {
          if (msg.type === 'bot' && msg.content.type === 'message') {
            const content = msg.content.message;
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
      
      setIsLoading(false);
      
      // If it's a simple text message, use typewriter effect
      if (data.type === 'message' && typeof data.message === 'string') {
        setTypingMessage(data.message);
        setIsTyping(true);
      } else {
        // For links or other complex content, add directly
        setMessages(prev => [...prev, { type: 'bot', content: data } as BotMessage]);
      }
    } catch (error) {
      console.error('Error:', error);
      setIsLoading(false);
      setMessages(prev => [...prev, {
        type: 'bot',
        content: {
          type: 'message',
          message: 'Sorry, I encountered an error. Please try again.'
        }
      } as BotMessage]);
    }
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

    // Bot message
    const botContent = message.content;
    if (botContent.type === 'links') {
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

    // Regular message
    const messageContent = botContent?.message || 'Sorry, I could not understand the response.';
    
    return (
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
            {messageContent}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {/* Chat Header */}
      <div style={styles.header}>
        <Avatar
          src={chatSettings?.chat_icon_url}
          name={chatSettings?.chat_name}
          style={styles.avatarSpacing}
        />
        <p style={{
          ...styles.messageText,
          fontWeight: '600',
          color: chatSettings?.chat_name_color || '#ffffff',
          margin: '0'
        }}>
          {chatSettings?.chat_name || 'Affi'}
        </p>
      </div>

      {/* Messages Area */}
      <div style={styles.messagesContainer}>
        {messages.length === 0 && !isLoading && (
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
        
        {messages.map((message, index) => (
          <div key={index}>
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
          />
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
            onKeyDown={(e) => e.key === 'Enter' && !isLoading && inputMessage.trim() && handleSendMessage()}
            placeholder={chatSettings?.input_placeholder || 'Type your message...'}
            style={styles.input}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={isLoading || !inputMessage.trim()}
            style={{
              ...styles.sendButton,
              opacity: (isLoading || !inputMessage.trim()) ? 0.5 : 1,
              cursor: (isLoading || !inputMessage.trim()) ? 'not-allowed' : 'pointer'
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
      `}</style>
    </div>
  );
}

export default ChatWidgetCore;