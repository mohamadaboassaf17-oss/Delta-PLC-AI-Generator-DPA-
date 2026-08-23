import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { LdNodeKind, LadderGraph, LdNode } from '@/types/ladder'

const RUNG_HEIGHT = 80
const BRANCH_SPACING = 50
const NODE_WIDTH = 100
const LEFT_RAIL_OFFSET = 20

export interface UseLadderResult {
  nodes: Node[]
  edges: Edge[]
}

function ladderKindToRfType(kindType: LdNodeKind['type']): string {
  switch (kindType) {
    case 'contact_no':
      return 'contactNo'
    case 'contact_nc':
      return 'contactNc'
    case 'coil_out':
      return 'coilOut'
    case 'coil_set':
      return 'coilSet'
    case 'coil_rst':
      return 'coilRst'
    case 'timer_block':
      return 'timerBlock'
    case 'counter_block':
      return 'counterBlock'
    case 'function_call':
      return 'functionCall'
    case 'comment':
      return 'comment'
  }
}

export function useLadder(graph: LadderGraph | null | undefined): UseLadderResult {
  return useMemo(() => {
    if (!graph || graph.nodes.length === 0) {
      return { nodes: [], edges: [] }
    }

    const rfNodes: Node[] = graph.nodes.map((n: LdNode) => {
      const y = n.rung * RUNG_HEIGHT + n.branch * BRANCH_SPACING
      const x = LEFT_RAIL_OFFSET + n.order * NODE_WIDTH
      return {
        id: n.id,
        type: ladderKindToRfType(n.kind.type),
        position: { x, y },
        data: {
          kind: n.kind,
          label: n.label,
          rung: n.rung,
          branch: n.branch,
          order: n.order,
        },
      }
    })

    const rfEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'default',
    }))

    return { nodes: rfNodes, edges: rfEdges }
  }, [graph])
}
