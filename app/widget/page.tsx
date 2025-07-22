'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import ChatWidget from '../../components/ChatWidget';
import { ChatSettings } from '../../components/ChatWidgetCore';

export default function WidgetPage() {
  const searchParams = useSearchParams();
  
  // Default settings
  const defaultSettings: ChatSettings = {
    chat_name: 'Affi',
    chat_color: '#000000',
    chat_icon_url: '',
    chat_name_color: '#FFFFFF',
    chat_bubble_icon_color: '#FFFFFF',
    input_placeholder: 'Type your message...',
    font_size: '14px',
    intro_message: 'Hello! How can I help you today?'
  };

  // Parse URL parameters
  const siteId = searchParams.get('siteId') || 'demo-site';
  const apiUrl = searchParams.get('apiUrl') ? decodeURIComponent(searchParams.get('apiUrl')!) : window.location.origin;
  const embedded = searchParams.get('embedded') === 'true';
  
  let chatSettings = defaultSettings;
  const settingsParam = searchParams.get('settings');
  if (settingsParam) {
    try {
      chatSettings = JSON.parse(decodeURIComponent(settingsParam));
    } catch (e) {
      console.warn('Failed to parse settings, using defaults', e);
    }
  }

  const introMessage = chatSettings.intro_message || 'Hello! How can I help you today?';

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      margin: 0, 
      padding: 0,
      backgroundColor: 'transparent'
    }}>
      <ChatWidget
        session={null}
        chatSettings={chatSettings}
        siteId={siteId}
        introMessage={introMessage}
        apiUrl={apiUrl}
        isEmbedded={embedded}
      />
    </div>
  );
}