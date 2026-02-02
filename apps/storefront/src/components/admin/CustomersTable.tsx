import { Badge } from '../catalyst/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table';
import { Pagination, PaginationPrevious, PaginationNext } from '../catalyst/pagination';

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
	return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
};

const formatDate = (dateStr: string | null) => {
	if (!dateStr) return '-';
	return new Date(dateStr).toLocaleDateString('ja-JP');
};

export default function CustomersTable({ customers, currentPage, totalPages, searchQuery }: Props) {
	const hasPrev = currentPage > 1;
	const hasNext = currentPage < totalPages;

	return (
		<div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
			<div className="overflow-x-auto">
				<Table>
					<TableHead>
						<TableRow>
							<TableHeader>Name</TableHeader>
							<TableHeader>Email</TableHeader>
							<TableHeader className="text-center">Orders</TableHeader>
							<TableHeader className="text-right">Total Spent</TableHeader>
							<TableHeader>Last Order</TableHeader>
							<TableHeader>Created</TableHeader>
							<TableHeader className="text-right">Action</TableHeader>
						</TableRow>
					</TableHead>
					<TableBody>
						{customers.length > 0 ? (
							customers.map((customer) => (
								<TableRow key={customer.id}>
									<TableCell>
										<a
											href={`/admin/customers/${customer.id}`}
											className="font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
										>
											{customer.name}
										</a>
									</TableCell>
									<TableCell className="text-zinc-500">
										{customer.email || <span className="italic">No email</span>}
									</TableCell>
									<TableCell className="text-center">
										{customer.order_count > 0 ? (
											<Badge color="blue">{customer.order_count}</Badge>
										) : (
											<span className="text-zinc-500">0</span>
										)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatCurrency(customer.total_spent)}
									</TableCell>
									<TableCell className="text-zinc-500 tabular-nums">
										{formatDate(customer.last_order_date)}
									</TableCell>
									<TableCell className="text-zinc-500 tabular-nums">
										{formatDate(customer.created_at)}
									</TableCell>
									<TableCell className="text-right">
										<a
											href={`/admin/customers/${customer.id}`}
											className="text-indigo-600 hover:underline font-medium"
										>
											View
										</a>
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={7} className="text-center text-zinc-500">
									No customers found.
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
						<PaginationPrevious href={hasPrev ? `?page=${currentPage - 1}&q=${searchQuery}` : null} />
						<PaginationNext href={hasNext ? `?page=${currentPage + 1}&q=${searchQuery}` : null} />
					</Pagination>
				</div>
			)}
		</div>
	);
}
