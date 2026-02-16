import { Pagination, PaginationPrevious, PaginationNext, PaginationList, PaginationPage } from '../catalyst/pagination'
import { t } from '../../i18n'

type Props = {
  currentPage: number
  totalPages: number
  buildHref: (page: number) => string
}

export default function AdminPagination({ currentPage, totalPages, buildHref }: Props) {
  if (totalPages <= 1) return null

  return (
    <div className="mt-4 flex items-center justify-between">
      <div className="text-sm text-zinc-500">
        {t('admin.pageOf', { page: currentPage, totalPages })}
      </div>
      <Pagination>
        {currentPage > 1 && (
          <PaginationPrevious href={buildHref(currentPage - 1)} />
        )}
        <PaginationList>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let pageNum: number
            if (totalPages <= 5) {
              pageNum = i + 1
            } else if (currentPage <= 3) {
              pageNum = i + 1
            } else if (currentPage >= totalPages - 2) {
              pageNum = totalPages - 4 + i
            } else {
              pageNum = currentPage - 2 + i
            }
            return (
              <PaginationPage
                key={pageNum}
                href={buildHref(pageNum)}
                current={pageNum === currentPage}
              >
                {pageNum}
              </PaginationPage>
            )
          })}
        </PaginationList>
        {currentPage < totalPages && (
          <PaginationNext href={buildHref(currentPage + 1)} />
        )}
      </Pagination>
    </div>
  )
}
