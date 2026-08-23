import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLadder } from '@/hooks/useLadder'
import type { LadderGraph } from '@/types/ladder'

describe('useLadder', () => {
  it('returns empty arrays for null graph', () => {
    const { result } = renderHook(() => useLadder(null))
    expect(result.current.nodes).toEqual([])
    expect(result.current.edges).toEqual([])
  })

  it('returns empty arrays for undefined graph', () => {
    const { result } = renderHook(() => useLadder(undefined))
    expect(result.current.nodes).toEqual([])
    expect(result.current.edges).toEqual([])
  })

  it('returns empty arrays for graph with no nodes', () => {
    const graph: LadderGraph = { nodes: [], edges: [] }
    const { result } = renderHook(() => useLadder(graph))
    expect(result.current.nodes).toEqual([])
    expect(result.current.edges).toEqual([])
  })

  it('places a single node at x=20, y=0', () => {
    const graph: LadderGraph = {
      nodes: [
        {
          id: 'r0_b0_n0',
          kind: { type: 'contact_no', address: 'X0' },
          label: 'X0',
          rung: 0,
          branch: 0,
          order: 0,
        },
      ],
      edges: [],
    }
    const { result } = renderHook(() => useLadder(graph))
    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0]!.position).toEqual({ x: 20, y: 0 })
  })

  it('uses different y for different rungs', () => {
    const graph: LadderGraph = {
      nodes: [
        {
          id: 'r0_b0_n0',
          kind: { type: 'contact_no', address: 'X0' },
          label: 'X0',
          rung: 0,
          branch: 0,
          order: 0,
        },
        {
          id: 'r1_b0_n0',
          kind: { type: 'contact_no', address: 'X1' },
          label: 'X1',
          rung: 1,
          branch: 0,
          order: 0,
        },
      ],
      edges: [],
    }
    const { result } = renderHook(() => useLadder(graph))
    expect(result.current.nodes[0]!.position.y).toBe(0)
    expect(result.current.nodes[1]!.position.y).toBe(80)
  })

  it('offsets parallel branches within the same rung', () => {
    const graph: LadderGraph = {
      nodes: [
        {
          id: 'r0_b0_n0',
          kind: { type: 'contact_no', address: 'X0' },
          label: 'X0',
          rung: 0,
          branch: 0,
          order: 0,
        },
        {
          id: 'r0_b1_n0',
          kind: { type: 'contact_no', address: 'X1' },
          label: 'X1',
          rung: 0,
          branch: 1,
          order: 0,
        },
      ],
      edges: [],
    }
    const { result } = renderHook(() => useLadder(graph))
    const y0 = result.current.nodes[0]!.position.y
    const y1 = result.current.nodes[1]!.position.y
    expect(y0).not.toBe(y1)
  })

  it('preserves edge IDs from the input graph', () => {
    const graph: LadderGraph = {
      nodes: [
        {
          id: 'r0_b0_n0',
          kind: { type: 'contact_no', address: 'X0' },
          label: 'X0',
          rung: 0,
          branch: 0,
          order: 0,
        },
        {
          id: 'r0_b0_n1',
          kind: { type: 'coil_out', address: 'Y0' },
          label: 'Y0',
          rung: 0,
          branch: 0,
          order: 1,
        },
      ],
      edges: [
        {
          id: 'e_r0_b0_n0_to_r0_b0_n1',
          source: 'r0_b0_n0',
          target: 'r0_b0_n1',
        },
      ],
    }
    const { result } = renderHook(() => useLadder(graph))
    expect(result.current.edges).toHaveLength(1)
    expect(result.current.edges[0]!.id).toBe('e_r0_b0_n0_to_r0_b0_n1')
    expect(result.current.edges[0]!.source).toBe('r0_b0_n0')
    expect(result.current.edges[0]!.target).toBe('r0_b0_n1')
  })

  it('maps each LdNodeKind type to a corresponding React Flow type', () => {
    const graph: LadderGraph = {
      nodes: [
        {
          id: 'a',
          kind: { type: 'contact_no', address: 'X0' },
          label: 'X0',
          rung: 0,
          branch: 0,
          order: 0,
        },
        {
          id: 'b',
          kind: { type: 'contact_nc', address: 'X1' },
          label: 'X1',
          rung: 0,
          branch: 0,
          order: 1,
        },
        {
          id: 'c',
          kind: { type: 'coil_out', address: 'Y0' },
          label: 'Y0',
          rung: 0,
          branch: 0,
          order: 2,
        },
        {
          id: 'd',
          kind: { type: 'coil_set', address: 'Y1' },
          label: 'Y1',
          rung: 0,
          branch: 0,
          order: 3,
        },
        {
          id: 'e',
          kind: { type: 'coil_rst', address: 'Y2' },
          label: 'Y2',
          rung: 0,
          branch: 0,
          order: 4,
        },
        {
          id: 'f',
          kind: { type: 'timer_block', timer: 'T0', preset: 'K100' },
          label: 'TMR T0',
          rung: 0,
          branch: 0,
          order: 5,
        },
        {
          id: 'g',
          kind: { type: 'counter_block', counter: 'C0', preset: 'K5' },
          label: 'CNT C0',
          rung: 0,
          branch: 0,
          order: 6,
        },
        {
          id: 'h',
          kind: { type: 'function_call', name: 'TON', args: ['T0', 'K100'] },
          label: 'TON',
          rung: 0,
          branch: 0,
          order: 7,
        },
        {
          id: 'i',
          kind: { type: 'comment', text: 'note' },
          label: 'note',
          rung: 0,
          branch: 0,
          order: 8,
        },
      ],
      edges: [],
    }
    const { result } = renderHook(() => useLadder(graph))
    expect(result.current.nodes.map((n) => n.type)).toEqual([
      'contactNo',
      'contactNc',
      'coilOut',
      'coilSet',
      'coilRst',
      'timerBlock',
      'counterBlock',
      'functionCall',
      'comment',
    ])
  })
})
