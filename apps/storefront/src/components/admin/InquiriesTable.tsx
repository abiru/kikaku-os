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
import AdminPagination from './AdminPagination';
import { getInquiryBadgeColor, getInquiryStatusLabel } from '../../lib/adminUtils';

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
            {getInquiryStatusLabel(s)}
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
                  <Badge color={getInquiryBadgeColor(inquiry.status)}>
                    {getInquiryStatusLabel(inquiry.status)}
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

      <AdminPagination
        currentPage={currentPage}
        totalPages={totalPages}
        buildHref={(page) => `?status=${currentStatus}&offset=${(page - 1) * limit}`}
      />
    </div>
  );
}
