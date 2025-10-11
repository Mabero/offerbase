// FILE PURPOSE: Main admin dashboard for managing sites, training materials, and chat settings
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import ColorPicker from "@/components/ColorPicker";
import { 
  ExternalLink, 
  FileText, 
  Settings as SettingsIcon, 
  Info, 
  Code, 
  BarChart3, 
  MessageCircle,
  ChevronDown,
  Plus,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  HelpCircle
} from 'lucide-react';

import { supabase } from '../lib/supabaseClient';
import ChatWidget from './ChatWidget';
import AreaTimeline from './analytics/AreaTimeline';
import TopPagesTable from './analytics/TopPagesTable';
import OffersTable from './analytics/OffersTable';
// ChatWidgetAI removed - using enhanced ChatWidgetCore instead

// Simple language options for the dashboard (AI will handle detection naturally)
const PREFERRED_LANGUAGE_OPTIONS = [
  { code: 'eng', name: 'English', flag: '🇺🇸' },
  { code: 'nor', name: 'Norwegian', flag: '🇳🇴' },
  { code: 'dan', name: 'Danish', flag: '🇩🇰' },
  { code: 'swe', name: 'Swedish', flag: '🇸🇪' },
  { code: 'deu', name: 'German', flag: '🇩🇪' },
  { code: 'fra', name: 'French', flag: '🇫🇷' },
  { code: 'spa', name: 'Spanish', flag: '🇪🇸' },
  { code: 'ita', name: 'Italian', flag: '🇮🇹' },
  { code: 'nld', name: 'Dutch', flag: '🇳🇱' },
  { code: 'por', name: 'Portuguese', flag: '🇵🇹' }
];
import { SiteSelector } from './site-selector';
import { TrainingContentEditor } from './TrainingContentEditor';
import { PredefinedQuestionsManager } from './PredefinedQuestionsManager';

const drawerWidth = 240;

const navItems = [
  { label: 'Offer Links', icon: ExternalLink },
  { label: 'Training Materials', icon: FileText },
  { label: 'Predefined Questions', icon: HelpCircle },
  { label: 'Widgets', icon: SettingsIcon },
  { label: 'Analytics', icon: BarChart3 },
  { label: 'Chat Logs', icon: MessageCircle },
];

// Types
interface DashboardProps {
  shouldOpenChat?: boolean;
  widgetSiteId?: string;
  isEmbedded?: boolean;
}

interface Site {
  id: string;
  name: string;
  user_id?: string;
  created_at: string;
  updated_at: string;
}

interface AffiliateLink {
  id: string;
  url: string;
  title: string;
  description: string;
  image_url?: string;
  button_text?: string;
  site_id: string;
  created_at: string;
}

interface TrainingMaterial {
  id: string;
  url: string;
  title: string;
  content?: string | null;
  content_type?: string;
  metadata?: Record<string, unknown>;
  scrape_status?: 'pending' | 'processing' | 'success' | 'failed';
  last_scraped_at?: string | null;
  error_message?: string | null;
  site_id: string;
  created_at: string;
  updated_at: string;
}

interface ChatSettings {
  chat_name: string;
  chat_color: string;
  chat_icon_url: string;
  chat_name_color: string;
  chat_bubble_icon_color: string;
  input_placeholder: string;
  font_size: string;
}

interface ChatSession {
  id: string;
  user_session_id: string;
  started_at: string;
  ended_at?: string;
  message_count: number;
  user_agent?: string;
  is_active: boolean;
  last_activity_at: string;
  offers_shown?: number;
  link_clicks?: number;
  clicked?: boolean;
  last_click_at?: string | null;
}

interface ChatMessage {
  id: string;
  chat_session_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface ChatStats {
  totalChats: number;
  totalMessages: number;
  averageResponseTime: number;
  satisfactionRate: number;
  totalOfferImpressions?: number;
  totalLinkClicks?: number;
  conversionRate?: number;
  widgetBreakdown?: {
    floating?: { opens: number; clicks: number; conversion_rate: number };
    inline?: { opens: number; clicks: number; conversion_rate: number };
    sidebar?: { opens: number; clicks: number; conversion_rate: number };
  };
}

function Dashboard({ shouldOpenChat, widgetSiteId: _widgetSiteId, isEmbedded }: DashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Get user from Clerk
  const { user, isLoaded } = useUser();
  
  // State management - preserving exact same state structure
  const [selectedTab, setSelectedTab] = useState(0);
  const [trainingMaterials, setTrainingMaterials] = useState<TrainingMaterial[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>([]);
  const [newTrainingUrl, setNewTrainingUrl] = useState('');
  const [newLink, setNewLink] = useState({
    url: '',
    title: '',
    description: '',
    image_url: '',
    button_text: '',
  });
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    chat_name: 'Affi',
    chat_color: '#000000',
    chat_icon_url: '',
    chat_name_color: '#FFFFFF',
    chat_bubble_icon_color: '#FFFFFF',
    input_placeholder: 'Type your message...',
    font_size: '14px'
  });
  const [, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [introMessage, setIntroMessage] = useState('Hello! How can I help you today?');
  const [isSaving, setIsSaving] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([]);
  const [isLoadingSessionDetails, setIsLoadingSessionDetails] = useState(false);
  const [sessionEvents, setSessionEvents] = useState<Array<{ id: string; event_type: string; created_at: string; event_data?: any; link_id?: string | null }>>([]);
  const [preferredLanguage, setPreferredLanguage] = useState<string | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [chatStats, setChatStats] = useState<ChatStats>({
    totalChats: 0,
    totalMessages: 0,
    averageResponseTime: 0,
    satisfactionRate: 0
  });
  // Analytics v2 extras
  const [trends, setTrends] = useState<any[]>([]);
  const [topPages, setTopPages] = useState<any[]>([]);
  const [routeMix, setRouteMix] = useState<any | null>(null);
  const [pageContextUsage, setPageContextUsage] = useState<any | null>(null);
  const [refusalRate, setRefusalRate] = useState<number | null>(null);
  const [offersPerf, setOffersPerf] = useState<any[]>([]);
  const [offersLastUpdated, setOffersLastUpdated] = useState<{ mv_last_day?: string | null; generated_at?: string } | null>(null);
  const [refreshingOffers, setRefreshingOffers] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedSeries, setSelectedSeries] = useState<'sessions' | 'clicks' | 'impressions' | 'widget_opens'>('sessions');
  const [isSupabaseConfiguredState, setIsSupabaseConfiguredState] = useState<boolean | null>(null);
  const [, setIsLoadingSites] = useState(false);
  const [, setIsLoadingChatSettings] = useState(false);
  // AI SDK toggle removed - using enhanced ChatWidgetCore directly

  // Refs for cleanup
  const isMountedRef = useRef(true);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // Content editor state
  const [isContentEditorOpen, setIsContentEditorOpen] = useState(false);
  const [selectedMaterialForEdit, setSelectedMaterialForEdit] = useState<TrainingMaterial | null>(null);
  
  // Polling state
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousMaterialsRef = useRef<TrainingMaterial[]>([]);

  const { toast } = useToast();

  // API URL - Use environment variable or current origin for dynamic deployment support
  const API_URL = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');

