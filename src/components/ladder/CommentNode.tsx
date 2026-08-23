import type { NodeProps } from '@xyflow/react'
import type { LdNodeKind } from '@/types/ladder'
import type { LadderNodeData } from './ContactNoNode'

export function CommentNode({ data }: NodeProps): React.ReactElement {
  const d = data as unknown as LadderNodeData
  const k = d.kind as Extract<LdNodeKind, { type: 'comment' }>
  return (
    <div
      data-testid="ladder-node-comment"
      className="rounded border border-dashed border-[var(--color-border)] bg-transparent px-2 py-1 font-mono text-xs italic text-[var(--color-muted)]"
    >
      (* {k.text} *)
    </div>
  )
}
