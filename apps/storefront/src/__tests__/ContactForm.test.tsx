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

describe('ContactForm', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders all form fields', () => {
		render(<ContactForm />);

		expect(screen.getByText('contact.name')).toBeInTheDocument();
		expect(screen.getByText('contact.email')).toBeInTheDocument();
		expect(screen.getByText('contact.subject')).toBeInTheDocument();
		expect(screen.getByText('contact.body')).toBeInTheDocument();
	});

	it('renders submit button', () => {
		render(<ContactForm />);

		expect(screen.getByText('contact.submit')).toBeInTheDocument();
	});

	it('renders placeholder text in fields', () => {
		render(<ContactForm />);

		expect(screen.getByPlaceholderText('contact.namePlaceholder')).toBeInTheDocument();
		expect(screen.getByPlaceholderText('contact.emailPlaceholder')).toBeInTheDocument();
		expect(screen.getByPlaceholderText('contact.subjectPlaceholder')).toBeInTheDocument();
		expect(screen.getByPlaceholderText('contact.bodyPlaceholder')).toBeInTheDocument();
	});

	it('shows validation errors when submitting empty form', async () => {
		render(<ContactForm />);

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
		render(<ContactForm />);

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
		render(<ContactForm />);

		fireEvent.click(screen.getByText('contact.submit'));

		await waitFor(() => {
			expect(screen.getByText('contact.validationName')).toBeInTheDocument();
		});

		fireEvent.change(screen.getByPlaceholderText('contact.namePlaceholder'), { target: { value: 'Test User' } });
		expect(screen.queryByText('contact.validationName')).not.toBeInTheDocument();
		expect(screen.getByText('contact.validationEmail')).toBeInTheDocument();
	});

	it('shows success message after successful submission', async () => {
		(global.fetch as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ token: 'test-csrf-token' }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ ok: true }),
			});

		render(<ContactForm />);

		fireEvent.change(screen.getByPlaceholderText('contact.namePlaceholder'), { target: { value: 'Test User' } });
		fireEvent.change(screen.getByPlaceholderText('contact.emailPlaceholder'), { target: { value: 'test@example.com' } });
		fireEvent.change(screen.getByPlaceholderText('contact.subjectPlaceholder'), { target: { value: 'Test Subject' } });
		fireEvent.change(screen.getByPlaceholderText('contact.bodyPlaceholder'), { target: { value: 'Test message body' } });

		fireEvent.click(screen.getByText('contact.submit'));

		await waitFor(() => {
			expect(screen.getByText('contact.success')).toBeInTheDocument();
			expect(screen.getByText('contact.successDescription')).toBeInTheDocument();
		});
	});

	it('shows error message on submission failure', async () => {
		(global.fetch as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ token: 'test-csrf-token' }),
			})
			.mockResolvedValueOnce({
				ok: false,
				json: () => Promise.resolve({ ok: false, message: 'Server error' }),
			});

		render(<ContactForm />);

		fireEvent.change(screen.getByPlaceholderText('contact.namePlaceholder'), { target: { value: 'Test User' } });
		fireEvent.change(screen.getByPlaceholderText('contact.emailPlaceholder'), { target: { value: 'test@example.com' } });
		fireEvent.change(screen.getByPlaceholderText('contact.subjectPlaceholder'), { target: { value: 'Test Subject' } });
		fireEvent.change(screen.getByPlaceholderText('contact.bodyPlaceholder'), { target: { value: 'Test body' } });

		fireEvent.click(screen.getByText('contact.submit'));

		await waitFor(() => {
			expect(screen.getByText('Server error')).toBeInTheDocument();
		});
	});

	it('contains honeypot field hidden from view', () => {
		render(<ContactForm />);

		const honeypotInput = document.querySelector('input[name="website"]');
		expect(honeypotInput).toBeInTheDocument();
		expect(honeypotInput?.closest('[aria-hidden="true"]')).toBeInTheDocument();
	});
});
