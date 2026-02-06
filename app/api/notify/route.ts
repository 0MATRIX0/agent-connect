import { NextRequest, NextResponse } from 'next/server';
import { getSubscriptions, clearInvalidSubscriptions } from '@/lib/subscriptions';
import { sendNotification, NotificationPayload } from '@/lib/webpush';

export async function POST(request: NextRequest) {
  try {
    const payload: NotificationPayload = await request.json();

    if (!payload.title || !payload.body) {
      return NextResponse.json(
        { error: 'Title and body are required' },
        { status: 400 }
      );
    }

    const subscriptions = await getSubscriptions();

    if (subscriptions.length === 0) {
      return NextResponse.json(
        { success: true, message: 'No subscriptions to notify', sent: 0 }
      );
    }

    const invalidEndpoints: string[] = [];
    let sentCount = 0;

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await sendNotification(subscription, payload);
          sentCount++;
        } catch (error: unknown) {
          const statusCode = (error as { statusCode?: number })?.statusCode;
          // Remove invalid subscriptions (gone or expired)
          if (statusCode === 404 || statusCode === 410) {
            invalidEndpoints.push(subscription.endpoint);
          } else {
            console.error('Failed to send notification:', error);
          }
        }
      })
    );

    // Clean up invalid subscriptions
    if (invalidEndpoints.length > 0) {
      await clearInvalidSubscriptions(invalidEndpoints);
    }

    return NextResponse.json({
      success: true,
      message: `Notification sent to ${sentCount} subscriber(s)`,
      sent: sentCount,
      cleaned: invalidEndpoints.length,
    });
  } catch (error) {
    console.error('Notify error:', error);
    return NextResponse.json(
      { error: 'Failed to send notification' },
      { status: 500 }
    );
  }
}

// Also support GET for simple testing
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const title = searchParams.get('title') || 'Agent Notifier';
  const body = searchParams.get('body') || 'Test notification';
  const type = searchParams.get('type') as NotificationPayload['type'];

  // Create a mock request and call POST handler
  const mockRequest = new NextRequest(request.url, {
    method: 'POST',
    body: JSON.stringify({ title, body, type }),
    headers: { 'Content-Type': 'application/json' },
  });

  return POST(mockRequest);
}
