import { Badge } from '../catalyst/badge';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '../catalyst/table';
import { Pagination, PaginationPrevious, PaginationNext } from '../catalyst/pagination';

type AdminUser = {
	id: number;
	clerk_user_id: string;
	email: string;
	name: string | null;
	role_id: string;
	role_name: string;
	role_priority: number;
	is_active: number;
	last_login_at: string | null;
	created_at: string;
	updated_at: string;
};

type Props = {
	users: AdminUser[];
	currentPage: number;
	totalPages: number;
	searchQuery: string;
	roleFilter: string;
	activeFilter: string;
};

const formatDate = (dateStr: string | null) => {
	if (!dateStr) return '-';
	return new Date(dateStr).toLocaleDateString('ja-JP', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit'
	});
};

const getRoleBadgeColor = (roleId: string): 'amber' | 'blue' | 'green' | 'zinc' => {
	switch (roleId) {
		case 'admin':
			return 'amber';
		case 'manager':
			return 'blue';
		case 'accountant':
			return 'green';
		default:
			return 'zinc';
	}
};

export default function UsersTable({
	users,
	currentPage,
	totalPages,
	searchQuery,
	roleFilter,
	activeFilter
}: Props) {
	const hasPrev = currentPage > 1;
	const hasNext = currentPage < totalPages;

	const buildQueryString = (page: number) => {
		const params = new URLSearchParams();
		params.set('page', page.toString());
		if (searchQuery) params.set('q', searchQuery);
		if (roleFilter) params.set('role', roleFilter);
		if (activeFilter) params.set('active', activeFilter);
		return params.toString();
	};

	return (
		<>
			<Table>
				<TableHead>
					<TableRow>
						<TableHeader>Name</TableHeader>
						<TableHeader>Email</TableHeader>
						<TableHeader>Role</TableHeader>
						<TableHeader className="text-center">Status</TableHeader>
						<TableHeader>Last Login</TableHeader>
						<TableHeader>Created</TableHeader>
						<TableHeader className="text-right">Action</TableHeader>
					</TableRow>
				</TableHead>
				<TableBody>
					{users.length > 0 ? (
						users.map((user) => (
							<TableRow key={user.id}>
								<TableCell>
									<a
										href={`/admin/users/${user.id}`}
										className="font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
									>
										{user.name || <span className="italic text-zinc-400">No name</span>}
									</a>
								</TableCell>
								<TableCell className="text-zinc-500">{user.email}</TableCell>
								<TableCell>
									<Badge color={getRoleBadgeColor(user.role_id)}>{user.role_name}</Badge>
								</TableCell>
								<TableCell className="text-center">
									{user.is_active ? (
										<Badge color="lime">Active</Badge>
									) : (
										<Badge color="red">Inactive</Badge>
									)}
								</TableCell>
								<TableCell className="text-zinc-500 tabular-nums text-sm">
									{formatDate(user.last_login_at)}
								</TableCell>
								<TableCell className="text-zinc-500 tabular-nums text-sm">
									{formatDate(user.created_at)}
								</TableCell>
								<TableCell className="text-right">
									<a
										href={`/admin/users/${user.id}`}
										className="text-indigo-600 hover:underline font-medium"
									>
										Edit
									</a>
								</TableCell>
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell colSpan={7} className="text-center text-zinc-500">
								No users found.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between mt-4">
					<div className="text-sm text-zinc-500">
						Page {currentPage} of {totalPages}
					</div>
					<Pagination>
						<PaginationPrevious href={hasPrev ? `?${buildQueryString(currentPage - 1)}` : null} />
						<PaginationNext href={hasNext ? `?${buildQueryString(currentPage + 1)}` : null} />
					</Pagination>
				</div>
			)}
		</>
	);
}
