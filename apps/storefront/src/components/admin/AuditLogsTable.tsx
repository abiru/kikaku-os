import { useState } from 'react';
import { Badge } from '../catalyst/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table';
import { formatDate } from '../../lib/format';
import AdminPagination from './AdminPagination';
import { t } from '../../i18n';

import { DATE_FORMATS } from '../../lib/constants';

const dateTimeOpts = DATE_FORMATS.DATETIME_SECONDS;

type AuditLog = {
  id: number;
  actor: string | null;
  action: string;
  target: string | null;
  metadata: string | null;
  created_at: string;
};

type Props = {
  logs: AuditLog[];
  total: number;
  currentPage: number;
  totalPages: number;
  actionFilter: string;
  targetFilter: string;
  dateFrom: string;
  dateTo: string;
  availableActions: string[];
  availableTargets: string[];
};

const getActionColor = (action: string): 'lime' | 'amber' | 'red' | 'blue' | 'zinc' => {
  if (action.startsWith('create')) return 'lime';
  if (action.startsWith('update')) return 'blue';
  if (action.startsWith('delete')) return 'red';
  if (action.startsWith('approve') || action.startsWith('reject')) return 'amber';
  return 'zinc';
};

const formatMetadata = (metadata: string | null): string => {
  if (!metadata) return '-';
  try {
    const parsed = JSON.parse(metadata);
    return Object.entries(parsed)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  } catch {
    return metadata;
  }
};

export default function AuditLogsTable({
  logs,
  total,
  currentPage,
  totalPages,
  actionFilter,
  targetFilter,
  dateFrom,
  dateTo,
  availableActions,
  availableTargets,
}: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const buildPaginationUrl = (page: number) => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    if (actionFilter) params.set('action', actionFilter);
    if (targetFilter) params.set('target', targetFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    return `?${params}`;
  };

  return (
    <>
      {/* Filters */}
      <form method="get" className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">{t('admin.auditAction')}</label>
          <select
            name="action"
            defaultValue={actionFilter}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
          >
            <option value="">{t('common.all')}</option>
            {availableActions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">{t('admin.auditTarget')}</label>
          <select
            name="target"
            defaultValue={targetFilter}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
          >
            <option value="">{t('common.all')}</option>
            {availableTargets.map((tgt) => (
              <option key={tgt} value={tgt}>{tgt}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">{t('admin.auditDateFrom')}</label>
          <input
            type="date"
            name="date_from"
            defaultValue={dateFrom}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500 mb-1">{t('admin.auditDateTo')}</label>
          <input
            type="date"
            name="date_to"
            defaultValue={dateTo}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-950 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors"
        >
          {t('common.apply')}
        </button>
        <a
          href="/admin/audit-logs"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 transition-colors"
        >
          {t('common.clear')}
        </a>
      </form>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeader>{t('admin.auditTimestamp')}</TableHeader>
            <TableHeader>{t('admin.auditActor')}</TableHeader>
            <TableHeader>{t('admin.auditAction')}</TableHeader>
            <TableHeader>{t('admin.auditTarget')}</TableHeader>
            <TableHeader>{t('admin.auditDetails')}</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {logs.length > 0 ? (
            logs.map((log) => (
              <TableRow
                key={log.id}
                className="cursor-pointer hover:bg-zinc-50"
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <TableCell className="text-zinc-500 tabular-nums whitespace-nowrap">
                  {formatDate(log.created_at, dateTimeOpts)}
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs bg-zinc-100 px-1.5 py-0.5 rounded">
                    {log.actor || '-'}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge color={getActionColor(log.action)}>{log.action}</Badge>
                </TableCell>
                <TableCell className="text-zinc-600">{log.target || '-'}</TableCell>
                <TableCell className="text-xs max-w-xs truncate text-zinc-500" title={formatMetadata(log.metadata)}>
                  {expandedId === log.id ? (
                    <pre className="whitespace-pre-wrap text-xs bg-zinc-50 p-2 rounded border border-zinc-200 max-w-md">
                      {log.metadata ? JSON.stringify(JSON.parse(log.metadata), null, 2) : '-'}
                    </pre>
                  ) : (
                    formatMetadata(log.metadata)
                  )}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-zinc-500">
                {t('admin.auditNoLogs')}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <AdminPagination
        currentPage={currentPage}
        totalPages={totalPages}
        buildHref={buildPaginationUrl}
      />
    </>
  );
}
