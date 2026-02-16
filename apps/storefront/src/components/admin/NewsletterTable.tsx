import { useState } from 'react';
import { Badge } from '../catalyst/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table';
import { Pagination, PaginationPrevious, PaginationNext } from '../catalyst/pagination';
import { Button } from '../catalyst/button';
import { formatDate } from '../../lib/format';
import { t } from '../../i18n';

type Subscriber = {
  id: number;
  email: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type Props = {
  subscribers: Subscriber[];
  total: number;
  currentPage: number;
  totalPages: number;
  statusFilter: string;
};

const getStatusColor = (status: string): 'lime' | 'red' | 'zinc' => {
  switch (status) {
    case 'active': return 'lime';
    case 'unsubscribed': return 'red';
    default: return 'zinc';
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'active': return t('admin.newsletterSubscribed');
    case 'unsubscribed': return t('admin.newsletterUnsubscribed');
    default: return status;
  }
};

export default function NewsletterTable({ subscribers, total, currentPage, totalPages, statusFilter }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;

  const buildPaginationUrl = (page: number) => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
    return `?${params}`;
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === subscribers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(subscribers.map((s) => s.id)));
    }
  };

  const handleCsvExport = () => {
    setIsExporting(true);
    try {
      const headers = ['ID', 'Email', 'Status', 'Created At', 'Updated At'];
      const rows = subscribers.map((s) => [
        s.id.toString(),
        s.email,
        s.status,
        s.created_at,
        s.updated_at,
      ]);

      const csvContent = [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `newsletter-subscribers-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {/* Status Filter */}
          <form method="get" className="flex items-center gap-2">
            <select
              name="status"
              defaultValue={statusFilter}
              onChange={(e) => {
                const form = e.target.closest('form');
                if (form) form.submit();
              }}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
            >
              <option value="all">{t('common.all')}</option>
              <option value="active">{t('admin.newsletterSubscribed')}</option>
              <option value="unsubscribed">{t('admin.newsletterUnsubscribed')}</option>
            </select>
          </form>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={handleCsvExport}
            disabled={isExporting || subscribers.length === 0}
            color="white"
          >
            {isExporting ? t('admin.processing') : t('admin.newsletterExportCsv')}
          </Button>
        </div>
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeader className="w-8">
              <input
                type="checkbox"
                checked={subscribers.length > 0 && selectedIds.size === subscribers.length}
                onChange={toggleSelectAll}
                className="rounded border-zinc-300"
              />
            </TableHeader>
            <TableHeader>{t('admin.newsletterEmail')}</TableHeader>
            <TableHeader>{t('admin.status')}</TableHeader>
            <TableHeader>{t('admin.newsletterSubscribedAt')}</TableHeader>
            <TableHeader>{t('admin.updated')}</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {subscribers.length > 0 ? (
            subscribers.map((subscriber) => (
              <TableRow key={subscriber.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(subscriber.id)}
                    onChange={() => toggleSelect(subscriber.id)}
                    className="rounded border-zinc-300"
                  />
                </TableCell>
                <TableCell className="font-medium">{subscriber.email}</TableCell>
                <TableCell>
                  <Badge color={getStatusColor(subscriber.status)}>
                    {getStatusLabel(subscriber.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500 tabular-nums">
                  {formatDate(subscriber.created_at)}
                </TableCell>
                <TableCell className="text-zinc-500 tabular-nums">
                  {formatDate(subscriber.updated_at)}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-zinc-500">
                {t('admin.newsletterNoSubscribers')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-zinc-500">
            {t('admin.total')} {total} {t('admin.entries')} — {t('admin.pageOf', { page: currentPage, totalPages })}
          </div>
          <Pagination>
            <PaginationPrevious href={hasPrev ? buildPaginationUrl(currentPage - 1) : null} />
            <PaginationNext href={hasNext ? buildPaginationUrl(currentPage + 1) : null} />
          </Pagination>
        </div>
      )}
    </>
  );
}
