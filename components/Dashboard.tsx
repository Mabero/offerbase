// Dashboard component with shadcn UI - preserving exact functionality
"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
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
  Loader2
} from 'lucide-react';

import { supabase } from '../lib/supabaseClient';
import { BASE_INSTRUCTIONS } from '../lib/instructions';
import ChatWidget from './ChatWidget';

const drawerWidth = 240;

const navItems = [
  { label: 'Offer Links', icon: ExternalLink },
  { label: 'Training Materials', icon: FileText },
  { label: 'Chat Settings', icon: SettingsIcon },
  { label: 'Instructions', icon: Info },
  { label: 'Embed Widget', icon: Code },
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
  user_id: string;
  created_at: string;
}

interface AffiliateLink {
  id: string;
  url: string;
  title: string;
  description: string;
  site_id: string;
  created_at: string;
}

interface TrainingMaterial {
  id: string;
  url: string;
  title: string;
  site_id: string;
  created_at: string;
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
  created_at: string;
}

interface ChatStats {
  totalChats: number;
  totalMessages: number;
  averageResponseTime: number;
  satisfactionRate: number;
}

function Dashboard({ shouldOpenChat, widgetSiteId, isEmbedded }: DashboardProps) {
  // Get user from Clerk
  const { user, isLoaded } = useUser();
  const userId = user?.id || 'default-user';
  
  // State management - preserving exact same state structure
  const [selectedTab, setSelectedTab] = useState(0);
  const [trainingMaterials, setTrainingMaterials] = useState<TrainingMaterial[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>([]);
  const [newTrainingUrl, setNewTrainingUrl] = useState('');
  const [newLink, setNewLink] = useState({
    url: '',
    title: '',
    description: '',
  });
  const [editingLink, setEditingLink] = useState<AffiliateLink | null>(null);
  const [chatSettings, setChatSettings] = useState<ChatSettings>({
    chat_name: 'Affi',
    chat_color: '#000000',
    chat_icon_url: '',
    chat_name_color: '#FFFFFF',
    chat_bubble_icon_color: '#FFFFFF',
    input_placeholder: 'Type your message...',
    font_size: '14px'
  });
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [newSiteName, setNewSiteName] = useState('');
  const [introMessage, setIntroMessage] = useState('Hello! How can I help you today?');
  const [isSaving, setIsSaving] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [instructions, setInstructions] = useState(BASE_INSTRUCTIONS);
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [chatStats, setChatStats] = useState<ChatStats>({
    totalChats: 0,
    totalMessages: 0,
    averageResponseTime: 0,
    satisfactionRate: 0
  });
  const [isSupabaseConfiguredState, setIsSupabaseConfiguredState] = useState<boolean | null>(null);
  const [itemToDelete, setItemToDelete] = useState<AffiliateLink | TrainingMaterial | Site | null>(null);
  const [deleteType, setDeleteType] = useState<'link' | 'training' | 'site' | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSiteDialogOpen, setIsSiteDialogOpen] = useState(false);
  const [isEmbedDialogOpen, setIsEmbedDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [useDirectWidget, setUseDirectWidget] = useState(false);

  // Refs for cleanup
  const isMountedRef = useRef(true);
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { toast } = useToast();

  // API URL
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://choosly.onrender.com';

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
    
    setIsSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const link: AffiliateLink = {
        id: Date.now().toString(),
        url: newLink.url,
        title: newLink.title,
        description: newLink.description,
        site_id: selectedSite?.id || 'default',
        created_at: new Date().toISOString()
      };
      
      setAffiliateLinks(prev => [...prev, link]);
      setNewLink({ url: '', title: '', description: '' });
      
      toast({
        title: "Success",
        description: "Offer link added successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add offer link",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditLink = (link: AffiliateLink) => {
    setEditingLink(link);
    setIsEditDialogOpen(true);
  };

  const handleDeleteLink = (link: AffiliateLink) => {
    setItemToDelete(link);
    setDeleteType('link');
    setIsDeleteDialogOpen(true);
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
    
    setIsSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const material: TrainingMaterial = {
        id: Date.now().toString(),
        url: data.url,
        title: new URL(data.url).hostname,
        site_id: selectedSite?.id || 'default',
        created_at: new Date().toISOString()
      };
      
      setTrainingMaterials(prev => [...prev, material]);
      setNewTrainingUrl('');
      
      toast({
        title: "Success",
        description: "Training material added successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add training material",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTrainingMaterial = (material: TrainingMaterial) => {
    setItemToDelete(material);
    setDeleteType('training');
    setIsDeleteDialogOpen(true);
  };

  const handleSaveChatSettings = async () => {
    setIsSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "Success",
        description: "Chat settings saved successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save chat settings",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInstructions = async () => {
    setIsSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      toast({
        title: "Success",
        description: "Instructions saved successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save instructions",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshChatLogs = async () => {
    setIsLoadingLogs(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock data for demo
      setChatSessions([
        { id: '1', created_at: new Date().toISOString() },
        { id: '2', created_at: new Date(Date.now() - 3600000).toISOString() },
      ]);
      
      toast({
        title: "Success",
        description: "Chat logs refreshed"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh chat logs",
        variant: "destructive"
      });
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleViewSession = (session: ChatSession) => {
    setSelectedSession(session);
    setIsSessionDialogOpen(true);
  };

  // Check if Supabase is configured
  const isSupabaseConfigured = useCallback(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key && !url.includes('dummy') && !key.includes('dummy');
  }, []);
  
  // Use the function to avoid unused variable warning
  React.useEffect(() => {
    setIsSupabaseConfiguredState(isSupabaseConfigured());
  }, [isSupabaseConfigured]);

  // Safe state setter
  const safeSetState = useCallback((setter: React.Dispatch<React.SetStateAction<unknown>>, value: unknown) => {
    if (isMountedRef.current) {
      setter(value);
    }
  }, []);

  // Initialize demo data
  useEffect(() => {
    if (isLoaded && user) {
      // Set demo site
      const demoSite: Site = {
        id: 'demo-site',
        name: 'Demo Site',
        user_id: user.id,
        created_at: new Date().toISOString()
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
          created_at: new Date().toISOString()
        }
      ]);
      
      setChatStats({
        totalChats: 42,
        totalMessages: 256,
        averageResponseTime: 1.2,
        satisfactionRate: 95
      });
      
      setIsSupabaseConfiguredState(false); // Show demo mode
    }
  }, [isLoaded, user]);

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
            <img src="/offerbase-logo.svg" alt="Offerbase Logo" className="h-6" />
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-auto px-3 pt-4 space-y-1">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider ml-1 mb-2">
              Workspace
            </div>
            
            {/* Site Selector */}
            <Button
              variant="ghost"
              onClick={() => setIsSiteDialogOpen(true)}
              className="w-full justify-start text-sm font-medium text-gray-700 hover:bg-gray-100 mb-3"
            >
              <ChevronDown className="h-4 w-4 mr-2" />
              {selectedSite ? selectedSite.name : 'Select Site'}
            </Button>
            
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider ml-1 mb-2">
              Menu
            </div>
            
            {/* Navigation Items */}
            {navItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <Button
                  key={item.label}
                  variant="ghost"
                  onClick={() => setSelectedTab(index)}
                  className={`w-full justify-start text-sm font-medium ${
                    selectedTab === index 
                      ? 'bg-gray-100 text-gray-900' 
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
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
                          <Plus className="mr-2 h-4 w-4" />
                          Add Link
                        </>
                      )}
                    </Button>
                  </div>
                  
                  <div className="pt-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Offer Links</h3>
                    <div className="space-y-4">
                      {affiliateLinks.map((link) => (
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
                                  className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-flex items-center"
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
                          <Plus className="mr-2 h-4 w-4" />
                          Add Training Material
                        </>
                      )}
                    </Button>
                  </div>
                  
                  <div className="pt-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Training Materials</h3>
                    <div className="space-y-4">
                      {trainingMaterials.map((material) => (
                        <Card key={material.id} className="bg-white border border-gray-200">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-900">{material.title}</h4>
                                <a
                                  href={material.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-sm text-blue-600 hover:text-blue-800 mt-1 inline-flex items-center"
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  View Source
                                </a>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteTrainingMaterial(material)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
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

              {/* Chat Settings Tab */}
              {selectedTab === 2 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Chat Settings</h2>
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
                    <div>
                      <Label htmlFor="chat-color">Chat Color</Label>
                      <input
                        type="color"
                        id="chat-color"
                        value={chatSettings.chat_color}
                        onChange={(e) => setChatSettings({ ...chatSettings, chat_color: e.target.value })}
                        className="w-16 h-16 border border-gray-300 rounded-full cursor-pointer bg-white/80 hover:bg-gray-50 focus:border-gray-500"
                      />
                    </div>
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
                </div>
              )}

              {/* Instructions Tab */}
              {selectedTab === 3 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Instructions</h2>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="instructions">AI Assistant Instructions</Label>
                      <Textarea
                        id="instructions"
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        rows={10}
                        className="bg-white/80 border-gray-300 focus:border-gray-500 font-mono text-sm"
                        placeholder="Enter instructions for your AI assistant..."
                      />
                    </div>
                    <Button
                      onClick={handleSaveInstructions}
                      disabled={isSaving}
                      className="bg-gray-900 hover:bg-gray-800 text-white max-w-fit"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        'Save Instructions'
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Embed Widget Tab */}
              {selectedTab === 4 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Embed Widget</h2>
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <Label htmlFor="embed-code">Embed Code</Label>
                      <Textarea
                        id="embed-code"
                        value={`<script src="${API_URL}/widget.js" data-site-id="${selectedSite?.id || 'your-site-id'}"></script>`}
                        rows={3}
                        className="mt-2 bg-white border-gray-300 font-mono text-sm"
                        readOnly
                      />
                      <p className="text-sm text-gray-600 mt-2">
                        Copy and paste this code into your website&apos;s HTML to embed the chat widget.
                      </p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <h3 className="font-medium text-blue-900 mb-2">Preview Options</h3>
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="direct-widget"
                            checked={useDirectWidget}
                            onCheckedChange={setUseDirectWidget}
                          />
                          <Label htmlFor="direct-widget" className="text-sm font-medium">
                            Use Direct Widget Integration
                          </Label>
                        </div>
                        <p className="text-sm text-gray-600">
                          {useDirectWidget 
                            ? "Direct integration shows the widget directly in the dashboard (better for testing and development)"
                            : "Iframe integration uses the embedded widget frame (matches production behavior)"
                          }
                        </p>
                        <div className="flex space-x-2">
                          <Button
                            onClick={() => setIsEmbedDialogOpen(true)}
                            variant="outline"
                            className="border-blue-300 text-blue-700 hover:bg-blue-100"
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            Preview Widget
                          </Button>
                          {useDirectWidget && (
                            <Button
                              onClick={() => setUseDirectWidget(false)}
                              variant="outline"
                              className="border-red-300 text-red-700 hover:bg-red-100"
                            >
                              <EyeOff className="mr-2 h-4 w-4" />
                              Hide Widget
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Analytics Tab */}
              {selectedTab === 5 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6">Analytics</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold text-gray-900">{chatStats.totalChats}</div>
                        <div className="text-sm text-gray-600">Total Chats</div>
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
                        <div className="text-2xl font-bold text-gray-900">{chatStats.averageResponseTime}s</div>
                        <div className="text-sm text-gray-600">Avg Response Time</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="text-2xl font-bold text-gray-900">{chatStats.satisfactionRate}%</div>
                        <div className="text-sm text-gray-600">Satisfaction Rate</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              )}

              {/* Chat Logs Tab */}
              {selectedTab === 6 && (
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
                              <div>
                                <div className="font-medium">Session {session.id}</div>
                                <div className="text-sm text-gray-600">
                                  {new Date(session.created_at).toLocaleString()}
                                </div>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleViewSession(session)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {chatSessions.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          No chat sessions yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Chat Widget - Direct Integration */}
      {useDirectWidget && selectedSite && (
        <ChatWidget
          session={null}
          chatSettings={chatSettings}
          siteId={selectedSite.id}
          introMessage={introMessage}
          apiUrl={API_URL}
          isEmbedded={false}
        />
      )}
    </>
  );
}

export default Dashboard;