"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Loader2, 
  Search,
  Globe,
  Link as LinkIcon,
  AlertCircle,
  Check,
  X,
  TestTube,
  Settings
} from 'lucide-react';
import { 
  PredefinedQuestion, 
  PredefinedQuestionFormData, 
  UrlRuleFormData,
  CreatePredefinedQuestionRequest,
  UpdatePredefinedQuestionRequest,
  UrlRuleType
} from '@/types/predefined-questions';

interface PredefinedQuestionsManagerProps {
  siteId: string;
}

interface QuestionWithRules extends PredefinedQuestion {
  question_url_rules: Array<{
    id: string;
    question_id: string;
    rule_type: UrlRuleType;
    pattern: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  }>;
}

export function PredefinedQuestionsManager({ siteId }: PredefinedQuestionsManagerProps) {
  const { toast } = useToast();
  
  // State management
  const [questions, setQuestions] = useState<QuestionWithRules[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  // Form states
  const [editingQuestion, setEditingQuestion] = useState<QuestionWithRules | null>(null);
  const [questionToDelete, setQuestionToDelete] = useState<QuestionWithRules | null>(null);
  const [formData, setFormData] = useState<PredefinedQuestionFormData>({
    question: '',
    answer: '',
    priority: 0,
    is_site_wide: false,
    is_active: true,
    url_rules: []
  });

  // Load questions from API
  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/predefined-questions?siteId=${siteId}&limit=100`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setQuestions(data.questions || []);
    } catch (error) {
      console.error('Error loading predefined questions:', error);
      toast({
        title: "Error",
        description: "Failed to load predefined questions. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Create new question
  const handleCreateQuestion = async () => {
    try {
      setIsSaving(true);
      
      const requestData: CreatePredefinedQuestionRequest & { siteId: string } = {
        siteId,
        question: formData.question.trim(),
        answer: formData.answer.trim(),
        priority: formData.priority,
        is_site_wide: formData.is_site_wide,
        is_active: formData.is_active,
        url_rules: formData.url_rules.filter(rule => rule.pattern.trim()).map(rule => ({
          rule_type: rule.rule_type,
          pattern: rule.pattern.trim(),
          is_active: rule.is_active
        }))
      };

      const response = await fetch('/api/predefined-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setQuestions(prev => [data.question, ...prev]);
      
      toast({
        title: "Success",
        description: "Predefined question created successfully!"
      });
      
      setIsCreateDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error creating question:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create question",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Update existing question
  const handleUpdateQuestion = async () => {
    if (!editingQuestion) return;
    
    try {
      setIsSaving(true);
      
      const requestData: UpdatePredefinedQuestionRequest = {
        question: formData.question.trim(),
        answer: formData.answer.trim(),
        priority: formData.priority,
        is_site_wide: formData.is_site_wide,
        is_active: formData.is_active,
        url_rules: formData.url_rules.map(rule => ({
          id: rule.id,
          rule_type: rule.rule_type,
          pattern: rule.pattern.trim(),
          is_active: rule.is_active,
          _delete: rule.isDeleted
        }))
      };

      const response = await fetch(`/api/predefined-questions/${editingQuestion.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? data.question : q));
      
      toast({
        title: "Success",
        description: "Predefined question updated successfully!"
      });
      
      setIsEditDialogOpen(false);
      setEditingQuestion(null);
      resetForm();
    } catch (error) {
      console.error('Error updating question:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update question",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete question
  const handleDeleteQuestion = async () => {
    if (!questionToDelete) return;
    
    try {
      setIsSaving(true);
      
      const response = await fetch(`/api/predefined-questions/${questionToDelete.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      setQuestions(prev => prev.filter(q => q.id !== questionToDelete.id));
      
      toast({
        title: "Success",
        description: "Predefined question deleted successfully!"
      });
      
      setIsDeleteDialogOpen(false);
      setQuestionToDelete(null);
    } catch (error) {
      console.error('Error deleting question:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete question",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Form helpers
  const resetForm = () => {
    setFormData({
      question: '',
      answer: '',
      priority: 0,
      is_site_wide: false,
      is_active: true,
      url_rules: []
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const openEditDialog = (question: QuestionWithRules) => {
    setEditingQuestion(question);
    setFormData({
      question: question.question,
      answer: question.answer || '',
      priority: question.priority,
      is_site_wide: question.is_site_wide,
      is_active: question.is_active,
      url_rules: question.question_url_rules?.map(rule => ({
        id: rule.id,
        rule_type: rule.rule_type,
        pattern: rule.pattern,
        is_active: rule.is_active,
        isNew: false,
        isDeleted: false
      })) || []
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (question: QuestionWithRules) => {
    setQuestionToDelete(question);
    setIsDeleteDialogOpen(true);
  };

  // URL Rules management
  const addUrlRule = () => {
    const newRule: UrlRuleFormData = {
      rule_type: 'contains',
      pattern: '',
      is_active: true,
      isNew: true,
      isDeleted: false
    };
    setFormData(prev => ({
      ...prev,
      url_rules: [...prev.url_rules, newRule]
    }));
  };

  const updateUrlRule = (index: number, updates: Partial<UrlRuleFormData>) => {
    setFormData(prev => ({
      ...prev,
      url_rules: prev.url_rules.map((rule, i) => 
        i === index ? { ...rule, ...updates } : rule
      )
    }));
  };

  const removeUrlRule = (index: number) => {
    setFormData(prev => ({
      ...prev,
      url_rules: prev.url_rules.map((rule, i) => 
        i === index ? { ...rule, isDeleted: true } : rule
      ).filter(rule => !rule.isNew || !rule.isDeleted)
    }));
  };

  // Filter questions based on search
  const filteredQuestions = questions.filter(question =>
    question.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (question.answer || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Load questions on component mount
  useEffect(() => {
    if (siteId) {
      loadQuestions();
    }
  }, [siteId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Predefined Questions</h2>
          <p className="text-sm text-gray-600 mt-1">
            Create questions that appear in your chat widget based on the URL visitors are viewing.
          </p>
        </div>
        <Button onClick={openCreateDialog} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Question
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search questions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : filteredQuestions.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <div className="text-gray-500">
                {searchQuery ? (
                  <>No questions match your search.</>
                ) : (
                  <>
                    <p className="mb-2">No predefined questions yet.</p>
                    <p className="text-sm">Click &quot;Add Question&quot; to create your first one!</p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredQuestions.map((question) => (
            <Card key={question.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle className="text-base font-medium">
                        {question.question}
                      </CardTitle>
                      {!question.is_active && (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                      {question.is_site_wide && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          Site-wide
                        </Badge>
                      )}
                      {question.priority > 0 && (
                        <Badge variant="default" className="text-xs">
                          Priority {question.priority}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-sm">
                      {question.answer && question.answer.length > 150 
                        ? `${question.answer.substring(0, 150)}...` 
                        : question.answer || 'AI will handle this question naturally'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEditDialog(question)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDeleteDialog(question)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              {/* URL Rules Display */}
              {question.question_url_rules && question.question_url_rules.length > 0 && (
                <CardContent className="pt-0">
                  <div className="text-xs text-gray-500 mb-2">URL Rules:</div>
                  <div className="flex flex-wrap gap-1">
                    {question.question_url_rules.map((rule) => (
                      <Badge 
                        key={rule.id} 
                        variant="outline" 
                        className="text-xs flex items-center gap-1"
                      >
                        <LinkIcon className="h-3 w-3" />
                        {rule.rule_type}: {rule.pattern}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen || isEditDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateDialogOpen(false);
          setIsEditDialogOpen(false);
          setEditingQuestion(null);
          resetForm();
        }
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingQuestion ? 'Edit Question' : 'Add New Question'}
            </DialogTitle>
            <DialogDescription>
              Create a question that appears in your chat widget. You can target specific URLs or make it site-wide.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Question */}
            <div>
              <Label htmlFor="question">Question *</Label>
              <Input
                id="question"
                value={formData.question}
                onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
                placeholder="What would you like to ask?"
                maxLength={500}
              />
              <div className="text-xs text-gray-500 mt-1">
                {formData.question.length}/500 characters
              </div>
            </div>

            {/* Answer */}
            <div>
              <Label htmlFor="answer">Answer (optional)</Label>
              <Textarea
                id="answer"
                value={formData.answer}
                onChange={(e) => setFormData(prev => ({ ...prev, answer: e.target.value }))}
                placeholder="Leave empty for AI to handle naturally, or provide a specific answer..."
                rows={4}
                maxLength={2000}
              />
              <div className="text-xs text-gray-500 mt-1">
                {formData.answer.length}/2000 characters • If empty, AI will generate responses naturally
              </div>
            </div>

            {/* Priority */}
            <div>
              <Label htmlFor="priority">Priority (0-100)</Label>
              <Input
                id="priority"
                type="number"
                min="0"
                max="100"
                value={formData.priority}
                onChange={(e) => setFormData(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                placeholder="0"
              />
              <div className="text-xs text-gray-500 mt-1">
                Higher priority questions appear first
              </div>
            </div>

            {/* Settings */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Site-wide Question</Label>
                  <div className="text-xs text-gray-500">Show on all pages by default</div>
                </div>
                <Switch
                  checked={formData.is_site_wide}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_site_wide: checked }))}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>Active</Label>
                  <div className="text-xs text-gray-500">Question appears in widget</div>
                </div>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                />
              </div>
            </div>

            {/* URL Rules */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label>URL Rules</Label>
                  <div className="text-xs text-gray-500">Target specific pages</div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addUrlRule}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Rule
                </Button>
              </div>

              <div className="space-y-3">
                {formData.url_rules.filter(rule => !rule.isDeleted).map((rule, index) => (
                  <div key={index} className="flex items-center gap-2 p-3 border rounded-lg">
                    <select
                      value={rule.rule_type}
                      onChange={(e) => updateUrlRule(index, { rule_type: e.target.value as UrlRuleType })}
                      className="px-2 py-1 border rounded text-sm"
                    >
                      <option value="contains">Contains</option>
                      <option value="exact">Exact Match</option>
                      <option value="exclude">Exclude</option>
                    </select>
                    
                    <Input
                      value={rule.pattern}
                      onChange={(e) => updateUrlRule(index, { pattern: e.target.value })}
                      placeholder="/products/ or https://example.com/page"
                      className="flex-1"
                    />
                    
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={(checked) => updateUrlRule(index, { is_active: checked })}
                    />
                    
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => removeUrlRule(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setIsEditDialogOpen(false);
                setEditingQuestion(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={editingQuestion ? handleUpdateQuestion : handleCreateQuestion}
              disabled={isSaving || !formData.question.trim()}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingQuestion ? 'Update Question' : 'Create Question'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Question</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this predefined question? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {questionToDelete && (
            <div className="py-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="font-medium text-sm">{questionToDelete.question}</div>
                <div className="text-xs text-gray-600 mt-1">
                  {(questionToDelete.answer || 'AI will handle naturally').substring(0, 100)}
                  {(questionToDelete.answer || '').length > 100 && '...'}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteQuestion}
              disabled={isSaving}
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}