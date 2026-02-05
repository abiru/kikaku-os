import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'

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
  onArchive: (id: number) => void
  onRestore: (id: number) => void
}

export default function HomeHeroesTable({ heroes, onArchive, onRestore }: Props) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Position</TableHeader>
          <TableHeader>Title</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Updated</TableHeader>
          <TableHeader className="text-right">Action</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {heroes.length > 0 ? (
          heroes.map((hero) => (
            <TableRow key={hero.id} href={`/admin/home-heroes/${hero.id}`}>
              <TableCell>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-zinc-100 text-xs font-medium">
                  {hero.position}
                </span>
              </TableCell>
              <TableCell>
                <div className="font-medium">{hero.title}</div>
                <div className="text-xs text-zinc-500 truncate max-w-xs">{hero.subtitle}</div>
              </TableCell>
              <TableCell>
                {hero.status === 'draft' ? (
                  <Badge color="zinc">Draft</Badge>
                ) : hero.status === 'archived' ? (
                  <Badge color="red">Archived</Badge>
                ) : (
                  <Badge color="blue">Active</Badge>
                )}
              </TableCell>
              <TableCell className="text-zinc-500 tabular-nums">
                {new Date(hero.updated_at).toLocaleDateString('ja-JP')}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <a
                    href={`/admin/home-heroes/${hero.id}`}
                    className="text-indigo-600 hover:underline text-xs font-medium"
                  >
                    Edit
                  </a>
                  {hero.status !== 'archived' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onArchive(hero.id)
                      }}
                      className="text-red-600 hover:underline text-xs font-medium"
                    >
                      Archive
                    </button>
                  )}
                  {hero.status === 'archived' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onRestore(hero.id)
                      }}
                      className="text-green-600 hover:underline text-xs font-medium"
                    >
                      Restore
                    </button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-zinc-500">
              No hero sections found. Create your first one!
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
