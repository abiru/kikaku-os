import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from '../App';

describe('App', () => {
  it('renders header title', () => {
    render(
      <MemoryRouter>
        <App>{null}</App>
      </MemoryRouter>
    );
    expect(screen.getByText('Led Kikaku OS')).toBeInTheDocument();
  });
});
