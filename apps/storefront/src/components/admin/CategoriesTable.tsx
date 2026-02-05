import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import { Badge } from '../catalyst/badge'

type Category = {
  category: string
  product_count: number
}

type Props = {
  categories: Category[]
  onRename: (category: string) => void
  onDelete: (category: string, count: number) => void
}

export default function CategoriesTable({ categories, onRename, onDelete }: Props) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Category Name</TableHeader>
          <TableHeader>Products</TableHeader>
          <TableHeader>Actions</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {categories.length > 0 ? (
          categories.map((cat) => (
            <TableRow key={cat.category}>
              <TableCell>
                <a
                  href={`/admin/categories/${encodeURIComponent(cat.category)}`}
                  className="font-medium text-zinc-950 hover:text-indigo-600"
                >
                  {cat.category}
                </a>
              </TableCell>
              <TableCell>
                <Badge color="zinc">{cat.product_count} products</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onRename(cat.category)}
                    className="text-indigo-600 hover:underline font-medium"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(cat.category, cat.product_count)}
                    className="text-red-600 hover:underline font-medium"
                  >
                    Delete
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={3} className="text-center text-zinc-500">
              No categories found. Categories are created automatically when you assign them to products.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
