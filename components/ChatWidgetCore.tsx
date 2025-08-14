// FILE PURPOSE: Main chat widget UI component - handles messages with AI SDK streaming
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { PredefinedQuestions } from './PredefinedQuestions';
import { PredefinedQuestionButton } from '@/types/predefined-questions';
import ReactMarkdown from 'react-markdown';
import { useWidgetAuth, authenticatedFetch } from '@/lib/use-widget-auth';

interface AffiliateProduct {
  id: string;
  title: string;
  description: string;
  url: string;
  button_text: string;
  image_url?: string;
}
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

// Markdown sanitization schema - allow only safe HTML elements
const sanitizeSchema = {
  allowedTags: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'code', 'pre', 'blockquote'],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
  allowedSchemes: [],
  allowedSchemesByTag: {}
};

// Product matching functions will be moved to dedicated service
// Keeping this space clean for now

// Typewriter component removed - using real streaming instead

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

// Utility function to generate unique message IDs (legacy - AI SDK handles this)
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
          key={link.url || `link-${index}`} 
          link={link} 
          chatSettings={chatSettings} 
          styles={styles} 
          onLinkClick={onLinkClick}
        />
      ))}
    </div>
  );
};

// ProductRecommendations component - uses server-side matching for precision with JWT authentication
const ProductRecommendations = ({ messageContent, streamingContent, messageId, userMessage, siteId, apiUrl, chatSettings, styles, isVisible, onProductsLoaded, preFetchedProducts, widgetToken, onTokenExpired, pageContext }: {
  messageContent: string;
  streamingContent?: string;
  messageId: string;
  userMessage?: string;
  siteId: string;
  apiUrl: string;
  chatSettings: ChatSettings;
  styles: Record<string, React.CSSProperties>;
  isVisible: boolean;
  onProductsLoaded?: () => void;
  preFetchedProducts?: { userMessage: string; products: AffiliateProduct[] } | null;
  widgetToken?: string | null;
  onTokenExpired?: () => Promise<void>;
  pageContext?: { title?: string; description?: string; url?: string };
}) => {
  const [products, setProducts] = useState<AffiliateProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchTriggeredRef = useRef<string>('');
  
  // Clarification state
  const [clarificationData, setClarificationData] = useState<{
    shouldAsk: boolean;
    confidence: number;
    reason: string;
    options: Array<{
      category: string;
      products: AffiliateProduct[];
      displayName: string;
    }>;
  } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Simplified fetch function to prevent AI SDK loops
  const fetchProducts = useCallback(async (contentToMatch: string) => {
    // Prevent multiple fetches for the same message
    if (fetchTriggeredRef.current === messageId || isLoading) return;
    
    // Need at least 3 words to start meaningful product matching
    const wordCount = contentToMatch.trim().split(/\s+/).length;
    if (wordCount < 3) return;
    
    // Need authentication token
    if (!widgetToken) {
      console.warn('No widget token available for product fetching');
      return;
    }
    
    fetchTriggeredRef.current = messageId;
    setIsLoading(true);
    
    try {
      console.log('🔍 Fetching products with context for:', contentToMatch);
      
      // Fetch products with contextual matching (training chunks will be fetched by the API)
      const response = await authenticatedFetch(
        `${apiUrl}/api/products/match`,
        {
          method: 'POST',
          body: JSON.stringify({
            query: userMessage?.trim() || contentToMatch.trim(), // Original user query
            aiText: contentToMatch.trim(), // AI response for exact matching
            pageContext: pageContext && (pageContext.title || pageContext.description) ? pageContext : undefined, // Page title, description, and URL for context
            limit: 12
          })
        },
        widgetToken,
        onTokenExpired
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.status}`);
      }
      
      const responseData = await response.json();
      const { data: matchedProducts, clarification } = responseData;
      
      console.log(`🎯 Found ${matchedProducts?.length || 0} products`);
      
      // Handle clarification if needed
      if (clarification?.shouldAsk && clarification.options?.length > 0) {
        console.log(`❓ Clarification needed (confidence: ${clarification.confidence}):`, clarification.reason);
        setClarificationData(clarification);
        setProducts([]); // Don't show products yet
      } else {
        console.log(`✅ High confidence (${clarification?.confidence || 'N/A'}), showing products directly`);
        setClarificationData(null);
        setProducts(matchedProducts || []);
      }
      
    } catch (error) {
      console.error('Product matching error:', error);
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [messageId, userMessage, widgetToken, apiUrl, isLoading, onTokenExpired, pageContext]);

  // Handle category selection for clarification
  const handleCategorySelection = useCallback((category: string) => {
    if (!clarificationData) return;
    
    const selectedOption = clarificationData.options.find(opt => opt.category === category);
    if (selectedOption) {
      // Log user clarification choice for analytics
      const clarificationTelemetry = {
        messageId,
        userMessage: userMessage?.trim(),
        clarificationReason: clarificationData.reason,
        confidence: clarificationData.confidence,
        availableOptions: clarificationData.options.map(opt => ({
          category: opt.category,
          displayName: opt.displayName,
          productCount: opt.products.length
        })),
        selectedCategory: category,
        selectedDisplayName: selectedOption.displayName,
        resultingProducts: selectedOption.products.length,
        timestamp: Date.now()
      };
      
      console.log(`✅ User clarification choice:`, clarificationTelemetry);
      // TODO: Send to analytics service
      // analyticsService.track('clarification_selected', clarificationTelemetry);
      
      setProducts(selectedOption.products);
      setClarificationData(null);
      setSelectedCategory(category);
      
      // Scroll to show the products
      setTimeout(() => onProductsLoaded?.(), 100);
    }
  }, [clarificationData, onProductsLoaded, messageId, userMessage]);

  useEffect(() => {
    // Only fetch products after AI response is complete (not during streaming)
    if (status === 'streaming') {
      return; // Don't fetch during streaming to prevent AI SDK loops
    }
    
    // First check if we have pre-fetched products for this user message
    if (preFetchedProducts && userMessage && preFetchedProducts.userMessage === userMessage.trim()) {
      // Using pre-fetched products
      setProducts(preFetchedProducts.products);
      fetchTriggeredRef.current = messageId; // Mark as processed
      return;
    }

    // Use final message content only after streaming is complete
    const contentToUse = messageContent;
    if (contentToUse && status !== 'streaming') {
      fetchProducts(contentToUse);
    }
  }, [messageId, messageContent, fetchProducts, preFetchedProducts, userMessage]);

  // Trigger scroll when products become visible
  useEffect(() => {
    if (isVisible && products.length > 0) {
      setTimeout(() => onProductsLoaded?.(), 50);
    }
  }, [isVisible, products.length, onProductsLoaded]);

  // Show clarification UI if needed
  if (clarificationData?.shouldAsk && clarificationData.options.length > 0) {
    return (
      <div style={{ 
        ...styles.linksContainer, 
        marginTop: '12px',
        padding: '12px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        backgroundColor: '#f8fafc'
      }}>
        <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
          I found products in multiple categories. Which are you interested in?
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {clarificationData.options.map((option) => (
            <button
              key={option.category}
              onClick={() => handleCategorySelection(option.category)}
              style={{
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                backgroundColor: '#fff',
                color: '#374151',
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
                e.currentTarget.style.borderColor = '#9ca3af';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = '#fff';
                e.currentTarget.style.borderColor = '#d1d5db';
              }}
            >
              {option.displayName} ({option.products.length})
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      ...styles.linksContainer, 
      marginTop: '12px',
      display: (!isVisible || products.length === 0) ? 'none' : 'flex'
    }}>
      {products.map((product, index) => (
        <ProductCard
          key={product.id || `product-${index}`}
          href={product.url}
          title={product.title}
          description={product.description}
          buttonText={product.button_text || 'View Product'}
          chatSettings={chatSettings}
          styles={styles}
        />
      ))}
    </div>
  );
};

// ProductCard component for product recommendations
const ProductCard = ({ href, title, description, buttonText, chatSettings, styles }: {
  href: string;
  title: string;
  description: string;
  buttonText: string;
  chatSettings: ChatSettings;
  styles: Record<string, React.CSSProperties>;
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
      <h4 
        style={{
          ...styles.linkTitle,
          fontSize: chatSettings?.font_size || '14px'
        }}
      >
        {title}
      </h4>
      
      {description && (
        <p 
          style={{
            ...styles.linkDescription,
            fontSize: chatSettings?.font_size || '14px'
          }}
        >
          {description}
        </p>
      )}
      
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
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
        {buttonText}
      </a>
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

// Helper function to create stable timestamps from message IDs
const hashStringToNumber = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
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
  
  // Initialize messages with intro message if available
  const getInitialMessages = useCallback((): Message[] => {
    // Always include intro message as the first message if it exists
    const introMsg = introMessage?.trim() || 
                    `Hi! I am ${chatSettings?.chat_name || 'Affi'}, your assistant. How can I help you today?`;
    
    return [{
      type: 'bot',
      content: {
        type: 'message',
        message: introMsg
      },
      id: 'intro_message',
      timestamp: Date.now()
    } as BotMessage];
  }, [introMessage, chatSettings?.chat_name]);

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
      fontSize: '16px', // Keep 16px to prevent mobile zoom
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Inter", sans-serif',
      backgroundColor: 'white',
      touchAction: 'manipulation', // Prevents double-tap zoom on mobile
      transform: 'scale(0.875)', // Scale down to make it appear like 14px (14/16 = 0.875)
      transformOrigin: 'left center' // Keep text aligned to the left
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

  // Widget authentication - handles JWT tokens and API security
  const widgetAuth = useWidgetAuth(siteId, apiUrl);
  
  // Local state for input (AI SDK manages loading state)
  const [input, setInput] = useState('');
  
  // Track streaming content for parallel product fetching
  const streamingContentRef = useRef<string>('');
  const currentMessageIdRef = useRef<string>('');
  const lastUserMessageRef = useRef<string>('');
  
  // Store pre-fetched products from user message for instant display
  const [preFetchedProducts, setPreFetchedProducts] = useState<{
    userMessage: string;
    products: AffiliateProduct[];
  } | null>(null);
  
  // Create custom transport with our endpoint
  const transport = React.useMemo(() => {
    console.log('🚛 Creating transport with endpoint:', `${apiUrl}/api/chat-ai`);
    
    return new DefaultChatTransport({
      api: `${apiUrl}/api/chat-ai`,
    });
  }, [apiUrl]);

  // Use AI SDK's useChat hook with minimal configuration to prevent loops
  const { messages: aiMessages, sendMessage, setMessages, error, status } = useChat({
    transport,
    onError: (error) => {
      console.error('AI SDK Error:', error);
      // Don't do anything else that could trigger re-renders
    }
    // Remove onFinish to prevent potential loop triggers
  });
  
  // Derive loading state from AI SDK status - check correct status values
  const aiLoading = status === 'streaming' || status === 'submitted';
  
  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };
  
  // Convert AI SDK messages to our Message format with stable approach
  const messages: Message[] = React.useMemo(() => {
    const baseMessages = [
      ...getInitialMessages(),
      ...aiMessages.map((msg, index) => {
        // Extract text content from UI message parts
        const textContent = msg.parts?.filter(part => part.type === 'text')
          .map(part => part.text).join(' ') || '';
        
        // Use message ID hash for stable timestamp to prevent re-renders
        const stableTimestamp = msg.id ? hashStringToNumber(msg.id) : Date.now();
        
        if (msg.role === 'user') {
          return {
            type: 'user' as const,
            content: textContent,
            id: msg.id,
            timestamp: stableTimestamp
          } as UserMessage;
        } else {
          // Handle bot messages - check if this is a placeholder or has content
          const isLastMessage = index === aiMessages.length - 1;
          const isWaiting = (status === 'submitted' && isLastMessage) || (!textContent && isLastMessage);
          
          // Use empty content for placeholder messages to trigger loading display
          const messageContent = textContent || '';
          
          // Track streaming content for the current message
          if (isLastMessage && status === 'streaming' && textContent) {
            streamingContentRef.current = textContent;
            currentMessageIdRef.current = msg.id;
          }
          
          return {
            type: 'bot' as const,
            content: {
              type: 'message' as const,
              message: messageContent
            },
            id: msg.id,
            timestamp: stableTimestamp,
            isWaiting // Add waiting flag
          } as BotMessage & { isWaiting?: boolean };
        }
      })
    ];

    // Add loading message when user just sent message (status='submitted')
    const lastMessage = aiMessages[aiMessages.length - 1];
    const needsLoading = status === 'submitted' && (!lastMessage || lastMessage.role === 'user');
    
    if (needsLoading) {
      baseMessages.push({
        type: 'bot' as const,
        content: {
          type: 'message' as const,
          message: ''
        },
        id: 'loading-temp',
        timestamp: Date.now(), // This is OK since it's temporary
        isWaiting: true
      } as BotMessage & { isWaiting?: boolean });
    }
    
    // Add error message if there's an API error
    if (error) {
      console.error('Displaying error message to user:', error);
      baseMessages.push({
        type: 'bot' as const,
        content: {
          type: 'message' as const,
          message: 'Sorry, there was an error processing your message. Please try again.'
        },
        id: 'error-temp',
        timestamp: Date.now()
      } as BotMessage);
    }
    
    return baseMessages;
  }, [aiMessages, status, error, getInitialMessages]);


  // Additional state for non-AI SDK features
  const [predefinedQuestions, setPredefinedQuestions] = useState<PredefinedQuestionButton[]>([]);
  const [pageUrl, setPageUrl] = useState<string>('');
  const [pageContext, setPageContext] = useState<{
    title?: string;
    description?: string;
    url?: string;
  }>({});

  // Keep your existing state that's not replaced by AI SDK
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  
  // Keep session management for backward compatibility
  const [sessionId, setSessionId] = useState<string | null>(() => {
    const oldStorageKey = `chat_session_${siteId}`;
    const newStorageKey = `chat_session_uuid_${siteId}`;
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem(oldStorageKey);
      const existingSessionId = localStorage.getItem(newStorageKey);
      if (existingSessionId) {
        return existingSessionId;
      }
    }
    return null;
  });

  // Legacy helper functions removed - simplified chat management

  const scrollToBottom = (force = false) => {
    // Note: Removed mobile detection logic that was blocking scroll in embedded widgets
    // The 440px iframe width was triggering mobile detection on desktop, preventing auto-scroll
    // Auto-scroll should always work during AI responses for better UX
    
    // Scroll the messages container instead of the entire page
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  // Smart streaming auto-scroll - only during AI streaming, not user interactions
  useEffect(() => {
    // Only scroll during active AI streaming to follow message growth
    if (aiLoading) {
      scrollToBottom();
    }
  }, [messages, aiLoading]);
  
  // Memoized scroll callback for products to prevent API spam
  const handleProductsLoaded = useCallback(() => {
    scrollToBottom(true);
  }, []);

  // Track if history has been loaded to prevent re-loading
  const [historyLoaded, setHistoryLoaded] = useState(false);
  

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
                content: dbMessage.content,
                id: dbMessage.id || generateMessageId(),
                timestamp: Date.now()
              } as UserMessage;
            } else {
              // Parse assistant message content
              let messageContent: MessageContent;
              try {
                const parsed = JSON.parse(dbMessage.content);
                if (parsed && typeof parsed === 'object' && parsed.type && parsed.message) {
                  messageContent = parsed;
                } else {
                  messageContent = {
                    type: 'message',
                    message: dbMessage.content
                  };
                }
              } catch {
                messageContent = {
                  type: 'message',
                  message: dbMessage.content
                };
              }

              return {
                type: 'bot',
                content: messageContent,
                id: dbMessage.id || generateMessageId(),
                timestamp: Date.now()
              } as BotMessage;
            }
          });

          // AI SDK manages its own message state - we can't restore history directly
          // The intro message is already handled in getInitialMessages()
          console.log('Chat history found:', chatMessages.length, 'messages (not restored - AI SDK manages state)');
          
          // Scroll to bottom after loading history
          setTimeout(() => scrollToBottom(), 100);
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
    // Check by ID first for reliability
    if (message.id === 'intro_message') {
      return true;
    }
    
    // Fallback content check for backward compatibility
    if (message.content.type === 'message' && message.content.message) {
      const content = message.content.message;
      return content.includes('Hi! I am') || 
             content.includes('How can I help') || 
             content.includes('your assistant');
    }
    return false;
  }, []);

  
  
  // Legacy helper functions removed - AI SDK handles request management


  // Process AI response (for predefined answers only)
  // processAIResponse is no longer needed - AI SDK handles response processing

  // Handle message actions (simplified for AI SDK)
  const handleCopyMessage = () => {
    // Message copied - no action needed
  };

  const handleThumbsUp = () => {
    // TODO: Send feedback to backend
  };

  const handleThumbsDown = () => {
    // TODO: Send feedback to backend
  };

  const handleRetryMessage = async () => {
    if (aiLoading) return;
    
    const lastUserMessage = messages.filter(msg => msg.type === 'user').pop();
    if (!lastUserMessage) return;
    
    console.log('Retrying message:', lastUserMessage.content);
    
    // Find the AI SDK messages to remove (find the last bot message)
    const filteredMessages = aiMessages.filter((msg, index) => {
      // Keep all messages except the last assistant message
      return !(msg.role === 'assistant' && index === aiMessages.length - 1);
    });
    
    // Update AI SDK messages
    setMessages(filteredMessages);
    
    // Retry the message with siteId
    await sendMessage(
      { text: lastUserMessage.content },
      {
        body: {
          siteId,
        }
      }
    );
  };

  // Pre-fetch products disabled - interferes with context-aware matching
  const preFetchProducts = async (userMessage: string) => {
    console.log('🚫 Pre-fetching disabled to allow context-aware matching');
    return;
    
    // Need at least 3 words to start meaningful product matching
    const wordCount = userMessage.trim().split(/\s+/).length;
    if (wordCount < 3) return;
    
    // Need authentication token
    if (!widgetAuth.token) {
      console.error('❌ No widget token available for product pre-fetching');
      return;
    }
    
    try {
      console.log('🔍 Pre-fetching products for:', userMessage, 'with token:', widgetAuth.token?.substring(0, 20) + '...');
      
      const response = await authenticatedFetch(
        `${apiUrl}/api/products/match`,
        {
          method: 'POST',
          body: JSON.stringify({
            query: userMessage.trim(),
            limit: 12
            // Note: Pre-fetching uses basic keyword extraction from query
            // Main product matching after AI response will use training chunks + AI text
          })
        },
        widgetAuth.token,
        widgetAuth.refresh
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Pre-fetch failed: ${response.status}`);
      }
      
      const responseData = await response.json();
      const matchedProducts = responseData.data;
      
      console.log('📦 API Response:', {
        success: responseData.success,
        count: responseData.count,
        products: matchedProducts?.length || 0,
        aiFiltered: responseData.aiFiltered,
        firstProduct: matchedProducts?.[0]?.title
      });
      
      // Store products with the user message for instant display
      setPreFetchedProducts({
        userMessage: userMessage.trim(),
        products: matchedProducts || []
      });
      
      console.log('✅ Pre-fetched', matchedProducts?.length || 0, 'products for:', userMessage.trim());
      
    } catch (error) {
      console.error('❌ Product pre-fetch error:', error);
      setPreFetchedProducts({ userMessage: userMessage.trim(), products: [] });
    }
  };

  // Handle form submission for AI SDK
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || aiLoading) return;
    
    const message = input.trim();
    console.log('Submitting message:', message);
    console.log('AI SDK state:', { aiLoading, error: !!error, messagesCount: aiMessages.length });
    
    setInput('');
    
    // Track the user message for product matching
    lastUserMessageRef.current = message;
    
    // Start product pre-fetching in parallel with AI streaming
    preFetchProducts(message);
    
    // Force scroll to bottom
    setTimeout(() => scrollToBottom(true), 100);
    
    // Send using AI SDK - pass siteId in body (AI SDK manages loading state)
    try {
      console.log('🚀 Calling sendMessage with:', { text: message });
      console.log('🚀 API URL configured as:', `${apiUrl}/api/chat-ai`);
      console.log('🚀 Current AI SDK state:', { status, error: !!error, messagesCount: aiMessages.length });
      console.log('🚀 Sending with siteId:', siteId);
      
      await sendMessage(
        { text: message },
        {
          body: {
            siteId,
          }
        }
      );
      console.log('✅ sendMessage completed successfully');
    } catch (error) {
      console.error('❌ Error sending message:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      // AI SDK manages loading state, no need to set isLoading false
    }
    
    onMessageSent?.(message);
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

  // Send a message using AI SDK (for predefined questions)  
  const sendMessageToAI = async (userMessage: string) => {
    console.log('Sending predefined message:', userMessage);
    
    try {
      // Use sendMessage for predefined questions with siteId (AI SDK manages loading state)
      await sendMessage(
        { text: userMessage },
        {
          body: {
            siteId,
          }
        }
      );
    } catch (error) {
      console.error('Error sending predefined message:', error);
      // AI SDK manages loading state
    }
    
    // Scroll to bottom
    setTimeout(() => scrollToBottom(true), 100);
  };

  // Handle predefined question click
  const handlePredefinedQuestionClick = async (question: PredefinedQuestionButton) => {
    // Clear predefined questions immediately when one is clicked
    setPredefinedQuestions([]);
    
    // AI SDK will handle adding the user message automatically
    if (question.answer && question.answer.trim()) {
      // Has predefined answer - but we'll still send through AI for consistency
      // Let the AI process it rather than showing static answers
      await sendMessageToAI(question.question);
    } else {
      // No predefined answer - send to AI
      await sendMessageToAI(question.question);
    }
    
    // Scroll to bottom
    setTimeout(() => scrollToBottom(true), 100);
    
    // Notify parent
    onMessageSent?.(question.question);
  };

  // Get simple page context for relevance boosting
  useEffect(() => {
    const getSimplePageContext = () => {
      if (typeof window === 'undefined') return;
      
      // Simple approach: extract current page context
      const context = {
        url: window.location.href,
        title: document.title || '',
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') || ''
      };
      
      // For embedded widgets, try to get referrer URL
      if (isEmbedded && window.parent !== window && document.referrer) {
        context.url = document.referrer;
      }
      
      setPageUrl(context.url);
      setPageContext(context);
      
      console.log('📍 Simple page context extracted:', { 
        url: context.url, 
        hasTitle: !!context.title, 
        hasDescription: !!context.description 
      });
    };
    
    getSimplePageContext();
  }, [isEmbedded]);

  // Load predefined questions when page URL changes
  useEffect(() => {
    if (pageUrl && siteId) {
      loadPredefinedQuestions(pageUrl!);
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
    const isWaiting = (message as BotMessage & { isWaiting?: boolean })?.isWaiting;
    const messageContent = botContent?.message || (isWaiting ? '' : 'Sorry, I could not understand the response.');
    
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
              {/* Show typing indicator if waiting and no content, otherwise show message */}
              {isWaiting && !messageContent ? (
                <div style={styles.typingContainer}>
                  <div style={{...styles.typingDot, ...styles.typingDot1}}></div>
                  <div style={{...styles.typingDot, ...styles.typingDot2}}></div>
                  <div style={{...styles.typingDot, ...styles.typingDot3}}></div>
                </div>
              ) : (
                <div style={styles.messageText}>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
                    components={{
                      p: ({children}) => <p style={{ margin: 0 }}>{children}</p>,
                      ul: ({children}) => <ul style={{ margin: '8px 0', paddingLeft: '20px', listStyle: 'disc', listStylePosition: 'outside' }}>{children}</ul>,
                      ol: ({children}) => <ol style={{ margin: '8px 0', paddingLeft: '20px', listStyle: 'decimal', listStylePosition: 'outside' }}>{children}</ol>,
                      li: ({children}) => <li style={{ margin: '4px 0' }}>{children}</li>
                    }}
                  >
                    {messageContent}
                  </ReactMarkdown>
                </div>
              )}
              
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
            
            {/* Product recommendations for AI responses - always render but control visibility */}
            {botContent.type === 'message' && (
              <ProductRecommendations
                messageContent={messageContent}
                streamingContent={currentMessageIdRef.current === message.id ? streamingContentRef.current : undefined}
                messageId={message.id}
                userMessage={lastUserMessageRef.current}
                siteId={siteId}
                apiUrl={apiUrl}
                chatSettings={chatSettings}
                styles={styles}
                isVisible={status !== 'streaming' && messageContent.length > 0}
                onProductsLoaded={handleProductsLoaded}
                preFetchedProducts={preFetchedProducts}
                widgetToken={widgetAuth.token}
                onTokenExpired={widgetAuth.refresh}
                pageContext={pageContext}
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
            onRetry={() => handleRetryMessage()}
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
        
        
        {/* Render messages */}
        {messages.map((message, index) => (
          <div key={message.id || `message-${index}`}>
            {renderMessage(message)}
          </div>
        ))}
        
        {/* AI SDK handles loading indicators automatically - no need for manual TypingIndicator */}
        
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={styles.inputContainer}>
        {/* Predefined Questions */}
        <PredefinedQuestions
          questions={predefinedQuestions}
          onQuestionClick={handlePredefinedQuestionClick}
          chatSettings={chatSettings}
          isVisible={predefinedQuestions.length > 0 && messages.length === 1 && messages[0].id === 'intro_message'}
        />
        <form onSubmit={handleSubmit} style={styles.inputWrapper}>
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            inputMode="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            placeholder={isLoadingHistory ? 'Loading conversation...' : (chatSettings?.input_placeholder || 'Type your message...')}
            style={styles.input}
            disabled={aiLoading || isLoadingHistory}
          />
          <button
            type="submit"
            disabled={aiLoading || isLoadingHistory || !input.trim()}
            style={{
              ...styles.sendButton,
              opacity: (aiLoading || isLoadingHistory || !input.trim()) ? 0.5 : 1,
              cursor: (aiLoading || isLoadingHistory || !input.trim()) ? 'not-allowed' : 'pointer'
            }}
            aria-label="Send message"
          >
            <SendIcon size={16} color="white" />
          </button>
        </form>
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