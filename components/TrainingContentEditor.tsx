import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, X, Eye, EyeOff } from 'lucide-react';

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

interface TrainingContentEditorProps {
  material: TrainingMaterial | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (material: TrainingMaterial) => void;
}

export function TrainingContentEditor({ material, isOpen, onClose, onSave }: TrainingContentEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [contentType, setContentType] = useState('webpage');
  const [isSaving, setIsSaving] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const { toast } = useToast();

  // Initialize form when material changes
  useEffect(() => {
    if (material) {
      setTitle(material.title || '');
      setContent(material.content || '');
      setContentType(material.content_type || 'webpage');
    } else {
      setTitle('');
      setContent('');
      setContentType('webpage');
    }
  }, [material]);

  const handleSave = async () => {
    if (!material) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/training-materials/${material.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          content,
          content_type: contentType,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Success",
          description: "Training material updated successfully",
        });
        onSave(data.material);
        onClose();
      } else {
        throw new Error(data.error || 'Failed to update training material');
      }
    } catch (error) {
      console.error('Error saving training material:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update training material",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  };

  if (!material) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Edit Training Material</DialogTitle>
              <DialogDescription className="mt-1">
                View and edit the content that will be used to train your AI assistant.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
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
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div className="grid grid-cols-1 gap-4 h-full">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter material title"
                />
              </div>
              <div>
                <Label htmlFor="content_type">Content Type</Label>
                <Select value={contentType} onValueChange={setContentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webpage">Webpage</SelectItem>
                    <SelectItem value="article">Article</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="faq">FAQ</SelectItem>
                    <SelectItem value="documentation">Documentation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* URL Display */}
            <div>
              <Label>Source URL</Label>
              <div className="text-sm text-gray-600 p-2 bg-gray-50 rounded border break-all">
                {material.url}
              </div>
            </div>

            {/* Content Editor */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="content">Content</Label>
                <div className="flex items-center gap-2">
                  {content && (
                    <span className="text-sm text-gray-500">
                      {content.length.toLocaleString()} characters
                    </span>
                  )}
                  {material.last_scraped_at && (
                    <span className="text-sm text-gray-500">
                      Updated: {new Date(material.last_scraped_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter or paste training content here..."
                className="flex-1 min-h-[300px] max-h-[400px] resize-none font-mono text-sm"
              />
            </div>

            {/* Metadata Section */}
            {material.metadata && Object.keys(material.metadata).length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label>Metadata</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowMetadata(!showMetadata)}
                  >
                    {showMetadata ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showMetadata ? 'Hide' : 'Show'} Details
                  </Button>
                </div>
                {showMetadata && (
                  <div className="bg-gray-50 p-3 rounded border max-h-32 overflow-y-auto">
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                      {JSON.stringify(material.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Error Display */}
            {material.scrape_status === 'failed' && material.error_message && (
              <div className="p-3 bg-red-50 border border-red-200 rounded">
                <div className="text-sm font-medium text-red-800 mb-1">Scraping Error</div>
                <div className="text-sm text-red-700">{material.error_message}</div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-gray-900 hover:bg-gray-800"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-1" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}