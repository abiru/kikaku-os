import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'

type Page = {
  id: number
  slug: string
  title: string
  meta_title: string | null
  meta_description: string | null
  body: string
  status: string
  created_at: string
  updated_at: string
}

type Props = {
  pages: Page[]
  coreSlugs: string[]
}

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

export default function PagesTable({ pages, coreSlugs }: Props) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Title</TableHeader>
          <TableHeader>Slug</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Updated</TableHeader>
          <TableHeader className="text-right">Action</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {pages.length > 0 ? (
          pages.map((p) => (
            <TableRow key={p.id} href={`/admin/pages/${p.id}`}>
              <TableCell>
                <div className="font-medium">{p.title}</div>
                {coreSlugs.includes(p.slug) && (
                  <span className="text-xs text-zinc-500">Core page</span>
                )}
              </TableCell>
              <TableCell>
                <code className="text-xs bg-zinc-100 px-2 py-1 rounded">/{p.slug}</code>
              </TableCell>
              <TableCell>
                {p.status === 'published' ? (
                  <Badge color="lime">Published</Badge>
                ) : (
                  <Badge color="zinc">Draft</Badge>
                )}
              </TableCell>
              <TableCell className="text-zinc-500 tabular-nums">
                {formatDate(p.updated_at)}
              </TableCell>
              <TableCell className="text-right">
                <a href={`/admin/pages/${p.id}`} className="text-indigo-600 hover:underline font-medium">Edit</a>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-zinc-500">
              No pages found.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
