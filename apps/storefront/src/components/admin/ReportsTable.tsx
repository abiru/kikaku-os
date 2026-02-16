import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table'
import TableEmptyState from './TableEmptyState'
import { t } from '../../i18n'

type Report = {
  id: number
  date: string
  created_at: string
  downloadUrl?: string
}

type Props = {
  reports: Report[]
}

export default function ReportsTable({ reports }: Props) {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableHeader>Date</TableHeader>
          <TableHeader>Type</TableHeader>
          <TableHeader>Generated At</TableHeader>
          <TableHeader>Action</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {reports.length > 0 ? (
          reports.map((report) => (
            <TableRow key={report.id}>
              <TableCell>
                {new Date(report.date).toLocaleDateString()}
              </TableCell>
              <TableCell className="text-zinc-500">
                Daily Close
              </TableCell>
              <TableCell className="text-zinc-500 tabular-nums">
                {new Date(report.created_at).toLocaleString()}
              </TableCell>
              <TableCell>
                {report.downloadUrl && (
                  <a
                    href={report.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:underline font-medium"
                  >
                    View Report
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={4}>
              <TableEmptyState
                icon="bar-chart"
                message={t('admin.emptyReports')}
                description={t('admin.emptyReportsDesc')}
              />
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
