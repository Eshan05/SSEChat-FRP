import { Link } from '@tanstack/react-router'
import { Home, Network } from 'lucide-react'

export default function Header() {
  // Simplified header — no sidebar/drawer

  return (
    <>
      <header className="p-4 flex items-center justify-between bg-gray-800 text-white shadow-lg">
        <div className="flex items-center">
          <h1 className="mr-4 text-xl font-semibold">
          <Link to="/">
            <img
              src="/tanstack-word-logo-white.svg"
              alt="TanStack Logo"
              className="h-10"
            />
          </Link>
          </h1>
          <nav className="hidden md:flex gap-2">
            <Link
              to="/"
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors"
              activeProps={{ className: 'bg-cyan-600 hover:bg-cyan-700' }}
            >
              <Home size={20} />
              <span className="font-medium">Home</span>
            </Link>
            <Link
              to="/demo/tanstack-query"
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors"
              activeProps={{ className: 'bg-cyan-600 hover:bg-cyan-700' }}
            >
              <Network size={20} />
              <span className="font-medium">TanStack Query</span>
            </Link>
          </nav>
        </div>
      </header>
    </>
  )
}
