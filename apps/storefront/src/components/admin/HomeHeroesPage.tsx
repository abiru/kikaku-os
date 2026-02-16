import { useState } from 'react'
import HomeHeroesTable from './HomeHeroesTable'

type Hero = {
  id: number
  position: number
  title: string
  subtitle: string
  status: string
  updated_at: string
}

type Props = {
  heroes: Hero[]
}

export default function HomeHeroesPage({ heroes }: Props) {
  const [error, setError] = useState<string | null>(null)

  const handleArchive = async (id: number) => {
    if (!confirm('Archive this hero section?')) return

    setError(null)
    try {
      const res = await fetch(`/api/admin/home/heroes/${id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        window.location.reload()
      } else {
        setError('Failed to archive hero section')
      }
    } catch (err) {
      setError('Error: ' + (err as Error).message)
    }
  }

  const handleRestore = async (id: number) => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/home/heroes/${id}/restore`, {
        method: 'POST',
      })

      if (res.ok) {
        window.location.reload()
      } else {
        setError('Failed to restore hero section')
      }
    } catch (err) {
      setError('Error: ' + (err as Error).message)
    }
  }

  return (
    <div>
      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <HomeHeroesTable
        heroes={heroes}
        onArchive={handleArchive}
        onRestore={handleRestore}
      />
    </div>
  )
}
