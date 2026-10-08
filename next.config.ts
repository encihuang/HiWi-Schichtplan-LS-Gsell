import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // PGlite (lokale Entwicklungsdatenbank) lädt WASM-Dateien zur Laufzeit.
  serverExternalPackages: ['@electric-sql/pglite', 'jspdf', 'exceljs'],
}

export default nextConfig
