import { type ReactElement } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useLadder } from '@/hooks/useLadder'
import type { LadderGraph } from '@/types/ladder'
import { ContactNoNode } from './ladder/ContactNoNode'
import { ContactNcNode } from './ladder/ContactNcNode'
import { CoilOutNode } from './ladder/CoilOutNode'
import { CoilSetNode } from './ladder/CoilSetNode'
import { CoilRstNode } from './ladder/CoilRstNode'
import { TimerBlockNode } from './ladder/TimerBlockNode'
import { CounterBlockNode } from './ladder/CounterBlockNode'
import { FunctionCallNode } from './ladder/FunctionCallNode'
import { CommentNode } from './ladder/CommentNode'

// `nodeTypes` is a module-level constant allowed by the ESLint rule
// (react-refresh/only-export-components with allowConstantExport: true).
const nodeTypes: NodeTypes = {
  contactNo: ContactNoNode,
  contactNc: ContactNcNode,
  coilOut: CoilOutNode,
  coilSet: CoilSetNode,
  coilRst: CoilRstNode,
  timerBlock: TimerBlockNode,
  counterBlock: CounterBlockNode,
  functionCall: FunctionCallNode,
  comment: CommentNode,
}

export interface LadderOutputPanelProps {
  graph: LadderGraph | null | undefined
  /**
   * When true, the panel fills its parent container without the fixed 400px
   * height and omits its own header (the host modal supplies one). Default
   * is false for backward compatibility with the previous split layout.
   */
  fullscreen?: boolean
}

function LadderCanvas({ graph, fullscreen = false }: LadderOutputPanelProps): ReactElement {
  const { nodes, edges } = useLadder(graph)

  const sizingClass = fullscreen ? 'h-full' : 'h-[400px] lg:h-full'

  if (!graph || graph.nodes.length === 0) {
    return (
      <div
        data-testid="ladder-empty"
        className={`flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] text-sm text-[var(--color-muted)] ${sizingClass}`}
      >
        Ladder diagram will appear here after code generation
      </div>
    )
  }

  return (
    <div
      data-testid="ladder-panel"
      className={`overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] ${sizingClass}`}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  )
}

export function LadderOutputPanel({
  graph,
  fullscreen = false,
}: LadderOutputPanelProps): ReactElement {
  if (fullscreen) {
    return (
      <div className="h-full w-full">
        <ReactFlowProvider>
          <LadderCanvas graph={graph} fullscreen />
        </ReactFlowProvider>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-[var(--color-text)]">
        Ladder Diagram (LD)
      </h2>
      <ReactFlowProvider>
        <LadderCanvas graph={graph} />
      </ReactFlowProvider>
    </section>
  )
}
