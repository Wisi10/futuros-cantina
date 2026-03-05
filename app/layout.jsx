import './globals.css';

export const metadata = {
  title: 'Futuros Cantina',
  description: 'POS Cantina - Futuros Sports Complex',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="bg-brand-cream-light min-h-screen">
        {children}
      </body>
    </html>
  );
}
