'use client';

import React, { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import ChatWidget from '../../../components/ChatWidget';
import { ChatSettings } from '../../../components/ChatWidgetCore';

// Language detection function
function detectLanguage(text: string): string {
  const commonWords: Record<string, string[]> = {
    'en': ['the', 'and', 'for', 'with', 'how', 'best', 'top', 'review', 'guide', 'tips'],
    'es': ['el', 'la', 'de', 'en', 'con', 'como', 'mejor', 'mejores', 'guía', 'consejos'],
    'fr': ['le', 'la', 'de', 'en', 'avec', 'comment', 'meilleur', 'meilleurs', 'guide', 'conseils'],
    'de': ['der', 'die', 'das', 'und', 'mit', 'wie', 'beste', 'besten', 'anleitung', 'tipps'],
    'it': ['il', 'la', 'di', 'in', 'con', 'come', 'migliore', 'migliori', 'guida', 'consigli'],
    'pt': ['o', 'a', 'de', 'em', 'com', 'como', 'melhor', 'melhores', 'guia', 'dicas'],
    'no': ['og', 'med', 'for', 'hvordan', 'beste', 'topp', 'anmeldelse', 'guide', 'tips']
  };
  
  const lowerText = text.toLowerCase();
  const scores: Record<string, number> = {};
  
  // Score each language based on common words found
  for (const [lang, words] of Object.entries(commonWords)) {
    scores[lang] = 0;
    words.forEach(word => {
      if (lowerText.includes(' ' + word + ' ') || lowerText.startsWith(word + ' ') || lowerText.endsWith(' ' + word)) {
        scores[lang]++;
      }
    });
  }
  
  // Find language with highest score
  const bestLang = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
  return scores[bestLang] > 0 ? bestLang : 'en'; // Default to English
}

// Topic extraction function
function extractTopic(title: string): string | null {
  if (!title || title.trim() === '') return null;
  
  // Clean up title first
  const cleanTitle = title
    .replace(/\s*[-|–—]\s*.+$/, '') // Remove site name after dash
    .replace(/\s*\|.+$/, '') // Remove site name after pipe
    .trim();
  
  // Common patterns to extract topics
  const patterns = [
    // "10 Best X" or "Top 5 X" patterns
    /(?:top\s+)?\d+\s+(?:best|top|greatest|most)\s+(.+)/i,
    // "Best X" or "Top X" patterns
    /(?:best|top|greatest|most)\s+(.+?)(?:\s+(?:for|in|of|\d+).*)?$/i,
    // "How to X" patterns
    /how\s+to\s+(.+?)(?:\s+[-–—].*)?$/i,
    // "X Review" or "X Guide" patterns
    /(.+?)\s+(?:review|guide|tutorial|tips|tricks|comparison)s?(?:\s+[-–—].*)?$/i,
    // "Complete X" or "Ultimate X" patterns
    /(?:complete|ultimate|comprehensive)\s+(.+?)(?:\s+(?:guide|tutorial))?(?:\s+[-–—].*)?$/i,
    // "X vs Y" patterns
    /(.+?)\s+vs?\s+.+/i,
    // "X for Y" patterns
    /(.+?)\s+for\s+.+/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanTitle.match(pattern);
    if (match && match[1]) {
      const topic = match[1].trim()
        .replace(/\b(?:the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/gi, ' ') // Remove common words
        .replace(/\s+/g, ' ') // Clean up multiple spaces
        .trim();
      
      if (topic.length > 3) { // Only return meaningful topics
        return topic.toLowerCase();
      }
    }
  }
  
  return null;
}

// Smart intro message generation
function generateContextualIntroMessage(pageTitle: string): string {
  if (!pageTitle || pageTitle.trim() === '') {
    return 'Hello! How can I help you today?';
  }
  
  const language = detectLanguage(pageTitle);
  const topic = extractTopic(pageTitle);
  
  // Message templates by language
  const templates: Record<string, { withTopic: string[], withoutTopic: string[] }> = {
    'en': {
      withTopic: [
        `Hey! I noticed you're interested in ${topic}. How can I help?`,
        `Hi there! Looking for information about ${topic}? I'm here to help!`,
        `Hello! I see you're exploring ${topic}. What would you like to know?`,
        `Welcome! Need any assistance with ${topic}?`,
        `Hi! I'm here to help you with ${topic}. What can I do for you?`
      ],
      withoutTopic: [
        'Hello! How can I help you today?',
        'Hi there! What can I assist you with?',
        'Welcome! How can I help you?',
        'Hey! Need any assistance?',
        'Hi! What would you like to know?'
      ]
    },
    'no': {
      withTopic: [
        `Hei! Jeg ser du er interessert i ${topic}. Hvordan kan jeg hjelpe?`,
        `Hallo! Leter du etter informasjon om ${topic}? Jeg er her for å hjelpe!`,
        `Hei der! Jeg ser du utforsker ${topic}. Hva vil du vite?`,
        `Velkommen! Trenger du hjelp med ${topic}?`,
        `Hei! Jeg er her for å hjelpe deg med ${topic}. Hva kan jeg gjøre for deg?`
      ],
      withoutTopic: [
        'Hei! Hvordan kan jeg hjelpe deg i dag?',
        'Hallo! Hva kan jeg hjelpe deg med?',
        'Velkommen! Hvordan kan jeg hjelpe?',
        'Hei! Trenger du hjelp med noe?',
        'Hallo! Hva vil du vite?'
      ]
    },
    'es': {
      withTopic: [
        `¡Hola! Veo que estás interesado en ${topic}. ¿Cómo puedo ayudar?`,
        `¡Hola! ¿Buscas información sobre ${topic}? ¡Estoy aquí para ayudar!`,
        `¡Hola! Veo que estás explorando ${topic}. ¿Qué te gustaría saber?`,
        `¡Bienvenido! ¿Necesitas ayuda con ${topic}?`,
        `¡Hola! Estoy aquí para ayudarte con ${topic}. ¿Qué puedo hacer por ti?`
      ],
      withoutTopic: [
        '¡Hola! ¿Cómo puedo ayudarte hoy?',
        '¡Hola! ¿En qué puedo asistirte?',
        '¡Bienvenido! ¿Cómo puedo ayudar?',
        '¡Hola! ¿Necesitas ayuda?',
        '¡Hola! ¿Qué te gustaría saber?'
      ]
    },
    'fr': {
      withTopic: [
        `Salut ! Je vois que vous vous intéressez à ${topic}. Comment puis-je aider ?`,
        `Bonjour ! Vous cherchez des informations sur ${topic} ? Je suis là pour aider !`,
        `Salut ! Je vois que vous explorez ${topic}. Que souhaitez-vous savoir ?`,
        `Bienvenue ! Avez-vous besoin d'aide avec ${topic} ?`,
        `Salut ! Je suis là pour vous aider avec ${topic}. Que puis-je faire pour vous ?`
      ],
      withoutTopic: [
        'Bonjour ! Comment puis-je vous aider aujourd\'hui ?',
        'Salut ! En quoi puis-je vous assister ?',
        'Bienvenue ! Comment puis-je aider ?',
        'Salut ! Avez-vous besoin d\'aide ?',
        'Bonjour ! Que souhaitez-vous savoir ?'
      ]
    },
    'de': {
      withTopic: [
        `Hallo! Ich sehe, Sie interessieren sich für ${topic}. Wie kann ich helfen?`,
        `Hi! Suchen Sie Informationen über ${topic}? Ich bin hier, um zu helfen!`,
        `Hallo! Ich sehe, Sie erkunden ${topic}. Was möchten Sie wissen?`,
        `Willkommen! Brauchen Sie Hilfe mit ${topic}?`,
        `Hallo! Ich bin hier, um Ihnen mit ${topic} zu helfen. Was kann ich für Sie tun?`
      ],
      withoutTopic: [
        'Hallo! Wie kann ich Ihnen heute helfen?',
        'Hi! Womit kann ich Ihnen behilflich sein?',
        'Willkommen! Wie kann ich helfen?',
        'Hallo! Brauchen Sie Hilfe?',
        'Hi! Was möchten Sie wissen?'
      ]
    }
  };
  
  // Get templates for detected language, fallback to English
  const langTemplates = templates[language] || templates['en'];
  
  // Choose appropriate template array
  const messageArray = topic ? langTemplates.withTopic : langTemplates.withoutTopic;
  
  // Return random message from array
  return messageArray[Math.floor(Math.random() * messageArray.length)];
}

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
  const pageTitle = searchParams?.get('pageTitle') ? decodeURIComponent(searchParams.get('pageTitle')!) : '';

  // Load settings dynamically
  useEffect(() => {
    async function loadSettings() {
      try {
        const response = await fetch(`/api/widget-settings?siteId=${encodeURIComponent(siteId)}`);
        if (response.ok) {
          const settings = await response.json();
          setChatSettings(settings);
          console.log('Widget: Loaded settings from API', settings);
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

  // Determine intro message - use custom if set and not default, otherwise generate contextual
  let introMessage = chatSettings.intro_message || '';
  
  // Check if intro message is empty or is the default message
  if (!introMessage || introMessage === 'Hello! How can I help you today?') {
    // Generate contextual intro message based on page title
    introMessage = generateContextualIntroMessage(pageTitle);
  }

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