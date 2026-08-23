import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LadderOutputPanel } from '@/components/LadderOutputPanel'
import { SAMPLE_LADDER_GRAPH, type LadderGraph } from '@/types/ladder'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}))

function setupInvoke(): void {
  invokeMock.mockResolvedValue(null)
}

describe('LadderOutputPanel', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    setupInvoke()
  })

  it('renders empty state when graph is null', () => {
    render(<LadderOutputPanel graph={null} />)
    expect(screen.getByTestId('ladder-empty')).toBeInTheDocument()
  })

  it('renders empty state when graph.nodes.length is 0', () => {
    const emptyGraph: LadderGraph = { nodes: [], edges: [] }
    render(<LadderOutputPanel graph={emptyGraph} />)
    expect(screen.getByTestId('ladder-empty')).toBeInTheDocument()
  })

  it('renders the panel header "Ladder Diagram (LD)" when graph is present', () => {
    render(<LadderOutputPanel graph={SAMPLE_LADDER_GRAPH} />)
    expect(screen.getByText('Ladder Diagram (LD)')).toBeInTheDocument()
  })

  it('renders the contact_no custom node for the sample graph', () => {
    render(<LadderOutputPanel graph={SAMPLE_LADDER_GRAPH} />)
    expect(screen.getByTestId('ladder-node-contact_no')).toBeInTheDocument()
  })

  it('renders the coil_out custom node for the sample graph', () => {
    render(<LadderOutputPanel graph={SAMPLE_LADDER_GRAPH} />)
    expect(screen.getByTestId('ladder-node-coil_out')).toBeInTheDocument()
  })

  it('does not render the ladder-empty when a graph is provided', () => {
    render(<LadderOutputPanel graph={SAMPLE_LADDER_GRAPH} />)
    expect(screen.queryByTestId('ladder-empty')).not.toBeInTheDocument()
  })
})
