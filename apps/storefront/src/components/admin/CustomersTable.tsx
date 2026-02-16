import { Badge } from '../catalyst/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table';
import { formatDate, formatPrice } from '../../lib/format';
import AdminPagination from './AdminPagination';
import TableEmptyState from './TableEmptyState';
import { t } from '../../i18n';

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

export default function CustomersTable({ customers, currentPage, totalPages, searchQuery }: Props) {
	return (
		<>
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
										{formatPrice(customer.total_spent)}
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
								<TableCell colSpan={7}>
									<TableEmptyState
										icon="users"
										message={t('admin.emptyCustomers')}
										description={t('admin.emptyCustomersDesc')}
									/>
								</TableCell>
							</TableRow>
						)}
					</TableBody>
			</Table>

			<AdminPagination
				currentPage={currentPage}
				totalPages={totalPages}
				buildHref={(page) => `?page=${page}&q=${searchQuery}`}
			/>
		</>
	);
}
