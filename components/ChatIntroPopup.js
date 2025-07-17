import React, { useEffect, useState } from 'react';
import { Box, Text, IconButton, Fade } from '@chakra-ui/react';
import { CloseIcon } from './CustomIcons';

const API_URL = process.env.REACT_APP_API_URL || '';

async function fetchIntroMessage(context, apiUrl) {
  try {
    const res = await fetch(`${API_URL}/api/chat-intro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });
    const data = await res.json();
    return data.message;
  } catch (e) {
    return "👋 Hi! Ask me anything about this page!";
  }
}

const ChatIntroPopup = ({ introMessage, apiUrl }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (introMessage && introMessage.trim()) {
        setMessage(introMessage);
        window.lastChatIntroMessage = introMessage;
        window.dispatchEvent(new Event('chat-intro-message'));
        setOpen(true);
        return;
      }
      // Gather page context
      const title = document.title;
      const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
      const firstHeading = document.querySelector('h1,h2')?.textContent || '';
      const url = window.location.href;
      const context = { title, metaDesc, firstHeading, url };

      // Fetch relevant message from backend
      const msg = await fetchIntroMessage(context, apiUrl);
      setMessage(msg);
      window.lastChatIntroMessage = msg;
      window.dispatchEvent(new Event('chat-intro-message'));
      setOpen(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [introMessage, apiUrl]);

  if (!open || !message) return null;

  return (
    <Fade in={open}>
      <Box
        position="fixed"
        bottom="100px"
        right="32px"
        zIndex={1000000}
        p={4}
        bg="rgba(255, 255, 255, 0.95)"
        backdropFilter="blur(20px)"
        border="1px solid rgba(255, 255, 255, 0.3)"
        borderRadius="16px"
        boxShadow="0 20px 60px rgba(0, 0, 0, 0.1)"
        minW="280px"
        maxW="340px"
        display="flex"
        alignItems="center"
        cursor="pointer"
        onClick={(e) => {
          // Prevent click from close button from opening chat
          if (e.target.closest('.chat-intro-close-btn')) return;
          if (window.openChat) {
            window.openChat();
          } else {
            window.dispatchEvent(new CustomEvent('open-chat-widget'));
          }
          setOpen(false);
        }}
      >
        <Box flex={1}>
          <Text color="gray.800" fontWeight="500" fontSize="14px">
            {message}
          </Text>
        </Box>
        <IconButton
          size="sm"
          className="chat-intro-close-btn"
          onClick={() => setOpen(false)}
          variant="ghost"
          color="gray.500"
          ml={2}
          _hover={{ color: 'gray.700' }}
        >
          <CloseIcon size={16} />
        </IconButton>
      </Box>
    </Fade>
  );
};

export default ChatIntroPopup; 