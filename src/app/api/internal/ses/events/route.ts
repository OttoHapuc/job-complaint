import { NextRequest, NextResponse } from "next/server";
import { EmailSuppressionReason } from "@prisma/client";
import { registerEmailSuppressions } from "@/lib/mail/suppression";
import { logInfo, logWarn } from "@/lib/logger";

type SnsEnvelope = {
  Type?: string;
  MessageId?: string;
  TopicArn?: string;
  Subject?: string;
  Message?: string;
  SubscribeURL?: string;
  Timestamp?: string;
};

type SesBounceNotification = {
  notificationType?: string;
  bounce?: {
    bounceType?: string;
    bouncedRecipients?: Array<{ emailAddress?: string }>;
  };
  complaint?: {
    complainedRecipients?: Array<{ emailAddress?: string }>;
  };
};

function isAuthorized(request: NextRequest) {
  const expected = process.env.SES_EVENTS_SECRET?.trim();
  if (!expected) return true;
  const provided = request.headers.get("x-ses-events-secret")?.trim();
  return provided === expected;
}

function topicArnAllowed(topicArn?: string) {
  const expected = process.env.SES_SNS_TOPIC_ARN?.trim();
  if (!expected) return true;
  return topicArn === expected;
}

function extractEmailsFromSesNotification(payload: SesBounceNotification) {
  const type = payload.notificationType?.toUpperCase();
  if (type === "BOUNCE") {
    return (payload.bounce?.bouncedRecipients ?? [])
      .map((item) => item.emailAddress?.trim())
      .filter((value): value is string => Boolean(value));
  }
  if (type === "COMPLAINT") {
    return (payload.complaint?.complainedRecipients ?? [])
      .map((item) => item.emailAddress?.trim())
      .filter((value): value is string => Boolean(value));
  }
  return [];
}

async function confirmSnsSubscription(subscribeUrl: string) {
  const response = await fetch(subscribeUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Falha ao confirmar assinatura SNS (${response.status}).`);
  }
}

export async function POST(request: NextRequest) {
  let body: SnsEnvelope;
  try {
    body = (await request.json()) as SnsEnvelope;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  if (!topicArnAllowed(body.TopicArn)) {
    logWarn("ses.events.topic_rejected", { data: { topicArn: body.TopicArn } });
    return NextResponse.json({ error: "TopicArn não autorizado." }, { status: 403 });
  }

  if (body.Type === "SubscriptionConfirmation") {
    if (!body.SubscribeURL) {
      return NextResponse.json({ error: "SubscribeURL ausente." }, { status: 400 });
    }
    await confirmSnsSubscription(body.SubscribeURL);
    logInfo("ses.events.subscription_confirmed", { data: { topicArn: body.TopicArn } });
    return NextResponse.json({ ok: true, action: "subscription_confirmed" });
  }

  if (body.Type !== "Notification") {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Sem autorização." }, { status: 401 });
    }
    return NextResponse.json({ ok: true, action: "ignored" });
  }

  let sesPayload: SesBounceNotification = {};
  if (body.Message) {
    try {
      sesPayload = JSON.parse(body.Message) as SesBounceNotification;
    } catch {
      return NextResponse.json({ error: "Message SNS inválida." }, { status: 400 });
    }
  }

  const emails = extractEmailsFromSesNotification(sesPayload);
  if (emails.length === 0) {
    return NextResponse.json({ ok: true, action: "no_recipients" });
  }

  const notificationType = sesPayload.notificationType?.toUpperCase();
  const reason =
    notificationType === "COMPLAINT"
      ? EmailSuppressionReason.COMPLAINT
      : EmailSuppressionReason.BOUNCE;

  await registerEmailSuppressions(
    emails,
    reason,
    "ses-sns-webhook",
    notificationType ?? "UNKNOWN",
  );

  logWarn("ses.events.suppressed", {
    data: {
      notificationType,
      count: emails.length,
      emails,
    },
  });

  return NextResponse.json({
    ok: true,
    action: "suppressed",
    count: emails.length,
  });
}
