import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, X, Send } from "lucide-react";

// Custom Chat Icon Component (preserving the original design)
const ChatIcon = ({ color = '#fff', ...props }) => (
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

function ChatWidget({ session, chatSettings: initialChatSettings, siteId, introMessage: initialIntroMessage, apiUrl = '', isEmbedded = false }) {
  console.log('ChatWidget received apiUrl:', apiUrl); // Debug log
  
  // Initialize messages with intro message if available
  const getInitialMessages = () => {
    if (initialIntroMessage && initialIntroMessage.trim()) {
      return [{
        type: 'bot',
        content: {
          type: 'message',
          message: initialIntroMessage
        }
      }];
    }
    return [];
  };
  
  const [messages, setMessages] = useState(getInitialMessages);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(isEmbedded); // Auto-open if embedded
  const messagesEndRef = useRef(null);
  const [internalIntroMessage, setInternalIntroMessage] = useState(initialIntroMessage || '');
  const [chatSettings, setChatSettings] = useState(initialChatSettings);
  const [introMessage, setIntroMessage] = useState(initialIntroMessage);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

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
      }]);
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
      }]);
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
        }]);
      }
    };
    window.addEventListener('chat-intro-message', handler);
    return () => window.removeEventListener('chat-intro-message', handler);
  }, [introMessage]);

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
    const handleSettingsUpdate = (event) => {
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
        }]);
      }
    };

    window.addEventListener('chat-settings-updated', handleSettingsUpdate);
    return () => window.removeEventListener('chat-settings-updated', handleSettingsUpdate);
  }, [introMessage]);

  // Analytics: track message sent
  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = inputMessage;
    setInputMessage('');
    setMessages(prev => [...prev, { type: 'user', content: userMessage }]);
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
      const headers = {
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
          if (msg.type === 'bot' && msg.content?.type === 'message') {
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
          content: msg.type === 'user' ? msg.content : msg.content?.message || ''
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
      setMessages(prev => [...prev, { type: 'bot', content: data }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, {
        type: 'bot',
        content: {
          type: 'message',
          message: 'Sorry, I encountered an error. Please try again.'
        }
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Analytics: track link clicks in bot messages
  const handleLinkClick = (link) => {
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

  const renderMessage = (message) => {
    if (message.type === 'user') {
      return (
        <div className="flex justify-end mb-3 items-end">
          <div
            className="bg-white/95 backdrop-blur-sm border border-white/30 rounded-2xl px-4 py-3 max-w-[80%] relative shadow-lg"
            style={{ fontSize: chatSettings?.font_size || '14px' }}
          >
            <p className="text-gray-800 leading-relaxed font-inter">
              {message.content}
            </p>
          </div>
        </div>
      );
    }

    const botContent = message.content;
    if (botContent.type === 'links') {
      return (
        <div className="flex justify-start mb-3 items-start">
          <Avatar className="mr-3">
            <AvatarImage src={chatSettings?.chat_icon_url || ''} />
            <AvatarFallback className="bg-gray-100 text-gray-600">
              {chatSettings?.chat_name?.[0] || 'AI'}
            </AvatarFallback>
          </Avatar>
          <div className="max-w-[80%]">
            <div
              className="bg-white/95 backdrop-blur-sm border border-white/30 rounded-2xl px-4 py-3 mb-3 relative shadow-lg"
              style={{ fontSize: chatSettings?.font_size || '14px' }}
            >
              <p className="text-gray-800 leading-relaxed font-inter mb-3">
                {botContent.message}
              </p>
            </div>
            
            <div className="space-y-3">
              {botContent.links.map((link, index) => (
                <div
                  key={index}
                  className="bg-white/90 backdrop-blur-md border border-white/40 rounded-2xl p-4 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 min-w-[220px] max-w-[340px]"
                >
                  {link.image_url && (
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-white p-0.5 mb-3 shadow-sm">
                      <img
                        src={link.image_url}
                        alt={link.name}
                        className="w-full h-full object-contain rounded-lg"
                      />
                    </div>
                  )}
                  
                  <h4 
                    className="font-bold text-gray-900 leading-snug mb-2 font-inter"
                    style={{ fontSize: chatSettings?.font_size || '14px' }}
                  >
                    {link.name}
                  </h4>
                  
                  <p 
                    className="text-gray-600 leading-relaxed mb-4 font-inter"
                    style={{ fontSize: chatSettings?.font_size || '14px' }}
                  >
                    {link.description}
                  </p>
                  
                  <Button
                    asChild
                    className="rounded-lg font-semibold px-4 py-2 transition-all duration-200 hover:-translate-y-px shadow-sm hover:shadow-md"
                    style={{ 
                      backgroundColor: chatSettings?.chat_color || '#000',
                      fontSize: chatSettings?.font_size || '14px'
                    }}
                  >
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener"
                      onClick={() => handleLinkClick(link)}
                    >
                      {link.button_text && link.button_text.trim() ? link.button_text : 'Learn more'}
                    </a>
                  </Button>
                </div>
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
        <div className="flex justify-start mb-3 items-start">
          <Avatar className="mr-3">
            <AvatarImage src={chatSettings?.chat_icon_url || ''} />
            <AvatarFallback className="bg-gray-100 text-gray-600">
              {chatSettings?.chat_name?.[0] || 'AI'}
            </AvatarFallback>
          </Avatar>
          <div
            className="bg-white/95 backdrop-blur-sm border border-white/30 rounded-2xl px-4 py-3 max-w-[80%] relative shadow-lg"
            style={{ fontSize: chatSettings?.font_size || '14px' }}
          >
            <p className="text-gray-800 leading-relaxed font-inter">
              {fallbackMessage}
            </p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="flex justify-start mb-3 items-start">
        <Avatar className="mr-3">
          <AvatarImage src={chatSettings?.chat_icon_url || ''} />
          <AvatarFallback className="bg-gray-100 text-gray-600">
            {chatSettings?.chat_name?.[0] || 'AI'}
          </AvatarFallback>
        </Avatar>
        <div
          className="bg-white/95 backdrop-blur-sm border border-white/30 rounded-2xl px-4 py-3 max-w-[80%] relative shadow-lg"
          style={{ fontSize: chatSettings?.font_size || '14px' }}
        >
          <p className="text-gray-800 leading-relaxed font-inter">
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
          className="fixed z-[1400] transition-all duration-200 hover:scale-105"
          style={{
            bottom: buttonBottom,
            right: buttonRight,
          }}
        >
          <Button
            onClick={() => setIsOpen(!isOpen)}
            className="rounded-full w-[52px] h-[52px] p-0 shadow-lg hover:shadow-xl transition-all duration-200"
            style={{
              backgroundColor: chatSettings?.chat_color || '#000',
              color: chatSettings?.chat_bubble_icon_color || '#fff',
            }}
            aria-label={isOpen ? 'Close chat' : 'Open chat'}
          >
            {isOpen ? (
              <X size={24} />
            ) : (
              <ChatIcon color={chatSettings?.chat_bubble_icon_color || '#fff'} />
            )}
          </Button>
        </div>
      )}

      {/* Chat Container */}
      {isOpen && (
        isEmbedded ? (
          // Embedded mode - no Portal, fill container
          <div className="w-full h-full bg-white flex flex-col overflow-hidden">
            {/* Chat Header */}
            <div
              className="p-4 flex items-center border-b border-white/10"
              style={{
                backgroundColor: chatSettings?.chat_color || '#000',
                color: chatSettings?.chat_name_color || '#fff',
              }}
            >
              <Avatar className="mr-3">
                <AvatarImage src={chatSettings?.chat_icon_url || ''} />
                <AvatarFallback className="bg-gray-100 text-gray-600">
                  {chatSettings?.chat_name?.[0] || 'AI'}
                </AvatarFallback>
              </Avatar>
              <p 
                className="font-semibold leading-relaxed font-inter"
                style={{ fontSize: chatSettings?.font_size || '14px' }}
              >
                {chatSettings?.chat_name || 'Affi'}
              </p>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-black/10 scrollbar-track-transparent">
              {messages.length === 0 && !isLoading && (
                <div className="flex justify-start mb-3 items-start">
                  <Avatar className="mr-3">
                    <AvatarImage src={chatSettings?.chat_icon_url || ''} />
                    <AvatarFallback className="bg-gray-100 text-gray-600">
                      {chatSettings?.chat_name?.[0] || 'AI'}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className="bg-white/95 backdrop-blur-sm border border-white/30 rounded-2xl px-4 py-3 max-w-[80%] relative shadow-lg"
                    style={{ fontSize: chatSettings?.font_size || '14px' }}
                  >
                    <p className="text-gray-800 leading-relaxed font-inter">
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
                <div className="flex justify-center my-4">
                  <Loader2 
                    className="h-6 w-6 animate-spin" 
                    style={{ color: chatSettings?.chat_color || '#6B7280' }}
                  />
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-white/20 bg-white/50 backdrop-blur-sm">
              <div className="relative">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={chatSettings?.input_placeholder || 'Type your message...'}
                  className="bg-white border-none rounded-3xl py-6 px-6 pr-14 shadow-sm focus:shadow-md font-inter"
                  style={{ 
                    fontSize: chatSettings?.font_size || '14px',
                    boxShadow: `0 4px 20px rgba(0, 0, 0, 0.05)`,
                  }}
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <Button
                    onClick={handleSendMessage}
                    disabled={isLoading || !inputMessage.trim()}
                    className="rounded-full w-8 h-8 p-0 transition-all duration-200 hover:scale-105 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed disabled:transform-none"
                    style={{ backgroundColor: chatSettings?.chat_color || '#000' }}
                    aria-label="Send message"
                  >
                    <Send size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Regular mode - Portal with fixed positioning
          <div
            className="fixed z-[1300] flex flex-col overflow-hidden bg-white/95 backdrop-blur-md border border-white/30 shadow-xl"
            style={{
              bottom: chatBottom,
              right: chatRight,
              width: chatWidth,
              height: chatHeight,
              borderRadius: '20px',
            }}
          >
            {/* Chat Header */}
            <div
              className="p-4 flex items-center border-b border-white/10 rounded-t-xl"
              style={{
                backgroundColor: chatSettings?.chat_color || '#000',
                color: chatSettings?.chat_name_color || '#fff',
              }}
            >
              <Avatar className="mr-3">
                <AvatarImage src={chatSettings?.chat_icon_url || ''} />
                <AvatarFallback className="bg-gray-100 text-gray-600">
                  {chatSettings?.chat_name?.[0] || 'AI'}
                </AvatarFallback>
              </Avatar>
              <p 
                className="font-semibold leading-relaxed font-inter"
                style={{ fontSize: chatSettings?.font_size || '14px' }}
              >
                {chatSettings?.chat_name || 'Affi'}
              </p>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-black/10 scrollbar-track-transparent">
              {messages.length === 0 && !isLoading && (
                <div className="flex justify-start mb-3 items-start">
                  <Avatar className="mr-3">
                    <AvatarImage src={chatSettings?.chat_icon_url || ''} />
                    <AvatarFallback className="bg-gray-100 text-gray-600">
                      {chatSettings?.chat_name?.[0] || 'AI'}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className="bg-white/95 backdrop-blur-sm border border-white/30 rounded-2xl px-4 py-3 max-w-[80%] relative shadow-lg"
                    style={{ fontSize: chatSettings?.font_size || '14px' }}
                  >
                    <p className="text-gray-800 leading-relaxed font-inter">
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
                <div className="flex justify-center my-4">
                  <Loader2 
                    className="h-6 w-6 animate-spin" 
                    style={{ color: chatSettings?.chat_color || '#6B7280' }}
                  />
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-white/20 bg-white/50 backdrop-blur-sm">
              <div className="relative">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={chatSettings?.input_placeholder || 'Type your message...'}
                  className="bg-white border-none rounded-3xl py-6 px-6 pr-14 shadow-sm focus:shadow-md font-inter"
                  style={{ 
                    fontSize: chatSettings?.font_size || '14px',
                    boxShadow: `0 4px 20px rgba(0, 0, 0, 0.05)`,
                  }}
                />
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                  <Button
                    onClick={handleSendMessage}
                    disabled={isLoading || !inputMessage.trim()}
                    className="rounded-full w-8 h-8 p-0 transition-all duration-200 hover:scale-105 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed disabled:transform-none"
                    style={{ backgroundColor: chatSettings?.chat_color || '#000' }}
                    aria-label="Send message"
                  >
                    <Send size={16} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </>
  );
}

export default ChatWidget; 