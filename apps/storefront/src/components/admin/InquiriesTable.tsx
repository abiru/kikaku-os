import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '../catalyst/table';
import { Badge } from '../catalyst/badge';
import { Link } from '../catalyst/link';

type Inquiry = {
  id: number;
  name: string;
  email: string;
  subject: string;
  status: string;
  created_at: string;
};

type Props = {
  inquiries: Inquiry[];
  currentStatus: string;
  total: number;
  limit: number;
  offset: number;
};

const getStatusBadgeColor = (status: string) => {
  switch (status) {
    case 'open':
      return 'amber' as const;
    case 'replied':
      return 'lime' as const;
    case 'closed':
      return 'zinc' as const;
    default:
      return 'zinc' as const;
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'open':
      return '未対応';
    case 'replied':
      return '返信済み';
    case 'closed':
      return 'クローズ';
    default:
      return status;
  }
};

export default function InquiriesTable({ inquiries, currentStatus, total, limit, offset }: Props) {
  const statuses = ['open', 'replied', 'closed'];
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Status filter tabs */}
      <div className="flex gap-2">
        {statuses.map((s) => (
          <a
            key={s}
            href={`/admin/inquiries?status=${s}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              currentStatus === s
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {getStatusLabel(s)}
          </a>
        ))}
      </div>

      <Table striped>
        <TableHead>
          <TableRow>
            <TableHeader>ID</TableHeader>
            <TableHeader>件名</TableHeader>
            <TableHeader>お名前</TableHeader>
            <TableHeader>メール</TableHeader>
            <TableHeader>ステータス</TableHeader>
            <TableHeader>受付日時</TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {inquiries.length > 0 ? (
            inquiries.map((inquiry) => (
              <TableRow key={inquiry.id} href={`/admin/inquiries/${inquiry.id}`}>
                <TableCell className="font-medium">
                  <Link
                    href={`/admin/inquiries/${inquiry.id}`}
                    className="text-indigo-600 hover:text-indigo-800"
                  >
                    #{inquiry.id}
                  </Link>
                </TableCell>
                <TableCell className="max-w-xs truncate">{inquiry.subject}</TableCell>
                <TableCell>{inquiry.name}</TableCell>
                <TableCell className="text-zinc-500">{inquiry.email}</TableCell>
                <TableCell>
                  <Badge color={getStatusBadgeColor(inquiry.status)}>
                    {getStatusLabel(inquiry.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-zinc-500 tabular-nums">
                  {new Date(inquiry.created_at).toLocaleDateString('ja-JP')}{' '}
                  <span className="text-xs">
                    {new Date(inquiry.created_at).toLocaleTimeString('ja-JP', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-zinc-500 py-12">
                お問い合わせはありません。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <div className="text-sm text-zinc-500">
            {currentPage} / {totalPages} ページ
          </div>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <a
                href={`/admin/inquiries?status=${currentStatus}&offset=${(currentPage - 2) * limit}`}
                className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-200"
              >
                前へ
              </a>
            )}
            {currentPage < totalPages && (
              <a
                href={`/admin/inquiries?status=${currentStatus}&offset=${currentPage * limit}`}
                className="rounded-lg bg-zinc-100 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-200"
              >
                次へ
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
