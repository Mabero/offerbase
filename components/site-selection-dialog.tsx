'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChevronDown, Plus, Edit, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Site {
  id: string
  name: string
  created_at: string
  updated_at: string
}

interface SiteSelectionDialogProps {
  selectedSite: Site | null
  onSiteSelect: (site: Site) => void
  onSiteChange: () => void
}

export function SiteSelectionDialog({
  selectedSite,
  onSiteSelect,
  onSiteChange,
}: SiteSelectionDialogProps) {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedSiteForAction, setSelectedSiteForAction] = useState<Site | null>(null)
  const [newSiteName, setNewSiteName] = useState('')
  const [editSiteName, setEditSiteName] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchSites = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sites')
      const data = await response.json()
      
      if (response.ok) {
        setSites(data.sites)
      } else {
        toast.error('Failed to fetch sites')
      }
    } catch (error) {
      toast.error('Error fetching sites')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (dialogOpen) {
      fetchSites()
    }
  }, [dialogOpen])

  const handleCreateSite = async () => {
    if (!newSiteName.trim()) {
      toast.error('Site name is required')
      return
    }

    setActionLoading(true)
    try {
      const response = await fetch('/api/sites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newSiteName.trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        setSites([data.site, ...sites])
        setNewSiteName('')
        setCreateDialogOpen(false)
        onSiteSelect(data.site)
        onSiteChange()
        toast.success('Site created successfully')
      } else {
        toast.error(data.error || 'Failed to create site')
      }
    } catch (error) {
      toast.error('Error creating site')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpdateSite = async () => {
    if (!selectedSiteForAction || !editSiteName.trim()) {
      toast.error('Site name is required')
      return
    }

    setActionLoading(true)
    try {
      const response = await fetch(`/api/sites/${selectedSiteForAction.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: editSiteName.trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        const updatedSites = sites.map(site =>
          site.id === selectedSiteForAction.id ? data.site : site
        )
        setSites(updatedSites)
        setEditDialogOpen(false)
        setSelectedSiteForAction(null)
        setEditSiteName('')
        
        // Update selected site if it's the one being edited
        if (selectedSite?.id === selectedSiteForAction.id) {
          onSiteSelect(data.site)
        }
        
        onSiteChange()
        toast.success('Site updated successfully')
      } else {
        toast.error(data.error || 'Failed to update site')
      }
    } catch (error) {
      toast.error('Error updating site')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteSite = async () => {
    if (!selectedSiteForAction) return

    setActionLoading(true)
    try {
      const response = await fetch(`/api/sites/${selectedSiteForAction.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        const updatedSites = sites.filter(site => site.id !== selectedSiteForAction.id)
        setSites(updatedSites)
        setDeleteDialogOpen(false)
        setSelectedSiteForAction(null)
        
        // If the deleted site was selected, select the first available site or null
        if (selectedSite?.id === selectedSiteForAction.id) {
          const newSelectedSite = updatedSites[0] || null
          onSiteSelect(newSelectedSite)
        }
        
        onSiteChange()
        toast.success('Site deleted successfully')
      } else {
        const data = await response.json()
        toast.error(data.error || 'Failed to delete site')
      }
    } catch (error) {
      toast.error('Error deleting site')
    } finally {
      setActionLoading(false)
    }
  }

  const openEditDialog = (site: Site) => {
    setSelectedSiteForAction(site)
    setEditSiteName(site.name)
    setEditDialogOpen(true)
  }

  const openDeleteDialog = (site: Site) => {
    setSelectedSiteForAction(site)
    setDeleteDialogOpen(true)
  }

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="justify-between">
            <span>{selectedSite ? selectedSite.name : 'Select site'}</span>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select Site</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Button
              onClick={() => setCreateDialogOpen(true)}
              className="w-full"
              variant="outline"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Site
            </Button>
            
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : sites.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No sites found. Create your first site to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {sites.map((site) => (
                  <div
                    key={site.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <button
                        onClick={() => {
                          onSiteSelect(site)
                          setDialogOpen(false)
                        }}
                        className="text-left w-full hover:text-primary"
                      >
                        <div className="font-medium">{site.name}</div>
                        <div className="text-sm text-muted-foreground">
                          Created {new Date(site.created_at).toLocaleDateString()}
                        </div>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditDialog(site)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openDeleteDialog(site)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Site Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Site</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="site-name">Site Name</Label>
              <Input
                id="site-name"
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                placeholder="Enter site name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateSite()
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCreateDialogOpen(false)
                  setNewSiteName('')
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateSite} disabled={actionLoading}>
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Site
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Site Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Site</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-site-name">Site Name</Label>
              <Input
                id="edit-site-name"
                value={editSiteName}
                onChange={(e) => setEditSiteName(e.target.value)}
                placeholder="Enter site name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleUpdateSite()
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false)
                  setSelectedSiteForAction(null)
                  setEditSiteName('')
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdateSite} disabled={actionLoading}>
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Update Site
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Site Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the site
              &quot;{selectedSiteForAction?.name}&quot; and all associated data including
              affiliate links, training materials, and chat settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteDialogOpen(false)
                setSelectedSiteForAction(null)
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSite}
              disabled={actionLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Site
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}