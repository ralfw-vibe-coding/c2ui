const paths: Record<string, string> = {
  chat: 'M4 5h16v11H8l-4 4z',
  'split-right': 'M4 5h16v14H4zM12 5v14',
  'split-down': 'M4 5h16v14H4zM4 12h16',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
  plus: 'M12 5v14M5 12h14',
  // Zahnrad (Form nach Lucide „settings“, ISC-Lizenz)
  gear: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z',
  folder: 'M3 7h6l2 2h10v10H3z',
  send: 'M5 12h13M13 6l6 6-6 6',
  stop: 'M7 7h10v10H7z',
  down: 'M12 5v14M6 13l6 6 6-6',
  tool: 'M14 6a4 4 0 00-5 5l-5 5 3 3 5-5a4 4 0 005-5l-2 2-3-3z',
  quote: 'M5 7h5v5l-2 5H6l1.5-5H5zM14 7h5v5l-2 5h-2l1.5-5H14z',
  check: 'M5 12l5 5 9-10',
  sidebar: 'M4 5h16v14H4zM9.5 5v14',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  note: 'M5 4h11l3 3v13H5zM8 9h8M8 13h8M8 17h5',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l5 5',
  // Uhr mit Rückwärtspfeil (bestehende Session übernehmen)
  history: 'M4 11a8 8 0 10 2.3-5.7M4 4v7h7M12 8v4.5l3 2',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  pencil: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7.5v.5',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  queue: 'M4 6h12M4 12h8M4 18h8M17 13v8M13 17h8',
  play: 'M7 4l13 8-13 8z',
  steer: 'M13 3L5 14h6l-1 7 8-11h-6z',
  board: 'M6 3v12M18 3a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM6 15a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM18 9a9 9 0 0 1-9 9'
}

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={paths[name] ?? ''} />
    </svg>
  )
}
