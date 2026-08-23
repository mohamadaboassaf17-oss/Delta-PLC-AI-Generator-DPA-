import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { LdNodeKind } from '@/types/ladder'
import type { LadderNodeData } from './ContactNoNode'

export function FunctionCallNode({ data }: NodeProps): React.ReactElement {
  const d = data as unknown as LadderNodeData
  const k = d.kind as Extract<LdNodeKind, { type: 'function_call' }>
  return (
    <div
      data-testid="ladder-node-function_call"
      className="flex items-center gap-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-mono text-xs text-[var(--color-text)]"
    >
      <Handle type="target" position={Position.Left} />
      <span>
        –[{k.name}({k.args.join(',')})]–
      </span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}
