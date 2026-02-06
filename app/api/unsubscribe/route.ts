import { NextRequest, NextResponse } from 'next/server';
import { removeSubscription } from '@/lib/subscriptions';

export async function POST(request: NextRequest) {
  try {
    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Endpoint is required' },
        { status: 400 }
      );
    }

    const removed = await removeSubscription(endpoint);

    if (removed) {
      return NextResponse.json({ success: true, message: 'Unsubscribed successfully' });
    } else {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json(
      { error: 'Failed to unsubscribe' },
      { status: 500 }
    );
  }
}
