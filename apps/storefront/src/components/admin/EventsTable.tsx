import { Badge } from '../catalyst/badge';

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
		<div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
			<div className="overflow-x-auto">
				<table className="w-full text-left text-sm text-zinc-950 dark:text-white">
					<thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
						<tr>
							<th className="px-6 py-3 font-medium text-zinc-500 dark:text-zinc-400">Received</th>
							<th className="px-6 py-3 font-medium text-zinc-500 dark:text-zinc-400">Event ID</th>
							<th className="px-6 py-3 font-medium text-zinc-500 dark:text-zinc-400">Type</th>
							<th className="px-6 py-3 font-medium text-zinc-500 dark:text-zinc-400">Status</th>
							<th className="px-6 py-3 font-medium text-zinc-500 dark:text-zinc-400">Error</th>
							<th className="px-6 py-3 font-medium text-zinc-500 dark:text-zinc-400">Processed</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
						{events.length > 0 ? (
							events.map((e) => (
								<tr
									key={e.event_id}
									className={`transition-colors ${
										e.processing_status === 'failed'
											? 'bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30'
											: 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
									}`}
								>
									<td className="px-6 py-4 text-zinc-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">
										{formatDate(e.received_at)}
									</td>
									<td className="px-6 py-4 font-mono text-xs">
										<span className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{e.event_id}</span>
									</td>
									<td className="px-6 py-4 font-mono text-xs">{e.event_type}</td>
									<td className="px-6 py-4">
										<Badge color={getStatusColor(e.processing_status)}>{e.processing_status}</Badge>
									</td>
									<td className="px-6 py-4 text-xs max-w-xs truncate" title={e.error || ''}>
										{e.error ? (
											<span className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 px-2 py-1 rounded">{e.error}</span>
										) : '-'}
									</td>
									<td className="px-6 py-4 text-zinc-500 dark:text-zinc-400 tabular-nums whitespace-nowrap">
										{formatDate(e.processed_at)}
									</td>
								</tr>
							))
						) : (
							<tr>
								<td colSpan={6} className="px-6 py-12 text-center text-zinc-500 dark:text-zinc-400">
									No events found.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Pagination */}
			<div className="border-t border-zinc-200 dark:border-zinc-800 px-6 py-4 flex items-center justify-between">
				<div className="text-xs text-zinc-500 dark:text-zinc-400">
					Page {currentPage} of {totalPages}
				</div>
				<div className="flex gap-2">
					<a
						href={hasPrev ? buildPaginationUrl(currentPage - 1) : '#'}
						className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
							hasPrev
								? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'
								: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
						}`}
						aria-disabled={!hasPrev}
					>
						Previous
					</a>
					<a
						href={hasNext ? buildPaginationUrl(currentPage + 1) : '#'}
						className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
							hasNext
								? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'
								: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-600 cursor-not-allowed'
						}`}
						aria-disabled={!hasNext}
					>
						Next
					</a>
				</div>
			</div>
		</div>
	);
}
