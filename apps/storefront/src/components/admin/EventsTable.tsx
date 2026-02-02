import { Badge } from '../catalyst/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table';
import { Pagination, PaginationPrevious, PaginationNext } from '../catalyst/pagination';

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

const formatDate = (dateStr: string | null) => {
	if (!dateStr) return '-';
	const d = new Date(dateStr);
	return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}`;
};

const getStatusColor = (status: string): 'lime' | 'amber' | 'red' | 'zinc' => {
	switch (status) {
		case 'completed': return 'lime';
		case 'pending': return 'amber';
		case 'failed': return 'red';
		default: return 'zinc';
	}
};

export default function EventsTable({ events, currentPage, totalPages, status, type }: Props) {
	const hasPrev = currentPage > 1;
	const hasNext = currentPage < totalPages;

	const buildPaginationUrl = (page: number) => {
		const params = new URLSearchParams();
		params.set('page', page.toString());
		if (status) params.set('status', status);
		if (type) params.set('type', type);
		return `?${params}`;
	};

	return (
		<div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
			<div className="overflow-x-auto">
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
										{formatDate(e.received_at)}
									</TableCell>
									<TableCell className="font-mono text-xs">
										<span className="bg-zinc-100 px-1.5 py-0.5 rounded">{e.event_id}</span>
									</TableCell>
									<TableCell className="font-mono text-xs">{e.event_type}</TableCell>
									<TableCell>
										<Badge color={getStatusColor(e.processing_status)}>{e.processing_status}</Badge>
									</TableCell>
									<TableCell className="text-xs max-w-xs truncate" title={e.error || ''}>
										{e.error ? (
											<span className="text-red-600 bg-red-50 px-2 py-1 rounded">{e.error}</span>
										) : '-'}
									</TableCell>
									<TableCell className="text-zinc-500 tabular-nums whitespace-nowrap">
										{formatDate(e.processed_at)}
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={6} className="text-center text-zinc-500">
									No events found.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="border-t border-zinc-200 px-6 py-4 flex items-center justify-between">
					<div className="text-sm text-zinc-500">
						Page {currentPage} of {totalPages}
					</div>
					<Pagination>
						<PaginationPrevious href={hasPrev ? buildPaginationUrl(currentPage - 1) : null} />
						<PaginationNext href={hasNext ? buildPaginationUrl(currentPage + 1) : null} />
					</Pagination>
				</div>
			)}
		</div>
	);
}
