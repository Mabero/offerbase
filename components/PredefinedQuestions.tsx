"use client";

import React, { useState, useEffect } from 'react';
import { PredefinedQuestionsComponentProps, PredefinedQuestionButton } from '@/types/predefined-questions';

export function PredefinedQuestions({
  questions,
  onQuestionClick,
  chatSettings,
  isVisible = true,
  className = ''
}: PredefinedQuestionsComponentProps) {
  const [visibleQuestions, setVisibleQuestions] = useState<PredefinedQuestionButton[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);

  // Update visible questions when props change
  useEffect(() => {
    if (questions.length > 0 && isVisible) {
      setIsAnimating(true);
      setVisibleQuestions(questions.slice(0, 4)); // Limit to 4 questions max
      
      // Add a slight delay for animation
      setTimeout(() => setIsAnimating(false), 300);
    } else {
      setVisibleQuestions([]);
    }
  }, [questions, isVisible]);

  // Handle question click
  const handleQuestionClick = (question: PredefinedQuestionButton) => {
    // Hide questions immediately when one is clicked
    setVisibleQuestions([]);
    onQuestionClick(question);
  };

  // Don't render if no questions or not visible
  if (!isVisible || visibleQuestions.length === 0) {
    return null;
  }

  // Get chat color for theming, default to black
  const chatColor = chatSettings?.chat_color || '#000000';
  const isLightColor = isColorLight(chatColor);
  const textColor = isLightColor ? '#000000' : '#FFFFFF';

  return (
    <div className={`predefined-questions-container ${className}`}>
      <style jsx>{`
        .predefined-questions-container {
          opacity: ${isAnimating ? 0 : 1};
          transform: translateY(${isAnimating ? '10px' : '0'});
          transition: all 0.3s ease-out;
        }

        .questions-wrapper {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }

        .question-button {
          background: white;
          color: #323232;
          border-radius: 20px;
          padding: 8px 16px;
          font-size: 14px;
          font-weight: 400;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          line-height: 1.3;
          max-width: 100%;
          word-wrap: break-word;
          border: 1px solid rgb(209, 213, 219);
        }

        .question-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.10);
          opacity: 0.9;
        }

        .question-button:active {
          transform: translateY(0);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        @media (max-width: 480px) {
          
          
          .questions-wrapper {
            gap: 6px;
            margin-bottom: 8px;
          }
          
          .question-button {
            font-size: 13px;
            padding: 6px 12px;
            border-radius: 16px;
          }
        }

        /* Accessibility */
        .question-button:focus {
          outline: 2px solid ${chatColor};
          outline-offset: 2px;
        }

        .question-button:focus-visible {
          outline: 2px solid ${chatColor};
          outline-offset: 2px;
        }
      `}</style>

      <div className="questions-wrapper">
        {visibleQuestions.map((question, index) => (
          <button
            key={question.id}
            className="question-button"
            onClick={() => handleQuestionClick(question)}
            title={question.question} // Tooltip for longer questions
            style={{
              animationDelay: `${index * 50}ms` // Staggered animation
            }}
          >
            {question.question}
          </button>
        ))}
      </div>
    </div>
  );
}

// Helper function to determine if a color is light or dark
function isColorLight(color: string): boolean {
  // Convert hex to RGB
  let r: number, g: number, b: number;
  
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  } else {
    // Default to dark if can't parse
    return false;
  }
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

export default PredefinedQuestions;