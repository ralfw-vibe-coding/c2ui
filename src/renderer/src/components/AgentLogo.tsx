import type { AgentKind } from '@shared/types'
import claudeLogo from '../assets/claude.png'
import openaiLogo from '../assets/openai.png'

/**
 * Logos der Agenten. Claude als farbiges Bild; das ChatGPT/OpenAI-Logo als Maske,
 * damit es die Textfarbe übernimmt (dunkel im hellen, hell im dunklen Modus).
 */
export function AgentLogo({ agent, size = 16 }: { agent: AgentKind; size?: number }) {
  if (agent === 'claude') {
    return <img className="agent-logo" src={claudeLogo} width={size} height={size} alt="Claude" draggable={false} />
  }
  return (
    <span
      className="agent-logo agent-logo-mask"
      role="img"
      aria-label="Codex"
      style={{ width: size, height: size, maskImage: `url(${openaiLogo})`, WebkitMaskImage: `url(${openaiLogo})` }}
    />
  )
}
