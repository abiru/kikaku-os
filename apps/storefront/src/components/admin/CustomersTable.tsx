import { Badge } from'../catalyst/badge';

type Customer = {
	id: number;
	name: string;
	email: string | null;
	metadata: string | null;
	created_at: string;
	updated_at: string;
	order_count: number;
	total_spent: number;
	last_order_date: string | null;
};

type Props = {
	customers: Customer[];
	currentPage: number;
	totalPages: number;
	searchQuery: string;
};

const formatCurrency = (amount: number) => {
	return new Intl.NumberFormat('ja-JP', { style:'currency', currency:'JPY' }).format(amount);
};

const formatDate = (dateStr: string | null) => {
	if (!dateStr) return'-';
	return new Date(dateStr).toLocaleDateString('ja-JP');
};

export default function CustomersTable({ customers, currentPage, totalPages, searchQuery }: Props) {
	const hasPrev = currentPage > 1;
	const hasNext = currentPage < totalPages;

	return (
		<div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
			<div className="overflow-x-auto">
				<table className="w-full text-left text-sm text-zinc-950 [--gutter:theme(spacing.6)] sm:[--gutter:theme(spacing.8)]">
					<thead className="bg-zinc-50 border-b border-zinc-200">
						<tr>
							<th className="px-6 py-3 font-medium text-zinc-500">Name</th>
							<th className="px-6 py-3 font-medium text-zinc-500">Email</th>
							<th className="px-6 py-3 font-medium text-zinc-500 text-center">Orders</th>
							<th className="px-6 py-3 font-medium text-zinc-500 text-right">Total Spent</th>
							<th className="px-6 py-3 font-medium text-zinc-500">Last Order</th>
							<th className="px-6 py-3 font-medium text-zinc-500">Created</th>
							<th className="px-6 py-3 font-medium text-zinc-500 text-right">Action</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-zinc-100">
						{customers.length > 0 ? (
							customers.map((customer) => (
								<tr key={customer.id} className="hover:bg-zinc-50 transition-colors">
									<td className="px-6 py-4">
										<a
											href={`/admin/customers/${customer.id}`}
											className="font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
										>
											{customer.name}
										</a>
									</td>
									<td className="px-6 py-4 text-zinc-500">
										{customer.email || <span className="italic">No email</span>}
									</td>
									<td className="px-6 py-4 text-center">
										{customer.order_count > 0 ? (
											<Badge color="blue">{customer.order_count}</Badge>
										) : (
											<span className="text-zinc-500">0</span>
										)}
									</td>
									<td className="px-6 py-4 text-right tabular-nums">
										{formatCurrency(customer.total_spent)}
									</td>
									<td className="px-6 py-4 text-zinc-500 tabular-nums">
										{formatDate(customer.last_order_date)}
									</td>
									<td className="px-6 py-4 text-zinc-500 tabular-nums">
										{formatDate(customer.created_at)}
									</td>
									<td className="px-6 py-4 text-right">
										<a
											href={`/admin/customers/${customer.id}`}
											className="text-indigo-600 hover:underline font-medium"
										>
											View
										</a>
									</td>
								</tr>
							))
						) : (
							<tr>
								<td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
									No customers found.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Pagination */}
			<div className="border-t border-zinc-200 px-6 py-4 flex items-center justify-between">
				<div className="text-xs text-zinc-500">
					Page {currentPage} of {totalPages}
				</div>
				<div className="flex gap-2">
					<a
						href={hasPrev ? `?page=${currentPage - 1}&q=${searchQuery}` :'#'}
						className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
							hasPrev
								?'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50'
								:'bg-zinc-100 text-zinc-400 cursor-not-allowed'
						}`}
						aria-disabled={!hasPrev}
					>
						Previous
					</a>
					<a
						href={hasNext ? `?page=${currentPage + 1}&q=${searchQuery}` :'#'}
						className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
							hasNext
								?'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50'
								:'bg-zinc-100 text-zinc-400 cursor-not-allowed'
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
