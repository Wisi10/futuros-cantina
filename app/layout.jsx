import './globals.css';
import NavWrapper from '@/components/NavWrapper';

export const metadata = {
  title: 'Futuros Cantina',
  description: 'POS Cantina - Futuros Sports Complex',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-brand-cream-light min-h-screen">
        <NavWrapper>{children}</NavWrapper>
      </body>
    </html>
  );
}
