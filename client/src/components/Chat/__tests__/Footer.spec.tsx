import React from 'react';
import { render, screen } from 'test/layout-test-utils';
import Footer from '../Footer';

jest.mock('~/hooks/AuthContext', () => ({
  AuthContextProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe('Product footer', () => {
  it('uses the product name without the upstream promotional link or version', () => {
    render(<Footer startupConfig={null} className="flex" />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Vaffyn');
    expect(screen.getByRole('contentinfo')).not.toHaveTextContent(/LibreChat|v0\./i);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('preserves configured custom text, privacy and terms links', () => {
    render(
      <Footer
        className="flex"
        startupConfig={{
          customFooter: 'Custom footer',
          interface: {
            privacyPolicy: { externalUrl: 'https://example.invalid/privacy' },
            termsOfService: { externalUrl: 'https://example.invalid/terms' },
          },
        }}
      />,
    );
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Custom footer');
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      'https://example.invalid/privacy',
    );
    expect(screen.getByRole('link', { name: 'Terms of service' })).toHaveAttribute(
      'href',
      'https://example.invalid/terms',
    );
  });
});
