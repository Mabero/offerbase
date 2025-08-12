import { ChunkingOptions, ChunkingError } from './types';

export interface Chunk {
  content: string;
  index: number;
  metadata: {
    startChar: number;
    endChar: number;
    tokenCount: number;
  };
}

export class TextChunker {
  private options: Required<ChunkingOptions>;
  
  constructor(options: ChunkingOptions = {}) {
    this.options = {
      chunkSize: options.chunkSize || 512,
      chunkOverlap: options.chunkOverlap || 128,
      splitByParagraph: options.splitByParagraph !== false,
      respectSentences: options.respectSentences !== false,
      minChunkSize: options.minChunkSize || 100,
      maxChunkSize: options.maxChunkSize || 1000,
    };
    
    // Validate options
    if (this.options.chunkOverlap >= this.options.chunkSize) {
      throw new ChunkingError('Chunk overlap must be less than chunk size');
    }
    
    if (this.options.minChunkSize > this.options.chunkSize) {
      throw new ChunkingError('Minimum chunk size cannot be greater than chunk size');
    }
    
    if (this.options.maxChunkSize < this.options.chunkSize) {
      throw new ChunkingError('Maximum chunk size cannot be less than chunk size');
    }
  }
  
  /**
   * Split text into chunks
   */
  chunk(text: string): Chunk[] {
    if (!text || text.trim().length === 0) {
      return [];
    }
    
    // Clean and normalize text
    const cleanedText = this.normalizeText(text);
    
    // Split by paragraphs first if enabled
    const segments = this.options.splitByParagraph
      ? this.splitByParagraphs(cleanedText)
      : [cleanedText];
    
    const chunks: Chunk[] = [];
    let globalCharOffset = 0;
    
    for (const segment of segments) {
      const segmentChunks = this.chunkSegment(segment, globalCharOffset);
      chunks.push(...segmentChunks);
      globalCharOffset += segment.length + 2; // Account for paragraph separator
    }
    
    return chunks;
  }
  
  /**
   * Chunk a single segment of text
   */
  private chunkSegment(text: string, startOffset: number): Chunk[] {
    const chunks: Chunk[] = [];
    const sentences = this.options.respectSentences
      ? this.splitIntoSentences(text)
      : [text];
    
    let currentChunk = '';
    let currentTokens = 0;
    let chunkStartChar = startOffset;
    let chunkIndex = chunks.length;
    
    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence);
      
      // If single sentence exceeds max size, split it
      if (sentenceTokens > this.options.maxChunkSize) {
        // Save current chunk if any
        if (currentChunk) {
          chunks.push(this.createChunk(
            currentChunk.trim(),
            chunkIndex++,
            chunkStartChar,
            chunkStartChar + currentChunk.length
          ));
        }
        
        // Split large sentence
        const subChunks = this.splitLargeSentence(sentence, chunkStartChar + currentChunk.length);
        chunks.push(...subChunks);
        chunkIndex += subChunks.length;
        
        // Reset for next chunk
        currentChunk = '';
        currentTokens = 0;
        chunkStartChar = chunkStartChar + currentChunk.length + sentence.length;
        continue;
      }
      
      // Check if adding sentence exceeds chunk size
      if (currentTokens + sentenceTokens > this.options.chunkSize && currentChunk) {
        // Save current chunk
        chunks.push(this.createChunk(
          currentChunk.trim(),
          chunkIndex++,
          chunkStartChar,
          chunkStartChar + currentChunk.length
        ));
        
        // Start new chunk with overlap
        const overlap = this.getOverlapText(currentChunk, this.options.chunkOverlap);
        currentChunk = overlap ? overlap + ' ' + sentence : sentence;
        currentTokens = this.estimateTokens(currentChunk);
        chunkStartChar = chunkStartChar + currentChunk.length - overlap.length;
      } else {
        // Add sentence to current chunk
        currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
        currentTokens += sentenceTokens;
      }
    }
    
    // Add remaining chunk if it meets minimum size
    if (currentChunk && this.estimateTokens(currentChunk) >= this.options.minChunkSize) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        chunkIndex,
        chunkStartChar,
        chunkStartChar + currentChunk.length
      ));
    }
    
    return chunks;
  }
  
  /**
   * Split large sentence into smaller chunks
   */
  private splitLargeSentence(sentence: string, startOffset: number): Chunk[] {
    const chunks: Chunk[] = [];
    const words = sentence.split(/\s+/);
    let currentChunk = '';
    let chunkStartChar = startOffset;
    let chunkIndex = 0;
    
    for (const word of words) {
      const testChunk = currentChunk ? currentChunk + ' ' + word : word;
      
      if (this.estimateTokens(testChunk) > this.options.chunkSize && currentChunk) {
        chunks.push(this.createChunk(
          currentChunk.trim(),
          chunkIndex++,
          chunkStartChar,
          chunkStartChar + currentChunk.length
        ));
        
        currentChunk = word;
        chunkStartChar += currentChunk.length + 1;
      } else {
        currentChunk = testChunk;
      }
    }
    
    if (currentChunk) {
      chunks.push(this.createChunk(
        currentChunk.trim(),
        chunkIndex,
        chunkStartChar,
        chunkStartChar + currentChunk.length
      ));
    }
    
    return chunks;
  }
  
  /**
   * Get overlap text from the end of a chunk
   */
  private getOverlapText(text: string, overlapTokens: number): string {
    const words = text.split(/\s+/);
    let overlapText = '';
    let tokenCount = 0;
    
    // Work backwards to get overlap text
    for (let i = words.length - 1; i >= 0 && tokenCount < overlapTokens; i--) {
      const word = words[i];
      tokenCount += this.estimateTokens(word);
      overlapText = word + (overlapText ? ' ' + overlapText : '');
    }
    
    return overlapText;
  }
  
  /**
   * Create a chunk object
   */
  private createChunk(content: string, index: number, startChar: number, endChar: number): Chunk {
    return {
      content,
      index,
      metadata: {
        startChar,
        endChar,
        tokenCount: this.estimateTokens(content),
      },
    };
  }
  
  /**
   * Split text into paragraphs
   */
  private splitByParagraphs(text: string): string[] {
    return text
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }
  
  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - can be improved with better NLP
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
  }
  
  /**
   * Normalize text for consistent processing
   */
  private normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/ +/g, ' ')
      .trim();
  }
  
  /**
   * Estimate token count (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}