  // Site management functions
  const loadSitesFromAPI = async () => {
    if (isSupabaseConfiguredState === false) return; // Skip if using demo mode
    
    setIsLoadingSites(true);
    try {
      const response = await fetch('/api/sites', {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (response.ok) {
        setSites(data.data || []);
        // If no site is selected but we have sites, select the first one
        if (!selectedSite && data.data && data.data.length > 0) {
          setSelectedSite(data.data[0]);
        }
      } else {
        toast({
          title: "Error",
          description: "Failed to load sites",
          variant: "destructive"
        });
      }
    } catch (_error) {
      toast({
        title: "Error",
        description: "Failed to load sites",
        variant: "destructive"
      });
    } finally {
      setIsLoadingSites(false);
    }
  };

  const handleSiteChange = async () => {
    // Reload site data and refresh any site-specific data
    await loadSitesFromAPI();
    // The useEffect for selectedSite will handle reloading the data automatically
    // when selectedSite changes, so we don't need to manually reload here
  };

  const loadAffiliateLinks = useCallback(async (siteId: string) => {
    if (isSupabaseConfiguredState === false) return; // Skip if using demo mode
    
    try {
      const response = await fetch(`/api/affiliate-links?siteId=${siteId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (response.ok) {
        setAffiliateLinks(data.data || []);
      } else {
        console.error('Failed to load affiliate links:', data.error);
      }
    } catch (error) {
      console.error('Error loading affiliate links:', error);
      setAffiliateLinks([]); // Ensure it stays as an array
    }
  }, [isSupabaseConfiguredState]);

  const loadTrainingMaterials = useCallback(async (siteId: string) => {
    if (isSupabaseConfiguredState === false) return; // Skip if using demo mode
    
    try {
      const response = await fetch(`/api/training-materials?siteId=${siteId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (response.ok) {
        // Check for status changes and show notifications
        const previousMaterials = previousMaterialsRef.current;
        const newMaterials = data.data || [];
        
        // Compare with previous state to detect status changes
        newMaterials.forEach((newMaterial: TrainingMaterial) => {
          const previousMaterial = previousMaterials.find(pm => pm.id === newMaterial.id);
          
          if (previousMaterial && previousMaterial.scrape_status !== newMaterial.scrape_status) {
            // Status changed - show notification
            if (newMaterial.scrape_status === 'success') {
              toast({
                title: "✅ Scraping Complete",
                description: `Successfully scraped content from "${newMaterial.title}"`,
              });
            } else if (newMaterial.scrape_status === 'failed') {
              toast({
                title: "❌ Scraping Failed",
                description: `Failed to scrape content from "${newMaterial.title}"`,
                variant: "destructive"
              });
            }
          }
        });
        
        // Update state and previous materials ref
        setTrainingMaterials(newMaterials);
        previousMaterialsRef.current = newMaterials;
      } else {
        console.error('Failed to load training materials:', data.error);
      }
    } catch (error) {
      console.error('Error loading training materials:', error);
      setTrainingMaterials([]); // Ensure it stays as an array
    }
  }, [isSupabaseConfiguredState, toast]);

  // Handler functions
  const handleAddLink = async () => {
    if (!newLink.url || !newLink.title) {
      toast({
        title: "Error",
        description: "Please fill in both URL and title",
        variant: "destructive"
      });
      return;
    }

    if (!selectedSite) {
      toast({
        title: "Error",
        description: "Please select a site first",
        variant: "destructive"
      });
      return;
    }
    
    setIsSaving(true);
    try {
      if (isSupabaseConfiguredState === false) {
        // Demo mode - simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const link: AffiliateLink = {
          id: Date.now().toString(),
          url: newLink.url,
          title: newLink.title,
          description: newLink.description,
          site_id: selectedSite.id,
          created_at: new Date().toISOString()
        };
        
        setAffiliateLinks(prev => [...prev, link]);
      } else {
        // Real API call
        const response = await fetch('/api/affiliate-links', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            siteId: selectedSite.id,
            url: newLink.url,
            title: newLink.title,
            description: newLink.description,
            image_url: newLink.image_url,
            button_text: newLink.button_text
          }),
          credentials: 'include',
        });

        const data = await response.json();

        if (response.ok) {
          setAffiliateLinks(prev => [...prev, data.data]);
        } else {
          throw new Error(data.error || 'Failed to add offer link');
        }
      }
      
      setNewLink({ url: '', title: '', description: '', image_url: '', button_text: '' });
      
      toast({
        title: "Success",
        description: "Offer link added successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add offer link",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Copy embed code to clipboard
  const handleCopyCode = async (code: string, type: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(type);
      toast({
        title: "Copied!",
        description: "Embed code copied to clipboard",
      });
      // Reset copied state after 2 seconds
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive"
      });
    }
  };

  const [editingLink, setEditingLink] = useState<AffiliateLink | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleEditLink = (link: AffiliateLink) => {
    setEditingLink(link);
    setIsEditDialogOpen(true);
  };

  const handleSaveEditLink = async () => {
    if (!editingLink) return;
    
    setIsSaving(true);
    try {
      if (isSupabaseConfiguredState === false) {
        // Demo mode - update in state
        setAffiliateLinks(prev => 
          prev.map(link => 
            link.id === editingLink.id ? editingLink : link
          )
        );
      } else {
        // Real API call
        const response = await fetch(`/api/affiliate-links/${editingLink.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: editingLink.url,
            title: editingLink.title,
            description: editingLink.description,
            image_url: editingLink.image_url,
            button_text: editingLink.button_text
          }),
          credentials: 'include',
        });

        const data = await response.json();

        if (response.ok) {
          setAffiliateLinks(prev => 
            prev.map(link => 
              link.id === editingLink.id ? data.data : link
            )
          );
        } else {
          throw new Error(data.error || 'Failed to update offer link');
        }
      }
      
      setIsEditDialogOpen(false);
      setEditingLink(null);
      
      toast({
        title: "Success",
        description: "Offer link updated successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update offer link",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLink = async (link: AffiliateLink) => {
    if (isSupabaseConfiguredState === false) {
      // Demo mode - just remove from state
      setAffiliateLinks(prev => prev.filter(l => l.id !== link.id));
      toast({
        title: "Success",
        description: "Offer link deleted successfully"
      });
      return;
    }

    try {
      const response = await fetch(`/api/affiliate-links/${link.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setAffiliateLinks(prev => prev.filter(l => l.id !== link.id));
        toast({
          title: "Success",
          description: "Offer link deleted successfully"
        });
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete offer link');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete offer link",
        variant: "destructive"
      });
    }
  };

  const handleAddTrainingMaterial = async (data: { url: string }) => {
    if (!data.url) {
      toast({
        title: "Error",
        description: "Please enter a URL",
        variant: "destructive"
      });
      return;
    }

    if (!selectedSite) {
      toast({
        title: "Error",
        description: "Please select a site first",
        variant: "destructive"
      });
      return;
    }
    
    setIsSaving(true);
    try {
      if (isSupabaseConfiguredState === false) {
        // Demo mode - simulate API call
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const material: TrainingMaterial = {
          id: Date.now().toString(),
          url: data.url,
          title: new URL(data.url).hostname,
          site_id: selectedSite.id,
          scrape_status: 'success',
          content: 'Demo content for ' + new URL(data.url).hostname + '. This is sample training content that would normally be scraped from the webpage.',
          content_type: 'webpage',
          last_scraped_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        setTrainingMaterials(prev => [...prev, material]);
      } else {
        // Real API call
        const response = await fetch('/api/training-materials', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            siteId: selectedSite.id,
            url: data.url
          }),
          credentials: 'include',
        });

        const responseData = await response.json();

        if (response.ok) {
          setTrainingMaterials(prev => [...prev, responseData.data]);
        } else {
          throw new Error(responseData.error || 'Failed to add training material');
        }
      }
      
      setNewTrainingUrl('');
      
      toast({
        title: "Success",
        description: "Training material added successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add training material",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTrainingMaterial = async (material: TrainingMaterial) => {
    if (isSupabaseConfiguredState === false) {
      // Demo mode - just remove from state
      setTrainingMaterials(prev => prev.filter(m => m.id !== material.id));
      toast({
        title: "Success",
        description: "Training material deleted successfully"
      });
      return;
    }

    try {
      const response = await fetch(`/api/training-materials/${material.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (response.ok) {
        setTrainingMaterials(prev => prev.filter(m => m.id !== material.id));
        toast({
          title: "Success",
          description: "Training material deleted successfully"
        });
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete training material');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete training material",
        variant: "destructive"
      });
    }
  };

  const handleEditMaterial = (material: TrainingMaterial) => {
    setSelectedMaterialForEdit(material);
    setIsContentEditorOpen(true);
  };

  const handleMaterialSaved = (updatedMaterial: TrainingMaterial) => {
    setTrainingMaterials(prev => 
      prev.map(m => m.id === updatedMaterial.id ? updatedMaterial : m)
    );
  };

  const handleCloseEditor = () => {
    setIsContentEditorOpen(false);
    setSelectedMaterialForEdit(null);
  };

  // Simplified polling approach - fixed circular dependency
  useEffect(() => {
    if (!selectedSite) return;

    // Check if we have any materials that need polling
    const hasProcessingMaterials = trainingMaterials.some(m => 
      m.scrape_status === 'pending' || m.scrape_status === 'processing'
    );


    if (hasProcessingMaterials) {
      // Start polling if not already running
      if (!pollingIntervalRef.current) {
        setIsPolling(true);
        
        pollingIntervalRef.current = setInterval(async () => {
          try {
            // Call loadTrainingMaterials directly without depending on the function reference
            if (isSupabaseConfiguredState === false) return;
            
            const response = await fetch(`/api/training-materials?siteId=${selectedSite.id}`, {
              credentials: 'include',
            });
            const data = await response.json();
            
            if (response.ok) {
              // Check for status changes and show notifications
              const previousMaterials = previousMaterialsRef.current;
              const newMaterials = data.data || [];
              
              // Compare with previous state to detect status changes
              newMaterials.forEach((newMaterial: TrainingMaterial) => {
                const previousMaterial = previousMaterials.find(m => m.id === newMaterial.id);
                if (previousMaterial && previousMaterial.scrape_status !== newMaterial.scrape_status) {
                  
                  if (newMaterial.scrape_status === 'success') {
                    toast({
                      title: "Content scraped successfully",
                      description: `"${newMaterial.title}" has been processed and is ready for training.`,
                      variant: "default",
                    });
                  } else if (newMaterial.scrape_status === 'failed') {
                    toast({
                      title: "Scraping failed",
                      description: `Failed to process "${newMaterial.title}". ${newMaterial.error_message || 'Please try again.'}`,
                      variant: "destructive",
                    });
                  }
                }
              });
              
              // Update state
              setTrainingMaterials(newMaterials);
              previousMaterialsRef.current = [...newMaterials];
            } else {
              console.error('Failed to load training materials:', data.error);
            }
          } catch (error) {
            console.error('Polling error:', error);
          }
        }, 5000); // Poll every 5 seconds for testing
      }
    } else {
      // Stop polling if no materials are being processed
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        setIsPolling(false);
      }
    }

    // Cleanup function
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
        setIsPolling(false);
      }
    };
  }, [trainingMaterials, selectedSite, isSupabaseConfiguredState, toast]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const handleRetryScrapeMaterial = async (material: TrainingMaterial) => {
    if (isSupabaseConfiguredState === false) {
      // Demo mode - just update status
      setTrainingMaterials(prev => 
        prev.map(m => m.id === material.id 
          ? { ...m, scrape_status: 'success' as const, error_message: null, content: 'Demo retry successful content' }
          : m
        )
      );
      toast({
        title: "Success",
        description: "Material re-scraped successfully"
      });
      return;
    }

    try {
      // Update status to processing
      setTrainingMaterials(prev => 
        prev.map(m => m.id === material.id 
          ? { ...m, scrape_status: 'processing' as const, error_message: null }
          : m
        )
      );

      // Trigger re-scraping by calling the API
      const response = await fetch('/api/training-materials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          siteId: material.site_id,
          url: material.url
        }),
      });

      if (response.ok) {
        
        toast({
          title: "Processing",
          description: "Re-scraping started. This may take a moment."
        });
      } else {
        throw new Error('Failed to trigger re-scraping');
      }
    } catch (error) {
      // Reset status to failed on error
      setTrainingMaterials(prev => 
        prev.map(m => m.id === material.id 
          ? { ...m, scrape_status: 'failed' as const }
          : m
        )
      );

      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to retry scraping",
        variant: "destructive"
      });
    }
  };

  const handleSaveChatSettings = async () => {
    if (!selectedSite) return;
    
    setIsSaving(true);
    try {
      const response = await fetch('/api/chat-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          siteId: selectedSite.id,
          ...chatSettings,
          intro_message: introMessage,
          preferred_language: preferredLanguage
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save chat settings');
      }
      
      toast({
        title: "Success",
        description: "Chat settings saved successfully"
      });
    } catch (error) {
      console.error('Error saving chat settings:', error);
      toast({
        title: "Error",
        description: "Failed to save chat settings",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };


  const loadChatSessions = async (siteId: string) => {
    setIsLoadingLogs(true);
    try {
      const response = await fetch(`/api/chat-sessions?siteId=${siteId}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch chat sessions');
      }
      const data = await response.json();
      setChatSessions(data.sessions || []);
    } catch (error) {
      console.error('Error fetching chat sessions:', error);
      toast({
        title: "Error",
        description: "Failed to load chat logs",
        variant: "destructive"
      });
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleDeleteSessionClick = (sessionId: string) => {
    setSessionToDelete(sessionId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;

    try {
      const response = await fetch(`/api/chat-sessions/${sessionToDelete}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete chat session');
      }
      
      // Remove the session from local state
      setChatSessions(prev => prev.filter(session => session.id !== sessionToDelete));
      
      // Close the session details modal if it's the deleted session
      if (selectedSession?.id === sessionToDelete) {
        setSelectedSession(null);
        setSessionMessages([]);
      }
      
      toast({
        title: "Success",
        description: "Chat session deleted successfully"
      });
      
      // Close the dialog
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
    } catch (error) {
      console.error('Error deleting chat session:', error);
      toast({
        title: "Error",
        description: "Failed to delete chat session",
        variant: "destructive"
      });
      
      // Close the dialog even on error
      setDeleteDialogOpen(false);
      setSessionToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setSessionToDelete(null);
  };

  const handleRefreshChatLogs = async () => {
    if (!selectedSite) return;
    await loadChatSessions(selectedSite.id);
    toast({
      title: "Success",
      description: "Chat logs refreshed"
    });
  };

  const handleViewSession = async (session: ChatSession) => {
    if (!selectedSite) return;
    
    setIsLoadingSessionDetails(true);
    setSelectedSession(session);
    
    try {
      const response = await fetch(`/api/chat-sessions/${session.id}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch session details');
      }
      
      const data = await response.json();
      setSessionMessages(data.messages || []);
      setSessionEvents(data.events || []);
    } catch (error) {
      console.error('Error fetching session details:', error);
      toast({
        title: "Error",
        description: "Failed to load session details",
        variant: "destructive"
      });
    } finally {
      setIsLoadingSessionDetails(false);
    }
  };

  const loadAnalyticsData = useCallback(async (siteId: string) => {
    try {
      // Use the metrics endpoint (V2). Support optional date range.
      const qs = new URLSearchParams({ site_id: siteId });
      if (startDate) {
        try { qs.set('start_date', new Date(startDate).toISOString()); } catch {}
      }
      if (endDate) {
        try { qs.set('end_date', new Date(endDate).toISOString()); } catch {}
      }
      const response = await fetch(`/api/analytics/metrics?${qs.toString()}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const data = await response.json();
      // Accept both shapes: {metrics: {...}} or direct metrics object
      const m = (data?.metrics ?? data) || {};
      const ov = m.overview || {};
      // Store v2 extras
      setTrends(Array.isArray(m.trends) ? m.trends : []);
      setRouteMix(m.route_mix || null);
      setPageContextUsage(m.page_context_usage || null);
      setRefusalRate(typeof m.refusal_rate === 'number' ? m.refusal_rate : (typeof data.refusal_rate === 'number' ? data.refusal_rate : null));
      setTopPages(Array.isArray(m.top_pages) ? m.top_pages : []);
      const offersPerfFromMetrics: any[] = Array.isArray((m as any).offers_performance) ? (m as any).offers_performance : [];
      if (m.last_updated) setOffersLastUpdated(m.last_updated);
      if (offersPerfFromMetrics.length > 0) {
        setOffersPerf(offersPerfFromMetrics);
      } else {
        // Fallback: if metrics didn\'t include offers yet (dev bypass / MV not ready), build zeroed rows from affiliate-links
        try {
          const affRes = await fetch(`/api/affiliate-links?siteId=${siteId}`, { credentials: 'include' });
          if (affRes.ok) {
            const aff = await affRes.json();
            const zeroed = (aff?.data || []).map((o: any) => ({
              id: o.id,
              title: o.title,
              url: o.url,
              impressions: 0,
              clicks: 0,
              ctr: 0,
              last_seen: null,
            }));
            setOffersPerf(zeroed);
          } else {
            setOffersPerf([]);
          }
        } catch {
          setOffersPerf([]);
        }
      }
      // Map to the dashboard ChatStats shape with sane fallbacks
      setChatStats({
        totalChats: (m.total_sessions ?? ov.total_sessions) || 0,
        totalMessages: (m.total_messages ?? ov.total_messages) || 0,
        averageResponseTime: (m.avg_session_duration ?? ov.avg_session_duration) || 0,
        satisfactionRate: (() => {
          // Approximate satisfaction as (1 - refusal_rate) when available; fallback to 100
          const refusal = typeof m.refusal_rate === 'number' ? m.refusal_rate : (typeof data.refusal_rate === 'number' ? data.refusal_rate : 0);
          return Math.max(0, Math.min(100, Math.round((1 - refusal) * 100)));
        })(),
        totalOfferImpressions: (m.total_offer_impressions ?? ov.total_offer_impressions ?? m.conversion_funnel?.offer_impressions) || 0,
        totalLinkClicks: (m.total_link_clicks ?? ov.total_link_clicks ?? m.conversion_funnel?.link_clicks) || 0,
        conversionRate: (() => {
          const cr = m.conversion_rate ?? ov.conversion_rate ?? 0;
          return Math.round(cr * 10) / 10;
        })(),
        widgetBreakdown: (m.widget_breakdown ?? m.widget_performance) || undefined
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      // Keep current stats on error
    }
  }, [startDate, endDate]);

  const refreshOffersPerformance = useCallback(async () => {
    if (!selectedSite || refreshingOffers) return;
    setRefreshingOffers(true);
    try {
      await fetch('/api/analytics/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: selectedSite.id })
      });
      setTimeout(() => loadAnalyticsData(selectedSite.id), 1500);
    } catch {}
    finally { setTimeout(() => setRefreshingOffers(false), 500); }
  }, [selectedSite, refreshingOffers, loadAnalyticsData]);

  const loadChatSettings = useCallback(async (siteId: string) => {
    setIsLoadingChatSettings(true);
    try {
      const response = await fetch(`/api/chat-settings?siteId=${siteId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch chat settings');
      }

      const data = await response.json();
      if (data.data) {
        setChatSettings({
          chat_name: data.data.chat_name || 'Affi',
          chat_color: data.data.chat_color || '#000000',
          chat_icon_url: data.data.chat_icon_url || '',
          chat_name_color: data.data.chat_name_color || '#FFFFFF',
          chat_bubble_icon_color: data.data.chat_bubble_icon_color || '#FFFFFF',
          input_placeholder: data.data.input_placeholder || 'Type your message...',
          font_size: data.data.font_size || '14px'
        });
        setIntroMessage(data.data.intro_message || 'Hello! How can I help you today?');
        setPreferredLanguage(data.data.preferred_language || null);
      }
    } catch (error) {
      console.error('Error fetching chat settings:', error);
      // Keep current settings on error
    } finally {
      setIsLoadingChatSettings(false);
    }
  }, []);

  // Check if Supabase is configured
  const isSupabaseConfigured = useCallback((): boolean => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return Boolean(url && key && !url.includes('dummy') && !key.includes('dummy'));
  }, []);
  
  // Use the function to avoid unused variable warning
  React.useEffect(() => {
    setIsSupabaseConfiguredState(isSupabaseConfigured());
  }, [isSupabaseConfigured]);

  // Initialize data - use demo data only if Supabase is not configured
  useEffect(() => {
    if (isLoaded && user) {
      if (isSupabaseConfiguredState === false) {
        // Only use demo data if Supabase is not configured
        const demoSite: Site = {
          id: 'demo-site',
          name: 'Demo Site',
          user_id: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        setSites([demoSite]);
        setSelectedSite(demoSite);
        
        // Set demo data
        setAffiliateLinks([
          {
            id: '1',
            url: 'https://example.com/product1',
            title: 'Sample Product 1',
            description: 'This is a sample affiliate link for testing',
            image_url: 'https://via.placeholder.com/80x80?text=Demo',
            site_id: 'demo-site',
            created_at: new Date().toISOString()
          }
        ]);
        
        setTrainingMaterials([
          {
            id: '1',
            url: 'https://example.com/docs',
            title: 'Documentation',
            site_id: 'demo-site',
            scrape_status: 'success',
            content: 'This is sample documentation content that has been scraped and processed. It contains information about how to use our products and services.',
            content_type: 'documentation',
            last_scraped_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
        
        setChatStats({
          totalChats: 42,
          totalMessages: 256,
          averageResponseTime: 1.2,
          satisfactionRate: 95
        });
      } else if (isSupabaseConfiguredState === true) {
        // Load real data from Supabase
        loadSitesFromAPI();
        setAffiliateLinks([]);
        setTrainingMaterials([]);
        setChatStats({
          totalChats: 0,
          totalMessages: 0,
          averageResponseTime: 0,
          satisfactionRate: 0
        });
      }
    }
  }, [isLoaded, user, isSupabaseConfiguredState]);

  // Load data when selected site changes
  useEffect(() => {
    if (selectedSite && isSupabaseConfiguredState === true) {
      // Update URL with current site
      try {
        const sp = new URLSearchParams(searchParams?.toString());
        sp.set('site_id', selectedSite.id);
        router.replace(`?${sp.toString()}`);
      } catch {}
      // Clear analytics state to avoid cross-site flash
      setOffersPerf([]);
      setTrends([]);
      setRouteMix(null);
      setPageContextUsage(null);
      setRefusalRate(null);
      
      loadAffiliateLinks(selectedSite.id);
      loadTrainingMaterials(selectedSite.id);
      if (selectedTab === 4) {
        loadAnalyticsData(selectedSite.id);
      }
      loadChatSettings(selectedSite.id);
      // Chat sessions will be refreshed when Chat Logs tab is clicked
    }
  }, [selectedSite, selectedTab, isSupabaseConfiguredState, loadAffiliateLinks, loadTrainingMaterials, loadAnalyticsData, loadChatSettings, router, searchParams]);

  // Handle tab selection with optional refresh for Chat Logs
  const handleTabSelection = (tabIndex: number) => {
    setSelectedTab(tabIndex);
    // Update URL param for tab
    try {
      const sp = new URLSearchParams(searchParams?.toString());
      const tabName = ['offers','training','predefined','widgets','analytics','logs'][tabIndex] || 'offers';
      sp.set('tab', tabName);
      router.replace(`?${sp.toString()}`);
    } catch {}
    // If Chat Logs tab is selected, refresh the data
    if (tabIndex === 5 && selectedSite && isSupabaseConfiguredState === true) {
      loadChatSessions(selectedSite.id);
    }
    // If Analytics tab is selected, (re)load analytics
    if (tabIndex === 4 && selectedSite && isSupabaseConfiguredState === true) {
      loadAnalyticsData(selectedSite.id);
    }
  };

  // Initialize from URL query params (tab + date range). Site preselect remains via UI for now.
  useEffect(() => {
    const tabParam = searchParams?.get('tab') || '';
    const map: Record<string, number> = { offers:0, training:1, predefined:2, widgets:3, analytics:4, logs:5 };
    if (tabParam && tabParam in map) setSelectedTab(map[tabParam]);
    const sd = searchParams?.get('start_date');
    const ed = searchParams?.get('end_date');
    if (sd) setStartDate(sd.split('T')[0] || sd);
    if (ed) setEndDate(ed.split('T')[0] || ed);
    // No dependencies: we intentionally respond to URL changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Loading state
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Embedded widget view
  if (isEmbedded && selectedSite) {
    return (
      <div className="min-h-screen bg-white p-0 m-0">
        <iframe
          key={`embedded-${selectedSite.id}`}
          src={`/widget-frame.html?siteId=${selectedSite.id}&apiUrl=${encodeURIComponent(API_URL)}&embedded=true`}
          title="Embedded Chat Widget"
          style={{
            width: '100%',
            height: '100vh',
            border: 'none',
            display: 'block',
            margin: 0,
            padding: 0,
            backgroundColor: 'white'
          }}
        />
      </div>
    );
  }

  // Standalone widget view
  if (shouldOpenChat && selectedSite) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <iframe
          key={`widget-${selectedSite.id}`}
          src={`/widget-frame.html?siteId=${selectedSite.id}&apiUrl=${encodeURIComponent(API_URL)}`}
          title="Chat Widget"
          style={{
            width: '100%',
            height: '100vh',
            border: 'none',
            display: 'block',
            margin: 0,
            padding: 0
          }}
        />
      </div>
    );
  }

  return (
    <>
      {/* Demo Mode Alert */}
      {isSupabaseConfiguredState === false && (
        <div className="bg-blue-50 border-b border-blue-200 p-3 text-center">
          <p className="text-sm text-blue-600 font-medium">
            📝 Demo Mode: Database not configured. You can explore the interface but data won&apos;t be saved.
          </p>
        </div>
      )}
      
      <div className="flex min-h-screen bg-gray-50">
        {/* Sidebar */}
        <div className="w-60 bg-white border-r border-gray-200 flex flex-col overflow-hidden h-screen fixed left-0 top-0 z-50">
          {/* Header */}
          <div className="flex items-center justify-center px-4 py-5 border-b border-gray-200 bg-white">
            <Image src="/offerbase-logo.svg" alt="Offerbase Logo" className="h-6" width={120} height={24} />
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-auto px-3 pt-4 space-y-1">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider ml-1 mb-2">
              Workspace
            </div>
            
            {/* Site Selector */}
            <div className="mb-3 px-1">
              <SiteSelector
                selectedSite={selectedSite}
                onSiteSelect={setSelectedSite}
                onSiteChange={handleSiteChange}
                className="w-full"
              />
            </div>
            
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider ml-1 !mb-1 !mt-5">
              Menu
            </div>
            
            {/* Navigation Items */}
            {navItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.label}
                  variant="ghost"
                  onClick={() => handleTabSelection(index)}
                  className={`w-full justify-start text-sm font-normal ${
                    selectedTab === index 
                      ? 'bg-gray-100 text-gray-900' 
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-1" />
                  {item.label}
                </Button>
              );
            })}
          </div>
          
          {/* User Info Footer */}
          <div className="px-3 py-4 border-t border-gray-200 bg-white">
            <p className="text-xs text-gray-600 font-medium truncate">
              {user?.emailAddresses[0]?.emailAddress || 'No email'}
            </p>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 ml-60 p-2">
          <Card className="w-full bg-white border border-gray-200">
            <CardContent className="p-6">
              {/* Show message when no site is selected */}
              {!selectedSite && isSupabaseConfiguredState === true ? (
                <div className="text-center py-12">
                  <div className="text-gray-500 text-lg mb-4">
                    No site selected
                  </div>
                  <p className="text-gray-400 mb-6">
                    Please select a site from the dropdown above or create a new one to get started.
                  </p>
                  <SiteSelector
                    selectedSite={selectedSite}
                    onSiteSelect={setSelectedSite}
                    onSiteChange={handleSiteChange}
                    className="inline-flex"
                  />
                </div>
              ) : (
                <>
                  {/* Tab Content */}
              {/* Offer Links Tab */}
              {selectedTab === 0 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Add New Offer Link</h2>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="url">URL</Label>
                      <Input
                        id="url"
                        value={newLink.url}
                        onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                        className="bg-white/80 border-gray-300 focus:border-gray-500"
                      />
                    </div>
                    <div>
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        value={newLink.title}
                        onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
                        className="bg-white/80 border-gray-300 focus:border-gray-500"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={newLink.description}
                        onChange={(e) => setNewLink({ ...newLink, description: e.target.value })}
                        className="bg-white/80 border-gray-300 focus:border-gray-500"
                      />
                    </div>
                    <div>
                      <Label htmlFor="image_url">Image URL (optional)</Label>
                      <Input
                        id="image_url"
                        value={newLink.image_url}
                        onChange={(e) => setNewLink({ ...newLink, image_url: e.target.value })}
                        placeholder="https://example.com/image.jpg"
                        className="bg-white/80 border-gray-300 focus:border-gray-500"
                      />
                      <p className="text-sm text-gray-600 mt-1">
                        Add an image URL to display a product image in the chat. Leave empty if no image is needed.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="button_text">Button Text (optional)</Label>
                      <Input
                        id="button_text"
                        value={newLink.button_text}
                        onChange={(e) => setNewLink({ ...newLink, button_text: e.target.value })}
                        placeholder="View Product"
                        className="bg-white/80 border-gray-300 focus:border-gray-500"
                      />
                      <p className="text-sm text-gray-600 mt-1">
                        Customize the call-to-action button text. Leave empty to use default &quot;View Product&quot;.
                      </p>
                    </div>
                    <Button
                      onClick={() => handleAddLink()}
                      disabled={isSaving}
                      className="bg-gray-900 hover:bg-gray-800 text-white"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        <>
                          Add Link
                        </>
                      )}
                    </Button>
                  </div>
                  
                  <div className="pt-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Offer Links</h3>
                    <div className="space-y-4">
                      {affiliateLinks.filter(link => link && link.id).map((link) => (
                        <Card key={link.id} className="bg-white border border-gray-200">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900">{link.title}</h4>
                                <p className="text-sm text-gray-600 mt-1">{link.description}</p>
                                <a
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm hover:text-blue-800 mt-2 inline-flex items-center"
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  View Link
                                </a>
                              </div>
                              <div className="flex space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditLink(link)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteLink(link)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {affiliateLinks.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          No offer links yet. Add one above to get started.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Training Materials Tab */}
              {selectedTab === 1 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Add New Training Material</h2>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="training-url">Website URL</Label>
                      <Input
                        id="training-url"
                        value={newTrainingUrl}
                        onChange={(e) => setNewTrainingUrl(e.target.value)}
                        placeholder="https://example.com/page-to-scrape"
                        className="bg-white/80 border-gray-300 focus:border-gray-500"
                      />
                    </div>
                    <p className="text-sm text-gray-600">
                      Enter a URL to scrape and add to your AI assistant&apos;s training data.
                    </p>
                    <Button
                      onClick={() => handleAddTrainingMaterial({ url: newTrainingUrl })}
                      disabled={isSaving}
                      className="bg-gray-900 hover:bg-gray-800 text-white max-w-fit"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Scraping...
                        </>
                      ) : (
                        <>
                          
                          Add Training Material
                        </>
                      )}
                    </Button>
                  </div>
                  
                  <div className="pt-8">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Your Training Materials</h3>
                      {isPolling && (
                        <div className="flex items-center text-sm text-blue-600">
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Checking for updates...
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      {trainingMaterials.map((material) => (
                        <Card key={material.id} className="bg-white border border-gray-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-medium text-gray-900">{material.title}</h4>
                                  {material.scrape_status === 'pending' && (
                                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      Pending
                                    </Badge>
                                  )}
                                  {material.scrape_status === 'processing' && (
                                    <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      Processing
                                    </Badge>
                                  )}
                                  {material.scrape_status === 'success' && (
                                    <Badge variant="default" className="bg-green-100 text-green-800">
                                      Success
                                    </Badge>
                                  )}
                                  {material.scrape_status === 'failed' && (
                                    <Badge variant="destructive" className="bg-red-100 text-red-800">
                                      Failed
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditMaterial(material)}
                                  title="Edit content"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteTrainingMaterial(material)}
                                  title="Delete material"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            
                            {/* Content info */}
                            {material.scrape_status === 'success' && material.content && (
                              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium text-gray-700">
                                    Content ({material.content.length.toLocaleString()} characters)
                                  </span>
                                  {material.content_type && (
                                    <Badge variant="outline" className="text-xs">
                                      {material.content_type}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-sm text-gray-600 line-clamp-3">
                                  {material.content.substring(0, 200)}
                                  {material.content.length > 200 && '...'}
                                </div>
                                {material.last_scraped_at && (
                                  <div className="text-xs text-gray-500 mt-2">
                                    Last updated: {new Date(material.last_scraped_at).toLocaleDateString()}
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Error message */}
                            {material.scrape_status === 'failed' && material.error_message && (
                              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="text-sm font-medium text-red-800">Scraping Error</div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRetryScrapeMaterial(material)}
                                    className="text-red-700 hover:text-red-800"
                                    title="Retry scraping"
                                  >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Retry
                                  </Button>
                                </div>
                                <div className="text-sm text-red-700">{material.error_message}</div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                      {trainingMaterials.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          No training materials yet. Add one above to get started.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Predefined Questions Tab */}
              {selectedTab === 2 && selectedSite && (
                <PredefinedQuestionsManager siteId={selectedSite.id} />
              )}

              {/* Widgets Tab */}
              {selectedTab === 3 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Widget Settings</h2>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="chat-name">Chat Name</Label>
                      <Input
                        id="chat-name"
                        value={chatSettings.chat_name}
                        onChange={(e) => setChatSettings({ ...chatSettings, chat_name: e.target.value })}
                        className="bg-white/80 border-gray-300 focus:border-gray-500"
                      />
                    </div>
                    <ColorPicker
                      label="Chat Color"
                      value={chatSettings.chat_color}
                      onChange={(color) => setChatSettings({ ...chatSettings, chat_color: color })}
                      id="chat-color"
                    />
                    <ColorPicker
                      label="Chat Bubble Icon Color"
                      value={chatSettings.chat_bubble_icon_color}
                      onChange={(color) => setChatSettings({ ...chatSettings, chat_bubble_icon_color: color })}
                      id="chat-bubble-icon-color"
                    />
                    <div>
                      <Label htmlFor="chat-icon-url">Chat Icon URL</Label>
                      <Input
                        id="chat-icon-url"
                        value={chatSettings.chat_icon_url}
                        onChange={(e) => setChatSettings({ ...chatSettings, chat_icon_url: e.target.value })}
                        className="bg-white/80 border-gray-300 focus:border-gray-500"
                      />
                    </div>
                    <div>
                      <Label htmlFor="input-placeholder">Input Placeholder</Label>
                      <Input
                        id="input-placeholder"
                        value={chatSettings.input_placeholder}
                        onChange={(e) => setChatSettings({ ...chatSettings, input_placeholder: e.target.value })}
                        className="bg-white/80 border-gray-300 focus:border-gray-500"
                      />
                    </div>
                    <div>
                      <Label htmlFor="intro-message">Intro Message</Label>
                      <Textarea
                        id="intro-message"
                        value={introMessage}
                        onChange={(e) => setIntroMessage(e.target.value)}
                        rows={3}
                        className="bg-white/80 border-gray-300 focus:border-gray-500"
                      />
                    </div>
                    <div>
                      <Label htmlFor="preferred-language">Preferred Language</Label>
                      <Select value={preferredLanguage || "auto"} onValueChange={(value) => setPreferredLanguage(value === "auto" ? null : value)}>
                        <SelectTrigger className="bg-white/80 border-gray-300 focus:border-gray-500">
                          <SelectValue placeholder="Auto-detect language" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto-detect language</SelectItem>
                          {PREFERRED_LANGUAGE_OPTIONS.map((lang) => (
                            <SelectItem key={lang.code} value={lang.code}>
                              {lang.flag} {lang.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-sm text-gray-600 mt-1">
                        Used as fallback when language detection is uncertain. Leave as &quot;Auto-detect&quot; to rely purely on automatic detection.
                      </p>
                    </div>
                    <Button
                      onClick={handleSaveChatSettings}
                      disabled={isSaving}
                      className="bg-gray-900 hover:bg-gray-800 text-white max-w-fit"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Settings'
                      )}
                    </Button>
                  </div>
                  
                  {/* Widget Types Section */}
                  
                  <div className="mt-8">
                    <h3 className="text-xl font-semibold text-gray-900 mt-10 mb-4">Widget Types</h3>
                    <p className="text-sm text-gray-600 mb-6">
                      Use the same settings with different widget types. You can deploy both widgets on your site simultaneously.
                    </p>
                    
                    {/* AI SDK Toggle */}
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-green-900">Enhanced Chat Widget</h4>
                          <p className="text-sm text-green-700 mt-1">
                            AI-powered chat with improved streaming, smart responses, and tool integration.
                          </p>
                        </div>
                        <div className="text-green-600 font-semibold">
                          ✓ Active
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Floating Chat Widget */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-2">Floating Chat Widget</h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Traditional floating chat button that appears in the bottom right corner. Perfect for general website support.
                        </p>
                        <Label className="text-sm font-medium">Embed Code</Label>
                        <div 
                          onClick={() => handleCopyCode(`<script src="${API_URL}/widget.js" data-site-id="${selectedSite?.id || 'your-site-id'}"></script>`, 'floating')}
                          className="mt-2 bg-white border border-gray-300 rounded-md p-3 font-mono text-xs cursor-pointer hover:bg-gray-50 transition-colors relative group"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 pr-8 break-all">
                              {`<script src="${API_URL}/widget.js" data-site-id="${selectedSite?.id || 'your-site-id'}"></script>`}
                            </div>
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {copiedCode === 'floating' ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <Copy className="h-4 w-4 text-gray-400" />
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Click to copy</p>
                      </div>
                      
                      {/* Inline Article Widget */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-2">Inline Article Widget</h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Chat box that appears inline with your content. Place this code where you want the widget to appear in articles or blog posts.
                        </p>
                        <Label className="text-sm font-medium">Embed Code</Label>
                        <div 
                          onClick={() => handleCopyCode(`<script src="${API_URL}/widget.js" data-site-id="${selectedSite?.id || 'your-site-id'}" data-widget-type="inline"></script>`, 'inline')}
                          className="mt-2 bg-white border border-gray-300 rounded-md p-3 font-mono text-xs cursor-pointer hover:bg-gray-50 transition-colors relative group"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 pr-8 break-all">
                              {`<script src="${API_URL}/widget.js" data-site-id="${selectedSite?.id || 'your-site-id'}" data-widget-type="inline"></script>`}
                            </div>
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {copiedCode === 'inline' ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <Copy className="h-4 w-4 text-gray-400" />
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Click to copy</p>
                        
                        {/* WordPress Help */}
                        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                          <p className="text-yellow-800 font-medium mb-1">WordPress Users:</p>
                          <p className="text-yellow-700">WordPress strips the data-widget-type attribute. Use this container method instead:</p>
                          <div 
                            onClick={() => handleCopyCode(`<!-- Chat Widget Container -->
<div data-chat-widget-inline style="min-height: 600px;"></div>
<script src="${API_URL}/widget.js" data-site-id="${selectedSite?.id || 'your-site-id'}"></script>`, 'inline-wp')}
                            className="mt-2 bg-white border border-yellow-300 rounded p-2 font-mono cursor-pointer hover:bg-yellow-50 transition-colors relative group"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex-1 pr-8 break-all text-[10px]">
                                {`<!-- Chat Widget Container -->\n<div data-chat-widget-inline style="min-height: 600px;"></div>\n<script src="${API_URL}/widget.js" data-site-id="${selectedSite?.id || 'your-site-id'}"></script>`}
                              </div>
                              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {copiedCode === 'inline-wp' ? (
                                  <Check className="h-3 w-3 text-green-600" />
                                ) : (
                                  <Copy className="h-3 w-3 text-gray-400" />
                                )}
                              </div>
                            </div>
                          </div>
                          <p className="text-yellow-700 mt-1 text-[10px]">The widget detects the container and automatically switches to inline mode.</p>
                        </div>
                      </div>
                      
                      {/* Sidebar Widget */}
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h4 className="font-semibold text-gray-900 mb-2">Sidebar Widget</h4>
                        <p className="text-sm text-gray-600 mb-3">
                          Full-height sidebar that makes room for chat by pushing the page content left. Collapsible, open by default. On mobile it becomes an overlay.
                        </p>
                        <Label className="text-sm font-medium">Embed Code</Label>
                        <div
                          onClick={() => handleCopyCode(`<script src=\"${API_URL}/widget-sidebar.js\" data-site-id=\"${selectedSite?.id || 'your-site-id'}\" data-sidebar-width=\"440\"></script>`, 'sidebar')}
                          className="mt-2 bg-white border border-gray-300 rounded-md p-3 font-mono text-xs cursor-pointer hover:bg-gray-50 transition-colors relative group"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1 pr-8 break-all">
                              {`<script src="${API_URL}/widget-sidebar.js" data-site-id="${selectedSite?.id || 'your-site-id'}" data-sidebar-width="440"></script>`}
                            </div>
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              {copiedCode === 'sidebar' ? (
                                <Check className="h-4 w-4 text-green-600" />
                              ) : (
                                <Copy className="h-4 w-4 text-gray-400" />
                              )}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Click to copy • Default width 440px. Optional: adjust width with data-sidebar-width (280–540)</p>
                        <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                          Recommended to use either the floating or the sidebar on a page, not both.
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                      <div className="flex">
                        <Info className="h-5 w-5 text-blue-400 mt-0.5 mr-2" />
                        <div>
                          <h5 className="text-sm font-medium text-blue-900">Pro Tip</h5>
                          <p className="text-sm text-blue-700 mt-1">
                            You can use both widget types on the same website! The floating widget provides general support, 
                            while inline widgets offer contextual help within your content.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}



              {/* Analytics Tab */}
              {selectedTab === 4 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Analytics</h2>
                  {/* Date range filters */}
                  <div className="flex flex-wrap items-end gap-3">
                    <div>
                      <Label className="text-sm">Start date</Label>
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[180px]" />
                    </div>
                    <div>
                      <Label className="text-sm">End date</Label>
                      <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[180px]" />
                    </div>
                    <Button
                      variant="outline"
                      className="h-9"
                      onClick={() => selectedSite && loadAnalyticsData(selectedSite.id)}
                    >
                      Apply
                    </Button>
                  </div>
                  {/* Overview Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold text-gray-900">{chatStats.totalChats}</div>
                        <div className="text-sm text-gray-600">Total Sessions</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold text-gray-900">{chatStats.totalMessages}</div>
                        <div className="text-sm text-gray-600">Total Messages</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold text-gray-900">{chatStats.totalLinkClicks || 0}</div>
                        <div className="text-sm text-gray-600">Link Clicks</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold text-gray-900">{chatStats.conversionRate || 0}%</div>
                        <div className="text-sm text-gray-600">Conversion Rate</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Conversion Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold text-gray-900">{chatStats.totalOfferImpressions || 0}</div>
                        <div className="text-sm text-gray-600">Offer Impressions</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold text-gray-900">{chatStats.averageResponseTime}s</div>
                        <div className="text-sm text-gray-600">Avg Session Duration</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold text-gray-900">{chatStats.satisfactionRate}%</div>
                        <div className="text-sm text-gray-600">Engagement Rate</div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Timeline */}
                  {trends && trends.length > 0 && (
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <CardTitle className="text-base">Timeline</CardTitle>
                            <CardDescription>Daily trend for a selected metric</CardDescription>
                          </div>
                          <div className="flex items-center gap-2 bg-gray-100 rounded-md p-1">
                            {([
                              { key: 'sessions', label: 'Sessions' },
                              { key: 'clicks', label: 'Clicks' },
                              { key: 'impressions', label: 'Impressions' },
                              { key: 'widget_opens', label: 'Opens' },
                            ] as const).map(({ key, label }) => (
                              <button
                                key={key}
                                onClick={() => setSelectedSeries(key)}
                                className={`px-3 py-1.5 text-sm rounded ${selectedSeries === key ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <AreaTimeline data={trends as any[]} metric={selectedSeries} />
                      </CardContent>
                    </Card>
                  )}

                  {/* Route Mix and Page Context Usage */}
                  {(routeMix || pageContextUsage || refusalRate !== null) && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Route Mix</CardTitle>
                          <CardDescription>Answer vs Clarify vs Refuse (incl. page summary/QA)</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="flex justify-between"><span className="text-gray-600">Answer</span><span className="font-medium">{routeMix?.answer || 0}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Clarify</span><span className="font-medium">{routeMix?.clarify || 0}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Refuse</span><span className="font-medium">{routeMix?.refuse || 0}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Page Summary</span><span className="font-medium">{routeMix?.page_summary || 0}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Page QA</span><span className="font-medium">{routeMix?.page_qa || 0}</span></div>
                          </div>
                          {refusalRate !== null && (
                            <div className="mt-3 text-sm text-gray-700">Refusal rate: <span className="font-medium">{Math.round((refusalRate as number) * 1000) / 10}%</span></div>
                          )}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Page Context Usage</CardTitle>
                          <CardDescription>How often page context is used vs ignored</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-gray-600">Used</span><span className="font-medium">{pageContextUsage?.used || 0}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Ignored</span><span className="font-medium">{pageContextUsage?.ignored || 0}</span></div>
                            <div className="flex justify-between"><span className="text-gray-600">Miss</span><span className="font-medium">{pageContextUsage?.miss || 0}</span></div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {/* Top Pages */}
                  {topPages && topPages.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Top Pages</CardTitle>
                        <CardDescription>Pages driving impressions and clicks</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <TopPagesTable pages={topPages as any[]} />
                      </CardContent>
                    </Card>
                  )}

                  {/* Offers Performance */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <CardTitle className="text-base">Offers Performance</CardTitle>
                          <CardDescription>
                            Impressions, clicks and CTR per offer
                            {offersLastUpdated && (
                              <>
                                {` • MV up to ${offersLastUpdated.mv_last_day || 'today'} • Generated ${new Date(offersLastUpdated.generated_at || Date.now()).toLocaleTimeString()}`}
                              </>
                            )}
                          </CardDescription>
                        </div>
                        <button
                          onClick={refreshOffersPerformance}
                          disabled={refreshingOffers}
                          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {refreshingOffers ? 'Refreshing…' : 'Refresh now'}
                        </button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <OffersTable items={offersPerf as any[]} />
                    </CardContent>
                  </Card>

                  {/* Widget Type Breakdown */}
                  {chatStats.widgetBreakdown && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Widget Performance</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card>
                          <CardContent className="p-6">
                            <h4 className="text-base font-medium text-gray-900 mb-4">Floating Widget</h4>
                            <div className="space-y-3">
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Opens</span>
                                <span className="font-medium">{chatStats.widgetBreakdown.floating?.opens || 0}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Clicks</span>
                                <span className="font-medium">{chatStats.widgetBreakdown.floating?.clicks || 0}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Conversion Rate</span>
                                <span className="font-medium">{chatStats.widgetBreakdown.floating?.conversion_rate || 0}%</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-6">
                            <h4 className="text-base font-medium text-gray-900 mb-4">Inline Widget</h4>
                            <div className="space-y-3">
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Opens</span>
                                <span className="font-medium">{chatStats.widgetBreakdown.inline?.opens || 0}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Clicks</span>
                                <span className="font-medium">{chatStats.widgetBreakdown.inline?.clicks || 0}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Conversion Rate</span>
                                <span className="font-medium">{chatStats.widgetBreakdown.inline?.conversion_rate || 0}%</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-6">
                            <h4 className="text-base font-medium text-gray-900 mb-4">Sidebar Widget</h4>
                            <div className="space-y-3">
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Opens</span>
                                <span className="font-medium">{chatStats.widgetBreakdown.sidebar?.opens || 0}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Clicks</span>
                                <span className="font-medium">{chatStats.widgetBreakdown.sidebar?.clicks || 0}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Conversion Rate</span>
                                <span className="font-medium">{chatStats.widgetBreakdown.sidebar?.conversion_rate || 0}%</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Chat Logs Tab */}
              {selectedTab === 5 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Chat Logs</h2>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-gray-600">Recent chat sessions</p>
                      <Button
                        onClick={handleRefreshChatLogs}
                        variant="outline"
                        size="sm"
                        disabled={isLoadingLogs}
                      >
                        {isLoadingLogs ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          'Refresh'
                        )}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {chatSessions.map((session) => (
                        <Card key={session.id} className="cursor-pointer hover:bg-gray-50">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <div className="font-medium">Session {session.id}</div>
                                  <Badge variant="secondary" className="text-xs">
                                    {session.message_count || 0} messages
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {session.offers_shown || 0} offers
                                  </Badge>
                                  <Badge variant={session.clicked ? 'default' : 'secondary'} className={`text-xs ${session.clicked ? 'bg-green-100 text-green-800' : ''}`}>
                                    {session.link_clicks || 0} clicks
                                  </Badge>
                                </div>
                                <div className="text-sm text-gray-600 flex gap-2 flex-wrap">
                                  <span>{session.started_at ? new Date(session.started_at).toLocaleString() : 'No date available'}</span>
                                  {session.last_click_at && (
                                    <span>• Last click {new Date(session.last_click_at).toLocaleString()}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewSession(session)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteSessionClick(session.id);
                                  }}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {chatSessions.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          {isLoadingLogs ? 'Loading chat sessions...' : 'No chat sessions yet.'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Session Details Dialog */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full m-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Chat Session Details</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedSession(null);
                  setSessionMessages([]);
                }}
              >
                ✕
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm text-gray-600">Session ID</div>
                <div className="font-medium">{selectedSession.id}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Started</div>
                <div className="font-medium">
                  {selectedSession.started_at ? new Date(selectedSession.started_at).toLocaleString() : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Messages</div>
                <div className="font-medium">{selectedSession.message_count}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Status</div>
                <div className="font-medium">
                  <span className={`px-2 py-1 rounded-full text-xs ${selectedSession.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {selectedSession.is_active ? 'Active' : 'Ended'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <h3 className="text-lg font-medium mb-3">Conversation</h3>
              {isLoadingSessionDetails ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : (
                <div className="overflow-y-auto max-h-96 space-y-3">
                  {(() => {
                    const msgs = [...(sessionMessages || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
                    const events = [...(sessionEvents || [])].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

                    if (msgs.length === 0 && events.length === 0) {
                      return (
                        <div className="text-center py-8 text-gray-500">No messages in this session yet.</div>
                      );
                    }

                    // Collect assistant messages for grouping
                    const assistantMsgs = msgs.filter(m => m.role === 'assistant');
                    const eventsByAssistant: Record<string, typeof events> = {};

                    // Helper to find the assistant message under which to display an event
                    const findHostAssistantId = (evTime: number): string | null => {
                      // Prefer the next assistant msg at/after the event; fallback to the last assistant msg before it
                      let candidate: ChatMessage | null = null;
                      for (let i = 0; i < assistantMsgs.length; i++) {
                        const am = assistantMsgs[i];
                        const t = new Date(am.created_at).getTime();
                        if (t >= evTime) { candidate = am; break; }
                      }
                      if (!candidate && assistantMsgs.length) candidate = assistantMsgs[assistantMsgs.length - 1];
                      return candidate ? candidate.id : null;
                    };

                    events.forEach(ev => {
                      const hostId = findHostAssistantId(new Date(ev.created_at).getTime());
                      if (!hostId) return;
                      (eventsByAssistant[hostId] ||= []).push(ev);
                    });

                    // Render messages, and for assistant messages, render their events beneath
                    return msgs.map((m, idx) => {
                      const bubble = (
                        <div key={`m-${idx}`} className={`p-3 rounded-lg ${m.role === 'user' ? 'bg-blue-50 ml-8' : 'bg-gray-50 mr-8'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium px-2 py-1 rounded ${m.role === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                              {m.role === 'user' ? 'User' : 'Assistant'}
                            </span>
                            <span className="text-xs text-gray-500">{new Date(m.created_at).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-sm">{m.content}</div>
                        </div>
                      );

                      if (m.role !== 'assistant') return bubble;

                      const evs = eventsByAssistant[m.id] || [];
                      if (evs.length === 0) return bubble;

                      return (
                        <div key={`mb-${idx}`} className="space-y-2">
                          {bubble}
                          {evs.map((ev, eidx) => {
                            const title = ev?.event_data?.link_name || ev?.event_data?.link_title || '';
                            const url = ev?.event_data?.link_url || '';
                            const isImpression = ev.event_type === 'offer_impression';
                            const label = isImpression ? 'Offer shown' : 'Link clicked';
                            return (
                              <div key={`e-${eidx}`} className="flex items-center justify-center">
                                <div className="text-[12px] text-gray-600 bg-gray-100 border border-gray-200 rounded px-2 py-1">
                                  {label}
                                  {title ? (
                                    <>
                                      : <span className="font-medium"> {title} </span>
                                      {url ? (
                                        <>
                                          (<a className="underline" href={url} target="_blank" rel="noreferrer">open</a>)
                                        </>
                                      ) : null}
                                    </>
                                  ) : null}
                                  <span className="ml-2 text-gray-400">{new Date(ev.created_at).toLocaleTimeString()}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Chat Widget - Always Visible */}
      {selectedSite && (
        <ChatWidget
          session={null}
          chatSettings={{ ...chatSettings, preferred_language: preferredLanguage || null }}
          siteId={selectedSite.id}
          introMessage={introMessage}
          apiUrl={API_URL}
          isEmbedded={false}
        />
      )}
      
      {/* Training Content Editor Modal */}
      <TrainingContentEditor
        material={selectedMaterialForEdit}
        isOpen={isContentEditorOpen}
        onClose={handleCloseEditor}
        onSave={handleMaterialSaved}
      />
      
      {/* Edit Link Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Offer Link</DialogTitle>
            <DialogDescription>
              Update the details for this offer link.
            </DialogDescription>
          </DialogHeader>
          {editingLink && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-url">URL</Label>
                <Input
                  id="edit-url"
                  value={editingLink.url}
                  onChange={(e) => setEditingLink({ ...editingLink, url: e.target.value })}
                  className="bg-white/80 border-gray-300 focus:border-gray-500"
                />
              </div>
              <div>
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editingLink.title}
                  onChange={(e) => setEditingLink({ ...editingLink, title: e.target.value })}
                  className="bg-white/80 border-gray-300 focus:border-gray-500"
                />
              </div>
              <div>
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editingLink.description}
                  onChange={(e) => setEditingLink({ ...editingLink, description: e.target.value })}
                  className="bg-white/80 border-gray-300 focus:border-gray-500"
                />
              </div>
              <div>
                <Label htmlFor="edit-image-url">Image URL (optional)</Label>
                <Input
                  id="edit-image-url"
                  value={editingLink.image_url || ''}
                  onChange={(e) => setEditingLink({ ...editingLink, image_url: e.target.value })}
                  placeholder="https://example.com/image.jpg"
                  className="bg-white/80 border-gray-300 focus:border-gray-500"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Add an image URL to display a product image in the chat. Leave empty if no image is needed.
                </p>
              </div>
              <div>
                <Label htmlFor="edit-button-text">Button Text (optional)</Label>
                <Input
                  id="edit-button-text"
                  value={editingLink.button_text || ''}
                  onChange={(e) => setEditingLink({ ...editingLink, button_text: e.target.value })}
                  placeholder="View Product"
                  className="bg-white/80 border-gray-300 focus:border-gray-500"
                />
                <p className="text-sm text-gray-600 mt-1">
                  Customize the call-to-action button text. Leave empty to use default &quot;View Product&quot;.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingLink(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveEditLink}
              disabled={isSaving}
              className="bg-gray-900 hover:bg-gray-800 text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this chat session? This action cannot be undone and will permanently remove all messages in this session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete Session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default Dashboard;
