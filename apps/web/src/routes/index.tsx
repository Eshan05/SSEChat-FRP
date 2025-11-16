import { createFileRoute } from '@tanstack/react-router'
import { getGreeting, type User } from '@pkg/types'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const greeting = getGreeting('World')
  const user: User = { name: 'Eshan', id: '1' }

  return (
    <div className="text-center">
      <header className="min-h-screen flex flex-col items-center justify-center bg-[#282c34] text-white text-[calc(10px+2vmin)]">
        <p>{greeting}</p>
        <p>
          Use types package: <code>{user.name} ({user.id})</code>
        </p>
        <a
          className="text-[#61dafb] hover:underline"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
        <a
          className="text-[#61dafb] hover:underline"
          href="https://tanstack.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn TanStack
        </a>
      </header>
    </div>
  )
}
