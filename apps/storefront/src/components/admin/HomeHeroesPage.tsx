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
  apiBase: string
  apiKey: string
}

export default function HomeHeroesPage({ heroes, apiBase, apiKey }: Props) {
  const handleArchive = async (id: number) => {
    if (!confirm('Archive this hero section?')) return

    try {
      const res = await fetch(`${apiBase}/admin/home/heroes/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': apiKey }
      })

      if (res.ok) {
        window.location.reload()
      } else {
        alert('Failed to archive hero section')
      }
    } catch (error) {
      alert('Error: ' + (error as Error).message)
    }
  }

  const handleRestore = async (id: number) => {
    try {
      const res = await fetch(`${apiBase}/admin/home/heroes/${id}/restore`, {
        method: 'POST',
        headers: { 'x-admin-key': apiKey }
      })

      if (res.ok) {
        window.location.reload()
      } else {
        alert('Failed to restore hero section')
      }
    } catch (error) {
      alert('Error: ' + (error as Error).message)
    }
  }

  return (
    <HomeHeroesTable
      heroes={heroes}
      onArchive={handleArchive}
      onRestore={handleRestore}
    />
  )
}
