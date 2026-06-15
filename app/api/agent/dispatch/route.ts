import { AgentDispatchClient } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const DOCO_AGENT_NAME = 'DOCO';

export async function POST(request: NextRequest) {
  try {
    if (!LIVEKIT_URL) {
      return new NextResponse('LIVEKIT_URL is not defined', { status: 500 });
    }

    if (!API_KEY || !API_SECRET) {
      return new NextResponse('LIVEKIT_API_KEY or LIVEKIT_API_SECRET is not defined', {
        status: 500,
      });
    }

    const body = (await request.json()) as { roomName?: unknown; participantName?: unknown };
    const roomName = typeof body.roomName === 'string' ? body.roomName.trim() : '';
    const participantName =
      typeof body.participantName === 'string' ? body.participantName.trim() : undefined;

    if (!roomName) {
      return new NextResponse('Missing required body field: roomName', { status: 400 });
    }

    const dispatchClient = new AgentDispatchClient(LIVEKIT_URL, API_KEY, API_SECRET);
    const dispatches = await dispatchClient.listDispatch(roomName);
    const existingDispatch = dispatches.find((dispatch) => dispatch.agentName === DOCO_AGENT_NAME);

    if (existingDispatch) {
      return NextResponse.json({
        status: 'already-dispatched',
        dispatchId: existingDispatch.id,
        agentName: existingDispatch.agentName,
        roomName,
      });
    }

    const dispatch = await dispatchClient.createDispatch(roomName, DOCO_AGENT_NAME, {
      metadata: JSON.stringify({
        requestedBy: participantName,
        source: 'manual-room-button',
        requestedAt: new Date().toISOString(),
      }),
    });

    return NextResponse.json({
      status: 'dispatched',
      dispatchId: dispatch.id,
      agentName: dispatch.agentName,
      roomName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown dispatch error';
    return new NextResponse(message, { status: 500 });
  }
}
