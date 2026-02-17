import { Badge } from '../catalyst/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table';
import { formatDate } from '../../lib/format';
import AdminPagination from './AdminPagination';
import { getEventBadgeColor } from '../../lib/adminUtils';
import TableEmptyState from './TableEmptyState';
import { t } from '../../i18n';

import { DATE_FORMATS } from '../../lib/constants';

const dateTimeSecsOpts = DATE_FORMATS.DATETIME_SECONDS;

type StripeEvent = {
	event_id: string;
	event_type: string;
	processing_status: string;
	error: string | null;
	received_at: string;
	processed_at: string | null;
};

type Props = {
	events: StripeEvent[];
	currentPage: number;
	totalPages: number;
	status: string;
	type: string;
};

export default function EventsTable({ events, currentPage, totalPages, status, type }: Props) {
	const buildPaginationUrl = (page: number) => {
		const params = new URLSearchParams();
		params.set('page', page.toString());
		if (status) params.set('status', status);
		if (type) params.set('type', type);
		return `?${params}`;
	};

	return (
		<>
			<Table>
					<TableHead>
						<TableRow>
							<TableHeader>Received</TableHeader>
							<TableHeader>Event ID</TableHeader>
							<TableHeader>Type</TableHeader>
							<TableHeader>Status</TableHeader>
							<TableHeader>Error</TableHeader>
							<TableHeader>Processed</TableHeader>
						</TableRow>
					</TableHead>
					<TableBody>
						{events.length > 0 ? (
							events.map((e) => (
								<TableRow
									key={e.event_id}
									className={
										e.processing_status === 'failed'
											? 'bg-red-50/50 hover:bg-red-50'
											: ''
									}
								>
									<TableCell className="text-zinc-500 tabular-nums whitespace-nowrap">
										{formatDate(e.received_at, dateTimeSecsOpts)}
									</TableCell>
									<TableCell className="font-mono text-xs">
										<span className="bg-zinc-100 px-1.5 py-0.5 rounded">{e.event_id}</span>
									</TableCell>
									<TableCell className="font-mono text-xs">{e.event_type}</TableCell>
									<TableCell>
										<Badge color={getEventBadgeColor(e.processing_status)}>{e.processing_status}</Badge>
									</TableCell>
									<TableCell className="text-xs max-w-xs truncate" title={e.error || ''}>
										{e.error ? (
											<span className="text-red-600 bg-red-50 px-2 py-1 rounded">{e.error}</span>
										) : '-'}
									</TableCell>
									<TableCell className="text-zinc-500 tabular-nums whitespace-nowrap">
										{formatDate(e.processed_at, dateTimeSecsOpts)}
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={6}>
									<TableEmptyState
										icon="calendar"
										message={t('admin.emptyEvents')}
										description={t('admin.emptyEventsDesc')}
									/>
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
