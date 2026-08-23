import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LdNodeKind } from '@/types/ladder'
import type { LadderNodeData } from './ContactNoNode'

export function TimerBlockNode({ data }: NodeProps): React.ReactElement {
  const d = data as unknown as LadderNodeData
  const k = d.kind as Extract<LdNodeKind, { type: 'timer_block' }>
  return (
    <div
      data-testid="ladder-node-timer_block"
      className="flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-mono text-xs text-[var(--color-text)]"
    >
      <Handle type="target" position={Position.Left} />
      <span>
        –[TMR {k.timer} {k.preset}]–
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
