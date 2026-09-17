import { render, screen, waitFor } from '@testing-library/react';
import QueryDevtoolsGate, { shouldEnableQueryDevtools } from '../QueryDevtoolsGate';

jest.mock('@tanstack/react-query-devtools/production', () => ({
  ReactQueryDevtools: () => <div data-testid="query-devtools" />,
}));

describe('QueryDevtoolsGate', () => {
  it('keeps query devtools disabled in production by default', () => {
    expect(shouldEnableQueryDevtools({ isDevelopment: false, config: undefined })).toBe(false);

    const { container } = render(<QueryDevtoolsGate isDevelopment={false} config={undefined} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('query-devtools')).not.toBeInTheDocument();
  });

  it('keeps query devtools hidden in local customer previews', () => {
    render(<QueryDevtoolsGate isDevelopment={true} config={undefined} />);

    expect(screen.queryByTestId('query-devtools')).not.toBeInTheDocument();
  });

  it('allows an explicit development-only opt-in', async () => {
    render(<QueryDevtoolsGate isDevelopment={true} config={{ enableQueryDevtools: true }} />);

    await waitFor(() => expect(screen.getByTestId('query-devtools')).toBeInTheDocument());
  });

  it('does not expose production query devtools even with the injected flag', () => {
    render(<QueryDevtoolsGate isDevelopment={false} config={{ enableQueryDevtools: true }} />);

    expect(screen.queryByTestId('query-devtools')).not.toBeInTheDocument();
  });
});
