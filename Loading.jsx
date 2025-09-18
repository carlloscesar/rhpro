export default function Loading({ text = 'Carregando...' }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-thermas-600"></div>
        <p className="mt-4 text-gray-600">{text}</p>
      </div>
    </div>
  )
}