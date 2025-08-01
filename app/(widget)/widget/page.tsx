'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ChatWidget from '../../../components/ChatWidget';
import { ChatSettings } from '../../../components/ChatWidgetCore';


function WidgetContent() {
  const searchParams = useSearchParams();
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    chat_name: 'Affi',
    chat_color: '#000000',
    chat_icon_url: '',
    chat_name_color: '#FFFFFF',
    chat_bubble_icon_color: '#FFFFFF',
    input_placeholder: 'Type your message...',
    font_size: '14px',
    intro_message: 'Hello! How can I help you today?'
  });
  const [isLoading, setIsLoading] = useState(true);

  // Parse URL parameters
  const siteId = searchParams?.get('siteId') || 'demo-site';
  const apiUrl = searchParams?.get('apiUrl') ? decodeURIComponent(searchParams.get('apiUrl')!) : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  const embedded = searchParams?.get('embedded') === 'true';
  const widgetType = searchParams?.get('widgetType') || 'floating';

  // Load settings dynamically
  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch(`/api/widget-settings?siteId=${encodeURIComponent(siteId)}`);
        if (response.ok) {
          const settings = await response.json();
          setChatSettings(settings);
        } else {
          console.warn('Widget: Failed to load settings, using defaults');
        }
      } catch (error) {
        console.warn('Widget: Error loading settings, using defaults', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadSettings();
  }, [siteId]);

  if (isLoading) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: 'transparent'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Use intro message from settings or default
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
        widgetType={widgetType as 'floating' | 'inline'}
      />
    </div>
  );
}

export default function WidgetPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: 'transparent'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid #3498db',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    }>
      <WidgetContent />
    </Suspense>
  );
}