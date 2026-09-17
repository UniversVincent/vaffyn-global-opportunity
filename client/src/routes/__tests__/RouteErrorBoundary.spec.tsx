import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import RouteErrorBoundary from '../RouteErrorBoundary';

describe('Customer route errors', () => {
  it.each([
    new Error('OpenAI sk-test-only: https://api.apify.com/private?token=test-only'),
    {
      status: 502,
      statusText: 'Internal LibreChat',
      data: { upstream: 'Apify', token: 'test-only' },
    },
  ])('does not render or offer to download internal error details', async (error) => {
    const router = createMemoryRouter([
      {
        path: '/',
        element: <></>,
        hydrateFallbackElement: <></>,
        loader: () => {
          throw error;
        },
        errorElement: <RouteErrorBoundary />,
      },
    ]);
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading')).toHaveTextContent(
      'This page is temporarily unavailable',
    );
    expect(screen.getByRole('button', { name: 'Refresh page' })).toBeEnabled();
    expect(document.body).not.toHaveTextContent(/OpenAI|Apify|LibreChat|sk-test|test-only|502/i);
    expect(document.querySelectorAll('pre, details, a[download]')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /logs|stack/i })).not.toBeInTheDocument();
  });
});
