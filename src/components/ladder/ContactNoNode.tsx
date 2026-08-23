import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LdNodeKind } from '@/types/ladder'

export interface LadderNodeData {
  kind: LdNodeKind
  label: string
  rung: number
  branch: number
  order: number
}

export function ContactNoNode({ data }: NodeProps): React.ReactElement {
  const d = data as unknown as LadderNodeData
  return (
    <div
      data-testid="ladder-node-contact_no"
      className="flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-mono text-xs text-[var(--color-text)]"
    >
      <Handle type="target" position={Position.Left} />
      <span>–| |{d.label}|–</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
