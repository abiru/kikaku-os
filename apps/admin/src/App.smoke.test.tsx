import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './App';

describe('App smoke', () => {
  it('renders header title', () => {
    render(
      <MemoryRouter initialEntries={['/dev-tools/seed']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText('Led Kikaku OS')).toBeInTheDocument();
  });
});
