import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock i18n — return the key so tests are language-independent
vi.mock('../i18n', () => ({
	t: (key: string) => key,
	useTranslation: () => ({ t: (key: string) => key }),
	translations: {},
}));

// Mock catalyst components to render standard HTML elements
vi.mock('../components/catalyst/button', () => ({
	Button: ({ children, href, outline, color, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: string; outline?: boolean; color?: string }) => {
		if (href) return <a href={href}>{children}</a>;
		return <button {...props}>{children}</button>;
	},
}));

vi.mock('../components/catalyst/input', () => ({
	Input: ({ invalid, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) =>
		<input data-invalid={invalid || undefined} {...props} />,
}));

vi.mock('../components/catalyst/textarea', () => ({
	Textarea: ({ invalid, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) =>
		<textarea data-invalid={invalid || undefined} {...props} />,
}));

vi.mock('../components/catalyst/fieldset', () => ({
	Field: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label>,
}));

// Mock fetch
global.fetch = vi.fn();

import ContactForm from '../components/ContactForm';

/** Helper: mock a successful CSRF token fetch (used by useEffect on mount) */
function mockCsrfFetchSuccess(token = 'test-csrf-token') {
	(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
		ok: true,
		json: () => Promise.resolve({ token }),
	});
}

/** Helper: render ContactForm and wait for the mount-time CSRF fetch to complete */
async function renderAndWaitForCsrf(csrfToken = 'test-csrf-token') {
	mockCsrfFetchSuccess(csrfToken);
	render(<ContactForm />);
	await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
}

describe('ContactForm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders all form fields', async () => {
		await renderAndWaitForCsrf();

		expect(screen.getByText('contact.name')).toBeInTheDocument();
		expect(screen.getByText('contact.email')).toBeInTheDocument();
		expect(screen.getByText('contact.subject')).toBeInTheDocument();
		expect(screen.getByText('contact.body')).toBeInTheDocument();
	});

	it('renders submit button', async () => {
		await renderAndWaitForCsrf();

		expect(screen.getByText('contact.submit')).toBeInTheDocument();
	});

	it('renders placeholder text in fields', async () => {
		await renderAndWaitForCsrf();

		expect(screen.getByPlaceholderText('contact.namePlaceholder')).toBeInTheDocument();
		expect(screen.getByPlaceholderText('contact.emailPlaceholder')).toBeInTheDocument();
		expect(screen.getByPlaceholderText('contact.subjectPlaceholder')).toBeInTheDocument();
		expect(screen.getByPlaceholderText('contact.bodyPlaceholder')).toBeInTheDocument();
	});

	it('shows validation errors when submitting empty form', async () => {
		await renderAndWaitForCsrf();

		const submitButton = screen.getByText('contact.submit');
		fireEvent.click(submitButton);

		await waitFor(() => {
			expect(screen.getByText('contact.validationName')).toBeInTheDocument();
			expect(screen.getByText('contact.validationEmail')).toBeInTheDocument();
			expect(screen.getByText('contact.validationSubject')).toBeInTheDocument();
			expect(screen.getByText('contact.validationBody')).toBeInTheDocument();
		});
	});

	it('shows email format validation error', async () => {
		await renderAndWaitForCsrf();

		fireEvent.change(screen.getByPlaceholderText('contact.namePlaceholder'), { target: { value: 'Test User' } });
		fireEvent.change(screen.getByPlaceholderText('contact.emailPlaceholder'), { target: { value: 'invalid-email' } });
		fireEvent.change(screen.getByPlaceholderText('contact.subjectPlaceholder'), { target: { value: 'Test Subject' } });
		fireEvent.change(screen.getByPlaceholderText('contact.bodyPlaceholder'), { target: { value: 'Test body message' } });

		const form = screen.getByText('contact.submit').closest('form')!;
		fireEvent.submit(form);

		await waitFor(() => {
			expect(screen.getByText('contact.validationEmailInvalid')).toBeInTheDocument();
		});

		expect(screen.queryByText('contact.validationName')).not.toBeInTheDocument();
		expect(screen.queryByText('contact.validationSubject')).not.toBeInTheDocument();
		expect(screen.queryByText('contact.validationBody')).not.toBeInTheDocument();
	});

	it('clears validation error when field is changed', async () => {
		await renderAndWaitForCsrf();

		fireEvent.click(screen.getByText('contact.submit'));

		await waitFor(() => {
			expect(screen.getByText('contact.validationName')).toBeInTheDocument();
		});

		fireEvent.change(screen.getByPlaceholderText('contact.namePlaceholder'), { target: { value: 'Test User' } });
		expect(screen.queryByText('contact.validationName')).not.toBeInTheDocument();
		expect(screen.getByText('contact.validationEmail')).toBeInTheDocument();
	});

	it('shows success message after successful submission', async () => {
		await renderAndWaitForCsrf();

		// Mock the submission fetch (2nd fetch call)
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			json: () => Promise.resolve({ ok: true }),
		});

		fireEvent.change(screen.getByPlaceholderText('contact.namePlaceholder'), { target: { value: 'Test User' } });
		fireEvent.change(screen.getByPlaceholderText('contact.emailPlaceholder'), { target: { value: 'test@example.com' } });
		fireEvent.change(screen.getByPlaceholderText('contact.subjectPlaceholder'), { target: { value: 'Test Subject' } });
		fireEvent.change(screen.getByPlaceholderText('contact.bodyPlaceholder'), { target: { value: 'Test message body' } });

		fireEvent.click(screen.getByText('contact.submit'));

		await waitFor(() => {
			expect(screen.getByText('contact.success')).toBeInTheDocument();
			expect(screen.getByText('contact.successDescription')).toBeInTheDocument();
		});

		// CSRF fetch (1st) + submission fetch (2nd)
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	it('shows error message on submission failure', async () => {
		await renderAndWaitForCsrf();

		// Mock the submission fetch (2nd fetch call) as failure
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.resolve({ ok: false, message: 'Server error' }),
		});

		fireEvent.change(screen.getByPlaceholderText('contact.namePlaceholder'), { target: { value: 'Test User' } });
		fireEvent.change(screen.getByPlaceholderText('contact.emailPlaceholder'), { target: { value: 'test@example.com' } });
		fireEvent.change(screen.getByPlaceholderText('contact.subjectPlaceholder'), { target: { value: 'Test Subject' } });
		fireEvent.change(screen.getByPlaceholderText('contact.bodyPlaceholder'), { target: { value: 'Test body' } });

		fireEvent.click(screen.getByText('contact.submit'));

		await waitFor(() => {
			expect(screen.getByText('Server error')).toBeInTheDocument();
		});

		// CSRF fetch (1st) + submission fetch (2nd)
		expect(global.fetch).toHaveBeenCalledTimes(2);
	});

	it('contains honeypot field hidden from view', async () => {
		await renderAndWaitForCsrf();

		const honeypotInput = document.querySelector('input[name="website"]');
		expect(honeypotInput).toBeInTheDocument();
		expect(honeypotInput?.closest('[aria-hidden="true"]')).toBeInTheDocument();
	});

	it('shows error banner and disables submit when CSRF fetch fails', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));

		render(<ContactForm />);

		await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

		// Error banner with role="alert" should appear
		await waitFor(() => {
			expect(screen.getByRole('alert')).toBeInTheDocument();
			expect(screen.getByRole('alert')).toHaveTextContent('contact.csrfError');
		});

		// Submit button should be disabled
		const submitButton = screen.getByText('contact.submit');
		expect(submitButton).toBeDisabled();
	});

	it('shows error banner when CSRF fetch returns non-ok response', async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			json: () => Promise.resolve({}),
		});

		render(<ContactForm />);

		await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

		await waitFor(() => {
			expect(screen.getByRole('alert')).toBeInTheDocument();
			expect(screen.getByRole('alert')).toHaveTextContent('contact.csrfError');
		});

		const submitButton = screen.getByText('contact.submit');
		expect(submitButton).toBeDisabled();
	});
});
