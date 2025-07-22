'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { ChevronDown, Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react'
import { toast } from 'sonner'

interface Site {
  id: string
  name: string
  created_at: string
  updated_at: string
}

interface SiteSelectorProps {
  selectedSite: Site | null
  onSiteSelect: (site: Site) => void
  onSiteChange: () => void
  className?: string
}

export function SiteSelector({
  selectedSite,
  onSiteSelect,
  onSiteChange,
  className = '',
}: SiteSelectorProps) {
  const { getToken } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [editingSiteId, setEditingSiteId] = useState<string | null>(null)
  const [editSiteName, setEditSiteName] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [siteToDelete, setSiteToDelete] = useState<Site | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  
  const newSiteInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)

  const fetchSites = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/sites', {
        credentials: 'include',
      })
      const data = await response.json()
      
      if (response.ok) {
        setSites(data.sites)
      } else {
        console.error('Failed to fetch sites:', data.error)
        if (response.status === 401) {
          toast.error('Session expired. Please log in again.')
        } else {
          toast.error(data.error || 'Failed to fetch sites')
        }
      }
    } catch (error) {
      console.error('Error fetching sites:', error)
      toast.error('Error fetching sites')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (dropdownOpen) {
      fetchSites()
    }
  }, [dropdownOpen])

  useEffect(() => {
    if (isCreating && newSiteInputRef.current) {
      newSiteInputRef.current.focus()
    }
  }, [isCreating])

  useEffect(() => {
    if (editingSiteId && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editingSiteId])

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
        credentials: 'include',
      })

      const data = await response.json()

      if (response.ok) {
        setSites([data.site, ...sites])
        setNewSiteName('')
        setIsCreating(false)
        onSiteSelect(data.site)
        onSiteChange()
        toast.success('Site created successfully')
      } else {
        if (response.status === 401) {
          toast.error('Session expired. Please log in again.')
        } else {
          toast.error(data.error || 'Failed to create site')
        }
      }
    } catch (error) {
      console.error('Error creating site:', error)
      toast.error('Error creating site')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpdateSite = async (siteId: string) => {
    if (!editSiteName.trim()) {
      toast.error('Site name is required')
      return
    }

    setActionLoading(true)
    try {
      const response = await fetch(`/api/sites/${siteId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: editSiteName.trim() }),
        credentials: 'include',
      })

      const data = await response.json()

      if (response.ok) {
        const updatedSites = sites.map(site =>
          site.id === siteId ? data.site : site
        )
        setSites(updatedSites)
        setEditingSiteId(null)
        setEditSiteName('')
        
        // Update selected site if it's the one being edited
        if (selectedSite?.id === siteId) {
          onSiteSelect(data.site)
        }
        
        onSiteChange()
        toast.success('Site updated successfully')
      } else {
        if (response.status === 401) {
          toast.error('Session expired. Please log in again.')
        } else {
          toast.error(data.error || 'Failed to update site')
        }
      }
    } catch (error) {
      console.error('Error updating site:', error)
      toast.error('Error updating site')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteSite = async () => {
    if (!siteToDelete) return

    setActionLoading(true)
    try {
      const response = await fetch(`/api/sites/${siteToDelete.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (response.ok) {
        const updatedSites = sites.filter(site => site.id !== siteToDelete.id)
        setSites(updatedSites)
        
        // If the deleted site was selected, select the first available site or null
        if (selectedSite?.id === siteToDelete.id) {
          const newSelectedSite = updatedSites[0] || null
          onSiteSelect(newSelectedSite)
        }
        
        onSiteChange()
        toast.success('Site deleted successfully')
      } else {
        const data = await response.json()
        if (response.status === 401) {
          toast.error('Session expired. Please log in again.')
        } else {
          toast.error(data.error || 'Failed to delete site')
        }
      }
    } catch (error) {
      console.error('Error deleting site:', error)
      toast.error('Error deleting site')
    } finally {
      setActionLoading(false)
      setDeleteDialogOpen(false)
      setSiteToDelete(null)
    }
  }

  const startEdit = (site: Site, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSiteId(site.id)
    setEditSiteName(site.name)
  }

  const cancelEdit = () => {
    setEditingSiteId(null)
    setEditSiteName('')
  }

  const openDeleteDialog = (site: Site, e: React.MouseEvent) => {
    e.stopPropagation()
    setSiteToDelete(site)
    setDeleteDialogOpen(true)
  }

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={`w-full justify-between ${className}`}>
            <span className="truncate">
              {selectedSite ? selectedSite.name : 'Select site'}
            </span>
            <ChevronDown className="w-4 h-4 ml-2 flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuLabel>Sites</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : sites.length === 0 && !isCreating ? (
            <div className="text-center py-4 px-2 text-sm text-muted-foreground">
              No sites yet. Create your first site below.
            </div>
          ) : (
            <>
              {sites.map((site) => (
                <DropdownMenuItem
                  key={site.id}
                  className="p-0"
                  onSelect={(e) => {
                    e.preventDefault()
                  }}
                >
                  {editingSiteId === site.id ? (
                    <div className="flex items-center w-full p-2 gap-1">
                      <Input
                        ref={editInputRef}
                        value={editSiteName}
                        onChange={(e) => setEditSiteName(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') {
                            handleUpdateSite(site.id)
                          } else if (e.key === 'Escape') {
                            cancelEdit()
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-7 text-sm"
                        disabled={actionLoading}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUpdateSite(site.id)
                        }}
                        disabled={actionLoading}
                      >
                        {actionLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          cancelEdit()
                        }}
                        disabled={actionLoading}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-between w-full p-2 cursor-pointer hover:bg-accent"
                      onClick={() => {
                        onSiteSelect(site)
                        setDropdownOpen(false)
                      }}
                    >
                      <span className="text-sm truncate flex-1">{site.name}</span>
                      <div className="flex items-center gap-1 ml-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={(e) => startEdit(site, e)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={(e) => openDeleteDialog(site, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </DropdownMenuItem>
              ))}
            </>
          )}
          
          <DropdownMenuSeparator />
          
          {isCreating ? (
            <div className="flex items-center gap-1 p-2">
              <Input
                ref={newSiteInputRef}
                value={newSiteName}
                onChange={(e) => setNewSiteName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    handleCreateSite()
                  } else if (e.key === 'Escape') {
                    setIsCreating(false)
                    setNewSiteName('')
                  }
                }}
                placeholder="Site name"
                className="h-8 text-sm"
                disabled={actionLoading}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={handleCreateSite}
                disabled={actionLoading}
              >
                {actionLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => {
                  setIsCreating(false)
                  setNewSiteName('')
                }}
                disabled={actionLoading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                setIsCreating(true)
              }}
              className="cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create New Site
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the site
              &quot;{siteToDelete?.name}&quot; and all associated data including
              affiliate links, training materials, and chat settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteDialogOpen(false)
                setSiteToDelete(null)
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