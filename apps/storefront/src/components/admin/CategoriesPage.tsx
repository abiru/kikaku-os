'use client'

import { useState } from 'react'
import CategoriesTable from './CategoriesTable'
import { Button } from '../catalyst/button'
import { Input } from '../catalyst/input'
import { Field, Label, Fieldset } from '../catalyst/fieldset'
import { Dialog, DialogTitle, DialogBody, DialogActions } from '../catalyst/dialog'

type Category = {
  category: string
  product_count: number
}

type Props = {
  categories: Category[]
}

export default function CategoriesPage({ categories }: Props) {
  const [renameModal, setRenameModal] = useState<{ open: boolean; category: string }>({ open: false, category: '' })
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; category: string; count: number }>({ open: false, category: '', count: 0 })
  const [newName, setNewName] = useState('')
  const [moveTo, setMoveTo] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleRename = (category: string) => {
    setRenameModal({ open: true, category })
    setNewName('')
    setRenameError(null)
  }

  const handleDelete = (category: string, count: number) => {
    setDeleteModal({ open: true, category, count })
    setMoveTo('')
    setDeleteError(null)
  }

  const closeRenameModal = () => {
    setRenameModal({ open: false, category: '' })
  }

  const closeDeleteModal = () => {
    setDeleteModal({ open: false, category: '', count: 0 })
  }

  const submitRename = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = newName.trim()

    if (!trimmedName) {
      setRenameError('New name is required')
      return
    }

    if (trimmedName === renameModal.category) {
      setRenameError('New name must be different from current name')
      return
    }

    try {
      const res = await fetch(`/api/admin/categories/${encodeURIComponent(renameModal.category)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newName: trimmedName })
      })

      const data = await res.json()

      if (!res.ok) {
        setRenameError(data.message || 'Failed to rename category')
        return
      }

      window.location.reload()
    } catch {
      setRenameError('An error occurred. Please try again.')
    }
  }

  const submitDelete = async (e: React.FormEvent) => {
    e.preventDefault()
    const moveToValue = moveTo.trim() || null

    try {
      const res = await fetch(`/api/admin/categories/${encodeURIComponent(deleteModal.category)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ moveTo: moveToValue })
      })

      const data = await res.json()

      if (!res.ok) {
        setDeleteError(data.message || 'Failed to delete category')
        return
      }

      window.location.reload()
    } catch {
      setDeleteError('An error occurred. Please try again.')
    }
  }

  return (
    <>
      <CategoriesTable
        categories={categories}
        onRename={handleRename}
        onDelete={handleDelete}
      />

      {/* Rename Modal */}
      <Dialog open={renameModal.open} onClose={closeRenameModal} size="md">
        <DialogTitle>Rename Category</DialogTitle>
        <DialogBody>
          <form id="rename-form" onSubmit={submitRename} className="space-y-4">
            <Fieldset>
              <Field>
                <Label>Current Name</Label>
                <Input type="text" value={renameModal.category} readOnly className="text-zinc-500 bg-zinc-50" />
              </Field>
              <Field>
                <Label>New Name *</Label>
                <Input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  placeholder="Enter new category name"
                  autoFocus
                />
              </Field>
            </Fieldset>

            {renameError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {renameError}
              </div>
            )}
          </form>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={closeRenameModal}>
            Cancel
          </Button>
          <Button type="submit" form="rename-form" color="indigo">
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Modal */}
      <Dialog open={deleteModal.open} onClose={closeDeleteModal} size="md">
        <DialogTitle>Delete Category</DialogTitle>
        <DialogBody>
          <form id="delete-form" onSubmit={submitDelete} className="space-y-4">
            <p className="text-sm text-zinc-950">
              Are you sure you want to delete the category "<span className="font-medium">{deleteModal.category}</span>"?
            </p>
            <p className="text-sm text-zinc-500">
              {deleteModal.count} product(s) will have their category removed.
            </p>

            <Fieldset>
              <Field>
                <Label>Move products to (optional)</Label>
                <Input
                  type="text"
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  placeholder="Leave empty to remove category from products"
                />
              </Field>
            </Fieldset>

            {deleteError && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
                {deleteError}
              </div>
            )}
          </form>
        </DialogBody>
        <DialogActions>
          <Button type="button" plain onClick={closeDeleteModal}>
            Cancel
          </Button>
          <Button type="submit" form="delete-form" color="red">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
