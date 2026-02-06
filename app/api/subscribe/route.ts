import { NextRequest, NextResponse } from 'next/server';
import { addSubscription } from '@/lib/subscriptions';
import { PushSubscription } from '@/lib/webpush';

export async function POST(request: NextRequest) {
  try {
    const subscription: PushSubscription = await request.json();

    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        { error: 'Invalid subscription object' },
        { status: 400 }
      );
    }

    await addSubscription(subscription);

    return NextResponse.json({ success: true, message: 'Subscribed successfully' });
  } catch (error) {
    console.error('Subscribe error:', error);
    return NextResponse.json(
      { error: 'Failed to subscribe' },
      { status: 500 }
    );
  }
}
